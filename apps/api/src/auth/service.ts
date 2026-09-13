import { randomBytes, timingSafeEqual } from 'node:crypto';
import { query, transaction } from '../db/pool.js';
import { sendPasswordResetEmail, sendVerificationEmail } from '../email/send.js';
import { log } from '../util/log.js';
import { hashPassword, needsRehash, validatePassword, verifyPassword } from './password.js';
import {
  ACCESS_TTL_SECONDS,
  hashToken,
  newOneTimeToken,
  newRefreshToken,
  signAccessToken,
} from './tokens.js';

export class AuthServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'AuthServiceError';
  }
}

export interface AccountRow {
  id: string;
  email: string;
  password_hash: string;
  email_verified: boolean;
  tier: 'free' | 'pro';
  tier_expires_at: string | null;
  created_at: string;
}

export interface PublicAccount {
  id: string;
  email: string;
  emailVerified: boolean;
  tier: 'free' | 'pro';
  createdAt: string;
}

export interface SessionResult {
  account: PublicAccount;
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
}

const toPublic = (row: AccountRow): PublicAccount => ({
  id: row.id,
  email: row.email,
  emailVerified: row.email_verified,
  tier: row.tier,
  createdAt: row.created_at,
});

const normalizeEmail = (email: unknown): string => {
  if (typeof email !== 'string') throw new AuthServiceError('Enter your email address.', 400, 'bad_email');
  const trimmed = email.trim().toLowerCase();
  // Deliberately permissive: the verification email is the real check.
  if (trimmed.length < 3 || trimmed.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    throw new AuthServiceError('Enter a valid email address.', 400, 'bad_email');
  }
  return trimmed;
};

const VERIFY_TTL_MINUTES = 60 * 24;
const RESET_TTL_MINUTES = 60;

/**
 * Constant-time comparison guard used when no user row was found, so a missing
 * account costs the same time as a wrong password and cannot be distinguished
 * by timing.
 */
const DUMMY_HASH = await hashPassword(randomBytes(24).toString('hex'));

const issueSession = async (row: AccountRow, userAgent?: string): Promise<SessionResult> => {
  const accessToken = await signAccessToken({ id: row.id, email: row.email, tier: row.tier });
  const refresh = newRefreshToken();
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent) VALUES ($1, $2, $3, $4)`,
    [row.id, refresh.hash, refresh.expiresAt, userAgent?.slice(0, 400) ?? null],
  );
  return {
    account: toPublic(row),
    accessToken,
    refreshToken: refresh.token,
    expiresIn: ACCESS_TTL_SECONDS,
  };
};

const findByEmail = async (email: string): Promise<AccountRow | undefined> => {
  const { rows } = await query<AccountRow>(
    `SELECT id, email, password_hash, email_verified, tier, tier_expires_at, created_at
       FROM users WHERE LOWER(email) = $1 AND deleted_at IS NULL`,
    [email],
  );
  return rows[0];
};

export const findById = async (id: string): Promise<AccountRow | undefined> => {
  const { rows } = await query<AccountRow>(
    `SELECT id, email, password_hash, email_verified, tier, tier_expires_at, created_at
       FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return rows[0];
};

// ---------------------------------------------------------------------------
// Signup / login
// ---------------------------------------------------------------------------

export const signUp = async (
  emailRaw: unknown,
  password: unknown,
  userAgent?: string,
): Promise<SessionResult> => {
  const email = normalizeEmail(emailRaw);
  const problem = validatePassword(password as string);
  if (problem) throw new AuthServiceError(problem.message, 400, 'weak_password');

  const passwordHash = await hashPassword(password as string);
  let row: AccountRow;
  try {
    const { rows } = await query<AccountRow>(
      `INSERT INTO users (email, password_hash) VALUES ($1, $2)
         RETURNING id, email, password_hash, email_verified, tier, tier_expires_at, created_at`,
      [email, passwordHash],
    );
    row = rows[0];
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      throw new AuthServiceError('An account with this email already exists.', 409, 'email_taken');
    }
    throw err;
  }

  await issueVerificationEmail(row.id, row.email);
  return issueSession(row, userAgent);
};

export const signIn = async (
  emailRaw: unknown,
  password: unknown,
  userAgent?: string,
): Promise<SessionResult> => {
  const email = normalizeEmail(emailRaw);
  const row = await findByEmail(email);

  // Always run a verification so the response time does not reveal whether the
  // account exists.
  const ok = await verifyPassword(String(password ?? ''), row?.password_hash ?? DUMMY_HASH);
  if (!row || !ok) {
    throw new AuthServiceError('Email or password is incorrect.', 401, 'bad_credentials');
  }

  if (needsRehash(row.password_hash)) {
    const upgraded = await hashPassword(String(password));
    await query(`UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1`, [row.id, upgraded]);
  }
  return issueSession(row, userAgent);
};

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

