/**
 * fal.ai endpoint ids used by the image pipeline. Each id was verified on
 * 2026-09-11 against the linked fal documentation page; the input/output
 * field names used in `providers/fal.ts` come from the same pages.
 *
 * Every id can be overridden with an env var so a newer model can be swapped
 * in without a code change.
 */

/**
 * Multi-image edit model (ghost-mannequin render + style frames).
 * Docs: https://fal.ai/models/fal-ai/nano-banana/edit/api
 *   input:  { prompt: string, image_urls: string[], num_images?, output_format?: 'png'|'jpeg'|'webp', aspect_ratio?, seed? }
 *   output: { images: { url, content_type, width, height }[], description }
 *   price:  $0.039 per image (fal listing, 2026-09-11)
 */
export const FAL_MODEL_EDIT = process.env.FAL_MODEL_EDIT?.trim() || 'fal-ai/nano-banana/edit';

/**
 * Virtual try-on (one garment per call; we chain calls for multiple garments).
 * Docs: https://fal.ai/models/fal-ai/fashn/tryon/v1.6/api
 *   input:  { model_image: string, garment_image: string, category?: 'tops'|'bottoms'|'one-pieces'|'auto',
 *             mode?: 'performance'|'balanced'|'quality', garment_photo_type?: 'auto'|'model'|'flat-lay',
 *             moderation_level?, seed?, num_samples?, segmentation_free?, output_format?: 'png'|'jpeg' }
 *   output: { images: { url, content_type, file_name, file_size }[] }
 *   price:  $0.075 per generation (fal listing, 2026-09-11)
 */
export const FAL_MODEL_TRYON = process.env.FAL_MODEL_TRYON?.trim() || 'fal-ai/fashn/tryon/v1.6';

/**
 * Background removal (RGBA cutout).
 * Docs: https://fal.ai/models/fal-ai/birefnet/v2/api
 *   input:  { image_url: string, model?: 'General Use (Light)'|'General Use (Light 2K)'|'General Use (Heavy)'|'Matting'|'Portrait'|'General Use (Dynamic)',
 *             operating_resolution?: '1024x1024'|'2048x2048'|'2304x2304', output_format?: 'png'|'webp'|'gif',
 *             refine_foreground?: boolean, output_mask?: boolean }
 *   output: { image: { url, content_type, width, height }, mask_image? }
 *   price:  billed per compute second (the listing shows "$0 per compute second" at the time of checking);
 *           BiRefNet itself is MIT-licensed and the fal listing is marked "Commercial use".
 * Alternative (also verified): fal-ai/bria/background/remove - same { image_url } -> { image: { url } } shape.
 */
export const FAL_MODEL_CUTOUT = process.env.FAL_MODEL_CUTOUT?.trim() || 'fal-ai/birefnet/v2';

/** Extra input fields only the BiRefNet endpoint understands. */
export const falCutoutExtraInput = (modelId: string): Record<string, unknown> =>
  modelId.includes('birefnet')
    ? { model: 'General Use (Light)', output_format: 'png', refine_foreground: true, output_mask: false }
    : {};

export const FAL_MODELS = {
  edit: FAL_MODEL_EDIT,
  tryon: FAL_MODEL_TRYON,
  cutout: FAL_MODEL_CUTOUT,
} as const;
