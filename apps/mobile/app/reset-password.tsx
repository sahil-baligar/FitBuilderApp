import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Deep-link and web landing route for `${APP_URL}/reset-password?token=…`,
 * the link `apps/api/src/email/send.ts` puts in password-reset emails.
 */
export default function ResetPasswordDeepLink() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  return <Redirect href={token ? `/auth/reset-password?token=${encodeURIComponent(token)}` : '/auth/reset-password'} />;
}
