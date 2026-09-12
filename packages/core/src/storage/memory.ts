import type { NamespacedStorageDriver, StorageDriver, StorageNamespace } from './types';

/** Volatile driver for tests, SSR, and as the fallback before a platform driver is registered. */
export class MemoryStorageDriver implements StorageDriver {
  private store = new Map<string, unknown>();

  async getItem<T>(key: string): Promise<T | null> {
    return (this.store.get(key) as T | undefined) ?? null;
  }

  async setItem<T>(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  getNamespace(ns: StorageNamespace): NamespacedStorageDriver {
    const prefix = `${ns}:`;
    return {
      getItem: <T,>(key: string) => this.getItem<T>(`${prefix}${key}`),
      setItem: <T,>(key: string, value: T) => this.setItem(`${prefix}${key}`, value),
      removeItem: (key: string) => this.removeItem(`${prefix}${key}`),
      keys: async () =>
        [...this.store.keys()].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length)),
    };
  }
}
