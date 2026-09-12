export type StorageNamespace = 'wardrobe' | 'fits' | 'preferences' | 'metadata';

export const STORAGE_NAMESPACES: StorageNamespace[] = ['wardrobe', 'fits', 'preferences', 'metadata'];

export interface NamespacedStorageDriver {
  getItem<T>(key: string): Promise<T | null>;
  setItem<T>(key: string, value: T): Promise<void>;
  removeItem(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

export interface StorageDriver {
  getItem<T>(key: string): Promise<T | null>;
  setItem<T>(key: string, value: T): Promise<void>;
  removeItem(key: string): Promise<void>;
  getNamespace(ns: StorageNamespace): NamespacedStorageDriver;
  /** Wipe everything this driver owns. Used by "reset app" in settings. */
  clear?(): Promise<void>;
}
