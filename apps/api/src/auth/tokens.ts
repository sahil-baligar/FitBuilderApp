import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { env } from '../config/env.js';

/**
 * Access tokens are short-lived HS256 JWTs signed with JWT_SECRET and verified
 * in-process, so the hot path touches no database.
 *
 * Refresh tokens are opaque random strings; only their SHA-256 hash is stored,
 * so a database leak yields nothing usable. Keeping them in a table is what
 * makes sign-out, password change and account deletion able to actually end a
 * session, which a purely stateless scheme cannot do.
 */

export const ACCESS_TTL_SECONDS = 60 * 15; // 15 minutes
export const REFRESH_TTL_DAYS = 60;

const ISSUER = 'fitbuilder-api';
const AUDIENCE = 'fitbuilder-app';

let secretKey: Uint8Array | undefined;

const getSecret = (): Uint8Array => {
  if (!env.jwtSecret) {
    throw new Error('JWT_SECRET is not set; the API cannot issue or verify sessions.');
  }
  secretKey ??= new TextEncoder().encode(env.jwtSecret);
  return secretKey;
};

export interface AccessClaims extends JWTPayload {
  sub: string;
  email?: string;
  tier?: 'free' | 'pro';
}

export const signAccessToken = async (user: {
  id: string;
  email: string;
  tier: 'free' | 'pro';
}): Promise<string> =>
  new SignJWT({ email: user.email, tier: user.tier })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(getSecret());

export const verifyAccessToken = async (token: string): Promise<AccessClaims> => {
  const { payload } = await jwtVerify(token, getSecret(), {
    issuer: ISSUER,
    audience: AUDIENCE,
    clockTolerance: 5,
  });
  if (typeof payload.sub !== 'string' || !payload.sub) {
    throw new Error('Token has no subject');
  }
  return payload as AccessClaims;
};

/** Opaque refresh token plus the hash to persist. Only the hash is stored. */
export const newRefreshToken = (): { token: string; hash: string; expiresAt: Date } => {
  const token = randomBytes(48).toString('base64url');
  return {
    token,
    hash: hashToken(token),
    expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000),
  };
};

/**
 * SHA-256 with no salt is correct here, unlike for passwords: these are
 * 384 bits of randomness, so there is nothing to brute-force, and an
 * unsalted digest is what makes a constant-time index lookup possible.
 */
export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

/** Single-use token for email verification and password reset. */
export const newOneTimeToken = (ttlMinutes: number): { token: string; hash: string; expiresAt: Date } => {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    hash: hashToken(token),
    expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000),
  };
};
