import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NamespacedStorageDriver, StorageDriver, StorageNamespace } from '@fitbuilder/core';

const ROOT_PREFIX = 'fitbuilder:';

/**
 * Core `StorageDriver` on AsyncStorage. Every key is prefixed with `fitbuilder:`
 * so `clear()` only wipes what this app owns; namespaces add a second prefix.
 * On web AsyncStorage maps to localStorage, so the same driver is reused there.
 */
export class AsyncStorageDriver implements StorageDriver {
  private fullKey(key: string) {
    return `${ROOT_PREFIX}${key}`;
  }

  async getItem<T>(key: string): Promise<T | null> {
    const raw = await AsyncStorage.getItem(this.fullKey(key));
    if (raw == null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async setItem<T>(key: string, value: T): Promise<void> {
    await AsyncStorage.setItem(this.fullKey(key), JSON.stringify(value));
  }

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(this.fullKey(key));
  }

  async clear(): Promise<void> {
    const all = await AsyncStorage.getAllKeys();
    const mine = all.filter((k) => k.startsWith(ROOT_PREFIX));
    if (mine.length) await AsyncStorage.multiRemove(mine);
  }

  getNamespace(ns: StorageNamespace): NamespacedStorageDriver {
    const prefix = `${ns}:`;
    const full = this.fullKey(prefix);
    return {
      getItem: <T,>(key: string) => this.getItem<T>(`${prefix}${key}`),
      setItem: <T,>(key: string, value: T) => this.setItem(`${prefix}${key}`, value),
      removeItem: (key: string) => this.removeItem(`${prefix}${key}`),
      keys: async () => {
        const all = await AsyncStorage.getAllKeys();
        return all.filter((k) => k.startsWith(full)).map((k) => k.slice(full.length));
      },
    };
  }
}

export const storageDriver = new AsyncStorageDriver();
