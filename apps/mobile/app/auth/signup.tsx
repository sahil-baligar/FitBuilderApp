import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useApp } from '@fitbuilder/core';
import { Button, Card, Field, Header, Muted, Notice, Screen } from '../../src/components/ui';
import { useToast } from '../../src/components/Toast';
import { describeApiError } from '../../src/lib/quota';
import { colors, spacing } from '../../src/theme';

const MIN_PASSWORD = 8;

export default function SignupScreen() {
  const router = useRouter();
  const { signup } = useApp();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const longEnough = password.length >= MIN_PASSWORD;
  const matches = confirmPassword.length > 0 && password === confirmPassword;

  const handleSignup = async () => {
    if (!email.trim()) {
      setError('Enter the email address you want the account under.');
      return;
    }
    if (!longEnough) {
      setError(`Your password needs at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError('The two passwords do not match.');
      return;
    }

    setError(null);
    setIsLoading(true);
    try {
      await signup(email.trim(), password);
      toast.success('Account created', 'Check your email to confirm the address.');
      router.replace('/');
    } catch (e) {
      setError(describeApiError(e, 'Could not create the account').message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Screen>
      <Header title="Join FitBuilder" subtitle="Create an account to sync and use AI features" back />

      <Card style={styles.card}>
        {error ? <Notice tone="error" title="Could not create the account" body={error} /> : null}

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
          returnKeyType="next"
        />

        <View style={{ gap: 6 }}>
          <Field
            label="Password"
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
          {/* The rule is stated up front, and ticks off as it is met, so nobody
              learns it from a rejection after pressing the button. */}
          <View style={styles.rule}>
            <Check size={14} color={longEnough ? colors.success : colors.mutedForeground} />
            <Text style={[styles.ruleText, longEnough && { color: colors.success }]}>
              At least {MIN_PASSWORD} characters
            </Text>
          </View>
        </View>

        <View style={{ gap: 6 }}>
          <Field
            label="Confirm password"
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
            onSubmitEditing={handleSignup}
          />
          {confirmPassword.length > 0 ? (
            <View style={styles.rule}>
              <Check size={14} color={matches ? colors.success : colors.mutedForeground} />
              <Text style={[styles.ruleText, matches && { color: colors.success }]}>
                {matches ? 'Passwords match' : 'Passwords do not match yet'}
              </Text>
            </View>
          ) : null}
        </View>

        <Button
          title={isLoading ? 'Creating account…' : 'Create account'}
          full
          loading={isLoading}
          onPress={handleSignup}
        />

        <Muted>
          We send one email to confirm the address. Confirming it is what makes a password reset possible later.
        </Muted>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Already have an account?{' '}
            <Link href="/auth/login" style={styles.link}>
              Sign in
            </Link>
          </Text>
          <Button title="Continue as guest" variant="ghost" size="sm" onPress={() => router.replace('/')} />
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.lg },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ruleText: { fontSize: 12, color: colors.mutedForeground },
  footer: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  footerText: { fontSize: 14, color: colors.mutedForeground },
  link: { color: colors.primary, fontWeight: '600' },
});
