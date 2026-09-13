import express, { type Request, type Response, type Router } from 'express';
import { currentUser, requireAuth } from '../auth/middleware.js';
import {
  AuthServiceError,
  changePassword,
  deleteAccount,
  findById,
  refreshSession,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  signIn,
  signOut,
  signOutEverywhere,
  signUp,
  verifyEmail,
} from '../auth/service.js';
import { databaseConfigured } from '../db/pool.js';
import { HttpError } from './validate.js';

/**
 * Account endpoints. Sessions are a short-lived access token plus a rotating
 * refresh token; the client stores both and calls /auth/refresh when the access
 * token expires.
 */

const requireDatabase = () => {
  if (!databaseConfigured()) {
    throw new HttpError(503, 'Accounts are unavailable: this server has no database configured.', 'no_database');
  }
};

/** Maps service errors onto HTTP without leaking internals. */
const handle = (fn: (req: Request, res: Response) => Promise<void>) =>
  async function route(req: Request, res: Response): Promise<void> {
    try {
      requireDatabase();
      await fn(req, res);
    } catch (err) {
      if (err instanceof AuthServiceError) {
        res.status(err.status).json({ error: err.message, code: err.code });
        return;
      }
      throw err;
    }
  };

const agentOf = (req: Request) => req.header('user-agent') ?? undefined;

export const createAuthRouter = (): Router => {
  const router = express.Router();

  router.post(
    '/auth/signup',
    handle(async (req, res) => {
      const session = await signUp(req.body?.email, req.body?.password, agentOf(req));
      res.status(201).json(session);
    }),
  );

  router.post(
    '/auth/login',
    handle(async (req, res) => {
      const session = await signIn(req.body?.email, req.body?.password, agentOf(req));
      res.json(session);
    }),
  );

  router.post(
    '/auth/refresh',
    handle(async (req, res) => {
      const session = await refreshSession(req.body?.refreshToken, agentOf(req));
      res.json(session);
    }),
  );

  router.post(
    '/auth/logout',
    handle(async (req, res) => {
      await signOut(req.body?.refreshToken);
      res.status(204).end();
    }),
  );

  router.post(
    '/auth/forgot-password',
    handle(async (req, res) => {
      await requestPasswordReset(req.body?.email);
      // Deliberately identical whether or not the address exists.
      res.json({ ok: true, message: 'If that address has an account, a reset link is on its way.' });
    }),
  );

  router.post(
    '/auth/reset-password',
    handle(async (req, res) => {
      await resetPassword(req.body?.token, req.body?.password);
      res.json({ ok: true });
    }),
  );

  router.post(
    '/auth/verify-email',
    handle(async (req, res) => {
      await verifyEmail(req.body?.token);
      res.json({ ok: true });
    }),
  );

  // --- authenticated -------------------------------------------------------

  router.get(
    '/auth/me',
    requireAuth,
    handle(async (req, res) => {
      const account = await findById(currentUser(req).id);
      if (!account) throw new AuthServiceError('Account not found.', 404, 'no_account');
      res.json({
        id: account.id,
        email: account.email,
        emailVerified: account.email_verified,
        tier: account.tier,
        createdAt: account.created_at,
      });
    }),
  );

  router.post(
    '/auth/resend-verification',
    requireAuth,
    handle(async (req, res) => {
      await resendVerification(currentUser(req).id);
      res.json({ ok: true });
    }),
  );

  router.post(
    '/auth/change-password',
    requireAuth,
    handle(async (req, res) => {
      await changePassword(currentUser(req).id, req.body?.currentPassword, req.body?.password);
      res.json({ ok: true, message: 'Password changed. Sign in again on your other devices.' });
    }),
  );

  router.post(
    '/auth/logout-all',
    requireAuth,
    handle(async (req, res) => {
      await signOutEverywhere(currentUser(req).id);
      res.status(204).end();
    }),
  );

  /**
   * Apple requires an in-app route to delete the account, so this backs the
   * Settings action rather than pointing users at a support address.
   */
  router.delete(
    '/account',
    requireAuth,
    handle(async (req, res) => {
      await deleteAccount(currentUser(req).id, req.body?.password);
      res.json({
        ok: true,
        message: 'Your account is scheduled for deletion and you have been signed out everywhere.',
      });
    }),
  );

  return router;
};
