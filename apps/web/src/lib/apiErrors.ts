import { ApiError, AuthError, QuotaError, type MeteredAction } from '@fitbuilder/core';

/**
 * One place to turn an API failure into words a person can act on.
 *
 * The API rejects unauthenticated calls in production but runs open in local
 * dev (everything is attributed to a single dev user), so every caller has to
 * cope with both a 401 and a perfectly ordinary success.
 */

export interface ErrorMessage {
  title: string;
  description: string;
}

/** Singular, for "1 more try-on left". */
export const actionLabel: Record<MeteredAction, string> = {
  garments: 'garment',
  tryons: 'try-on',
  styleframes: 'style frame',
  stylist: 'AI stylist request',
};

/** Plural, for "3 try-ons a month". */
export const actionLabelPlural: Record<MeteredAction, string> = {
  garments: 'garments',
  tryons: 'try-ons',
  styleframes: 'style frames',
  stylist: 'AI stylist requests',
};

/** What the free plan buys, mirrored from the API so the copy can name it. */
export const freeTierCopy = '15 garments, 3 try-ons and 3 style frames a month';

export const formatResetDate = (iso: string | undefined): string => {
  if (!iso) return 'the start of next month';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'the start of next month';
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
};

/** `fetch` rejects with a TypeError when the server cannot be reached at all. */
export const isOfflineError = (err: unknown): boolean =>
  err instanceof TypeError || (err instanceof Error && err.message.includes('Failed to fetch'));

export const isSignedOutError = (err: unknown): boolean =>
  (err instanceof ApiError || err instanceof AuthError) && err.status === 401;

/** The AI stylist has a zero allowance on free, so 402 there means "upgrade", not "slow down". */
export const isProOnlyError = (err: QuotaError): boolean => err.quota.action === 'stylist' || err.quota.limit === 0;

export const describeQuota = (err: QuotaError): ErrorMessage => {
  if (isProOnlyError(err)) {
    return {
      title: 'FitBuilder Pro feature',
      description: `The AI stylist is part of FitBuilder Pro. Your free plan covers ${freeTierCopy}. Pro is coming soon.`,
    };
  }
  const plural = actionLabelPlural[err.quota.action];
  return {
    title: `Monthly ${plural} limit reached`,
    description: `Your ${err.tier} plan includes ${err.quota.limit} ${plural} per month and you have used ${err.quota.used}. Your allowance resets on ${formatResetDate(err.resetsAt)}.`,
  };
};

export const signInPrompt: ErrorMessage = {
  title: 'Sign in to continue',
  description: 'This action needs a FitBuilder account so it can be counted against your monthly allowance.',
};

export const offlineMessage = (title: string): ErrorMessage => ({
  title,
  description: 'Could not reach the FitBuilder API. Check that the server is running, then try again.',
});

/** Turn any thrown value into a toast-ready title and description. */
export const describeApiError = (err: unknown, fallbackTitle: string): ErrorMessage => {
  if (err instanceof QuotaError) return describeQuota(err);
  if (isSignedOutError(err)) return signInPrompt;
  if (isOfflineError(err)) return offlineMessage(fallbackTitle);
  return {
    title: fallbackTitle,
    description: err instanceof Error && err.message ? err.message : 'Something went wrong. Please try again.',
  };
};

/** Sign-in, sign-up and the token flows all fail through AuthError. */
export const describeAuthError = (err: unknown, fallbackTitle: string): ErrorMessage => {
  if (isOfflineError(err)) return offlineMessage(fallbackTitle);
  if (err instanceof AuthError) {
    switch (err.code) {
      case 'invalid_credentials':
        return { title: 'Incorrect email or password', description: 'Check the address and password and try again.' };
      case 'email_taken':
        return { title: 'That email is already registered', description: 'Sign in instead, or reset your password.' };
      case 'email_not_verified':
        return {
          title: 'Verify your email first',
          description: 'Open the link we sent you, then sign in again.',
        };
      case 'invalid_token':
      case 'token_expired':
        return { title: 'That link has expired', description: 'Links can only be used once. Please request a new one.' };
      case 'weak_password':
        return { title: 'Choose a stronger password', description: err.message };
      default:
        break;
    }
    if (err.status === 401) {
      return { title: 'Incorrect email or password', description: 'Check the address and password and try again.' };
    }
    if (err.status === 429) {
      return { title: 'Too many attempts', description: 'Please wait a minute before trying again.' };
    }
    return { title: fallbackTitle, description: err.message };
  }
  return {
    title: fallbackTitle,
    description: err instanceof Error && err.message ? err.message : 'Something went wrong. Please try again.',
  };
};
