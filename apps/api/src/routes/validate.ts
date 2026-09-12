import type {
  ClothingCategory,
  GarmentProcessRequest,
  StyleFrameRequest,
  TryOnRequest,
} from '@fitbuilder/core/contracts';
import type { FitRenderView } from '@fitbuilder/core/models';
import { CATEGORIES } from '../prompts/analysis.js';
import { isDataUrl, isHttpUrl } from '../util/image.js';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message: string, code = 'bad_request') => new HttpError(400, message, code);

const VIEWS: FitRenderView[] = ['front', 'side', 'back', 'torso'];

const obj = (v: unknown, what: string): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw badRequest(`${what} must be a JSON object`);
  return v as Record<string, unknown>;
};

const imageRef = (v: unknown, field: string): string => {
  if (typeof v !== 'string' || !(isDataUrl(v) || isHttpUrl(v))) {
    throw badRequest(`${field} must be a data URL or an http(s) URL`);
  }
  return v;
};

const optString = (v: unknown, field: string): string | undefined => {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string') throw badRequest(`${field} must be a string`);
  return v;
};

const optBool = (v: unknown, field: string): boolean | undefined => {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'boolean') throw badRequest(`${field} must be a boolean`);
  return v;
};

const category = (v: unknown, field: string): ClothingCategory => {
  if (typeof v !== 'string' || !(CATEGORIES as string[]).includes(v)) {
    throw badRequest(`${field} must be one of ${CATEGORIES.join(', ')}`);
  }
  return v as ClothingCategory;
};

export const parseGarmentRequest = (body: unknown): GarmentProcessRequest => {
  const b = obj(body, 'body');
  const o = b.options === undefined ? {} : obj(b.options, 'options');
  return {
    image: imageRef(b.image, 'image'),
    itemId: optString(b.itemId, 'itemId'),
    categoryHint: b.categoryHint === undefined ? undefined : category(b.categoryHint, 'categoryHint'),
    options: {
      cutout: optBool(o.cutout, 'options.cutout'),
      analyze: optBool(o.analyze, 'options.analyze'),
      ghost: optBool(o.ghost, 'options.ghost'),
      preferLocal: optBool(o.preferLocal, 'options.preferLocal'),
    },
  };
};

export const parseTryOnRequest = (body: unknown): TryOnRequest => {
  const b = obj(body, 'body');
  if (!Array.isArray(b.garments) || b.garments.length === 0) {
    throw badRequest('garments must be a non-empty array');
  }
  if (b.garments.length > 6) throw badRequest('at most 6 garments per try-on');
  const o = b.options === undefined ? {} : obj(b.options, 'options');
  const quality = optString(o.quality, 'options.quality');
  if (quality && !['fast', 'balanced', 'quality'].includes(quality)) {
    throw badRequest('options.quality must be fast, balanced or quality');
  }
  return {
    bodyImage: imageRef(b.bodyImage, 'bodyImage'),
    fitId: optString(b.fitId, 'fitId'),
    garments: b.garments.map((g, i) => {
      const item = obj(g, `garments[${i}]`);
      return {
        itemId: optString(item.itemId, `garments[${i}].itemId`) ?? `garment-${i}`,
        image: imageRef(item.image, `garments[${i}].image`),
        category: category(item.category, `garments[${i}].category`),
      };
    }),
    options: {
      quality: quality as TryOnRequest['options'] extends infer O ? (O extends { quality?: infer Q } ? Q : never) : never,
      prompt: optString(o.prompt, 'options.prompt'),
    },
  };
};

export const parseStyleFrameRequest = (body: unknown): StyleFrameRequest => {
  const b = obj(body, 'body');
  if (!Array.isArray(b.views) || b.views.length === 0) throw badRequest('views must be a non-empty array');
  if (b.views.length > 4) throw badRequest('at most 4 views per request');
  const views = b.views.map((v) => {
    if (typeof v !== 'string' || !(VIEWS as string[]).includes(v)) {
      throw badRequest(`views must contain only ${VIEWS.join(', ')}`);
    }
    return v as FitRenderView;
  });
  const o = b.options === undefined ? {} : obj(b.options, 'options');
  const background = optString(o.background, 'options.background');
  if (background && !['studio', 'city', 'nature', 'keep'].includes(background)) {
    throw badRequest('options.background must be studio, city, nature or keep');
  }
  return {
    sourceImage: imageRef(b.sourceImage, 'sourceImage'),
    views,
    fitId: optString(b.fitId, 'fitId'),
    options: { background: background as NonNullable<StyleFrameRequest['options']>['background'] },
  };
};
