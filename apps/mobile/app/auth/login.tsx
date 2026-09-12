import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useApp } from '@fitbuilder/core';
import { Button, Card, Field, Header, Muted, Screen } from '../../src/components/ui';
import { useToast } from '../../src/components/Toast';
import { errorMessage } from '../../src/lib/format';
import { colors, spacing } from '../../src/theme';

export default function LoginScreen() {
  const router = useRouter();
  const { login, cloudAvailable } = useApp();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      toast.error('Missing fields', 'Enter email and password.');
      return;
    }
    setIsLoading(true);
    try {
      await login(email.trim(), password);
      toast.success('Welcome back!', 'You have successfully logged in.');
      router.replace('/');
    } catch (e) {
      toast.error('Login failed', errorMessage(e, 'Please check your credentials and try again.'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Screen>
      <Header title="Welcome back" subtitle="Sign in to sync your wardrobe" back />

      <Card style={styles.card}>
        {!cloudAvailable ? (
          <Muted style={{ marginBottom: spacing.md }}>
            Cloud sync is not configured on this build. You can still browse as a guest.
          </Muted>
        ) : null}

        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          secureTextEntry
          autoComplete="password"
          textContentType="password"
          onSubmitEditing={handleLogin}
        />

        <Button title={isLoading ? 'Signing in...' : 'Sign In'} full loading={isLoading} onPress={handleLogin} />

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Don't have an account?{' '}
            <Link href="/auth/signup" style={styles.link}>
              Sign up
            </Link>
          </Text>
          <Button title="Continue as Guest" variant="ghost" size="sm" onPress={() => router.replace('/')} />
          <Button title="Back to Settings" variant="ghost" size="sm" onPress={() => router.push('/settings')} />
        </View>
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
