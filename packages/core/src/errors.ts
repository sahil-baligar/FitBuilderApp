/**
 * Error types shared by every client call.
 *
 * `ApiError` lives here rather than in `ai/client.ts` so `auth/session.ts` can
 * extend it without the two modules importing each other. That matters to
 * callers: a 401 can come from either an account call or a pipeline call, and
 * one `instanceof ApiError` check should cover both.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The request needs a signed-in account, or the session is no longer valid. */
export const isUnauthorized = (err: unknown): boolean => err instanceof ApiError && err.status === 401;

/** The account is out of allowance for a metered action. */
export const isQuotaExceeded = (err: unknown): boolean => err instanceof ApiError && err.status === 402;

/** The server could not be reached at all, as opposed to refusing the request. */
export const isOffline = (err: unknown): boolean =>
  err instanceof TypeError || (err instanceof ApiError && err.status === 0);
