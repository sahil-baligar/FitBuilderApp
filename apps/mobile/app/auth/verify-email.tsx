import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BadgeCheck } from 'lucide-react-native';
import { resendVerification, useApp, verifyEmail } from '@fitbuilder/core';
import { Button, Card, Header, Muted, Notice, Screen } from '../../src/components/ui';
import { useToast } from '../../src/components/Toast';
import { describeApiError } from '../../src/lib/quota';
import { colors, spacing } from '../../src/theme';

type State =
  | { status: 'idle' }
  | { status: 'verifying' }
  | { status: 'done' }
  | { status: 'failed'; message: string };

export default function VerifyEmailScreen() {
  const router = useRouter();
  const toast = useToast();
  const { account, reloadAccount } = useApp();
  // The confirmation email links to /verify-email?token=…
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [state, setState] = useState<State>({ status: 'idle' });
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (!token) return;
    let active = true;
    setState({ status: 'verifying' });
    verifyEmail(token)
      .then(async () => {
        if (!active) return;
        setState({ status: 'done' });
        // Pick up emailVerified so Settings stops nagging, if this device is
        // the signed-in one. Signing in is not required to verify.
        await reloadAccount().catch(() => undefined);
      })
      .catch((err) => {
        if (!active) return;
        setState({ status: 'failed', message: describeApiError(err, 'Could not confirm this address').message });
      });
    return () => {
      active = false;
    };
  }, [token, reloadAccount]);

  const handleResend = useCallback(async () => {
    setResending(true);
    try {
      await resendVerification();
      toast.success('Email sent', 'A fresh confirmation link is on its way.');
    } catch (e) {
      const described = describeApiError(e, 'Could not resend the email');
      toast.error(described.title, described.message);
    } finally {
      setResending(false);
    }
  }, [toast]);

  const resendAction = account ? (
    <Button title={resending ? 'Sending…' : 'Resend the email'} size="sm" loading={resending} onPress={handleResend} />
  ) : (
    <Button title="Sign in to resend" size="sm" variant="outline" onPress={() => router.push('/auth/login')} />
  );

  return (
    <Screen>
      <Header title="Confirm your email" back />

      <Card style={styles.card}>
        {!token ? (
          <>
            <Notice
              tone="warning"
              title="This link is incomplete"
              body="Open the confirmation link from your email — it carries a one-time token that this page needs."
              action={resendAction}
            />
            <Button title="Go to the app" variant="ghost" full onPress={() => router.replace('/')} />
          </>
        ) : state.status === 'verifying' || state.status === 'idle' ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.primary} />
            <Muted>Confirming your address…</Muted>
          </View>
        ) : state.status === 'done' ? (
          <>
            <Notice
              tone="success"
              icon={<BadgeCheck size={16} color={colors.success} />}
              title="Email confirmed"
              body="Your address is verified. Password resets will now reach you."
            />
            <Button title={account ? 'Back to the app' : 'Sign in'} full onPress={() => router.replace(account ? '/' : '/auth/login')} />
          </>
        ) : (
          <>
            <Notice
              tone="warning"
              title="That link has expired"
              body={`${state.message} Confirmation links are good for 24 hours and can only be used once.`}
              action={resendAction}
            />
            <Button title="Go to the app" variant="ghost" full onPress={() => router.replace('/')} />
          </>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.lg },
  centered: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg },
});
