// Web resolves `./storage` here; native resolves `./storage.native`.
//
// Web deliberately does NOT reuse the AsyncStorage driver. AsyncStorage maps to
// localStorage on web, which caps at ~5 MB — and a single processed garment
// (original JPEG + cutout PNG + ghost PNG, all base64 in one record) costs
// ~1.5 MB, so the wardrobe blew the quota at three items and try-on renders
// could never be saved. IndexedDB has no such practical limit.
import type { NamespacedStorageDriver, StorageDriver, StorageNamespace } from '@fitbuilder/core';

const ROOT_PREFIX = 'fitbuilder:';
const DB_NAME = 'fitbuilder';
const DB_VERSION = 1;
const STORE = 'kv';

const promisify = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });

/**
 * Key/value `StorageDriver` on IndexedDB, with a one-time import of anything a
 * previous build left in localStorage so existing wardrobes survive the switch.
 */
export class IndexedDbStorageDriver implements StorageDriver {
  private dbPromise?: Promise<IDBDatabase>;

  private open(): Promise<IDBDatabase> {
    this.dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('Could not open IndexedDB'));
    })
      .then(async (db) => {
        await this.migrateFromLocalStorage(db);
        return db;
      })
      .catch((err) => {
        this.dbPromise = undefined;
        throw err;
      });
    return this.dbPromise;
  }

  /** Move `fitbuilder:*` entries out of localStorage exactly once. */
  private async migrateFromLocalStorage(db: IDBDatabase): Promise<void> {
    let legacy: string[] = [];
    try {
      legacy = Object.keys(localStorage).filter((k) => k.startsWith(ROOT_PREFIX));
    } catch {
      return; // storage disabled (private mode); nothing to migrate
    }
    if (!legacy.length) return;
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      for (const key of legacy) {
        const raw = localStorage.getItem(key);
        if (raw != null) store.put(raw, key);
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('Migration failed'));
      });
      for (const key of legacy) localStorage.removeItem(key);
    } catch {
      // Leave localStorage untouched; the app still works off whatever IDB has.
    }
  }

  private async tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.open();
    const store = db.transaction(STORE, mode).objectStore(STORE);
    return promisify(run(store));
  }

  private fullKey(key: string) {
    return `${ROOT_PREFIX}${key}`;
  }

  async getItem<T>(key: string): Promise<T | null> {
    const raw = await this.tx<string | undefined>('readonly', (s) => s.get(this.fullKey(key)));
    if (raw == null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async setItem<T>(key: string, value: T): Promise<void> {
    await this.tx('readwrite', (s) => s.put(JSON.stringify(value), this.fullKey(key)));
  }

  async removeItem(key: string): Promise<void> {
    await this.tx('readwrite', (s) => s.delete(this.fullKey(key)));
  }

  async clear(): Promise<void> {
    const keys = await this.tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys());
    const mine = keys.filter((k): k is string => typeof k === 'string' && k.startsWith(ROOT_PREFIX));
    const db = await this.open();
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const key of mine) store.delete(key);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Clear failed'));
    });
  }

  getNamespace(ns: StorageNamespace): NamespacedStorageDriver {
    const prefix = `${ns}:`;
    const full = this.fullKey(prefix);
    return {
      getItem: <T,>(key: string) => this.getItem<T>(`${prefix}${key}`),
      setItem: <T,>(key: string, value: T) => this.setItem(`${prefix}${key}`, value),
      removeItem: (key: string) => this.removeItem(`${prefix}${key}`),
      keys: async () => {
        const keys = await this.tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys());
        return keys
          .filter((k): k is string => typeof k === 'string' && k.startsWith(full))
          .map((k) => k.slice(full.length));
      },
    };
  }
}

export const storageDriver = new IndexedDbStorageDriver();
