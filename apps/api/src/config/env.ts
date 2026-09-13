import dotenv from 'dotenv';
import path from 'node:path';

// `npm run dev -w apps/api` runs with cwd=apps/api; running from the repo root
// or from dist should also pick up apps/api/.env.
dotenv.config({
  path: [path.resolve(process.cwd(), '.env'), path.resolve(process.cwd(), 'apps/api/.env')],
  quiet: true,
});

export type ProviderChoice = 'auto' | 'fal' | 'local' | 'ollama' | 'openai' | 'mock';

export interface Env {
  nodeEnv: string;
  port: number;
  corsOrigins: '*' | string[];
  dataDir: string;
  jobConcurrency: number;
  jobTtlMs: number;

  falKey?: string;
  openaiKey?: string;
  /** ChatGPT model for AI stylist (Responses API). */
  openaiTextModel: string;
  /** ChatGPT vision model for garment analysis. */
  openaiVisionModel: string;
  weatherKey?: string;
  /** Railway Postgres (or any Postgres) connection string for cloud sync tables. */
  databaseUrl?: string;

  ollamaUrl: string;
  ollamaVisionModel: string;
  ollamaTextModel: string;
  ollamaTimeoutMs: number;

  localCutoutModel: string;

  /** Signing key for access tokens. Required in production. */
  jwtSecret?: string;
  /** Public base URL of the app, used to build email links. */
  appUrl: string;
  /** Resend API key. Without it, emails are logged instead of sent. */
  resendApiKey?: string;
  /** From address for outbound email. */
  emailFrom: string;
  /** Days a soft-deleted account is retained before it is purged. */
  accountPurgeGraceDays: number;
  /**
   * When false the API accepts unauthenticated calls and attributes them to a
   * single local identity. Only ever false in development, and refused outright
   * in production.
   */
  authRequired: boolean;

  /** Free-tier allowances per rolling calendar month, per account. */
  quota: {
    garments: number;
    tryons: number;
    styleframes: number;
    stylist: number;
    /** Ceiling applied to Pro accounts so one runaway client cannot drain the balance. */
    proCeiling: number;
  };

  /** `PROVIDERS=mock` forces every capability offline. */
  forceMock: boolean;
  providers: {
    cutout: ProviderChoice;
    analysis: ProviderChoice;
    ghost: ProviderChoice;
    tryon: ProviderChoice;
    styleframe: ProviderChoice;
  };
}

const str = (key: string): string | undefined => {
  const v = process.env[key];
  return v && v.trim() !== '' ? v.trim() : undefined;
};

const int = (key: string, fallback: number): number => {
  const v = Number(str(key));
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
};

const choice = (key: string): ProviderChoice => {
  const v = (str(key) ?? 'auto').toLowerCase();
  const allowed: ProviderChoice[] = ['auto', 'fal', 'local', 'ollama', 'openai', 'mock'];
  return (allowed as string[]).includes(v) ? (v as ProviderChoice) : 'auto';
};

export const loadEnv = (): Env => {
  const nodeEnv = str('NODE_ENV') ?? 'development';
  const corsRaw = str('CORS_ORIGINS');
  const corsOrigins: '*' | string[] =
    !corsRaw || corsRaw === '*'
      ? '*'
      : corsRaw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);

  return {
    nodeEnv,
    port: int('PORT', 8787),
    corsOrigins,
    dataDir: path.resolve(process.cwd(), str('DATA_DIR') ?? './data'),
    jobConcurrency: int('JOB_CONCURRENCY', 2),
    jobTtlMs: int('JOB_TTL_HOURS', 24) * 60 * 60 * 1000,

    falKey: str('FAL_KEY'),
    openaiKey: str('OPENAI_API_KEY'),
    // Production default: ChatGPT. Override with OPENAI_TEXT_MODEL / OPENAI_VISION_MODEL.
    openaiTextModel: str('OPENAI_TEXT_MODEL') ?? 'gpt-4.1-mini',
    openaiVisionModel: str('OPENAI_VISION_MODEL') ?? 'gpt-4.1-mini',
    weatherKey: str('WEATHER_API_KEY'),
    databaseUrl: str('DATABASE_URL'),

    ollamaUrl: (str('OLLAMA_URL') ?? 'http://localhost:11434').replace(/\/+$/, ''),
    ollamaVisionModel: str('OLLAMA_VISION_MODEL') ?? 'qwen2.5vl:7b',
    ollamaTextModel: str('OLLAMA_TEXT_MODEL') ?? 'qwen2.5:3b-instruct',
    ollamaTimeoutMs: int('OLLAMA_TIMEOUT_MS', 240_000),

    localCutoutModel: str('LOCAL_CUTOUT_MODEL') ?? 'onnx-community/BiRefNet_lite',

    jwtSecret: str('JWT_SECRET'),
    appUrl: (str('APP_URL') ?? 'https://fitbuilder.app').replace(/\/+$/, ''),
    resendApiKey: str('RESEND_API_KEY'),
    emailFrom: str('EMAIL_FROM') ?? 'FitBuilder <noreply@fitbuilder.app>',
    accountPurgeGraceDays: int('ACCOUNT_PURGE_GRACE_DAYS', 30),
    // Secure by default: auth is on unless explicitly disabled for local work.
    authRequired: (str('AUTH_REQUIRED') ?? 'true').toLowerCase() !== 'false',

    quota: {
      garments: int('FREE_GARMENTS_PER_MONTH', 15),
      tryons: int('FREE_TRYONS_PER_MONTH', 3),
      styleframes: int('FREE_STYLEFRAMES_PER_MONTH', 3),
      // AI stylist is the paid feature; free accounts get none.
      stylist: Number(str('FREE_STYLIST_PER_MONTH') ?? '0') || 0,
      proCeiling: int('PRO_CEILING_PER_MONTH', 500),
    },

    forceMock: (str('PROVIDERS') ?? '').toLowerCase() === 'mock',
    providers: {
      cutout: choice('CUTOUT_PROVIDER'),
      // Default analysis to openai when key is present and ANALYSIS_PROVIDER unset → still 'auto',
      // but provider chain prefers OpenAI unless preferLocal=true.
      analysis: choice('ANALYSIS_PROVIDER'),
      ghost: choice('GHOST_PROVIDER'),
      tryon: choice('TRYON_PROVIDER'),
      styleframe: choice('STYLEFRAME_PROVIDER'),
    },
  };
};

export const env: Env = loadEnv();
