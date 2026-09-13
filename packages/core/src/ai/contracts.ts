/**
 * Wire contracts shared by the client (`ai/client.ts`) and the API server
 * (`apps/api`). Keep this file free of runtime imports so the server can
 * consume it as pure types.
 */
import type {
  ClothingCategory,
  ClothingItem,
  Fit,
  FitRenderView,
  GarmentAnalysis,
  SuggestedItem,
} from '../types/models';

// ---------------------------------------------------------------------------
// AI stylist (text) — unchanged from the original app
// ---------------------------------------------------------------------------

export interface AiStylistPayload {
  prompt: string;
  wardrobe: ClothingItem[];
  mode: 'manual' | 'ai' | 'generator';
  ownershipFilter: 'owned-only' | 'include-new';
  weather?: {
    tempC: number;
    condition: string;
  };
}

export interface AiStylistSuggestion {
  id: string;
  title: string;
  rationale: string;
  ownedItemIds: string[];
  suggestedItems: SuggestedItem[];
}

export interface AiStylistResponse {
  suggestions: AiStylistSuggestion[];
}

// ---------------------------------------------------------------------------
// Async jobs — every image pipeline call returns a job and is polled
// ---------------------------------------------------------------------------

export type JobStatus = 'queued' | 'processing' | 'done' | 'failed';

export interface Job<TResult> {
  id: string;
  kind: 'garment' | 'tryon' | 'styleframe';
  status: JobStatus;
  /** Human-readable current stage, e.g. "Removing background". */
  step?: string;
  /** 0..1 when known. */
  progress?: number;
  result?: TResult;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

/** An image on the wire: a data URL (base64) or an https URL the server can fetch. */
export type ImageRef = string;

// ---------------------------------------------------------------------------
// Garment pipeline: upload → cutout → analysis → ghost mannequin
// (analysis runs before ghost so catalogued facts feed the ghost prompt)
// ---------------------------------------------------------------------------

export interface GarmentProcessRequest {
  image: ImageRef;
  /** Wardrobe item id, echoed back so the client can match results. */
  itemId?: string;
  /** User-provided hint. Improves analysis and the ghost render prompt. */
  categoryHint?: ClothingCategory;
  options?: {
    /** Remove background and return an RGBA cutout. Default true. */
    cutout?: boolean;
    /** Extract attributes with a vision model. Default true. */
    analyze?: boolean;
    /** Produce the ghost-mannequin render. Default true. */
    ghost?: boolean;
    /** Prefer local (Ollama) analysis over cloud where available. Default true. */
    preferLocal?: boolean;
  };
}

export interface GarmentProcessResult {
  itemId?: string;
  originalImageUrl: ImageRef;
  cutoutImageUrl?: ImageRef;
  ghostImageUrl?: ImageRef;
  analysis?: GarmentAnalysis;
  /** Which providers handled which step, for debugging and cost tracking. */
  providers: Partial<Record<'cutout' | 'analysis' | 'ghost', string>>;
}

export type GarmentJob = Job<GarmentProcessResult>;

// ---------------------------------------------------------------------------
// Try-on: put one or more garments on the user's body photo
// ---------------------------------------------------------------------------

export interface TryOnGarment {
  itemId: string;
  image: ImageRef;
  category: ClothingCategory;
}

export interface TryOnRequest {
  /** Full-body photo of the user. */
  bodyImage: ImageRef;
  garments: TryOnGarment[];
  fitId?: string;
  options?: {
    /** 'fast' trades fidelity for latency and cost. */
    quality?: 'fast' | 'balanced' | 'quality';
    /** Free-text steering, e.g. "tucked in", "sleeves rolled". */
    prompt?: string;
  };
}

export interface TryOnResult {
  fitId?: string;
  imageUrl: ImageRef;
  provider: string;
}

export type TryOnJob = Job<TryOnResult>;

// ---------------------------------------------------------------------------
// Style frame: consistent multi-view renders of an already-generated look
// ---------------------------------------------------------------------------

export interface StyleFrameRequest {
  /** Usually a TryOnResult.imageUrl; any full-body render works. */
  sourceImage: ImageRef;
  views: FitRenderView[];
  fitId?: string;
  options?: {
    background?: 'studio' | 'city' | 'nature' | 'keep';
  };
}

export interface StyleFrameResult {
  fitId?: string;
  frames: { view: FitRenderView; imageUrl: ImageRef }[];
  provider: string;
}

export type StyleFrameJob = Job<StyleFrameResult>;

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

export interface ApiErrorBody {
  error: string;
  code?: string;
}

/** Shape of the server's health endpoint; the client uses it to show which features are live. */
export interface HealthResponse {
  ok: boolean;
  version: string;
  providers: {
    fal: boolean;
    openai: boolean;
    ollama: boolean;
    weather: boolean;
  };
  /** Present when the API checks Railway/Postgres connectivity. */
  database?: {
    configured: boolean;
    ok?: boolean;
  };
  /** Whether this server demands a verified session token. */
  auth?: {
    required: boolean;
    configured: boolean;
  };
}

// ---------------------------------------------------------------------------
// Account usage and entitlement
// ---------------------------------------------------------------------------

export type Tier = 'free' | 'pro';

/** Actions that cost money per call and are therefore metered per account. */
export type MeteredAction = 'garments' | 'tryons' | 'styleframes' | 'stylist';

export interface QuotaLine {
  used: number;
  limit: number;
  remaining: number;
}

export interface UsageResponse {
  userId: string;
  tier: Tier;
  expiresAt?: string;
  /** `YYYY-MM` bucket the counts belong to. */
  period: string;
  /** When the allowance refills. */
  resetsAt: string;
  quota: Record<MeteredAction, QuotaLine>;
}

/** Body returned with HTTP 402 when an account is out of allowance. */
export interface QuotaExceededBody extends ApiErrorBody {
  code: 'quota_exceeded';
  quota: { action: MeteredAction; used: number; limit: number; remaining: number; cost: number };
  tier: Tier;
  resetsAt: string;
}

export type { ClothingCategory, ClothingItem, Fit, GarmentAnalysis };
