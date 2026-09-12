export type ClothingCategory = 'top' | 'bottom' | 'outerwear' | 'shoes' | 'accessories';
export type WeatherBand = 'cold' | 'cool' | 'warm' | 'hot';

export type AccessoryPlacement = 'head' | 'neck' | 'torso' | 'waist' | 'wrist' | 'hand';

export interface ClothingLayer {
  id: string;
  label: string;
  imageUrl: string;
  mode?: 'overlay' | 'open' | 'closed';
}

/**
 * Lifecycle of the server-side image pipeline for a wardrobe item.
 * `imageUrl` on the item always points at the best available render so UI
 * never has to reason about which stage completed.
 */
export type ProcessingStatus = 'idle' | 'queued' | 'processing' | 'done' | 'failed';
export type ProcessingStep = 'cutout' | 'analysis' | 'ghost' | 'finalize';

export interface ProcessingState {
  status: ProcessingStatus;
  step?: ProcessingStep;
  jobId?: string;
  error?: string;
  updatedAt: string;
}

/** Auto-extracted garment attributes. Populated by the vision model, editable by the user. */
export interface GarmentAnalysis {
  category: ClothingCategory;
  subcategory?: string;
  primaryColor: { name: string; hex: string };
  secondaryColors?: { name: string; hex: string }[];
  pattern?: 'solid' | 'striped' | 'plaid' | 'floral' | 'graphic' | 'textured' | 'other';
  material?: string;
  fit?: 'slim' | 'regular' | 'relaxed' | 'oversized';
  sleeveLength?: 'sleeveless' | 'short' | 'three-quarter' | 'long';
  neckline?: string;
  weatherSuitability: WeatherBand[];
  occasions?: string[];
  tags: string[];
  confidence?: number;
  source: 'local-vlm' | 'cloud-vlm' | 'user';
}

export interface ClothingItem {
  id: string;
  name: string;
  /** Display image: ghost render if available, else cutout, else original. */
  imageUrl: string;
  /** Raw user upload, untouched. */
  originalImageUrl?: string;
  /** Background-removed RGBA PNG. */
  cutoutImageUrl?: string;
  /** Ghost-mannequin render (garment shaped as if worn by an invisible body). */
  ghostImageUrl?: string;
  category: ClothingCategory;
  color: string;
  weatherSuitability: WeatherBand[];
  tags: string[];
  notes?: string;
  isVirtual?: boolean;
  layers?: ClothingLayer[];
  accessoryPlacement?: AccessoryPlacement;
  analysis?: GarmentAnalysis;
  processing?: ProcessingState;
  createdAt: string;
  updatedAt: string;
  isDeleted?: boolean;
}

export interface SuggestedItem {
  tempId: string;
  category: ClothingCategory;
  color?: string;
  description: string;
}

export type FitRenderKind = 'tryon' | 'styleframe' | 'flatlay';
export type FitRenderView = 'front' | 'side' | 'back' | 'torso';

/** A generated image of a saved fit, e.g. a try-on on the user's photo or a multi-view style frame. */
export interface FitRender {
  id: string;
  kind: FitRenderKind;
  view?: FitRenderView;
  imageUrl: string;
  provider?: string;
  createdAt: string;
}

export interface Fit {
  id: string;
  name: string;
  itemIds: string[];
  suggestedItems?: SuggestedItem[];
  weatherContext?: string;
  occasion?: string;
  notes?: string;
  source: 'manual' | 'ai' | 'generator';
  renders?: FitRender[];
  createdAt: string;
  updatedAt: string;
  isDeleted?: boolean;
}

export interface UserPreferences {
  defaultMode: 'manual' | 'ai' | 'generator';
  useLocation: boolean;
  allowVirtualItems: boolean;
  temperatureUnit: 'c' | 'f';
  manualWeather?: {
    temp: number;
    condition: string;
  };
  recentFitIds: string[];
  syncEnabled: boolean;
  /** Optional full-body photo used as the try-on base. Stored locally only. */
  bodyPhotoUrl?: string;
  /** Run ghost-mannequin processing automatically on every upload. */
  autoProcessUploads?: boolean;
}

export interface WeatherInfo {
  tempC: number;
  condition: string;
  humidity?: number;
  location: string;
  source: 'geo' | 'manual';
  fetchedAt: string;
}

export interface SyncMetadata {
  lastSyncedAt: string | null;
}

export interface AuthSession {
  userId: string;
  email: string;
}
