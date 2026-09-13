import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { MailCheck } from 'lucide-react-native';
import { requestPasswordReset } from '@fitbuilder/core';
import { Button, Card, Field, Header, Muted, Notice, Screen } from '../../src/components/ui';
import { describeApiError, isOffline } from '../../src/lib/quota';
import { colors, spacing } from '../../src/theme';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim()) {
      setError('Enter the email address on the account.');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (e) {
      // A transport failure is worth reporting; anything the server says about
      // this address is not, because it would reveal whether the account
      // exists. Everything else reads as the same confirmation.
      if (isOffline(e)) setError(describeApiError(e).message);
      else setSent(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Screen>
      <Header title="Reset your password" subtitle="We'll email you a link" back />

      <Card style={styles.card}>
        {sent ? (
          <>
            <Notice
              tone="success"
              icon={<MailCheck size={16} color={colors.success} />}
              title="Check your email"
              body={`If an account exists for ${email.trim()}, a reset link is on its way. The link expires in one hour.`}
            />
            <Muted>
              Nothing arrived? Look in spam, then try again in a few minutes — we send the same reply either way, so
              this page can never tell you whether an address is registered.
            </Muted>
            <Button title="Back to sign in" full onPress={() => router.replace('/auth/login')} />
            <Button
              title="Use a different address"
              variant="ghost"
              size="sm"
              onPress={() => {
                setSent(false);
                setEmail('');
              }}
            />
          </>
        ) : (
          <>
            {error ? <Notice tone="error" title="Could not send the email" body={error} /> : null}

            <Muted>
              Enter the address on your account and we will send a link to set a new password.
            </Muted>

            <Field
              label="Email"
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                setError(null);
              }}
              placeholder="you@example.com"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="go"
              onSubmitEditing={handleSubmit}
            />

            <Button
              title={isLoading ? 'Sending…' : 'Send reset link'}
              full
              loading={isLoading}
              onPress={handleSubmit}
            />

            <View style={styles.footer}>
              <Text style={styles.footerText}>
                Remembered it?{' '}
                <Link href="/auth/login" style={styles.link}>
                  Sign in
                </Link>
              </Text>
            </View>
          </>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.lg },
  footer: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  footerText: { fontSize: 14, color: colors.mutedForeground },
  link: { color: colors.primary, fontWeight: '600' },
});
