import React, { createContext, useContext, useEffect, useState } from 'react';

export interface ClothingItem {
  id: string;
  name: string;
  imageUrl: string;
  category: 'top' | 'bottom' | 'outerwear' | 'shoes' | 'accessories';
  color: string;
  weatherSuitability: ('cold' | 'cool' | 'warm' | 'hot')[];
  tags: string[];
  createdAt: string;
}

export interface Outfit {
  id: string;
  name: string;
  items: string[]; // clothing item IDs
  weather?: string;
  occasion?: string;
  notes?: string;
  createdAt: string;
  isAiGenerated?: boolean;
}

export interface AppSettings {
  defaultMode: 'manual' | 'ai' | 'random';
  useLocation: boolean;
  allowVirtualItems: boolean;
}

interface AppContextType {
  // Wardrobe
  wardrobe: ClothingItem[];
  addClothingItem: (item: Omit<ClothingItem, 'id' | 'createdAt'>) => void;
  removeClothingItem: (id: string) => void;
  updateClothingItem: (id: string, updates: Partial<ClothingItem>) => void;

  // Outfits
  outfits: Outfit[];
  addOutfit: (outfit: Omit<Outfit, 'id' | 'createdAt'>) => void;
  removeOutfit: (id: string) => void;
  updateOutfit: (id: string, updates: Partial<Outfit>) => void;

  // Settings
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;

  // Auth (mocked for now)
  isLoggedIn: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;

  // Weather (mocked)
  currentWeather: { temp: number; condition: string; location: string } | null;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEYS = {
  WARDROBE: 'fitforge_wardrobe',
  OUTFITS: 'fitforge_outfits',
  SETTINGS: 'fitforge_settings',
  AUTH: 'fitforge_auth',
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [wardrobe, setWardrobe] = useState<ClothingItem[]>([]);
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    defaultMode: 'manual',
    useLocation: false,
    allowVirtualItems: false,
  });
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentWeather] = useState({ temp: 42, condition: 'Cloudy', location: 'San Francisco' });

  // Load data from localStorage on mount
  useEffect(() => {
    const loadedWardrobe = localStorage.getItem(STORAGE_KEYS.WARDROBE);
    const loadedOutfits = localStorage.getItem(STORAGE_KEYS.OUTFITS);
    const loadedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    const loadedAuth = localStorage.getItem(STORAGE_KEYS.AUTH);

    if (loadedWardrobe) setWardrobe(JSON.parse(loadedWardrobe));
    if (loadedOutfits) setOutfits(JSON.parse(loadedOutfits));
    if (loadedSettings) setSettings(JSON.parse(loadedSettings));
    if (loadedAuth) setIsLoggedIn(JSON.parse(loadedAuth));
  }, []);

  // Save to localStorage when data changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.WARDROBE, JSON.stringify(wardrobe));
  }, [wardrobe]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.OUTFITS, JSON.stringify(outfits));
  }, [outfits]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.AUTH, JSON.stringify(isLoggedIn));
  }, [isLoggedIn]);

  // Wardrobe functions
  const addClothingItem = (item: Omit<ClothingItem, 'id' | 'createdAt'>) => {
    const newItem: ClothingItem = {
      ...item,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
    };
    setWardrobe((prev) => [...prev, newItem]);
  };

  const removeClothingItem = (id: string) => {
    setWardrobe((prev) => prev.filter((item) => item.id !== id));
  };

  const updateClothingItem = (id: string, updates: Partial<ClothingItem>) => {
    setWardrobe((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  };

  // Outfit functions
  const addOutfit = (outfit: Omit<Outfit, 'id' | 'createdAt'>) => {
    const newOutfit: Outfit = {
      ...outfit,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
    };
    setOutfits((prev) => [...prev, newOutfit]);
  };

  const removeOutfit = (id: string) => {
    setOutfits((prev) => prev.filter((outfit) => outfit.id !== id));
  };

  const updateOutfit = (id: string, updates: Partial<Outfit>) => {
    setOutfits((prev) =>
      prev.map((outfit) => (outfit.id === id ? { ...outfit, ...updates } : outfit))
    );
  };

  // Settings functions
  const updateSettings = (updates: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  };

  // Auth functions (mocked)
  const login = async (email: string, password: string) => {
    // Mock login - just simulate a delay
    await new Promise((resolve) => setTimeout(resolve, 500));
    setIsLoggedIn(true);
  };

  const signup = async (name: string, email: string, password: string) => {
    // Mock signup
    await new Promise((resolve) => setTimeout(resolve, 500));
    setIsLoggedIn(true);
  };

  const logout = () => {
    setIsLoggedIn(false);
  };

  return (
    <AppContext.Provider
      value={{
        wardrobe,
        addClothingItem,
        removeClothingItem,
        updateClothingItem,
        outfits,
        addOutfit,
        removeOutfit,
        updateOutfit,
        settings,
        updateSettings,
        isLoggedIn,
        login,
        signup,
        logout,
        currentWeather,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
};
