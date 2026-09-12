import type {
  ClothingCategory,
  GarmentAnalysis,
  ImageRef,
  StyleFrameRequest,
  TryOnGarment,
  TryOnRequest,
} from '@fitbuilder/core/contracts';
import type { FitRenderView } from '@fitbuilder/core/models';

/**
 * Every capability sits behind a tiny interface so implementations can be
 * swapped (fal / local / ollama / openai / mock) without touching the jobs.
 * All images flow in and out as data URLs (https URLs are accepted on input).
 */

export interface CutoutProvider {
  readonly name: string;
  /** Remove the background; resolves to an RGBA PNG data URL. */
  cutout(image: ImageRef): Promise<string>;
}

export interface AnalysisProvider {
  readonly name: string;
  /** Extract garment attributes. `hint` is the user's category guess. */
  analyze(image: ImageRef, hint?: ClothingCategory): Promise<GarmentAnalysis>;
}

export interface GhostRenderInput {
  /** Cutout PNG if available, else the original upload. */
  image: ImageRef;
  categoryHint?: ClothingCategory;
  analysis?: GarmentAnalysis;
}

export interface GhostProvider {
  readonly name: string;
  /** Render the garment as worn by an invisible person; resolves to a PNG data URL. */
  render(input: GhostRenderInput): Promise<string>;
}

export interface TryOnProvider {
  readonly name: string;
  tryOn(
    bodyImage: ImageRef,
    garments: TryOnGarment[],
    options?: TryOnRequest['options'],
    onProgress?: (done: number, total: number) => void,
  ): Promise<string>;
}

export interface StyleFrame {
  view: FitRenderView;
  imageUrl: string;
}

export interface StyleFrameProvider {
  readonly name: string;
  render(
    sourceImage: ImageRef,
    views: FitRenderView[],
    options?: StyleFrameRequest['options'],
    onFrame?: (frame: StyleFrame, index: number, total: number) => void,
  ): Promise<StyleFrame[]>;
}

export interface ProviderSet {
  cutout: CutoutProvider;
  /** Ordered fallback chain for the given preference; the first provider that succeeds wins. */
  analysis: (preferLocal: boolean) => Promise<AnalysisProvider[]>;
  ghost: GhostProvider;
  tryon: TryOnProvider;
  styleframe: StyleFrameProvider;
}
