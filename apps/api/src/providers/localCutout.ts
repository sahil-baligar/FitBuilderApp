import path from 'node:path';
import sharp from 'sharp';
import { loadImage, toDataUrl } from '../util/image.js';
import { log } from '../util/log.js';
import type { CutoutProvider } from './types.js';

/**
 * Local, CPU-only background removal via transformers.js.
 *
 * Model: `onnx-community/BiRefNet_lite` (MIT; ONNX export of ZhengPeng7/BiRefNet,
 * also MIT). We deliberately avoid `@imgly/background-removal-node` (AGPL-3.0)
 * and the BRIA RMBG models (non-commercial licenses).
 *
 * The ~224 MB fp32 weights are downloaded on first use into
 * `<DATA_DIR>/models`. Inference on an AMD CPU takes several seconds per
 * image, which is acceptable for a background job.
 */

// transformers.js typings are loose; keep the surface we touch minimal.
interface LoadedModel {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  processor: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  RawImage: any;
}

export const createLocalCutout = (opts: { modelId: string; cacheDir: string }): CutoutProvider => {
  let loading: Promise<LoadedModel> | undefined;
  // ONNX inference is CPU-bound; serialize calls so two jobs do not thrash.
  let chain: Promise<unknown> = Promise.resolve();

  const load = (): Promise<LoadedModel> => {
    loading ??= (async () => {
      const started = Date.now();
      const tf = await import('@huggingface/transformers');
      tf.env.cacheDir = path.join(opts.cacheDir, 'models');
      tf.env.allowLocalModels = false;
      log.info(`local cutout: loading ${opts.modelId} (first run downloads ~224 MB)`);
      const model = await tf.AutoModel.from_pretrained(opts.modelId, { dtype: 'fp32' });
      const processor = await tf.AutoProcessor.from_pretrained(opts.modelId);
      log.info(`local cutout: model ready in ${((Date.now() - started) / 1000).toFixed(1)}s`);
      return { model, processor, RawImage: tf.RawImage };
    })().catch((err) => {
      loading = undefined;
      throw err;
    });
    return loading;
  };

  const run = async (imageRef: string): Promise<string> => {
    const { model, processor, RawImage } = await load();
    const { buffer } = await loadImage(imageRef);

    // Flatten onto white so an existing alpha channel does not confuse the model.
    // Tiny inputs (e.g. 1×1 test PNGs) crash sharp/transformers colourspace — upscale first.
    const meta0 = await sharp(buffer).metadata();
    const minEdge = 64;
    let prepared = sharp(buffer).flatten({ background: '#ffffff' });
    if ((meta0.width ?? 0) < minEdge || (meta0.height ?? 0) < minEdge) {
      prepared = prepared.resize({
        width: Math.max(meta0.width ?? minEdge, minEdge),
        height: Math.max(meta0.height ?? minEdge, minEdge),
        fit: 'fill',
      });
    }
    const rawRgb = await prepared.toColorspace('srgb').raw().toBuffer({ resolveWithObject: true });
    const width = rawRgb.info.width;
    const height = rawRgb.info.height;
    if (!width || !height) throw new Error('Could not read image dimensions');

    const image = new RawImage(
      new Uint8ClampedArray(rawRgb.data),
      width,
      height,
      rawRgb.info.channels,
    );
    const { pixel_values } = await processor(image);
    const outputs = await model({ input_image: pixel_values });
    const logits = outputs.output_image ?? outputs.output ?? Object.values(outputs)[0];
    const maskTensor = logits[0].sigmoid().mul(255).to('uint8');
    const mask = await RawImage.fromTensor(maskTensor).resize(width, height);
    const alpha = Buffer.from(mask.data as Uint8Array);

    const rgbPng = await sharp(rawRgb.data, {
      raw: { width, height, channels: rawRgb.info.channels },
    })
      .png()
      .toBuffer();
    const rgba = await sharp(rgbPng)
      .joinChannel(alpha, { raw: { width, height, channels: 1 } })
      .png()
      .toBuffer();
    return toDataUrl(rgba, 'image/png');
  };

  return {
    name: `local:${opts.modelId}`,
    cutout(image) {
      const next = chain.then(() => run(image));
      chain = next.catch(() => undefined);
      return next;
    },
  };
};