export const refreshSession = async (refreshToken: unknown, userAgent?: string): Promise<SessionResult> => {
  if (typeof refreshToken !== 'string' || !refreshToken) {
    throw new AuthServiceError('Sign in again to continue.', 401, 'bad_refresh');
  }
  const hash = hashToken(refreshToken);

  return transaction(async (client) => {
    const { rows } = await client.query<{ id: string; user_id: string; expires_at: string; revoked_at: string | null }>(
      `SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`,
      [hash],
    );
    const token = rows[0];
    if (!token) throw new AuthServiceError('Sign in again to continue.', 401, 'bad_refresh');

    if (token.revoked_at) {
      // A revoked token being presented means it leaked; drop every session
      // for the account rather than just refusing this one.
      await client.query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`, [
        token.user_id,
      ]);
      log.warn(`refresh token reuse detected for user ${token.user_id}; all sessions revoked`);
      throw new AuthServiceError('Sign in again to continue.', 401, 'token_reused');
    }
    if (new Date(token.expires_at).getTime() < Date.now()) {
      throw new AuthServiceError('Sign in again to continue.', 401, 'expired_refresh');
    }

    const { rows: userRows } = await client.query<AccountRow>(
      `SELECT id, email, password_hash, email_verified, tier, tier_expires_at, created_at
         FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [token.user_id],
    );
    const user = userRows[0];
    if (!user) throw new AuthServiceError('Sign in again to continue.', 401, 'bad_refresh');

    // Rotate: the presented token is retired and a fresh one issued, so a
    // stolen token is usable at most once before reuse detection fires.
    await client.query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`, [token.id]);
    const next = newRefreshToken();
    await client.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent) VALUES ($1, $2, $3, $4)`,
      [user.id, next.hash, next.expiresAt, userAgent?.slice(0, 400) ?? null],
    );
    const accessToken = await signAccessToken({ id: user.id, email: user.email, tier: user.tier });
    return { account: toPublic(user), accessToken, refreshToken: next.token, expiresIn: ACCESS_TTL_SECONDS };
  });
};

export const signOut = async (refreshToken: unknown): Promise<void> => {
  if (typeof refreshToken !== 'string' || !refreshToken) return;
  await query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL`, [
    hashToken(refreshToken),
  ]);
};

export const signOutEverywhere = async (userId: string): Promise<void> => {
  await query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
};

// ---------------------------------------------------------------------------
// Email verification
// ---------------------------------------------------------------------------

const issueVerificationEmail = async (userId: string, email: string): Promise<void> => {
  const token = newOneTimeToken(VERIFY_TTL_MINUTES);
  await query(
    `INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at) VALUES ($1, 'verify_email', $2, $3)`,
    [userId, token.hash, token.expiresAt],
  );
  await sendVerificationEmail(email, token.token);
};

export const resendVerification = async (userId: string): Promise<void> => {
  const user = await findById(userId);
  if (!user || user.email_verified) return;
  await query(
    `UPDATE auth_tokens SET consumed_at = NOW()
       WHERE user_id = $1 AND purpose = 'verify_email' AND consumed_at IS NULL`,
    [userId],
  );
  await issueVerificationEmail(user.id, user.email);
};

export const verifyEmail = async (tokenRaw: unknown): Promise<void> => {
  if (typeof tokenRaw !== 'string' || !tokenRaw) {
    throw new AuthServiceError('This link is not valid.', 400, 'bad_token');
  }
  const { rowCount } = await query(
    `UPDATE auth_tokens SET consumed_at = NOW()
       WHERE token_hash = $1 AND purpose = 'verify_email'
         AND consumed_at IS NULL AND expires_at > NOW()`,
    [hashToken(tokenRaw)],
  );
  if (!rowCount) throw new AuthServiceError('This link has expired or was already used.', 400, 'bad_token');

  await query(
    `UPDATE users SET email_verified = TRUE, updated_at = NOW()
       WHERE id = (SELECT user_id FROM auth_tokens WHERE token_hash = $1)`,
    [hashToken(tokenRaw)],
  );
};

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

/** Always resolves, whether or not the address exists, so accounts cannot be enumerated. */
export const requestPasswordReset = async (emailRaw: unknown): Promise<void> => {
  let email: string;
  try {
    email = normalizeEmail(emailRaw);
  } catch {
    return;
  }
  const user = await findByEmail(email);
  if (!user) {
    log.info(`password reset requested for unknown address ${email}; no email sent`);
    return;
  }
  await query(
    `UPDATE auth_tokens SET consumed_at = NOW()
       WHERE user_id = $1 AND purpose = 'reset_password' AND consumed_at IS NULL`,
    [user.id],
  );
  const token = newOneTimeToken(RESET_TTL_MINUTES);
  await query(
    `INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at) VALUES ($1, 'reset_password', $2, $3)`,
    [user.id, token.hash, token.expiresAt],
  );
  await sendPasswordResetEmail(user.email, token.token);
};

export const resetPassword = async (tokenRaw: unknown, newPassword: unknown): Promise<void> => {
  if (typeof tokenRaw !== 'string' || !tokenRaw) {
    throw new AuthServiceError('This link is not valid.', 400, 'bad_token');
  }
  const problem = validatePassword(newPassword as string);
  if (problem) throw new AuthServiceError(problem.message, 400, 'weak_password');

  const hash = hashToken(tokenRaw);
  const passwordHash = await hashPassword(newPassword as string);

  await transaction(async (client) => {
    const { rows } = await client.query<{ user_id: string }>(
      `UPDATE auth_tokens SET consumed_at = NOW()
         WHERE token_hash = $1 AND purpose = 'reset_password'
           AND consumed_at IS NULL AND expires_at > NOW()
         RETURNING user_id`,
      [hash],
    );
    const userId = rows[0]?.user_id;
    if (!userId) throw new AuthServiceError('This link has expired or was already used.', 400, 'bad_token');

    await client.query(`UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1`, [
      userId,
      passwordHash,
    ]);
    // Anyone holding a session from before the reset loses it.
    await client.query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`, [
      userId,
    ]);
  });
};

