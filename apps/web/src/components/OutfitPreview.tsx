import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { AccessoryPlacement, ClothingCategory, ClothingItem } from '@/types/models';
import { Button } from '@/components/ui/button';

type SelectedItems = Partial<Record<ClothingCategory, ClothingItem | null>>;

interface OutfitPreviewProps {
  selectedItems: SelectedItems;
  compact?: boolean;
}

interface PreviewLayer {
  slot: ClothingCategory;
  item: ClothingItem;
  variant?: 'overlay';
}

interface PreviewStep {
  label: string;
  layers: PreviewLayer[];
}

const baseStyles: Record<ClothingCategory, CSSProperties> = {
  top: {
    top: '6%',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '55%',
    height: '38%',
  },
  outerwear: {
    top: '4%',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '60%',
    height: '50%',
  },
  bottom: {
    top: '40%',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '50%',
    height: '38%',
  },
  shoes: {
    bottom: '6%',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '40%',
    height: '18%',
  },
  accessories: {
    top: '15%',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '25%',
    height: '18%',
  },
};

const accessoryStyles: Record<AccessoryPlacement, CSSProperties> = {
  head: { top: '4%' },
  neck: { top: '12%' },
  torso: { top: '20%' },
  waist: { top: '42%' },
  wrist: { top: '48%', width: '18%' },
  hand: { top: '55%', width: '20%' },
};

const getLayerStyle = (layer: PreviewLayer): CSSProperties => {
  if (layer.slot === 'accessories' && layer.item.accessoryPlacement) {
    return {
      ...baseStyles.accessories,
      ...accessoryStyles[layer.item.accessoryPlacement],
    };
  }
  return baseStyles[layer.slot];
};

const getImageForLayer = (layer: PreviewLayer) => {
  if (layer.variant) {
    const overlay = layer.item.layers?.find((entry) => entry.mode === 'overlay');
    if (overlay) return overlay.imageUrl;
  }
  return layer.item.imageUrl;
};

const buildSteps = (items: SelectedItems): PreviewStep[] => {
  const steps: PreviewStep[] = [];
  const order: ClothingCategory[] = ['top', 'bottom', 'shoes', 'accessories'];

  order.forEach((slot) => {
    const item = items[slot];
    if (item) {
      steps.push({
        label: item.name,
        layers: [{ slot, item }],
      });
    }
  });

  const coreLayers: PreviewLayer[] = order
    .map((slot) => items[slot])
    .filter((item): item is ClothingItem => Boolean(item))
    .map((item) => ({ slot: item.category, item }));

  if (coreLayers.length) {
    steps.push({ label: 'Core fit', layers: coreLayers });
  }

  const outerwear = items.outerwear;
  if (outerwear) {
    steps.push({
      label: outerwear.name,
      layers: [{ slot: 'outerwear', item: outerwear }],
    });
    const overlayLayer: PreviewLayer = {
      slot: 'outerwear',
      item: outerwear,
      variant: outerwear.layers?.some((layer) => layer.mode === 'overlay') ? 'overlay' : undefined,
    };
    steps.push({
      label: `${outerwear.name} layered`,
      layers: [...coreLayers, overlayLayer],
    });
  }

  return steps;
};

export const OutfitPreview = ({ selectedItems, compact }: OutfitPreviewProps) => {
  const steps = useMemo(() => buildSteps(selectedItems), [selectedItems]);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    setStepIndex(0);
  }, [steps.length]);

  if (!steps.length) {
    return (
      <div
        className={`rounded-3xl border border-dashed bg-muted/40 flex items-center justify-center text-muted-foreground ${
          compact ? 'h-64' : 'h-96'
        }`}
      >
        Add items to preview your fit
      </div>
    );
  }

  const activeStep = steps[Math.min(stepIndex, steps.length - 1)];

  return (
    <div className="space-y-3">
      <div
        className={`relative overflow-hidden rounded-3xl border bg-gradient-to-b from-background to-muted shadow-inner ${
          compact ? 'h-64' : 'h-96'
        }`}
      >
        <div className="absolute inset-0 pointer-events-none" />
        {activeStep.layers.map((layer) => (
          <img
            key={`${layer.slot}-${layer.item.id}-${layer.variant ?? 'base'}`}
            src={getImageForLayer(layer)}
            alt={layer.item.name}
            style={getLayerStyle(layer)}
            className="absolute object-contain pointer-events-none transition-all duration-300 drop-shadow-2xl"
          />
        ))}
      </div>
      <div className="flex items-center justify-between text-sm">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setStepIndex((prev) => Math.max(prev - 1, 0))}
          disabled={stepIndex === 0}
        >
          Prev
        </Button>
        <span className="font-medium text-center flex-1">{activeStep.label}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setStepIndex((prev) => Math.min(prev + 1, steps.length - 1))}
          disabled={stepIndex >= steps.length - 1}
        >
          Next
        </Button>
      </div>
    </div>
  );
};

