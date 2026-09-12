import { createFalClient, type FalClient } from '@fal-ai/client';
import type { ClothingCategory, ImageRef, TryOnGarment, TryOnRequest } from '@fitbuilder/core/contracts';
import type { FitRenderView } from '@fitbuilder/core/models';
import { FAL_MODELS, falCutoutExtraInput } from '../config/models.js';
import { buildGhostPrompt } from '../prompts/ghost.js';
import { buildStyleFramePrompt } from '../prompts/styleframe.js';
import { fetchToDataUrl, isHttpUrl, loadImage, toBlob } from '../util/image.js';
import { log } from '../util/log.js';
import type {
  CutoutProvider,
  GhostProvider,
  StyleFrame,
  StyleFrameProvider,
  TryOnProvider,
} from './types.js';

/**
 * fal.ai-backed providers. Inputs are uploaded to fal storage (data URLs) or
 * passed through (https). Outputs are downloaded and returned as data URLs
 * because fal result URLs expire and the app is local-first.
 */

interface FalImageFile {
  url: string;
  content_type?: string;
  width?: number;
  height?: number;
}

const createClient = (falKey: string): FalClient =>
  createFalClient({ credentials: falKey, suppressLocalCredentialsWarning: true });

const makeUploader = (client: FalClient) => async (ref: ImageRef): Promise<string> => {
  if (isHttpUrl(ref)) return ref;
  const img = await loadImage(ref);
  return client.storage.upload(toBlob(img));
};

const firstImageUrl = (data: unknown, field: 'images' | 'image'): string => {
  const d = data as Record<string, unknown>;
  const candidate =
    field === 'image'
      ? (d.image as FalImageFile | undefined)
      : ((d.images as FalImageFile[] | undefined)?.[0] ?? (d.image as FalImageFile | undefined));
  if (!candidate?.url) throw new Error(`fal response has no ${field} url`);
  return candidate.url;
};

const runModel = async <T = unknown>(
  client: FalClient,
  modelId: string,
  input: Record<string, unknown>,
): Promise<T> => {
  const started = Date.now();
  const result = await client.subscribe(modelId, { input, logs: false });
  log.info(`fal ${modelId} finished in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  return result.data as T;
};

// ---------------------------------------------------------------------------

export const createFalCutout = (falKey: string): CutoutProvider => {
  const client = createClient(falKey);
  const upload = makeUploader(client);
  const model = FAL_MODELS.cutout;
  return {
    name: `fal:${model}`,
    async cutout(image) {
      const image_url = await upload(image);
      const data = await runModel(client, model, { image_url, ...falCutoutExtraInput(model) });
      return fetchToDataUrl(firstImageUrl(data, 'image'));
    },
  };
};

export const createFalGhost = (falKey: string): GhostProvider => {
  const client = createClient(falKey);
  const upload = makeUploader(client);
  const model = FAL_MODELS.edit;
  return {
    name: `fal:${model}`,
    async render({ image, categoryHint, analysis }) {
      const url = await upload(image);
      const prompt = buildGhostPrompt({ categoryHint, analysis });
      const data = await runModel(client, model, {
        prompt,
        image_urls: [url],
        num_images: 1,
        output_format: 'png',
      });
      return fetchToDataUrl(firstImageUrl(data, 'images'));
    },
  };
};

/** Maps our categories onto the try-on endpoint's garment categories. */
const tryOnCategory = (category: ClothingCategory): 'tops' | 'bottoms' | 'auto' => {
  switch (category) {
    case 'top':
    case 'outerwear':
      return 'tops';
    case 'bottom':
      return 'bottoms';
    default:
      return 'auto';
  }
};

const tryOnMode = (quality: NonNullable<TryOnRequest['options']>['quality']) =>
  quality === 'fast' ? 'performance' : quality === 'quality' ? 'quality' : 'balanced';

/**
 * Dressing order for multi-garment try-on: bottoms first, then tops, then
 * outerwear. Matches wardrobe layering (under → over). Shoes/accessories are
 * skipped by the FASHN endpoint (tops/bottoms only).
 *
 * Clients should send `layerImageFor` images (ghost → cutout → original) so
 * garment prep is already done; we tell FASHN these are on-model / worn-volume
 * product shots (`garment_photo_type: model`) rather than flat lays.
 */
const layerOrder: Record<ClothingCategory, number> = {
  bottom: 0,
  top: 1,
  outerwear: 2,
  shoes: 3,
  accessories: 4,
};

export const createFalTryOn = (falKey: string): TryOnProvider => {
  const client = createClient(falKey);
  const upload = makeUploader(client);
  const model = FAL_MODELS.tryon;
  return {
    name: `fal:${model}`,
    async tryOn(bodyImage, garments: TryOnGarment[], options, onProgress) {
      const wearable = garments
        .filter((g) => g.category !== 'shoes' && g.category !== 'accessories')
        .sort((a, b) => layerOrder[a.category] - layerOrder[b.category]);
      const skipped = garments.length - wearable.length;
      if (skipped > 0) log.warn(`tryon: skipping ${skipped} shoes/accessory garment(s); ${model} handles tops and bottoms only`);
      if (wearable.length === 0) throw new Error('No try-on capable garments (tops, bottoms, outerwear) were supplied');

      // One garment per call; the output of each pass becomes the model image for the next.
      let modelImage = await upload(bodyImage);
      let index = 0;
      for (const garment of wearable) {
        const garment_image = await upload(garment.image);
        const data = await runModel(client, model, {
          model_image: modelImage,
          garment_image,
          category: tryOnCategory(garment.category),
          mode: tryOnMode(options?.quality),
          // Prefer ghost/cutout wardrobe images (worn volume) over flat-lay detection.
          garment_photo_type: 'model',
          output_format: 'png',
          num_samples: 1,
        });
        modelImage = firstImageUrl(data, 'images');
        index += 1;
        onProgress?.(index, wearable.length);
      }
      return fetchToDataUrl(modelImage);
    },
  };
};

export const createFalStyleFrame = (falKey: string): StyleFrameProvider => {
  const client = createClient(falKey);
  const upload = makeUploader(client);
  const model = FAL_MODELS.edit;
  return {
    name: `fal:${model}`,
    async render(sourceImage, views: FitRenderView[], options, onFrame) {
      const sourceUrl = await upload(sourceImage);
      const frames: StyleFrame[] = [];
      // Chain: every call sees the original front render plus the previous
      // output, which keeps the person, clothes and setting consistent.
      let previousUrl: string | undefined;
      for (let i = 0; i < views.length; i += 1) {
        const view = views[i];
        const image_urls = previousUrl ? [sourceUrl, previousUrl] : [sourceUrl];
        const data = await runModel(client, model, {
          prompt: buildStyleFramePrompt(view, options),
          image_urls,
          num_images: 1,
          output_format: 'png',
        });
        const url = firstImageUrl(data, 'images');
        previousUrl = url;
        const frame: StyleFrame = { view, imageUrl: await fetchToDataUrl(url) };
        frames.push(frame);
        onFrame?.(frame, i, views.length);
      }
      return frames;
    },
  };
};
