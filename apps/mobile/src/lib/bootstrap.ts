/**
 * Wires the platform into `@fitbuilder/core`. Imported once at the top of
 * `app/_layout.tsx` so it runs before any component renders.
 */
import { setCoreConfig, setStorageDriver } from '@fitbuilder/core';
import { API_BASE_URL } from './config';
import { storageDriver } from './storage';

let booted = false;

export const bootstrapCore = () => {
  if (booted) return;
  booted = true;
  // Sessions are stored through the same driver as everything else, so there
  // is no separate auth storage to configure.
  setStorageDriver(storageDriver);
  setCoreConfig({ apiBaseUrl: API_BASE_URL });
};

bootstrapCore();
