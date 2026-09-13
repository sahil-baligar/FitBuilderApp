import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';
import { resetPassword } from '@fitbuilder/core';
import { Button, Card, Field, Header, Muted, Notice, Screen } from '../../src/components/ui';
import { useToast } from '../../src/components/Toast';
import { describeApiError } from '../../src/lib/quota';
import { colors, spacing } from '../../src/theme';

const MIN_PASSWORD = 8;

export default function ResetPasswordScreen() {
  const router = useRouter();
  const toast = useToast();
  // The email links to /reset-password?token=…; deep links and the web build
  // both land here with the token as a route param.
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const longEnough = password.length >= MIN_PASSWORD;

  const handleSubmit = async () => {
    if (!token) return;
    if (!longEnough) {
      setError(`Your new password needs at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError('The two passwords do not match.');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      await resetPassword(token, password);
      toast.success('Password changed', 'Sign in with your new password.');
      router.replace('/auth/login');
    } catch (e) {
      setError(describeApiError(e, 'Could not reset the password').message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <Screen>
        <Header title="Reset password" back />
        <Card style={styles.card}>
          <Notice
            tone="warning"
            title="This link is incomplete"
            body="Open the reset link from your email — it carries a one-time token that this page needs. Links expire one hour after they are sent."
          />
          <Button title="Request a new link" full onPress={() => router.replace('/auth/forgot-password')} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Header title="Choose a new password" subtitle="This signs you out everywhere else" back />

      <Card style={styles.card}>
        {error ? <Notice tone="error" title="Could not reset the password" body={error} /> : null}

        <View style={{ gap: 6 }}>
          <Field
            label="New password"
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              setError(null);
            }}
            placeholder="••••••••"
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="next"
          />
          <View style={styles.rule}>
            <Check size={14} color={longEnough ? colors.success : colors.mutedForeground} />
            <Text style={[styles.ruleText, longEnough && { color: colors.success }]}>
              At least {MIN_PASSWORD} characters
            </Text>
          </View>
        </View>

        <Field
          label="Confirm new password"
          value={confirmPassword}
          onChangeText={(v) => {
            setConfirmPassword(v);
            setError(null);
          }}
          placeholder="••••••••"
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={handleSubmit}
        />

        <Button title={isLoading ? 'Saving…' : 'Set new password'} full loading={isLoading} onPress={handleSubmit} />

        <Muted>Reset links expire one hour after they are sent and can only be used once.</Muted>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.lg },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ruleText: { fontSize: 12, color: colors.mutedForeground },
});
