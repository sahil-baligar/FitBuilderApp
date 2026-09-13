import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { env } from '../config/env.js';
import { log } from '../util/log.js';

/**
 * Verifies Supabase access tokens locally against the project's JWKS.
 *
 * `createRemoteJWKSet` fetches the key set once and caches it, refetching only
 * when it sees an unknown `kid`, so the common path costs no network call. That
 * keeps per-request latency flat and stops Supabase downtime from taking the
 * API with it.
 */

export interface AuthenticatedUser {
  id: string;
  email?: string;
  /** Supabase `role` claim, e.g. `authenticated`. */
  role?: string;
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

const jwksUrl = (): string | undefined => {
  if (env.supabaseJwksUrl) return env.supabaseJwksUrl;
  if (env.supabaseUrl) return `${env.supabaseUrl}/auth/v1/.well-known/jwks.json`;
  return undefined;
};

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

const getJwks = () => {
  const url = jwksUrl();
  if (!url) throw new AuthError('Auth is not configured on this server', 'not_configured');
  jwks ??= createRemoteJWKSet(new URL(url), {
    cooldownDuration: 30_000,
    cacheMaxAge: 10 * 60_000,
  });
  return jwks;
};

/** True when this server can actually verify tokens. */
export const authConfigured = (): boolean => Boolean(jwksUrl());

const userFromPayload = (payload: JWTPayload): AuthenticatedUser => {
  const id = typeof payload.sub === 'string' ? payload.sub : undefined;
  if (!id) throw new AuthError('Token has no subject', 'invalid_token');
  return {
    id,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    role: typeof payload.role === 'string' ? payload.role : undefined,
  };
};

export const verifyAccessToken = async (token: string): Promise<AuthenticatedUser> => {
  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      audience: env.supabaseAudience,
      // Supabase issues tokens from <project>/auth/v1; allow a configured override.
      issuer: env.supabaseUrl ? `${env.supabaseUrl}/auth/v1` : undefined,
      clockTolerance: 5,
    });
    return userFromPayload(payload);
  } catch (err) {
    if (err instanceof AuthError) throw err;
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
