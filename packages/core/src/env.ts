/**
 * Runtime configuration injected by the host platform.
 * Web reads Vite `import.meta.env`; Expo reads `process.env.EXPO_PUBLIC_*`.
 * Core never touches either directly.
 */
export interface SupabaseAuthStorage {
  getItem: (key: string) => Promise<string | null> | string | null;
  setItem: (key: string, value: string) => Promise<void> | void;
  removeItem: (key: string) => Promise<void> | void;
}

export interface CoreConfig {
  /** Absolute or root-relative base URL of the FitBuilder API, no trailing slash. */
  apiBaseUrl: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  /**
   * Storage adapter for supabase auth sessions. Required on React Native
   * (AsyncStorage); omit on web to use supabase-js defaults.
   */
  supabaseAuthStorage?: SupabaseAuthStorage;
  /** Set false on native: there is no URL hash to parse an OAuth session from. */
  detectSessionInUrl?: boolean;
}

let config: CoreConfig = { apiBaseUrl: '/api' };

export const setCoreConfig = (next: Partial<CoreConfig>) => {
  config = { ...config, ...next };
};

export const getCoreConfig = (): CoreConfig => config;
