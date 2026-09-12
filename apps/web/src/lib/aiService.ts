import type { ClothingItem, Fit, SuggestedItem } from '@/types/models';

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

const apiBase = import.meta.env.VITE_API_BASE_URL ?? '/api';

export const requestAiSuggestions = async (payload: AiStylistPayload): Promise<AiStylistResponse> => {
  const res = await fetch(`${apiBase}/ai-stylist`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error('Unable to fetch suggestions');
  }
  return res.json();
};

export const convertSuggestionToFit = (suggestion: AiStylistSuggestion): Omit<Fit, 'id' | 'createdAt' | 'updatedAt'> => ({
  name: suggestion.title,
  itemIds: suggestion.ownedItemIds,
  suggestedItems: suggestion.suggestedItems,
  notes: suggestion.rationale,
  source: 'ai',
  weatherContext: undefined,
  occasion: undefined,
});


