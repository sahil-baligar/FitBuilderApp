import Constants from 'expo-constants';
import { Platform } from 'react-native';

const trimSlash = (s: string) => s.replace(/\/+$/, '');

/** Port the local API listens on in development. */
const DEV_API_PORT = process.env.EXPO_PUBLIC_API_PORT?.trim() || '8788';

/**
 * In development, derive the API host from the Expo dev server we were loaded
 * from. On a physical phone `localhost` is the phone itself, so a hardcoded
 * localhost URL can never reach the developer machine. `hostUri` is the LAN
 * address Expo Go already connected to, which is exactly the host we want.
 * Returns undefined in production builds or when the host is unknown.
 */
const devApiOrigin = (): string | undefined => {
  if (!__DEV__) return undefined;
  const hostUri = Constants.expoConfig?.hostUri ?? (Constants as { expoGoConfig?: { debuggerHost?: string } }).expoGoConfig?.debuggerHost;
  const host = hostUri?.split('/')[0]?.split(':')[0];
  if (!host) return undefined;
  // On web the page origin already points at the right machine.
  if (Platform.OS === 'web' && (host === 'localhost' || host === '127.0.0.1')) return undefined;
  return `http://${host}:${DEV_API_PORT}`;
};

// Explicit env wins; then the Expo dev host; then localhost for web dev.
const rawApi =
  process.env.EXPO_PUBLIC_API_URL?.trim() ||
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ||
  devApiOrigin() ||
  `http://localhost:${DEV_API_PORT}`;
const origin = trimSlash(rawApi);

/** Full API base URL, always ending in `/api`. */
export const API_BASE_URL = origin.endsWith('/api') ? origin : `${origin}/api`;
