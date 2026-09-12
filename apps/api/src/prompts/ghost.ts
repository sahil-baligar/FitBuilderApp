import type { ClothingCategory, GarmentAnalysis } from '@fitbuilder/core/contracts';

/**
 * Ghost-mannequin prompt builder.
 *
 * Structure mirrors commercial e-commerce ghost pipelines (analyze → weave
 * facts → render): task lock, non-negotiable facts, category shaping rules,
 * presentation, forbidden edits, self-check. Wording is original to FitBuilder.
 */

const categoryRules: Record<ClothingCategory, string[]> = {
  top: [
    'Give the torso natural rounded volume as if a body fills it; do not leave it flat or crumpled.',
    'Shape both sleeves as if arms hang relaxed inside them; cuff or hem openings stay open and hollow.',
    'Keep the neck opening hollow: the inside back of the collar or neckband must be visible through it.',
    'Let the bottom hem fall straight with a slight open oval, interior faintly lit.',
  ],
  bottom: [
    'Give the waist and hips natural worn volume; the waistband opening is hollow with its inside visible.',
    'Both legs hang straight with rounded volume and open, hollow hems.',
    'Keep the fly, belt loops, pockets and seams exactly where they are on the source.',
  ],
  outerwear: [
    'Shape the shoulders, chest and sleeves with the structured volume of a worn jacket or coat.',
    'Keep the collar and lapels standing in their natural shape; the neck opening is hollow with its interior visible.',
    'Keep the closure state (open or closed, zipped or unzipped) exactly as in the source; every button, zipper and pocket stays.',
  ],
  shoes: [
    'Present the pair (or single shoe if only one is shown) upright on an invisible floor, slight three-quarter front angle, laces and soles as in the source.',
    'No feet, no legs, no shadows other than a faint contact shadow.',
  ],
  accessories: [
    'Present the item alone, in its natural resting orientation, filling most of the frame comfortably.',
    'No body parts, no props, no styling context.',
  ],
};

const forbiddenEdits = [
  'Do not invent features that are not in the source photo.',
  'Do not change the primary or secondary colors, even slightly.',
  'Do not add, remove, move, resize or redraw any logo, label, print, graphic, embroidery or text.',
  'Do not change the pattern, its scale, or its alignment.',
  'Do not add or remove buttons, zippers, pockets, drawstrings, straps or any hardware.',
  'Do not change the neckline shape, sleeve length, hem length, or overall silhouette.',
  'Do not smooth away real fabric texture, ribbing, knit structure or weave.',
  'Do not add any person, mannequin, head, hands, skin, hanger, clip, tag, shadow-caster or prop.',
  'Do not add a second garment, layering piece, or any decorative item.',
  'Do not add captions, watermarks, borders or any text.',
  'Do not tilt, mirror, crop or rotate the garment; front view only.',
];

const presentation = [
  'Front view, straight on, centered; the garment fills roughly 80–90% of the frame with a small even margin on all sides.',
  'Pure white seamless background (#FFFFFF), no floor line, no gradient, no cast shadows.',
  'Soft, even, high-key studio lighting; sharp focus over the entire garment; true-to-life sRGB color.',
  'Clean product-photography quality suitable for an online wardrobe listing.',
  'Ghost-mannequin presentation: worn volume with hollow openings and a softly lit interior at neck, sleeves and hem where applicable.',
];

const selfCheck = [
  'Is every color, logo, print and pattern identical to the source?',
  'Does the garment show natural worn volume with hollow openings and a visible interior at the neck / waist / cuffs?',
  'Is there any trace of a person, mannequin, hanger, or background left? There must be none.',
  'Is the garment front-facing, centered, filling most of the frame, on pure white?',
];

const describeFacts = (analysis?: GarmentAnalysis, categoryHint?: ClothingCategory): string[] => {
  const facts: string[] = [];
  const category = categoryHint ?? analysis?.category;
  if (category) facts.push(`Garment category: ${category}.`);
  if (analysis?.subcategory) facts.push(`Garment type: ${analysis.subcategory}.`);
  if (analysis) {
    facts.push(`Primary color: ${analysis.primaryColor.name} (${analysis.primaryColor.hex}).`);
    if (analysis.secondaryColors?.length) {
      facts.push(
        `Secondary colors: ${analysis.secondaryColors.map((c) => `${c.name} (${c.hex})`).join(', ')}.`,
      );
    }
    if (analysis.pattern) facts.push(`Pattern: ${analysis.pattern}.`);
    if (analysis.material) facts.push(`Material / texture: ${analysis.material}.`);
    if (analysis.fit) facts.push(`Fit: ${analysis.fit}.`);
    if (analysis.sleeveLength) facts.push(`Sleeve length: ${analysis.sleeveLength}.`);
    if (analysis.neckline) facts.push(`Neckline: ${analysis.neckline}.`);
  } else if (categoryHint) {
    facts.push(
      `No vision analysis was available; treat the item firmly as a "${categoryHint}" and preserve every visible colour, print and construction detail from the photo.`,
    );
  }
  return facts;
};

export const buildGhostPrompt = (opts: {
  categoryHint?: ClothingCategory;
  analysis?: GarmentAnalysis;
}): string => {
  const category = opts.categoryHint ?? opts.analysis?.category ?? 'top';
  const facts = describeFacts(opts.analysis, opts.categoryHint);

  const sections: string[] = [];

  sections.push(
    [
      'TASK',
      'Fidelity lock: reproduce the exact garment from the photo. Do not redesign, restyle or invent details.',
      `Turn the supplied photo of a ${category} into a ghost-mannequin product photo for an online wardrobe.`,
      'Show the identical garment as if worn by a completely invisible person: three-dimensional body volume inside, but no body, skin, face, hands, mannequin, hanger or prop visible anywhere.',
      'This is a faithful re-photograph of the identical garment, not a redesign.',
    ].join('\n'),
  );

  sections.push(
    [
      'NON-NEGOTIABLE FACTS',
      '- Exact colors, pattern and scale, fabric texture, every seam, logo, label, print and graphic must match the source.',
      '- Garment construction stays the same: neckline, sleeves, hem, closures, pockets and hardware.',
      ...facts.map((f) => `- ${f}`),
    ].join('\n'),
  );

  sections.push(
    ['SHAPING RULES FOR THIS CATEGORY', ...categoryRules[category].map((r) => `- ${r}`)].join('\n'),
  );

  sections.push(['PRESENTATION', ...presentation.map((r) => `- ${r}`)].join('\n'));

  sections.push(['FORBIDDEN EDITS', ...forbiddenEdits.map((r) => `- ${r}`)].join('\n'));

  sections.push(['CHECK BEFORE FINISHING', ...selfCheck.map((r) => `- ${r}`)].join('\n'));

  sections.push('OUTPUT: a single PNG of the garment only, front view, on pure white.');

  return sections.join('\n\n');
};
