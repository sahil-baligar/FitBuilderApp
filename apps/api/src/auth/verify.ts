import { env } from '../config/env.js';
import { log } from '../util/log.js';
import { verifyAccessToken as verifyJwt } from './tokens.js';

/**
 * Session verification for incoming requests.
 *
 * Tokens are issued and signed by this API (see tokens.ts) and verified in
 * process against JWT_SECRET, so no identity provider sits in the request path.
 */

export interface AuthenticatedUser {
  id: string;
  email?: string;
  tier?: 'free' | 'pro';
  /** True when the request was attributed rather than proven (dev only). */
  anonymous?: boolean;
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly code: 'missing_token' | 'invalid_token' | 'expired_token' | 'not_configured',
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/** True when this server holds the key material needed to verify sessions. */
export const authConfigured = (): boolean => Boolean(env.jwtSecret) && Boolean(env.databaseUrl);

export const verifyAccessToken = async (token: string): Promise<AuthenticatedUser> => {
  if (!env.jwtSecret) throw new AuthError('Auth is not configured on this server', 'not_configured');
  try {
    const claims = await verifyJwt(token);
    return { id: claims.sub, email: claims.email, tier: claims.tier };
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === 'ERR_JWT_EXPIRED') throw new AuthError('Session expired', 'expired_token');
    log.warn(`token verification failed: ${err instanceof Error ? err.message : String(err)}`);
    throw new AuthError('Invalid session token', 'invalid_token');
  }
};

/** Pulls a bearer token out of the Authorization header. */
export const bearerFrom = (header: string | undefined): string | undefined => {
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || undefined;
};
