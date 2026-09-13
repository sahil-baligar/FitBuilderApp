import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { log } from '../util/log.js';
import { AuthError, authConfigured, bearerFrom, verifyAccessToken, type AuthenticatedUser } from './verify.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/** Identity used for unauthenticated local development, so quotas still apply. */
const DEV_USER: AuthenticatedUser = { id: 'dev-local-user', email: 'dev@localhost', anonymous: true };

/**
 * Decides once, at boot, whether this process will demand real tokens.
 *
 * Refusing to start is deliberate: a production deployment that silently fell
 * back to open access would expose the metered fal/OpenAI endpoints to anyone
 * who found the URL.
 */
export const assertAuthConfig = (): void => {
  if (!env.authRequired) {
    if (env.nodeEnv === 'production') {
      throw new Error(
        'AUTH_REQUIRED=false is not permitted in production. Set SUPABASE_URL and remove AUTH_REQUIRED.',
      );
    }
    log.loud('AUTH DISABLED (AUTH_REQUIRED=false). Every request is attributed to a single dev user.');
    return;
  }
  if (!authConfigured()) {
    if (env.nodeEnv === 'production') {
      throw new Error('SUPABASE_URL (or SUPABASE_JWKS_URL) is required in production so tokens can be verified.');
    }
    log.loud(
      'Supabase is not configured, so tokens cannot be verified. Running open for local development only; ' +
        'requests are attributed to a single dev user. Set SUPABASE_URL to turn verification on.',
    );
  }
};

const shouldEnforce = () => env.authRequired && authConfigured();

/** Rejects the request unless it carries a valid Supabase access token. */
export const requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (!shouldEnforce()) {
    req.user = DEV_USER;
    next();
    return;
  }
  const token = bearerFrom(req.header('authorization'));
  if (!token) {
    res.status(401).json({ error: 'Sign in to continue', code: 'missing_token' });
    return;
  }
  try {
    req.user = await verifyAccessToken(token);
    next();
  } catch (err) {
    const e = err instanceof AuthError ? err : new AuthError('Invalid session token', 'invalid_token');
    res.status(401).json({ error: e.message, code: e.code });
  }
};

/**
 * Attaches the user when a token is present but never rejects.
 * Used by endpoints that are cheap but still worth attributing.
 */
export const optionalAuth = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  if (!shouldEnforce()) {
    req.user = DEV_USER;
    next();
    return;
  }
  const token = bearerFrom(req.header('authorization'));
  if (token) {
    try {
      req.user = await verifyAccessToken(token);
    } catch {
      /* fall through unauthenticated */
    }
  }
  next();
};

export const currentUser = (req: Request): AuthenticatedUser => {
  if (!req.user) throw new AuthError('No authenticated user on request', 'missing_token');
  return req.user;
};
