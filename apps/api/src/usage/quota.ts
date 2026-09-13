import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { currentUser } from '../auth/middleware.js';
import { databaseConfigured, query } from '../db/pool.js';
import { log } from '../util/log.js';
import { METERED_ACTIONS, UsageStore, periodResetsAt, type MeteredAction, type UsageCounts } from './store.js';

/**
 * Free-tier allowances, enforced server-side.
 *
 * The client also hides gated actions, but that is presentation only — anyone
 * can call the API directly, and these endpoints each bill a real provider, so
 * the ceiling has to live here.
 */

export type Tier = 'free' | 'pro';

export interface Entitlement {
  tier: Tier;
  /** ISO timestamp when a Pro subscription lapses; absent for free accounts. */
  expiresAt?: string;
}

export interface QuotaLine {
  used: number;
  limit: number;
  remaining: number;
}

export type QuotaSummary = Record<MeteredAction, QuotaLine>;

export const limitsFor = (tier: Tier): Record<MeteredAction, number> =>
  tier === 'pro'
    ? {
        garments: env.quota.proCeiling,
        tryons: env.quota.proCeiling,
        styleframes: env.quota.proCeiling,
        stylist: env.quota.proCeiling,
      }
    : {
        garments: env.quota.garments,
        tryons: env.quota.tryons,
        styleframes: env.quota.styleframes,
        stylist: env.quota.stylist,
      };

export const summarize = (counts: UsageCounts, tier: Tier): QuotaSummary => {
  const limits = limitsFor(tier);
  return METERED_ACTIONS.reduce((acc, action) => {
    const limit = limits[action];
    const used = counts[action] ?? 0;
    acc[action] = { used, limit, remaining: Math.max(0, limit - used) };
    return acc;
  }, {} as QuotaSummary);
};

/**
 * Resolves a user's tier from the accounts table.
 *
 * An expired Pro subscription reads as free without needing a background job to
 * downgrade the row, so a missed webhook cannot leave someone on Pro forever.
 * When RevenueCat lands it writes `tier` and `tier_expires_at`; nothing else
 * needs to change.
 */
export const entitlementFor = async (userId: string): Promise<Entitlement> => {
  if (!databaseConfigured()) return { tier: 'free' };
  try {
    const { rows } = await query<{ tier: Tier; tier_expires_at: string | null }>(
      `SELECT tier, tier_expires_at FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [userId],
    );
    const row = rows[0];
    if (!row || row.tier !== 'pro') return { tier: 'free' };
    if (row.tier_expires_at && new Date(row.tier_expires_at).getTime() < Date.now()) {
      return { tier: 'free' };
    }
    return { tier: 'pro', expiresAt: row.tier_expires_at ?? undefined };
  } catch (err) {
    // Never fail open onto Pro: an unreachable database means free-tier limits.
    log.warn(`entitlement lookup failed for ${userId}; treating as free`, err);
    return { tier: 'free' };
  }
};

export interface QuotaOptions {
  action: MeteredAction;
  /** How many units this request consumes; defaults to 1. */
  cost?: (req: Request) => number;
}

/**
 * Blocks the request when the account has no allowance left, otherwise records
 * the spend and lets it through.
 *
 * Counting up-front rather than on success is deliberate: the provider bills us
 * for work that fails late, and a caller who could retry for free would make
 * the quota meaningless. Handlers refund explicitly when they reject a request
 * before doing any paid work.
 */
export const enforceQuota = (store: UsageStore, opts: QuotaOptions) =>
  async function quotaGate(req: Request, res: Response, next: NextFunction): Promise<void> {
    const user = currentUser(req);
    const cost = Math.max(1, Math.floor(opts.cost?.(req) ?? 1));
    const { tier } = await entitlementFor(user.id);
    const limit = limitsFor(tier)[opts.action];
    const record = await store.snapshot(user.id);
    const used = record.counts[opts.action] ?? 0;

    if (used + cost > limit) {
      res.status(402).json({
        error:
          limit === 0
            ? 'This feature is part of FitBuilder Pro.'
            : `You have used your ${limit} free ${opts.action} this month.`,
        code: 'quota_exceeded',
        quota: { action: opts.action, used, limit, remaining: Math.max(0, limit - used), cost },
        tier,
        resetsAt: periodResetsAt(),
      });
      return;
    }

    await store.consume(user.id, opts.action, cost);
    res.locals.quotaRefund = () => store.refund(user.id, opts.action, cost);
    next();
  };
