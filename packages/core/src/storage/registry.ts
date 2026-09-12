import { MemoryStorageDriver } from './memory';
import type { StorageDriver } from './types';

let driver: StorageDriver = new MemoryStorageDriver();

/** Platforms (web, native) register their driver before rendering the app. */
export const setStorageDriver = (next: StorageDriver) => {
  driver = next;
};

export const getStorageDriver = (): StorageDriver => driver;
