/**
 * Wires the platform into `@fitbuilder/core`. Imported once at the top of
 * `app/_layout.tsx` so it runs before any component renders.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setCoreConfig, setStorageDriver } from '@fitbuilder/core';
import { API_BASE_URL, SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import { storageDriver } from './storage';

let booted = false;

export const bootstrapCore = () => {
  if (booted) return;
  booted = true;
  setStorageDriver(storageDriver);
  setCoreConfig({
    apiBaseUrl: API_BASE_URL,
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY,
    supabaseAuthStorage: AsyncStorage,
    detectSessionInUrl: false,
  });
};

bootstrapCore();
