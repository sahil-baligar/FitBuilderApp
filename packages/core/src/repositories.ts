import { nanoid } from 'nanoid';
import { getStorageDriver } from './storage/registry';
import type { ClothingItem, Fit, SyncMetadata, UserPreferences } from './types/models';

const ns = (name: 'wardrobe' | 'fits' | 'preferences' | 'metadata') =>
  getStorageDriver().getNamespace(name);

export const defaultPreferences: UserPreferences = {
  defaultMode: 'manual',
  useLocation: false,
  allowVirtualItems: false,
  temperatureUnit: 'c',
  recentFitIds: [],
  syncEnabled: false,
  autoProcessUploads: true,
};

type Upsertable<T extends { id: string; createdAt: string; updatedAt: string }> = Omit<
  T,
  'id' | 'createdAt' | 'updatedAt'
> & { id?: string; createdAt?: string; updatedAt?: string };

export type UpsertableClothingItem = Upsertable<ClothingItem>;
export type UpsertableFit = Upsertable<Fit>;

const listAll = async <T,>(name: 'wardrobe' | 'fits'): Promise<T[]> => {
  const store = ns(name);
  const keys = await store.keys();
  const items = await Promise.all(keys.map((key) => store.getItem<T>(key)));
  return items.filter(Boolean) as T[];
};

export const WardrobeRepository = {
  list: () => listAll<ClothingItem>('wardrobe'),
  async get(id: string) {
    return ns('wardrobe').getItem<ClothingItem>(id);
  },
  async upsert(item: UpsertableClothingItem): Promise<ClothingItem> {
    const now = new Date().toISOString();
    const record: ClothingItem = {
      ...item,
      id: item.id ?? nanoid(),
      createdAt: item.createdAt ?? now,
      updatedAt: now,
    };
    await ns('wardrobe').setItem(record.id, record);
    return record;
  },
  async remove(id: string) {
    await ns('wardrobe').removeItem(id);
  },
};

export const FitsRepository = {
  list: () => listAll<Fit>('fits'),
  async get(id: string) {
    return ns('fits').getItem<Fit>(id);
  },
  async upsert(fit: UpsertableFit): Promise<Fit> {
    const now = new Date().toISOString();
    const record: Fit = {
      ...fit,
      id: fit.id ?? nanoid(),
      createdAt: fit.createdAt ?? now,
      updatedAt: now,
    };
    await ns('fits').setItem(record.id, record);
    return record;
  },
  async remove(id: string) {
    await ns('fits').removeItem(id);
  },
};

export const PreferencesRepository = {
  async get(): Promise<UserPreferences> {
    const prefs = await ns('preferences').getItem<UserPreferences>('current');
    return prefs ? { ...defaultPreferences, ...prefs } : defaultPreferences;
  },
  async update(updates: Partial<UserPreferences>) {
    const existing = await PreferencesRepository.get();
    const next: UserPreferences = {
      ...existing,
      ...updates,
      manualWeather: updates.manualWeather !== undefined ? updates.manualWeather : existing.manualWeather,
      recentFitIds: updates.recentFitIds ?? existing.recentFitIds,
    };
    await ns('preferences').setItem('current', next);
    return next;
  },
};

export const MetadataRepository = {
  async get(): Promise<SyncMetadata> {
    const meta = await ns('metadata').getItem<SyncMetadata>('sync');
    return meta ?? { lastSyncedAt: null };
  },
  async update(updates: Partial<SyncMetadata>) {
    const existing = await MetadataRepository.get();
    const next = { ...existing, ...updates };
    await ns('metadata').setItem('sync', next);
    return next;
  },
};
