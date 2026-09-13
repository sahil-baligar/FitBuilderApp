import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { log } from '../util/log.js';

/**
 * Per-account counters for the metered endpoints, bucketed by calendar month.
 *
 * Backed by one JSON file per account under `<DATA_DIR>/usage`. This is
 * deliberately simple: a single API instance owns the file, and the write is
 * atomic via rename. When the service scales past one instance this moves to
 * Postgres behind the same interface, which is why callers only ever touch
 * `consume` / `snapshot`.
 */

export type MeteredAction = 'garments' | 'tryons' | 'styleframes' | 'stylist';

export const METERED_ACTIONS: MeteredAction[] = ['garments', 'tryons', 'styleframes', 'stylist'];

export type UsageCounts = Record<MeteredAction, number>;

export interface UsageRecord {
  userId: string;
  /** `YYYY-MM` of the counters below. */
  period: string;
  counts: UsageCounts;
  updatedAt: string;
}

const zero = (): UsageCounts => ({ garments: 0, tryons: 0, styleframes: 0, stylist: 0 });

export const currentPeriod = (now = new Date()): string =>
  `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

/** Start of the next monthly bucket, so clients can say when the allowance returns. */
export const periodResetsAt = (now = new Date()): string =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();

export class UsageStore {
  private readonly dir: string;
  private readonly cache = new Map<string, UsageRecord>();
  private writes = new Map<string, Promise<void>>();

  constructor(dataDir: string) {
    this.dir = path.join(dataDir, 'usage');
    fs.mkdirSync(this.dir, { recursive: true });
  }

  private file(userId: string) {
    // User ids are Supabase UUIDs, but never trust them as path segments.
    const safe = userId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 96);
    return path.join(this.dir, `${safe}.json`);
  }

  private async read(userId: string): Promise<UsageRecord> {
    const cached = this.cache.get(userId);
    const period = currentPeriod();
    if (cached) return cached.period === period ? cached : this.reset(userId, period);

    try {
      const raw = await fsp.readFile(this.file(userId), 'utf8');
      const parsed = JSON.parse(raw) as UsageRecord;
      const record: UsageRecord =
        parsed.period === period
          ? { ...parsed, counts: { ...zero(), ...parsed.counts } }
          : { userId, period, counts: zero(), updatedAt: new Date().toISOString() };
      this.cache.set(userId, record);
      return record;
    } catch {
      return this.reset(userId, period);
    }
  }

  private reset(userId: string, period: string): UsageRecord {
    const record: UsageRecord = { userId, period, counts: zero(), updatedAt: new Date().toISOString() };
    this.cache.set(userId, record);
    return record;
  }

  async snapshot(userId: string): Promise<UsageRecord> {
    const record = await this.read(userId);
    return { ...record, counts: { ...record.counts } };
  }

  /**
   * Adds `amount` to an action's counter and returns the new total.
   * Callers check the quota first; this only records.
   */
  async consume(userId: string, action: MeteredAction, amount = 1): Promise<number> {
    const record = await this.read(userId);
    record.counts[action] += amount;
    record.updatedAt = new Date().toISOString();
    this.persist(record);
    return record.counts[action];
  }

  /** Gives back an allowance when the work failed after being counted. */
  async refund(userId: string, action: MeteredAction, amount = 1): Promise<void> {
    const record = await this.read(userId);
    record.counts[action] = Math.max(0, record.counts[action] - amount);
    record.updatedAt = new Date().toISOString();
    this.persist(record);
  }

  private persist(record: UsageRecord): void {
    const prev = this.writes.get(record.userId) ?? Promise.resolve();
    const next = prev
      .catch(() => undefined)
      .then(async () => {
        const target = this.file(record.userId);
        const tmp = `${target}.${process.pid}.tmp`;
        await fsp.writeFile(tmp, JSON.stringify(record), 'utf8');
        await fsp.rename(tmp, target);
      })
      .catch((err) => log.warn(`usage: could not persist ${record.userId}`, err));
    this.writes.set(record.userId, next);
  }

  async flush(): Promise<void> {
    await Promise.all(this.writes.values());
  }
}
