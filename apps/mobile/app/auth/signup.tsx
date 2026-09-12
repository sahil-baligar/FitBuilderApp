import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useApp } from '@fitbuilder/core';
import { Button, Card, Field, Header, Muted, Screen } from '../../src/components/ui';
import { useToast } from '../../src/components/Toast';
import { errorMessage } from '../../src/lib/format';
import { colors, spacing } from '../../src/theme';

export default function SignupScreen() {
  const router = useRouter();
  const { signup, cloudAvailable } = useApp();
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSignup = async () => {
    if (!email.trim() || !password) {
      toast.error('Missing fields', 'Enter email and password.');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match', 'Please make sure your passwords match.');
      return;
    }
    if (password.length < 8) {
      toast.error('Password too short', 'Password must be at least 8 characters long.');
      return;
    }

    setIsLoading(true);
    try {
      await signup(email.trim(), password);
      toast.success(
        'Account created!',
        name.trim()
          ? `Welcome, ${name.trim()}. Start building your wardrobe.`
          : 'Welcome to FitBuilder. Start building your wardrobe.',
      );
      router.replace('/');
    } catch (e) {
      toast.error('Signup failed', errorMessage(e, 'Please try again or use a different email.'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Screen>
      <Header title="Join FitBuilder" subtitle="Create your account to get started" back />

      <Card style={styles.card}>
        {!cloudAvailable ? (
          <Muted style={{ marginBottom: spacing.md }}>
            Cloud sync is not configured on this build. Signup will fail until Supabase is set up.
          </Muted>
        ) : null}

        <Field
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          autoComplete="name"
          textContentType="name"
        />
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
          autoComplete="new-password"
          textContentType="newPassword"
          hint="At least 8 characters"
        />
        <Field
          label="Confirm password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="••••••••"
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          onSubmitEditing={handleSignup}
        />

        <Button
          title={isLoading ? 'Creating account...' : 'Create Account'}
          full
          loading={isLoading}
          onPress={handleSignup}
        />

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Already have an account?{' '}
            <Link href="/auth/login" style={styles.link}>
              Sign in
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
