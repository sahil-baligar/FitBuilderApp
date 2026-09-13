import { getCoreConfig } from './env';
import { withAccessToken } from './auth/session';
import { FitsRepository, MetadataRepository, WardrobeRepository } from './repositories';
import type { ClothingItem, Fit } from './types/models';

/**
 * Cloud sync against the FitBuilder API.
 *
 * The server resolves conflicts by last-write-wins on `updatedAt`, so the
 * client can push everything it has and pull everything newer without tracking
 * per-record state. `lastSyncedAt` narrows the pull to what changed.
 */

interface SyncPullResponse {
  serverTime: string;
  wardrobe: ClothingItem[];
  fits: Fit[];
}

interface SyncPushResponse {
  serverTime: string;
  accepted: { wardrobe: number; fits: number };
  skipped: { wardrobe: number; fits: number };
}

export class SyncError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'SyncError';
  }
}

const request = async <T,>(path: string, init?: RequestInit): Promise<T | undefined> => {
  const token = await withAccessToken();
  // Signed out: sync is simply a no-op rather than an error.
  if (!token) return undefined;

  const { apiBaseUrl } = getCoreConfig();
  const res = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let message = `Sync failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* keep the default */
    }
    throw new SyncError(message, res.status);
  }
  return (await res.json()) as T;
};

/** Pulls everything changed since the last successful sync into local storage. */
export const syncDown = async (): Promise<void> => {
  const meta = await MetadataRepository.get();
  const since = meta.lastSyncedAt ? `?since=${encodeURIComponent(meta.lastSyncedAt)}` : '';
  const data = await request<SyncPullResponse>(`/sync${since}`);
  if (!data) return;

  await Promise.all([
    ...data.wardrobe.map((row) => WardrobeRepository.upsert(row)),
    ...data.fits.map((row) => FitsRepository.upsert(row)),
  ]);
  await MetadataRepository.update({ lastSyncedAt: data.serverTime });
};

/** Pushes local wardrobe and fits to the server. */
export const syncUp = async (): Promise<void> => {
  const [wardrobe, fits] = await Promise.all([WardrobeRepository.list(), FitsRepository.list()]);
  if (wardrobe.length === 0 && fits.length === 0) return;

  const result = await request<SyncPushResponse>('/sync', {
    method: 'POST',
    body: JSON.stringify({ wardrobe, fits }),
  });
  if (!result) return;
  await MetadataRepository.update({ lastSyncedAt: result.serverTime });
};

/** Push then pull, so both sides converge in one pass. */
export const syncNow = async (): Promise<void> => {
  await syncUp();
  await syncDown();
};
