// Must run before anything renders: registers the storage driver + core config.
import '../src/lib/bootstrap';

import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '@fitbuilder/core';
import { ToastProvider } from '../src/components/Toast';
import { colors } from '../src/theme';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <AppProvider>
          <ToastProvider>
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.background },
                animation: Platform.OS === 'web' ? 'none' : 'default',
              }}
            >
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="settings" />
              <Stack.Screen name="item/[id]" />
              <Stack.Screen name="fit/[id]" />
              <Stack.Screen name="auth/login" />
              <Stack.Screen name="auth/signup" />
              <Stack.Screen name="auth/forgot-password" />
              <Stack.Screen name="auth/reset-password" />
              <Stack.Screen name="auth/change-password" />
              <Stack.Screen name="auth/verify-email" />
              {/* Landing routes for the links in verification and reset emails. */}
              <Stack.Screen name="reset-password" />
              <Stack.Screen name="verify-email" />
            </Stack>
          </ToastProvider>
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
});
