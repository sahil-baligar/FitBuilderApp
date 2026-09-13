import { getCoreConfig } from '../env';
import { getStorageDriver } from '../storage/registry';

/**
 * Client-side session handling against the FitBuilder API.
 *
 * Tokens live in the platform's `StorageDriver`, so the same code works on
 * AsyncStorage, IndexedDB or memory. The access token is short-lived; every
 * authorised request goes through `withAccessToken`, which refreshes it once,
 * transparently, when it is close to expiry or already rejected.
 */

const STORAGE_KEY = 'session';

export interface Account {
  id: string;
  email: string;
  emailVerified: boolean;
  tier: 'free' | 'pro';
  createdAt: string;
}

export interface StoredSession {
  account: Account;
  accessToken: string;
  refreshToken: string;
  /** Epoch ms at which the access token expires. */
  expiresAt: number;
}

interface SessionPayload {
  account: Account;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

type Listener = (session: StoredSession | null) => void;

const listeners = new Set<Listener>();
let cached: StoredSession | null | undefined;
let refreshInFlight: Promise<StoredSession | null> | undefined;

const store = () => getStorageDriver().getNamespace('metadata');

const notify = (session: StoredSession | null) => {
  for (const listener of listeners) {
    try {
      listener(session);
    } catch {
      /* a bad listener must not break sign-in */
    }
  }
};

/** Subscribe to sign-in and sign-out. Returns an unsubscribe function. */
export const onSessionChange = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const persist = async (session: StoredSession | null) => {
  cached = session;
  if (session) await store().setItem(STORAGE_KEY, session);
  else await store().removeItem(STORAGE_KEY);
  notify(session);
};

export const getSession = async (): Promise<StoredSession | null> => {
  if (cached !== undefined) return cached;
  cached = (await store().getItem<StoredSession>(STORAGE_KEY)) ?? null;
  return cached;
};

const toStored = (payload: SessionPayload): StoredSession => ({
  account: payload.account,
  accessToken: payload.accessToken,
  refreshToken: payload.refreshToken,
  // Refresh a little early so a request never races the expiry.
  expiresAt: Date.now() + Math.max(0, payload.expiresIn - 30) * 1000,
});

const authFetch = async <T,>(path: string, body?: unknown, token?: string): Promise<T> => {
  const { apiBaseUrl } = getCoreConfig();
  const res = await fetch(`${apiBaseUrl}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    throw new AuthError(
      typeof json.error === 'string' ? json.error : `Request failed (${res.status})`,
      res.status,
      typeof json.code === 'string' ? json.code : undefined,
    );
  }
  return json as T;
};

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

export const signUp = async (email: string, password: string): Promise<Account> => {
  const payload = await authFetch<SessionPayload>('/auth/signup', { email, password });
  await persist(toStored(payload));
  return payload.account;
};

export const signIn = async (email: string, password: string): Promise<Account> => {
  const payload = await authFetch<SessionPayload>('/auth/login', { email, password });
  await persist(toStored(payload));
  return payload.account;
};

export const signOut = async (): Promise<void> => {
  const session = await getSession();
  if (session) {
    // Best effort: the local session is cleared regardless.
    await authFetch('/auth/logout', { refreshToken: session.refreshToken }).catch(() => undefined);
  }
  await persist(null);
};

export const requestPasswordReset = (email: string) =>
  authFetch<{ ok: boolean; message: string }>('/auth/forgot-password', { email });

export const resetPassword = (token: string, password: string) =>
  authFetch<{ ok: boolean }>('/auth/reset-password', { token, password });

export const verifyEmail = (token: string) => authFetch<{ ok: boolean }>('/auth/verify-email', { token });

export const resendVerification = async () => {
  const token = await withAccessToken();
  return authFetch<{ ok: boolean }>('/auth/resend-verification', {}, token);
};

export const changePassword = async (currentPassword: string, password: string) => {
  const token = await withAccessToken();
  const result = await authFetch<{ ok: boolean }>('/auth/change-password', { currentPassword, password }, token);
  // Changing the password revokes every session, including this one.
  await persist(null);
  return result;
};

export const deleteAccount = async (password: string) => {
  const { apiBaseUrl } = getCoreConfig();
  const token = await withAccessToken();
  const res = await fetch(`${apiBaseUrl}/account`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ password }),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new AuthError(
      typeof json.error === 'string' ? json.error : 'Could not delete the account',
      res.status,
      typeof json.code === 'string' ? json.code : undefined,
    );
  }
  await persist(null);
  return json;
};

/** Re-reads the account from the server, picking up tier and verification changes. */
export const refreshAccount = async (): Promise<Account | null> => {
  const session = await getSession();
  if (!session) return null;
  const token = await withAccessToken();
  if (!token) return null;
  const account = await authFetch<Account>('/auth/me', undefined, token);
  await persist({ ...session, account });
  return account;
};

// ---------------------------------------------------------------------------
// Token access
// ---------------------------------------------------------------------------

const doRefresh = async (session: StoredSession): Promise<StoredSession | null> => {
  try {
    const payload = await authFetch<SessionPayload>('/auth/refresh', { refreshToken: session.refreshToken });
    const next = toStored(payload);
    await persist(next);
    return next;
  } catch (err) {
    // A refusal means the refresh token is spent, revoked or reused; the only
    // honest outcome is to sign out rather than retry forever.
    if (err instanceof AuthError && err.status === 401) {
      await persist(null);
      return null;
    }
    throw err;
  }
};

/**
 * Current access token, refreshed if it has expired. Returns undefined when
 * signed out, so callers can treat the API as anonymous rather than failing.
 * Concurrent callers share a single refresh.
 */
export const withAccessToken = async (): Promise<string | undefined> => {
  const session = await getSession();
  if (!session) return undefined;
  if (session.expiresAt > Date.now()) return session.accessToken;

  refreshInFlight ??= doRefresh(session).finally(() => {
    refreshInFlight = undefined;
  });
  const next = await refreshInFlight;
  return next?.accessToken;
};

/** Forces a refresh after the server rejected a token we believed was valid. */
export const forceRefresh = async (): Promise<string | undefined> => {
  const session = await getSession();
  if (!session) return undefined;
  refreshInFlight ??= doRefresh(session).finally(() => {
    refreshInFlight = undefined;
  });
  const next = await refreshInFlight;
  return next?.accessToken;
};

/** Clears the in-memory cache; used by tests and after a storage reset. */
export const resetSessionCache = () => {
  cached = undefined;
};
