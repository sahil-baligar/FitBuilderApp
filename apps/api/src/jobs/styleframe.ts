import type { StyleFrameRequest, StyleFrameResult } from '@fitbuilder/core/contracts';
import type { ProviderSet } from '../providers/types.js';
import type { JobContext } from './queue.js';

export const runStyleFrameJob = async (
  req: StyleFrameRequest,
  providers: ProviderSet,
  ctx: JobContext,
): Promise<StyleFrameResult> => {
  ctx.progress(`Rendering ${req.views.length} view(s)`, 0.1);
  const frames = await providers.styleframe.render(req.sourceImage, req.views, req.options, (frame, i, total) =>
    ctx.progress(`Rendered ${frame.view} view (${i + 1}/${total})`, 0.1 + (0.8 * (i + 1)) / total),
  );
  ctx.progress('Finalizing', 0.95);
  return { fitId: req.fitId, frames, provider: providers.styleframe.name };
};
