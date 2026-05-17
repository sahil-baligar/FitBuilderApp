import { nanoid } from 'nanoid';
import { storageDriver } from './storage';
import type { ClothingItem, Fit, SyncMetadata, UserPreferences } from '@/types/models';

const wardrobeStore = storageDriver.getNamespace('wardrobe');
const fitStore = storageDriver.getNamespace('fits');
const prefStore = storageDriver.getNamespace('preferences');
const metaStore = storageDriver.getNamespace('metadata');

const defaultPreferences: UserPreferences = {
  defaultMode: 'manual',
  useLocation: false,
  allowVirtualItems: false,
  temperatureUnit: 'c',
  recentFitIds: [],
  syncEnabled: false,
};

export const WardrobeRepository = {
  async list(): Promise<ClothingItem[]> {
    const keys = await wardrobeStore.keys();
    const items = await Promise.all(keys.map((key) => wardrobeStore.getItem<ClothingItem>(key)));
    return items.filter(Boolean) as ClothingItem[];
  },
  async upsert(item: Omit<ClothingItem, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) {
    const now = new Date().toISOString();
    const record: ClothingItem = {
      ...item,
      id: item.id ?? nanoid(),
      createdAt: item.createdAt ?? now,
      updatedAt: now,
    };
    await wardrobeStore.setItem(record.id, record);
    return record;
  },
  async remove(id: string) {
    await wardrobeStore.removeItem(id);
  },
};

export const FitsRepository = {
  async list(): Promise<Fit[]> {
    const keys = await fitStore.keys();
    const items = await Promise.all(keys.map((key) => fitStore.getItem<Fit>(key)));
    return items.filter(Boolean) as Fit[];
  },
  async upsert(fit: Omit<Fit, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) {
    const now = new Date().toISOString();
    const record: Fit = {
      ...fit,
      id: fit.id ?? nanoid(),
      createdAt: fit.createdAt ?? now,
      updatedAt: now,
    };
    await fitStore.setItem(record.id, record);
    return record;
  },
  async remove(id: string) {
    await fitStore.removeItem(id);
  },
};

export const PreferencesRepository = {
  async get(): Promise<UserPreferences> {
    const prefs = await prefStore.getItem<UserPreferences>('current');
    return prefs ?? defaultPreferences;
  },
  async update(updates: Partial<UserPreferences>) {
    const existing = await PreferencesRepository.get();
    const next: UserPreferences = {
      ...existing,
      ...updates,
      manualWeather:
        updates.manualWeather !== undefined ? updates.manualWeather : existing.manualWeather,
      recentFitIds: updates.recentFitIds ?? existing.recentFitIds,
    };
    await prefStore.setItem('current', next);
    return next;
  },
};

export const MetadataRepository = {
  async get(): Promise<SyncMetadata> {
    const meta = await metaStore.getItem<SyncMetadata>('sync');
    return meta ?? { lastSyncedAt: null };
  },
  async update(updates: Partial<SyncMetadata>) {
    const existing = await MetadataRepository.get();
    const next = { ...existing, ...updates };
    await metaStore.setItem('sync', next);
    return next;
  },
};


