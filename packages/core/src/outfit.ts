/**
 * Platform-agnostic outfit composition. Produces normalized layer geometry
 * (fractions of the canvas) so the web (CSS) and native (Skia/Image) previews
 * render the same fit identically.
 */
import type { AccessoryPlacement, ClothingCategory, ClothingItem } from './types/models';

export type SelectedItems = Partial<Record<ClothingCategory, ClothingItem | null>>;

/** Normalized rectangle: x,y is the top-left corner; all values are 0..1 fractions of the canvas. */
export interface LayerRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OutfitLayer {
  key: string;
  slot: ClothingCategory;
  item: ClothingItem;
  imageUrl: string;
  rect: LayerRect;
  /** Paint order; higher is on top. */
  z: number;
  variant?: 'overlay';
}

export interface OutfitStep {
  label: string;
  layers: OutfitLayer[];
}

/** Fractions tuned for a 3:4 portrait canvas. Centered horizontally. */
const centered = (y: number, w: number, h: number): LayerRect => ({ x: (1 - w) / 2, y, w, h });

const slotRects: Record<ClothingCategory, LayerRect> = {
  outerwear: centered(0.04, 0.6, 0.5),
  top: centered(0.06, 0.55, 0.38),
  bottom: centered(0.4, 0.5, 0.38),
  shoes: centered(0.76, 0.4, 0.18),
  accessories: centered(0.15, 0.25, 0.18),
};

const accessoryRects: Record<AccessoryPlacement, Partial<LayerRect>> = {
  head: { y: 0.0 },
  neck: { y: 0.1 },
  torso: { y: 0.2 },
  waist: { y: 0.42 },
  wrist: { y: 0.48, w: 0.18 },
  hand: { y: 0.55, w: 0.2 },
};

const zOrder: Record<ClothingCategory, number> = {
  shoes: 1,
  bottom: 2,
  top: 3,
  accessories: 4,
  outerwear: 5,
};

/** Paint order of the core garments, bottom-most first. */
export const CORE_SLOT_ORDER: ClothingCategory[] = ['shoes', 'bottom', 'top', 'accessories'];

export const rectForItem = (item: ClothingItem): LayerRect => {
  const base = slotRects[item.category];
  if (item.category === 'accessories' && item.accessoryPlacement) {
    const override = accessoryRects[item.accessoryPlacement];
    const w = override.w ?? base.w;
    return { ...base, ...override, w, x: (1 - w) / 2 };
  }
  return base;
};

/** Best image for layering: ghost render, then cutout, then whatever the item shows. */
export const layerImageFor = (item: ClothingItem, variant?: 'overlay'): string => {
  if (variant === 'overlay') {
    const overlay = item.layers?.find((l) => l.mode === 'overlay');
    if (overlay) return overlay.imageUrl;
  }
  return item.ghostImageUrl ?? item.cutoutImageUrl ?? item.imageUrl;
};

const toLayer = (item: ClothingItem, variant?: 'overlay'): OutfitLayer => ({
  key: `${item.category}-${item.id}-${variant ?? 'base'}`,
  slot: item.category,
  item,
  imageUrl: layerImageFor(item, variant),
  rect: rectForItem(item),
  z: zOrder[item.category],
  variant,
});

/** Flat, fully layered view of the selection. */
export const composeOutfit = (items: SelectedItems): OutfitLayer[] => {
  const layers: OutfitLayer[] = [];
  for (const slot of CORE_SLOT_ORDER) {
    const item = items[slot];
    if (item) layers.push(toLayer(item));
  }
  const outer = items.outerwear;
  if (outer) {
    const hasOverlay = outer.layers?.some((l) => l.mode === 'overlay');
    layers.push(toLayer(outer, hasOverlay ? 'overlay' : undefined));
  }
  return layers.sort((a, b) => a.z - b.z);
};

/** Step-by-step "dressing" sequence used by the swipeable preview. */
export const buildOutfitSteps = (items: SelectedItems): OutfitStep[] => {
  const steps: OutfitStep[] = [];
  const order: ClothingCategory[] = ['top', 'bottom', 'shoes', 'accessories'];

  for (const slot of order) {
    const item = items[slot];
    if (item) steps.push({ label: item.name, layers: [toLayer(item)] });
  }

  const core = composeOutfit({ ...items, outerwear: null });
  if (core.length) steps.push({ label: 'Core fit', layers: core });

  const outer = items.outerwear;
  if (outer) {
    steps.push({ label: outer.name, layers: [toLayer(outer)] });
    steps.push({ label: `${outer.name} layered`, layers: composeOutfit(items) });
  }
  return steps;
};

/** Convert a Fit's itemIds into a slot map, picking the first item per category. */
export const selectionFromItemIds = (itemIds: string[], wardrobe: ClothingItem[]): SelectedItems => {
  const byId = new Map(wardrobe.map((i) => [i.id, i]));
  const selection: SelectedItems = {};
  for (const id of itemIds) {
    const item = byId.get(id);
    if (item && !selection[item.category]) selection[item.category] = item;
  }
  return selection;
};
