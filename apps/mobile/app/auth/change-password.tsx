import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';
import { changePassword, useApp } from '@fitbuilder/core';
import { Button, Card, Field, Header, Muted, Notice, Screen } from '../../src/components/ui';
import { useToast } from '../../src/components/Toast';
import { describeApiError } from '../../src/lib/quota';
import { colors, spacing } from '../../src/theme';

const MIN_PASSWORD = 8;

export default function ChangePasswordScreen() {
  const router = useRouter();
  const toast = useToast();
  const { account } = useApp();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const longEnough = next.length >= MIN_PASSWORD;

  const handleSubmit = async () => {
    if (!current) {
      setError('Enter your current password.');
      return;
    }
    if (!longEnough) {
      setError(`Your new password needs at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (next !== confirm) {
      setError('The two new passwords do not match.');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      await changePassword(current, next);
      // The API revokes every session on a password change, this one included,
      // so the only honest next step is a fresh sign-in.
      toast.success('Password changed', 'Sign in again with your new password.');
      router.replace('/auth/login');
    } catch (e) {
      setError(describeApiError(e, 'Could not change the password').message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!account) {
    return (
      <Screen>
        <Header title="Change password" back />
        <Card style={styles.card}>
          <Notice tone="info" title="You are signed out" body="Sign in first to change your password." />
          <Button title="Sign in" full onPress={() => router.replace('/auth/login')} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Header title="Change password" subtitle={account.email} back />

      <Card style={styles.card}>
        {error ? <Notice tone="error" title="Could not change the password" body={error} /> : null}

        <Field
          label="Current password"
          value={current}
          onChangeText={(v) => {
            setCurrent(v);
            setError(null);
          }}
          placeholder="••••••••"
          secureTextEntry
          autoComplete="password"
          textContentType="password"
          returnKeyType="next"
        />

        <View style={{ gap: 6 }}>
          <Field
            label="New password"
            value={next}
            onChangeText={(v) => {
              setNext(v);
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
          value={confirm}
          onChangeText={(v) => {
            setConfirm(v);
            setError(null);
          }}
          placeholder="••••••••"
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={handleSubmit}
        />

        <Button title={isLoading ? 'Saving…' : 'Change password'} full loading={isLoading} onPress={handleSubmit} />

        <Muted>Changing your password signs you out on every device, including this one.</Muted>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.lg },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ruleText: { fontSize: 12, color: colors.mutedForeground },
});
