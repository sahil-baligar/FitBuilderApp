import { openDB, type IDBPDatabase } from 'idb';

export type StorageNamespace = 'wardrobe' | 'fits' | 'preferences' | 'metadata';

export interface StorageDriver {
  getItem<T>(key: string): Promise<T | null>;
  setItem<T>(key: string, value: T): Promise<void>;
  removeItem(key: string): Promise<void>;
  getNamespace(ns: StorageNamespace): NamespacedStorageDriver;
}

export interface NamespacedStorageDriver {
  getItem<T>(key: string): Promise<T | null>;
  setItem<T>(key: string, value: T): Promise<void>;
  removeItem(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

const LOCAL_PREFIX = 'fitforge';

class LocalStorageDriver implements StorageDriver {
  async getItem<T>(key: string): Promise<T | null> {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async setItem<T>(key: string, value: T): Promise<void> {
    localStorage.setItem(key, JSON.stringify(value));
  }

  async removeItem(key: string): Promise<void> {
    localStorage.removeItem(key);
  }

  getNamespace(ns: StorageNamespace): NamespacedStorageDriver {
    const prefix = `${LOCAL_PREFIX}_${ns}_`;
    return {
      getItem: <T,>(key: string) => this.getItem<T>(`${prefix}${key}`),
      setItem: <T,>(key: string, value: T) => this.setItem(`${prefix}${key}`, value),
      removeItem: (key: string) => this.removeItem(`${prefix}${key}`),
      keys: async () => {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i += 1) {
          const k = localStorage.key(i);
          if (k && k.startsWith(prefix)) {
            keys.push(k.replace(prefix, ''));
          }
        }
        return keys;
      },
    };
  }
}

class IndexedDbDriver implements StorageDriver {
  private dbPromise: Promise<IDBPDatabase> | null = null;

  private async getDb() {
    if (!this.dbPromise) {
      this.dbPromise = openDB('fitforge', 1, {
        upgrade(db) {
          (['wardrobe', 'fits', 'preferences', 'metadata'] as StorageNamespace[]).forEach(
            (store) => {
              if (!db.objectStoreNames.contains(store)) {
                db.createObjectStore(store);
              }
            },
          );
        },
      });
    }
    return this.dbPromise;
  }

  async getItem<T>(key: string): Promise<T | null> {
    const db = await this.getDb();
    const value = await db.get('metadata', key);
    return (value as T | undefined) ?? null;
  }

  async setItem<T>(key: string, value: T): Promise<void> {
    const db = await this.getDb();
    await db.put('metadata', value, key);
  }

  async removeItem(key: string): Promise<void> {
    const db = await this.getDb();
    await db.delete('metadata', key);
  }

  getNamespace(ns: StorageNamespace): NamespacedStorageDriver {
    return {
      getItem: async <T,>(key: string) => {
        const db = await this.getDb();
        const value = await db.get(ns, key);
        return (value as T | undefined) ?? null;
      },
      setItem: async <T,>(key: string, value: T) => {
        const db = await this.getDb();
        await db.put(ns, value, key);
      },
      removeItem: async (key: string) => {
        const db = await this.getDb();
        await db.delete(ns, key);
      },
      keys: async () => {
        const db = await this.getDb();
        const tx = db.transaction(ns, 'readonly');
        const keys: string[] = [];
        let cursor = await tx.store.openKeyCursor();
        while (cursor) {
          keys.push(String(cursor.key));
          cursor = await cursor.continue();
        }
        await tx.done;
        return keys;
      },
    };
  }
}

export const storageDriver =
  typeof window !== 'undefined' && 'indexedDB' in window
    ? new IndexedDbDriver()
    : new LocalStorageDriver();


