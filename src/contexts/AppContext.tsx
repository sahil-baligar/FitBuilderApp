import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ClothingItem, Fit, UserPreferences, WeatherInfo } from '@/types/models';
import { FitsRepository, PreferencesRepository, WardrobeRepository } from '@/lib/repositories';
import { supabase } from '@/lib/supabaseClient';
import { syncDown, syncUp } from '@/lib/sync';

interface AppContextType {
  wardrobe: ClothingItem[];
  outfits: Fit[];
  settings: UserPreferences;
  currentWeather: WeatherInfo | null;
  isLoggedIn: boolean;
  loading: boolean;
  addClothingItem: (item: Omit<ClothingItem, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  removeClothingItem: (id: string) => Promise<void>;
  updateClothingItem: (id: string, updates: Partial<ClothingItem>) => Promise<void>;
  addOutfit: (outfit: Omit<Fit, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  removeOutfit: (id: string) => Promise<void>;
  updateOutfit: (id: string, updates: Partial<Fit>) => Promise<void>;
  updateSettings: (updates: Partial<UserPreferences>) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const initialPreferences: UserPreferences = {
  defaultMode: 'manual',
  useLocation: false,
  allowVirtualItems: false,
  temperatureUnit: 'c',
  recentFitIds: [],
  syncEnabled: false,
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [wardrobe, setWardrobe] = useState<ClothingItem[]>([]);
  const [outfits, setOutfits] = useState<Fit[]>([]);
  const [settings, setSettings] = useState<UserPreferences>(initialPreferences);
  const [currentWeather, setCurrentWeather] = useState<WeatherInfo | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  const refreshData = useCallback(async () => {
    const [wardrobeItems, fitItems, prefs] = await Promise.all([
      WardrobeRepository.list(),
      FitsRepository.list(),
      PreferencesRepository.get(),
    ]);
    setWardrobe(wardrobeItems);
    setOutfits(fitItems);
    setSettings(prefs);
    if (prefs.manualWeather) {
      const tempC =
        prefs.temperatureUnit === 'f'
          ? ((prefs.manualWeather.temp - 32) * 5) / 9
          : prefs.manualWeather.temp;
      setCurrentWeather({
        tempC,
        condition: prefs.manualWeather.condition,
        location: 'Manual',
        source: 'manual',
        fetchedAt: new Date().toISOString(),
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      const hasSession = !!data.session;
      setIsLoggedIn(hasSession);
      if (hasSession && settings.syncEnabled) {
        syncDown().then(refreshData).catch(console.error);
      }
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const loggedIn = !!session;
      setIsLoggedIn(loggedIn);
      if (loggedIn && settings.syncEnabled) {
        syncDown().then(refreshData).catch(console.error);
      }
    });
    return () => subscription.unsubscribe();
  }, [refreshData, settings.syncEnabled]);

  const syncIfEnabled = useCallback(async () => {
    if (!settings.syncEnabled || !supabase) return;
    try {
      await syncUp();
    } catch (error) {
      console.warn('Sync failed, queued for later', error);
    }
  }, [settings.syncEnabled]);

  const addClothingItem = useCallback(
    async (item: Omit<ClothingItem, 'id' | 'createdAt' | 'updatedAt'>) => {
      const record = await WardrobeRepository.upsert(item);
      setWardrobe((prev) => [...prev.filter((i) => i.id !== record.id), record]);
      await syncIfEnabled();
    },
    [syncIfEnabled],
  );

  const removeClothingItem = useCallback(
    async (id: string) => {
      await WardrobeRepository.remove(id);
      setWardrobe((prev) => prev.filter((item) => item.id !== id));
      await syncIfEnabled();
    },
    [syncIfEnabled],
  );

  const updateClothingItem = useCallback(
    async (id: string, updates: Partial<ClothingItem>) => {
      const existing = wardrobe.find((item) => item.id === id);
      if (!existing) return;
      const record = await WardrobeRepository.upsert({ ...existing, ...updates, id });
      setWardrobe((prev) => prev.map((item) => (item.id === id ? record : item)));
      await syncIfEnabled();
    },
    [wardrobe, syncIfEnabled],
  );

  const addOutfit = useCallback(
    async (outfit: Omit<Fit, 'id' | 'createdAt' | 'updatedAt'>) => {
      const record = await FitsRepository.upsert(outfit);
      setOutfits((prev) => [...prev.filter((fit) => fit.id !== record.id), record]);
      await PreferencesRepository.update({
        recentFitIds: [record.id, ...settings.recentFitIds].slice(0, 10),
      });
      await syncIfEnabled();
    },
    [settings.recentFitIds, syncIfEnabled],
  );

  const removeOutfit = useCallback(
    async (id: string) => {
      await FitsRepository.remove(id);
      setOutfits((prev) => prev.filter((fit) => fit.id !== id));
      await syncIfEnabled();
    },
    [syncIfEnabled],
  );

  const updateOutfit = useCallback(
    async (id: string, updates: Partial<Fit>) => {
      const existing = outfits.find((fit) => fit.id === id);
      if (!existing) return;
      const record = await FitsRepository.upsert({ ...existing, ...updates, id });
      setOutfits((prev) => prev.map((fit) => (fit.id === id ? record : fit)));
      await syncIfEnabled();
    },
    [outfits, syncIfEnabled],
  );

  const updateSettings = useCallback(async (updates: Partial<UserPreferences>) => {
    const next = await PreferencesRepository.update(updates);
    setSettings(next);
    if (updates.syncEnabled && supabase) {
      await syncUp();
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      throw new Error('Supabase not configured');
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await syncDown();
    await refreshData();
  }, [refreshData]);

  const signup = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      throw new Error('Supabase not configured');
    }
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  }, []);

  const logout = useCallback(async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    setIsLoggedIn(false);
  }, []);

  return (
    <AppContext.Provider
      value={{
        wardrobe,
        outfits,
        settings,
        currentWeather,
        isLoggedIn,
        loading,
        addClothingItem,
        removeClothingItem,
        updateClothingItem,
        addOutfit,
        removeOutfit,
        updateOutfit,
        updateSettings,
        login,
        signup,
        logout,
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
