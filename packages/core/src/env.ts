/**
 * Runtime configuration injected by the host platform.
 * Web reads Vite `import.meta.env`; Expo reads `process.env.EXPO_PUBLIC_*`.
 * Core never touches either directly.
 */
export interface CoreConfig {
  /** Absolute or root-relative base URL of the FitBuilder API, no trailing slash. */
  apiBaseUrl: string;
}

let config: CoreConfig = { apiBaseUrl: '/api' };

export const setCoreConfig = (next: Partial<CoreConfig>) => {
  config = { ...config, ...next };
};

export const getCoreConfig = (): CoreConfig => config;
