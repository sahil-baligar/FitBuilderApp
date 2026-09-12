import { openDB, type IDBPDatabase } from 'idb';
import {
  STORAGE_NAMESPACES,
  type NamespacedStorageDriver,
  type StorageDriver,
  type StorageNamespace,
} from '@fitbuilder/core';

// Kept as "fitforge" so existing users' local data survives the rename.
const LOCAL_PREFIX = 'fitforge';
const DB_NAME = 'fitforge';
const DB_VERSION = 1;

/** Fallback driver for browsers without IndexedDB (or private modes that block it). */
export class LocalStorageDriver implements StorageDriver {
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

  async clear(): Promise<void> {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(`${LOCAL_PREFIX}_`)) doomed.push(k);
    }
    doomed.forEach((k) => localStorage.removeItem(k));
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
          if (k && k.startsWith(prefix)) keys.push(k.slice(prefix.length));
        }
        return keys;
      },
    };
  }
}

/** Primary web driver: one object store per namespace, values stored structurally (no JSON round-trip). */
export class IndexedDbDriver implements StorageDriver {
  private dbPromise: Promise<IDBPDatabase> | null = null;

  private getDb() {
    if (!this.dbPromise) {
      this.dbPromise = openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
          STORAGE_NAMESPACES.forEach((store) => {
            if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
          });
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

  async clear(): Promise<void> {
    const db = await this.getDb();
    const tx = db.transaction(STORAGE_NAMESPACES, 'readwrite');
    await Promise.all(STORAGE_NAMESPACES.map((ns) => tx.objectStore(ns).clear()));
    await tx.done;
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
        const keys = await db.getAllKeys(ns);
        return keys.map(String);
      },
    };
  }
}

export const createWebStorageDriver = (): StorageDriver =>
  typeof window !== 'undefined' && 'indexedDB' in window ? new IndexedDbDriver() : new LocalStorageDriver();
