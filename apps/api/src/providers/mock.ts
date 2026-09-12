import type {
  ClothingCategory,
  GarmentAnalysis,
  ImageRef,
  TryOnGarment,
} from '@fitbuilder/core/contracts';
import type { FitRenderView } from '@fitbuilder/core/models';
import sharp from 'sharp';
import { loadImage, toDataUrl } from '../util/image.js';
import type {
  AnalysisProvider,
  CutoutProvider,
  GhostProvider,
  StyleFrame,
  StyleFrameProvider,
  TryOnProvider,
} from './types.js';

/**
 * Deterministic offline providers. They never touch the network; images are
 * echoed or lightly composited and the analysis is a fixed record.
 * Selected automatically when a real provider's key is missing, and used by
 * the test-suite.
 */

const echo = async (image: ImageRef): Promise<string> => {
  const { buffer, mime } = await loadImage(image);
  return toDataUrl(buffer, mime.startsWith('image/') ? mime : 'image/png');
};

/** Reduce alpha so overlaid garments read as a soft demo dress-up, not opaque blocks. */
const withOpacity = async (buffer: Buffer, opacity: number): Promise<Buffer> => {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  for (let i = 3; i < out.length; i += 4) {
    out[i] = Math.round(out[i] * opacity);
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
};

const layerY: Record<ClothingCategory, number> = {
  outerwear: 0.1,
  top: 0.16,
  bottom: 0.42,
  shoes: 0.72,
  accessories: 0.05,
};

const layerOrder: Record<ClothingCategory, number> = {
  bottom: 0,
  top: 1,
  outerwear: 2,
  shoes: 3,
  accessories: 4,
};

/**
 * Offline try-on: stack scaled garment images onto the body photo so the demo
 * is visibly dressed instead of echoing an empty body shot.
 */
const mockCompositeTryOn = async (bodyImage: ImageRef, garments: TryOnGarment[]): Promise<string> => {
  const body = await loadImage(bodyImage);
  const meta = await sharp(body.buffer).metadata();
  const width = meta.width ?? 512;
  const height = meta.height ?? 512;

  const wearable = [...garments].sort((a, b) => layerOrder[a.category] - layerOrder[b.category]);
  const composites: { input: Buffer; left: number; top: number }[] = [];

  for (const garment of wearable) {
    try {
      const g = await loadImage(garment.image);
      const targetW = Math.max(32, Math.round(width * (garment.category === 'bottom' ? 0.42 : 0.48)));
      const resized = await sharp(g.buffer)
        .resize({ width: targetW, withoutEnlargement: true })
        .ensureAlpha()
        .png()
        .toBuffer();
      const faded = await withOpacity(resized, 0.72);
      const gm = await sharp(faded).metadata();
      const gw = gm.width ?? targetW;
      const gh = gm.height ?? targetW;
      const left = Math.max(0, Math.round((width - gw) / 2));
      const top = Math.max(0, Math.min(height - gh, Math.round(height * layerY[garment.category])));
      composites.push({ input: faded, left, top });
    } catch {
      // Skip a bad garment and keep composing the rest.
    }
  }

  if (composites.length === 0) return echo(bodyImage);

  const out = await sharp(body.buffer)
    .ensureAlpha()
    .resize({ width, height, fit: 'fill' })
    .composite(composites)
    .png()
    .toBuffer();
  return toDataUrl(out, 'image/png');
};

export const mockCutout: CutoutProvider = {
  name: 'mock',
  cutout: echo,
};

export const mockAnalysis: AnalysisProvider = {
  name: 'mock',
  async analyze(_image: ImageRef, hint?: ClothingCategory): Promise<GarmentAnalysis> {
    const category = hint ?? 'top';
    return {
      category,
      subcategory: category === 'top' ? 't-shirt' : undefined,
      primaryColor: { name: 'Gray', hex: '#808080' },
      secondaryColors: [],
      pattern: 'solid',
      material: 'cotton',
      fit: 'regular',
      sleeveLength: category === 'top' ? 'short' : undefined,
      neckline: category === 'top' ? 'crew' : undefined,
      weatherSuitability: ['cool', 'warm'],
      occasions: ['casual'],
      tags: ['mock', 'unprocessed'],
      confidence: 0,
      source: 'local-vlm',
    };
  },
};

export const mockGhost: GhostProvider = {
  name: 'mock',
  render: ({ image }) => echo(image),
};

export const mockTryOn: TryOnProvider = {
  name: 'mock',
  tryOn: (bodyImage, garments) => mockCompositeTryOn(bodyImage, garments),
};

export const mockStyleFrame: StyleFrameProvider = {
  name: 'mock',
  async render(sourceImage, views: FitRenderView[], _options, onFrame): Promise<StyleFrame[]> {
    const imageUrl = await echo(sourceImage);
    return views.map((view, i) => {
      const frame = { view, imageUrl };
      onFrame?.(frame, i, views.length);
      return frame;
    });
  },
};
