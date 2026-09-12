import { getSupabase } from './supabaseClient';
import { FitsRepository, MetadataRepository, WardrobeRepository } from './repositories';
import type { ClothingItem, Fit } from './types/models';

const TABLES = {
  wardrobe: 'wardrobe_items',
  fits: 'fits',
};

const upsertMany = async <T extends object>(table: string, rows: T[]) => {
  const supabase = getSupabase();
  if (!supabase || rows.length === 0) return;
  // The client is untyped (no generated DB types yet), so rows are passed as plain records.
  const { error } = await supabase.from(table).upsert(rows as unknown as Record<string, unknown>[]);
  if (error) throw error;
};

export const syncDown = async () => {
  const supabase = getSupabase();
  if (!supabase) return;
  const { data: wardrobeData, error: wardrobeError } = await supabase.from(TABLES.wardrobe).select();
  if (wardrobeError) throw wardrobeError;
  const { data: fitData, error: fitError } = await supabase.from(TABLES.fits).select();
  if (fitError) throw fitError;

  if (wardrobeData) {
    await Promise.all((wardrobeData as ClothingItem[]).map((row) => WardrobeRepository.upsert(row)));
  }
  if (fitData) {
    await Promise.all((fitData as Fit[]).map((row) => FitsRepository.upsert(row)));
  }
  await MetadataRepository.update({ lastSyncedAt: new Date().toISOString() });
};

export const syncUp = async () => {
  if (!getSupabase()) return;
  const [wardrobe, fits] = await Promise.all([WardrobeRepository.list(), FitsRepository.list()]);
  await Promise.all([upsertMany(TABLES.wardrobe, wardrobe), upsertMany(TABLES.fits, fits)]);
  await MetadataRepository.update({ lastSyncedAt: new Date().toISOString() });
};
