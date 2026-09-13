import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { ApiError, AuthError, QuotaError, type MeteredAction } from '@fitbuilder/core';
import { useToast } from '../components/Toast';

/**
 * One place to turn an API failure into something a person can act on.
 *
 * Three failures need different words, not a red box: the account ran out of
 * a monthly allowance (wait or upgrade), the feature is Pro-only (nothing to
 * buy yet), and the API wants an account (sign in). Everything else falls back
 * to the server's own message.
 */

export const ACTION_LABEL: Record<MeteredAction, string> = {
  garments: 'Garment processing',
  tryons: 'Try-on renders',
  styleframes: 'Style frames',
  stylist: 'AI stylist',
};

/** Plural noun for "3 of 3 <unit> left". */
export const ACTION_UNIT: Record<MeteredAction, string> = {
  garments: 'garments',
  tryons: 'try-ons',
  styleframes: 'style frames',
  stylist: 'stylist replies',
};

export const formatResetDate = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'the start of next month';
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
};

/** A limit of zero is not an allowance that ran out — the plan never included it. */
export const isProOnly = (err: QuotaError): boolean => err.quota.limit <= 0;

export const isUnauthorized = (err: unknown): boolean =>
  (err instanceof ApiError || err instanceof AuthError) && err.status === 401;

/** A fetch that never reached the server throws TypeError, not ApiError. */
export const isOffline = (err: unknown): boolean =>
  err instanceof TypeError ||
  (err instanceof Error && /failed to fetch|network request failed|load failed/i.test(err.message));

export type ApiErrorKind = 'quota' | 'pro' | 'auth' | 'offline' | 'error';

export interface DescribedError {
  kind: ApiErrorKind;
  title: string;
  message: string;
}

export const describeApiError = (err: unknown, fallbackTitle = 'Something went wrong'): DescribedError => {
  if (err instanceof QuotaError) {
    const { action, limit, used } = err.quota;
    const unit = ACTION_UNIT[action] ?? 'requests';
    if (isProOnly(err)) {
      return {
        kind: 'pro',
        title: `${ACTION_LABEL[action] ?? 'This feature'} is part of FitBuilder Pro`,
        message: `The free plan does not include ${unit}. Pro is not on sale yet — it is coming soon.`,
      };
    }
    return {
      kind: 'quota',
      title: `You have used this month's ${unit}`,
      message: `The free plan includes ${limit} ${unit} a month and you have used ${used}. Your allowance resets on ${formatResetDate(
        err.resetsAt,
      )}.`,
    };
  }

  if (isUnauthorized(err)) {
    return {
      kind: 'auth',
      title: 'Sign in to continue',
      message: 'This needs a FitBuilder account. Your wardrobe stays on this device either way.',
    };
  }

  if (isOffline(err)) {
    return {
      kind: 'offline',
      title: 'Could not reach FitBuilder',
      message: 'Check your connection and try again. Your wardrobe still works offline.',
    };
  }

  return {
    kind: 'error',
    title: fallbackTitle,
    message: err instanceof Error && err.message ? err.message : 'Please try again.',
  };
};

/**
 * Reports a failed API action: a plain toast for quota and sign-in (they are
 * not errors the reader caused), a red one for real failures. Returns the
 * description so a screen can also show it inline.
 */
export const useApiErrorReporter = () => {
  const toast = useToast();
  const router = useRouter();

  return useCallback(
    (err: unknown, fallbackTitle = 'Something went wrong'): DescribedError => {
      const described = describeApiError(err, fallbackTitle);
      if (described.kind === 'quota' || described.kind === 'pro') {
        toast.toast(described.title, described.message);
      } else if (described.kind === 'auth') {
        toast.toast(described.title, described.message);
        router.push('/auth/login');
      } else {
        toast.error(described.title, described.message);
      }
      return described;
    },
    [router, toast],
  );
};