export const changePassword = async (
  userId: string,
  currentPassword: unknown,
  newPassword: unknown,
): Promise<void> => {
  const user = await findById(userId);
  if (!user) throw new AuthServiceError('Account not found.', 404, 'no_account');
  const ok = await verifyPassword(String(currentPassword ?? ''), user.password_hash);
  if (!ok) throw new AuthServiceError('Current password is incorrect.', 401, 'bad_credentials');

  const problem = validatePassword(newPassword as string);
  if (problem) throw new AuthServiceError(problem.message, 400, 'weak_password');

  const passwordHash = await hashPassword(newPassword as string);
  await query(`UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1`, [userId, passwordHash]);
  await signOutEverywhere(userId);
};

// ---------------------------------------------------------------------------
// Deletion
// ---------------------------------------------------------------------------

/**
 * Apple requires an in-app path to delete the account, so this is a product
 * requirement rather than a nicety.
 *
 * The row is soft-deleted and every session revoked immediately: the account
 * stops working at once, the email is freed for reuse, and the data survives a
 * short grace window in case the deletion was a mistake. `purgeDeletedAccounts`
 * removes it for good.
 */
export const deleteAccount = async (userId: string, password: unknown): Promise<void> => {
  const user = await findById(userId);
  if (!user) throw new AuthServiceError('Account not found.', 404, 'no_account');
  const ok = await verifyPassword(String(password ?? ''), user.password_hash);
  if (!ok) throw new AuthServiceError('Password is incorrect.', 401, 'bad_credentials');

  await transaction(async (client) => {
    // Scramble the stored email so the address can be reused straight away
    // while the row is retained for the grace period.
    await client.query(
      `UPDATE users
          SET deleted_at = NOW(),
              email = $2,
              updated_at = NOW()
        WHERE id = $1`,
      [userId, `deleted+${userId}@fitbuilder.invalid`],
    );
    await client.query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1`, [userId]);
  });
  log.info(`account ${userId} marked for deletion`);
};

/** Removes accounts soft-deleted longer ago than the grace period. Cascades to all user data. */
export const purgeDeletedAccounts = async (graceDays: number): Promise<number> => {
  const { rowCount } = await query(
    `DELETE FROM users WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - ($1 || ' days')::interval`,
    [String(graceDays)],
  );
  if (rowCount) log.info(`purged ${rowCount} deleted account(s)`);
  return rowCount ?? 0;
};

/** Drops expired and long-revoked tokens so the tables stay small. */
export const pruneTokens = async (): Promise<void> => {
  await query(`DELETE FROM refresh_tokens WHERE expires_at < NOW() - interval '7 days'`);
  await query(`DELETE FROM auth_tokens WHERE expires_at < NOW() - interval '7 days'`);
};

export { timingSafeEqual };
