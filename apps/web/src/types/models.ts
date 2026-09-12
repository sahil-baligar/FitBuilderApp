export type ClothingCategory = 'top' | 'bottom' | 'outerwear' | 'shoes' | 'accessories';
export type WeatherBand = 'cold' | 'cool' | 'warm' | 'hot';

export type AccessoryPlacement = 'head' | 'neck' | 'torso' | 'waist' | 'wrist' | 'hand';

export interface ClothingLayer {
  id: string;
  label: string;
  imageUrl: string;
  mode?: 'overlay' | 'open' | 'closed';
}

export interface ClothingItem {
  id: string;
  name: string;
  imageUrl: string;
  category: ClothingCategory;
  color: string;
  weatherSuitability: WeatherBand[];
  tags: string[];
  notes?: string;
  isVirtual?: boolean;
  layers?: ClothingLayer[];
  accessoryPlacement?: AccessoryPlacement;
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

export interface Fit {
  id: string;
  name: string;
  itemIds: string[];
  suggestedItems?: SuggestedItem[];
  weatherContext?: string;
  occasion?: string;
  notes?: string;
  source: 'manual' | 'ai' | 'generator';
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


