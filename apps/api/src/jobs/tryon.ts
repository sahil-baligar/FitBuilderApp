import type { TryOnRequest, TryOnResult } from '@fitbuilder/core/contracts';
import type { ProviderSet } from '../providers/types.js';
import type { JobContext } from './queue.js';

export const runTryOnJob = async (
  req: TryOnRequest,
  providers: ProviderSet,
  ctx: JobContext,
): Promise<TryOnResult> => {
  ctx.progress('Preparing try-on', 0.1);
  const imageUrl = await providers.tryon.tryOn(req.bodyImage, req.garments, req.options, (done, total) =>
    ctx.progress(`Dressing garment ${done} of ${total}`, 0.1 + (0.8 * done) / Math.max(1, total)),
  );
  ctx.progress('Finalizing', 0.95);
  return { fitId: req.fitId, imageUrl, provider: providers.tryon.name };
};
