import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Deep-link and web landing route.
 *
 * `apps/api/src/email/send.ts` builds confirmation links as
 * `${APP_URL}/verify-email?token=…`, so this path has to exist at the root for
 * both the web build and the `fitbuilder://` scheme. It hands the token to the
 * real screen rather than duplicating it.
 */
export default function VerifyEmailDeepLink() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  return <Redirect href={token ? `/auth/verify-email?token=${encodeURIComponent(token)}` : '/auth/verify-email'} />;
}
