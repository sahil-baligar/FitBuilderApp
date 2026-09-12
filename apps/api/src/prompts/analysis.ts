import type { ClothingCategory, GarmentAnalysis } from '@fitbuilder/core/contracts';
import type { WeatherBand } from '@fitbuilder/core/models';

export const CATEGORIES: ClothingCategory[] = ['top', 'bottom', 'outerwear', 'shoes', 'accessories'];
const WEATHER: WeatherBand[] = ['cold', 'cool', 'warm', 'hot'];
const PATTERNS = ['solid', 'striped', 'plaid', 'floral', 'graphic', 'textured', 'other'] as const;
const FITS = ['slim', 'regular', 'relaxed', 'oversized'] as const;
const SLEEVES = ['sleeveless', 'short', 'three-quarter', 'long'] as const;

/**
 * Strict JSON-only instruction shared by the Ollama and OpenAI analysis
 * providers. The schema mirrors `GarmentAnalysis` minus `source`.
 */
export const buildAnalysisPrompt = (hint?: ClothingCategory): string =>
  [
    'You are a garment cataloguing assistant for a wardrobe app. Look at the photo and describe the single main clothing item.',
    'Respond with ONE JSON object only. No prose, no markdown, no code fences.',
    '',
    'Schema (use exactly these keys; use null when unknown):',
    '{',
    '  "category": "top" | "bottom" | "outerwear" | "shoes" | "accessories",',
    '  "subcategory": string,              // e.g. "t-shirt", "hoodie", "jeans", "chinos", "sneakers", "belt"',
    '  "primaryColor": { "name": string, "hex": "#rrggbb" },',
    '  "secondaryColors": [ { "name": string, "hex": "#rrggbb" } ],   // up to 3, [] if none',
    '  "pattern": "solid" | "striped" | "plaid" | "floral" | "graphic" | "textured" | "other",',
    '  "material": string,                 // best guess, e.g. "cotton", "denim", "wool", "leather", "polyester"',
    '  "fit": "slim" | "regular" | "relaxed" | "oversized",',
    '  "sleeveLength": "sleeveless" | "short" | "three-quarter" | "long" | null,   // tops/outerwear only',
    '  "neckline": string | null,          // e.g. "crew", "v-neck", "collar", "hood"',
    '  "weatherSuitability": [ "cold" | "cool" | "warm" | "hot" ],   // one or more',
    '  "occasions": [ string ],            // e.g. "casual", "work", "formal", "sport", "party"',
    '  "tags": [ string ],                 // 3-8 short lowercase descriptive tags',
    '  "confidence": number                // 0 to 1, how sure you are overall',
    '}',
    '',
    'Rules: "top" covers shirts, t-shirts, sweaters, hoodies and dresses; "bottom" covers pants, jeans, shorts and skirts; "outerwear" covers jackets, coats and blazers.',
    'Colors must be the fabric colors, not the background. Hex values must be 6-digit lowercase.',
    hint ? `The user believes this item is a "${hint}"; prefer that unless the photo clearly disagrees.` : '',
  ]
    .filter((line) => line !== '')
    .join('\n');

/** Extract the first JSON object from free text (models sometimes wrap it). */
export const extractJson = (text: string): unknown => {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('No JSON object found in model output');
  return JSON.parse(trimmed.slice(start, end + 1));
};

const categorySynonyms: Record<string, ClothingCategory> = {
  tops: 'top',
  shirt: 'top',
  tshirt: 'top',
  't-shirt': 'top',
  tee: 'top',
  blouse: 'top',
  sweater: 'top',
  hoodie: 'top',
  sweatshirt: 'top',
  dress: 'top',
  polo: 'top',
  bottoms: 'bottom',
  pants: 'bottom',
  trousers: 'bottom',
  jeans: 'bottom',
  shorts: 'bottom',
  skirt: 'bottom',
  jacket: 'outerwear',
  coat: 'outerwear',
  blazer: 'outerwear',
  parka: 'outerwear',
  vest: 'outerwear',
  shoe: 'shoes',
  sneakers: 'shoes',
  sneaker: 'shoes',
  boots: 'shoes',
  boot: 'shoes',
  sandals: 'shoes',
  footwear: 'shoes',
  accessory: 'accessories',
  hat: 'accessories',
  cap: 'accessories',
  bag: 'accessories',
  belt: 'accessories',
  scarf: 'accessories',
  watch: 'accessories',
  jewelry: 'accessories',
  sunglasses: 'accessories',
};

