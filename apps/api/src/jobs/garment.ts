import type {
  GarmentAnalysis,
  GarmentProcessRequest,
  GarmentProcessResult,
} from '@fitbuilder/core/contracts';
import type { ProviderSet } from '../providers/types.js';
import { errorMessage, log } from '../util/log.js';
import type { JobContext } from './queue.js';

/**
 * Garment pipeline: cutout → analysis → ghost → finalize.
 *
 * Analysis runs before ghost when both are requested so ghost render can
 * weave colour / fit / construction facts into the prompt (wardrobe ghost
 * mannequins are far more reliable with those facts). Each stage may fail
 * without failing the job; the job only fails when every requested stage failed.
 */
export const runGarmentJob = async (
  req: GarmentProcessRequest,
  providers: ProviderSet,
  ctx: JobContext,
): Promise<GarmentProcessResult> => {
  const opts = {
    cutout: req.options?.cutout ?? true,
    analyze: req.options?.analyze ?? true,
    ghost: req.options?.ghost ?? true,
    preferLocal: req.options?.preferLocal ?? false,
  };

  const result: GarmentProcessResult = {
    itemId: req.itemId,
    originalImageUrl: req.image,
    providers: {},
  };
  const failures: string[] = [];

  // --- 1. cutout -------------------------------------------------------------
  let working = req.image;
  if (opts.cutout) {
    ctx.progress('Removing background', 0.1);
    try {
      result.cutoutImageUrl = await providers.cutout.cutout(req.image);
      result.providers.cutout = providers.cutout.name;
      working = result.cutoutImageUrl;
    } catch (err) {
      const msg = errorMessage(err);
      failures.push(`cutout: ${msg}`);
      result.providers.cutout = `failed(${providers.cutout.name}): ${msg}`;
      log.warn(`job ${ctx.id}: cutout failed, continuing with original image: ${msg}`);
    }
  }

  // --- 2. analysis (before ghost so facts can steer the render) --------------
  let analysis: GarmentAnalysis | undefined;
  if (opts.analyze) {
    ctx.progress('Analyzing garment', 0.3);
    const chain = await providers.analysis(opts.preferLocal);
    const errors: string[] = [];
    for (const provider of chain) {
      try {
        analysis = await provider.analyze(working, req.categoryHint);
        result.providers.analysis = provider.name;
        result.analysis = analysis;
        break;
      } catch (err) {
        const msg = errorMessage(err);
        errors.push(`${provider.name}: ${msg}`);
        log.warn(`job ${ctx.id}: analysis via ${provider.name} failed: ${msg}`);
      }
    }
    if (!analysis) {
      failures.push(`analysis: ${errors.join('; ')}`);
      result.providers.analysis = `failed: ${errors.join('; ')}`;
    }
  }

  // Effective category for ghost: user hint wins when set; else analysis.
  const categoryHint = req.categoryHint ?? analysis?.category;

  // --- 3. ghost mannequin ----------------------------------------------------
  if (opts.ghost) {
    ctx.progress('Rendering ghost mannequin', 0.55);
    try {
      const rendered = await providers.ghost.render({
        image: working,
        categoryHint,
        analysis,
      });
      // A real render comes back on a white background; cut it out again so the
      // client receives an RGBA ghost. The mock echoes the input, so skip it.
      if (providers.ghost.name === 'mock' || !opts.cutout) {
        result.providers.ghost = providers.ghost.name;
        result.ghostImageUrl = rendered;
      } else {
        try {
          const rgba = await providers.cutout.cutout(rendered);
          result.providers.ghost = `${providers.ghost.name} + ${providers.cutout.name}`;
          result.ghostImageUrl = rgba;
        } catch (err) {
          log.warn(`job ${ctx.id}: ghost post-cutout failed, returning raw render: ${errorMessage(err)}`);
          result.providers.ghost = providers.ghost.name;
          result.ghostImageUrl = rendered;
        }
      }
    } catch (err) {
      const msg = errorMessage(err);
      failures.push(`ghost: ${msg}`);
      result.providers.ghost = `failed(${providers.ghost.name}): ${msg}`;
      log.warn(`job ${ctx.id}: ghost render failed: ${msg}`);
    }
  }

  // --- 4. finalize -----------------------------------------------------------
  ctx.progress('Finalizing', 0.95);
  const requested = [opts.cutout, opts.analyze, opts.ghost].filter(Boolean).length;
  if (requested > 0 && failures.length >= requested) {
    throw new Error(`All pipeline stages failed: ${failures.join(' | ')}`);
  }
  return result;
};
