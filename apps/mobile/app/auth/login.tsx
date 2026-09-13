import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useApp } from '@fitbuilder/core';
import { Button, Card, Field, Header, Notice, Screen } from '../../src/components/ui';
import { useToast } from '../../src/components/Toast';
import { describeApiError } from '../../src/lib/quota';
import { colors, spacing } from '../../src/theme';

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useApp();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      await login(email.trim(), password);
      toast.success('Welcome back', 'Your wardrobe is syncing.');
      router.replace('/');
    } catch (e) {
      // The server's own wording is the useful part here ("Email or password is
      // incorrect", "Too many attempts"), so show it inline rather than a toast
      // the reader has to catch before it fades.
      setError(describeApiError(e, 'Could not sign in').message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Screen>
      <Header title="Welcome back" subtitle="Sign in to sync your wardrobe" back />

      <Card style={styles.card}>
        {error ? <Notice tone="error" title="Could not sign in" body={error} /> : null}

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
        <Field
          label="Password"
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            setError(null);
          }}
          placeholder="••••••••"
          secureTextEntry
          autoComplete="password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={handleLogin}
        />

        <Link href="/auth/forgot-password" style={styles.forgot}>
          Forgot password?
        </Link>

        <Button title={isLoading ? 'Signing in…' : 'Sign in'} full loading={isLoading} onPress={handleLogin} />

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Don&apos;t have an account?{' '}
            <Link href="/auth/signup" style={styles.link}>
              Sign up
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
  forgot: { color: colors.primary, fontWeight: '600', fontSize: 13, alignSelf: 'flex-start' },
  footer: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  footerText: { fontSize: 14, color: colors.mutedForeground },
  link: { color: colors.primary, fontWeight: '600' },
});
