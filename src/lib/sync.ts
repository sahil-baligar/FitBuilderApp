import { supabase } from './supabaseClient';
import { FitsRepository, MetadataRepository, WardrobeRepository } from './repositories';
import type { ClothingItem, Fit } from '@/types/models';

const TABLES = {
  wardrobe: 'wardrobe_items',
  fits: 'fits',
};

const upsertMany = async <T extends Record<string, unknown>>(table: string, rows: T[]) => {
  if (!supabase || rows.length === 0) {
    return;
  }
  await supabase.from(table).upsert(rows);
};

export const syncDown = async () => {
  if (!supabase) return;
  const { data: wardrobeData, error: wardrobeError } = await supabase.from(TABLES.wardrobe).select();
  if (wardrobeError) throw wardrobeError;
  const { data: fitData, error: fitError } = await supabase.from(TABLES.fits).select();
  if (fitError) throw fitError;

  if (wardrobeData) {
    await Promise.all(
      wardrobeData.map((row: ClothingItem) =>
        WardrobeRepository.upsert({ ...row, id: row.id, createdAt: row.createdAt, updatedAt: row.updatedAt }),
      ),
    );
  }
  if (fitData) {
    await Promise.all(
      fitData.map((row: Fit) =>
        FitsRepository.upsert({ ...row, id: row.id, createdAt: row.createdAt, updatedAt: row.updatedAt }),
      ),
    );
  }
  await MetadataRepository.update({ lastSyncedAt: new Date().toISOString() });
};

export const syncUp = async () => {
  if (!supabase) return;
  const [wardrobe, fits] = await Promise.all([WardrobeRepository.list(), FitsRepository.list()]);

  await Promise.all([
    upsertMany(
      TABLES.wardrobe,
      wardrobe.map((item) => ({
        ...item,
      })),
    ),
    upsertMany(
      TABLES.fits,
      fits.map((fit) => ({
        ...fit,
      })),
    ),
  ]);

  await MetadataRepository.update({ lastSyncedAt: new Date().toISOString() });
};


