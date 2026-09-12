import { useCallback } from 'react';
import { useApp, useGarmentPipeline, type ClothingItem } from '@fitbuilder/core';
import { persistImage, toDataUrl } from './images';

/**
 * Runs core's garment pipeline for an item and persists the returned data URLs
 * (cutout / ghost / original) to local files on native before they land in the
 * record. On web the data URLs are kept as-is.
 */
export const useProcessItem = () => {
  const pipeline = useGarmentPipeline();
  const { updateClothingItem } = useApp();

  const process = useCallback(
    async (item: ClothingItem): Promise<ClothingItem | undefined> => {
      // The API needs a data URL; native records hold file:// URIs.
      const source = item.originalImageUrl ?? item.imageUrl;
      const image = await toDataUrl(source);
      const updated = await pipeline.run({ ...item, originalImageUrl: image });
      if (!updated) return undefined;

      const [original, cutout, ghost] = await Promise.all([
        updated.originalImageUrl && updated.originalImageUrl.startsWith('data:')
          ? persistImage(updated.originalImageUrl, `${item.id}-original`)
          : Promise.resolve(source),
        updated.cutoutImageUrl ? persistImage(updated.cutoutImageUrl, `${item.id}-cutout`) : Promise.resolve(undefined),
        updated.ghostImageUrl ? persistImage(updated.ghostImageUrl, `${item.id}-ghost`) : Promise.resolve(undefined),
      ]);

      return updateClothingItem(item.id, {
        originalImageUrl: original,
        cutoutImageUrl: cutout,
        ghostImageUrl: ghost,
        imageUrl: ghost ?? cutout ?? original,
      });
    },
    [pipeline, updateClothingItem],
  );

  return { process, cancel: pipeline.cancel, active: pipeline.active, isRunning: pipeline.isRunning };
};
