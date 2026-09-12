import type { StyleFrameRequest } from '@fitbuilder/core/contracts';
import type { FitRenderView } from '@fitbuilder/core/models';

/**
 * Multi-view style-frame prompts.
 *
 * Inspired by multi-angle framing flows (front → side → torso → back) where
 * each shot must keep the same person, outfit and setting. Wording is original.
 */

const viewBrief: Record<FitRenderView, string> = {
  front:
    'Show the same person full body from the front, head to feet, standing relaxed and centered in frame.',
  side:
    'Show the same person full body from one side (clear profile or three-quarter side), head to feet, standing relaxed.',
  back:
    'Show the same person full body from behind, head to feet, standing relaxed and centered in frame.',
  torso:
    'Show the same person from the waist up, including the full head and shoulders, framed from the front.',
};

const backgroundPhrase = (bg: NonNullable<StyleFrameRequest['options']>['background']): string => {
  switch (bg) {
    case 'studio':
      return 'Place them in front of a plain, seamless, neutral light-gray studio backdrop with soft even lighting.';
    case 'city':
      return 'Place them on a clean city street with soft daylight and a softly blurred urban background.';
    case 'nature':
      return 'Place them outdoors in a calm natural setting with soft daylight and a softly blurred green background.';
    case 'keep':
    default:
      return 'Keep the same background as the reference image(s).';
  }
};

/**
 * One prompt per view. The source render (and, when chaining, the previous
 * frame) is attached as reference image(s), so the wording stresses identity
 * and outfit lock across the multi-view set.
 */
export const buildStyleFramePrompt = (
  view: FitRenderView,
  options?: StyleFrameRequest['options'],
): string =>
  [
    viewBrief[view],
    'Identity lock: keep the same person, face, hairstyle, body shape and skin tone as in the reference image(s).',
    'Outfit lock: keep the same clothes, colours, patterns, fit, layering and footwear; do not add or remove any garment or accessory.',
    backgroundPhrase(options?.background ?? 'keep'),
    'Natural relaxed standing pose, photorealistic, sharp focus, lighting consistent with the reference.',
    'No text, no watermark, no logo overlay, no collage borders.',
  ].join(' ');