const asString = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;

const asEnum = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined => {
  const s = asString(v)?.toLowerCase();
  return s && (allowed as readonly string[]).includes(s) ? (s as T) : undefined;
};

const asStringArray = (v: unknown, max = 12): string[] => {
  const arr = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [];
  const out: string[] = [];
  for (const item of arr) {
    const s = asString(item)?.toLowerCase();
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= max) break;
  }
  return out;
};

const normaliseHex = (v: unknown): string | undefined => {
  const s = asString(v)?.replace(/^#/, '').toLowerCase();
  if (!s) return undefined;
  if (/^[0-9a-f]{6}$/.test(s)) return `#${s}`;
  if (/^[0-9a-f]{3}$/.test(s)) return `#${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`;
  return undefined;
};

const asColor = (v: unknown): { name: string; hex: string } | undefined => {
  if (typeof v === 'string') {
    const hex = normaliseHex(v);
    return hex ? { name: v, hex } : { name: v, hex: '#808080' };
  }
  if (v && typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    const name = asString(obj.name) ?? asString(obj.color);
    const hex = normaliseHex(obj.hex) ?? normaliseHex(obj.value);
    if (name || hex) return { name: name ?? hex ?? 'Unknown', hex: hex ?? '#808080' };
  }
  return undefined;
};

export const coerceCategory = (v: unknown, hint?: ClothingCategory): ClothingCategory => {
  const s = asString(v)?.toLowerCase();
  if (s) {
    if ((CATEGORIES as string[]).includes(s)) return s as ClothingCategory;
    if (categorySynonyms[s]) return categorySynonyms[s];
    for (const [key, cat] of Object.entries(categorySynonyms)) {
      if (s.includes(key)) return cat;
    }
  }
  return hint ?? 'top';
};

const defaultWeather = (category: ClothingCategory): WeatherBand[] => {
  switch (category) {
    case 'outerwear':
      return ['cold', 'cool'];
    case 'shoes':
    case 'accessories':
      return ['cold', 'cool', 'warm', 'hot'];
    default:
      return ['cool', 'warm'];
  }
};

/**
 * Coerce whatever a model returned into a valid `GarmentAnalysis`. Never
 * throws on shape problems; only requires that `raw` is an object.
 */
export const coerceAnalysis = (
  raw: unknown,
  source: GarmentAnalysis['source'],
  hint?: ClothingCategory,
): GarmentAnalysis => {
  if (!raw || typeof raw !== 'object') throw new Error('Analysis output is not an object');
  const r = raw as Record<string, unknown>;

  const category = coerceCategory(r.category, hint);
  const primaryColor = asColor(r.primaryColor) ??
    asColor(r.primary_color) ??
    asColor(r.color) ?? { name: 'Unknown', hex: '#808080' };

  const secondaryRaw = Array.isArray(r.secondaryColors)
    ? r.secondaryColors
    : Array.isArray(r.secondary_colors)
      ? r.secondary_colors
      : [];
  const secondaryColors = secondaryRaw
    .map(asColor)
    .filter((c): c is { name: string; hex: string } => Boolean(c))
    .slice(0, 3);

  const weather = asStringArray(r.weatherSuitability ?? r.weather_suitability ?? r.weather).filter(
    (w): w is WeatherBand => (WEATHER as string[]).includes(w),
  );

  const confidenceRaw = Number(r.confidence);
  const confidence = Number.isFinite(confidenceRaw)
    ? Math.min(1, Math.max(0, confidenceRaw > 1 ? confidenceRaw / 100 : confidenceRaw))
    : undefined;

  const isUpperBody = category === 'top' || category === 'outerwear';

  return {
    category,
    subcategory: asString(r.subcategory) ?? asString(r.type),
    primaryColor,
    secondaryColors,
    pattern: asEnum(r.pattern, PATTERNS),
    material: asString(r.material)?.toLowerCase(),
    fit: asEnum(r.fit, FITS),
    sleeveLength: isUpperBody ? asEnum(r.sleeveLength ?? r.sleeve_length, SLEEVES) : undefined,
    neckline: isUpperBody ? asString(r.neckline)?.toLowerCase() : undefined,
    weatherSuitability: weather.length ? weather : defaultWeather(category),
    occasions: asStringArray(r.occasions, 6),
    tags: asStringArray(r.tags, 10),
    confidence,
    source,
  };
};
