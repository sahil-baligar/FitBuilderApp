import { useCallback, useRef, useState } from 'react';
import { ApiError, processGarment } from '../ai/client';
import type { GarmentProcessRequest } from '../ai/contracts';
import { useApp } from '../context/AppContext';
import type { ClothingItem, ProcessingState } from '../types/models';

export interface PipelineProgress {
  itemId: string;
  step?: string;
  progress?: number;
}

/**
 * Drives the server-side garment pipeline for a wardrobe item and keeps the
 * item record updated as stages complete. Safe to call for many items at once.
 */
export const useGarmentPipeline = () => {
  const { updateClothingItem } = useApp();
  const [active, setActive] = useState<Record<string, PipelineProgress>>({});
  const controllers = useRef(new Map<string, AbortController>());

  const setProcessing = useCallback(
    (itemId: string, state: Partial<ProcessingState>) =>
      updateClothingItem(itemId, {
        processing: { status: 'processing', ...state, updatedAt: new Date().toISOString() } as ProcessingState,
      }),
    [updateClothingItem],
  );

  const run = useCallback(
    async (item: ClothingItem, options?: GarmentProcessRequest['options']): Promise<ClothingItem | undefined> => {
      const controller = new AbortController();
      controllers.current.set(item.id, controller);
      setActive((prev) => ({ ...prev, [item.id]: { itemId: item.id, step: 'Starting' } }));
      await setProcessing(item.id, { status: 'queued' });

      try {
        const job = await processGarment(
          {
            image: item.originalImageUrl ?? item.imageUrl,
            itemId: item.id,
            categoryHint: item.category,
            options,
          },
          {
            signal: controller.signal,
            onUpdate: (j) => {
              setActive((prev) => ({ ...prev, [item.id]: { itemId: item.id, step: j.step, progress: j.progress } }));
              void setProcessing(item.id, { status: 'processing', jobId: j.id });
            },
          },
        );
        const result = job.result;
        if (!result) throw new ApiError('Job finished without a result', 500);

        const analysis = result.analysis;
        const updated = await updateClothingItem(item.id, {
          originalImageUrl: result.originalImageUrl,
          cutoutImageUrl: result.cutoutImageUrl ?? item.cutoutImageUrl,
          ghostImageUrl: result.ghostImageUrl ?? item.ghostImageUrl,
          imageUrl: result.ghostImageUrl ?? result.cutoutImageUrl ?? item.imageUrl,
          analysis: analysis ?? item.analysis,
          // Only fill in fields the user left blank; never overwrite their edits.
          color: item.color || analysis?.primaryColor.name || '',
          weatherSuitability: item.weatherSuitability.length ? item.weatherSuitability : analysis?.weatherSuitability ?? [],
          tags: item.tags.length ? item.tags : analysis?.tags ?? [],
          processing: { status: 'done', jobId: job.id, updatedAt: new Date().toISOString() },
        });
        return updated;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Processing failed';
        await updateClothingItem(item.id, {
          processing: { status: 'failed', error: message, updatedAt: new Date().toISOString() },
        });
        throw err;
      } finally {
        controllers.current.delete(item.id);
        setActive((prev) => {
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
      }
    },
    [setProcessing, updateClothingItem],
  );

  const cancel = useCallback((itemId: string) => {
    controllers.current.get(itemId)?.abort();
  }, []);

  return { run, cancel, active, isRunning: (itemId: string) => itemId in active };
};
