import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getCoreConfig } from './env';

let client: SupabaseClient | null | undefined;
let clientKey = '';

/**
 * Lazily-built Supabase client. Returns null when the project is not
 * configured so every caller can treat cloud sync as optional.
 * Rebuilds if config changes (e.g. a test swaps credentials).
 */
export const getSupabase = (): SupabaseClient | null => {
  const { supabaseUrl, supabaseAnonKey, supabaseAuthStorage, detectSessionInUrl } = getCoreConfig();
  const key = `${supabaseUrl ?? ''}|${supabaseAnonKey ?? ''}`;
  if (client !== undefined && key === clientKey) return client;
  clientKey = key;
  if (!supabaseUrl || !supabaseAnonKey) {
    client = null;
    return client;
  }
  client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      ...(supabaseAuthStorage ? { storage: supabaseAuthStorage } : {}),
      detectSessionInUrl: detectSessionInUrl ?? true,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return client;
};
