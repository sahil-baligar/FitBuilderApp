import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ClothingItem, Fit, UserPreferences, WeatherInfo } from '../types/models';
import { FitsRepository, PreferencesRepository, WardrobeRepository, defaultPreferences } from '../repositories';
import { getSupabase } from '../supabaseClient';
import { syncDown, syncUp } from '../sync';

export interface AppContextType {
  wardrobe: ClothingItem[];
  outfits: Fit[];
  settings: UserPreferences;
  currentWeather: WeatherInfo | null;
  isLoggedIn: boolean;
  loading: boolean;
  /** True when a Supabase project is configured, regardless of session. */
  cloudAvailable: boolean;
  addClothingItem: (item: Omit<ClothingItem, 'id' | 'createdAt' | 'updatedAt'>) => Promise<ClothingItem>;
  removeClothingItem: (id: string) => Promise<void>;
  updateClothingItem: (id: string, updates: Partial<ClothingItem>) => Promise<ClothingItem | undefined>;
  addOutfit: (outfit: Omit<Fit, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Fit>;
  removeOutfit: (id: string) => Promise<void>;
  updateOutfit: (id: string, updates: Partial<Fit>) => Promise<Fit | undefined>;
  updateSettings: (updates: Partial<UserPreferences>) => Promise<void>;
  setCurrentWeather: (weather: WeatherInfo | null) => void;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [wardrobe, setWardrobe] = useState<ClothingItem[]>([]);
  const [outfits, setOutfits] = useState<Fit[]>([]);
  const [settings, setSettings] = useState<UserPreferences>(defaultPreferences);
  const [currentWeather, setCurrentWeather] = useState<WeatherInfo | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const supabase = getSupabase();
  // Always-fresh copies for callbacks that must not re-subscribe on every change.
  const wardrobeRef = useRef(wardrobe);
  const outfitsRef = useRef(outfits);
  const settingsRef = useRef(settings);
  wardrobeRef.current = wardrobe;
  outfitsRef.current = outfits;
  settingsRef.current = settings;

  const refreshData = useCallback(async () => {
    const [wardrobeItems, fitItems, prefs] = await Promise.all([
      WardrobeRepository.list(),
      FitsRepository.list(),
      PreferencesRepository.get(),
    ]);
    setWardrobe(wardrobeItems.filter((i) => !i.isDeleted));
    setOutfits(fitItems.filter((f) => !f.isDeleted));
    setSettings(prefs);
    if (prefs.manualWeather) {
      const tempC =
        prefs.temperatureUnit === 'f' ? ((prefs.manualWeather.temp - 32) * 5) / 9 : prefs.manualWeather.temp;
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
      if (hasSession && settingsRef.current.syncEnabled) {
        syncDown().then(refreshData).catch(console.error);
      }
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const loggedIn = !!session;
      setIsLoggedIn(loggedIn);
      if (loggedIn && settingsRef.current.syncEnabled) {
        syncDown().then(refreshData).catch(console.error);
      }
    });
    return () => subscription.unsubscribe();
  }, [refreshData, supabase]);

  const syncIfEnabled = useCallback(async () => {
    if (!settingsRef.current.syncEnabled || !getSupabase()) return;
    try {
      await syncUp();
    } catch (error) {
      console.warn('Sync failed, will retry on next change', error);
    }
  }, []);

  const addClothingItem = useCallback(
    async (item: Omit<ClothingItem, 'id' | 'createdAt' | 'updatedAt'>) => {
      const record = await WardrobeRepository.upsert(item);
      setWardrobe((prev) => [...prev.filter((i) => i.id !== record.id), record]);
      void syncIfEnabled();
      return record;
    },
    [syncIfEnabled],
  );

  const removeClothingItem = useCallback(
    async (id: string) => {
      await WardrobeRepository.remove(id);
      setWardrobe((prev) => prev.filter((item) => item.id !== id));
      void syncIfEnabled();
    },
    [syncIfEnabled],
  );

  const updateClothingItem = useCallback(
    async (id: string, updates: Partial<ClothingItem>) => {
      // Read from storage, not state, so concurrent pipeline updates never clobber each other.
      const existing = (await WardrobeRepository.get(id)) ?? wardrobeRef.current.find((i) => i.id === id);
      if (!existing) return undefined;
      const record = await WardrobeRepository.upsert({ ...existing, ...updates, id });
      setWardrobe((prev) => prev.map((item) => (item.id === id ? record : item)));
      void syncIfEnabled();
      return record;
    },
    [syncIfEnabled],
  );

  const addOutfit = useCallback(
    async (outfit: Omit<Fit, 'id' | 'createdAt' | 'updatedAt'>) => {
      const record = await FitsRepository.upsert(outfit);
      setOutfits((prev) => [...prev.filter((fit) => fit.id !== record.id), record]);
      const next = await PreferencesRepository.update({
        recentFitIds: [record.id, ...settingsRef.current.recentFitIds.filter((x) => x !== record.id)].slice(0, 10),
      });
      setSettings(next);
      void syncIfEnabled();
      return record;
    },
    [syncIfEnabled],
  );

  const removeOutfit = useCallback(
    async (id: string) => {
      await FitsRepository.remove(id);
      setOutfits((prev) => prev.filter((fit) => fit.id !== id));
      void syncIfEnabled();
    },
    [syncIfEnabled],
  );

  const updateOutfit = useCallback(
    async (id: string, updates: Partial<Fit>) => {
      const existing = (await FitsRepository.get(id)) ?? outfitsRef.current.find((f) => f.id === id);
      if (!existing) return undefined;
      const record = await FitsRepository.upsert({ ...existing, ...updates, id });
      setOutfits((prev) => prev.map((fit) => (fit.id === id ? record : fit)));
      void syncIfEnabled();
      return record;
    },
    [syncIfEnabled],
  );

  const updateSettings = useCallback(async (updates: Partial<UserPreferences>) => {
    const next = await PreferencesRepository.update(updates);
    setSettings(next);
    if (updates.syncEnabled && getSupabase()) {
      await syncUp().catch(console.error);
    }
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const client = getSupabase();
      if (!client) throw new Error('Cloud sync is not configured');
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await syncDown();
      await refreshData();
    },
    [refreshData],
  );

  const signup = useCallback(async (email: string, password: string) => {
    const client = getSupabase();
    if (!client) throw new Error('Cloud sync is not configured');
    const { error } = await client.auth.signUp({ email, password });
    if (error) throw error;
  }, []);

  const logout = useCallback(async () => {
    const client = getSupabase();
    if (client) await client.auth.signOut();
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
        cloudAvailable: !!supabase,
        addClothingItem,
        removeClothingItem,
        updateClothingItem,
        addOutfit,
        removeOutfit,
        updateOutfit,
        updateSettings,
        setCurrentWeather,
        refresh: refreshData,
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
