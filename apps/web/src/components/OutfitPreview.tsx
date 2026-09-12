import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, Layers, User } from 'lucide-react';
import {
  buildOutfitSteps,
  composeOutfit,
  type LayerRect,
  type OutfitLayer,
  type SelectedItems,
} from '@fitbuilder/core';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface OutfitPreviewProps {
  selectedItems: SelectedItems;
  compact?: boolean;
  /** Start in the layered "full look" view instead of the step-by-step one. */
  defaultMode?: 'steps' | 'full';
}

type PreviewMode = 'steps' | 'full';

const SWIPE_THRESHOLD_PX = 40;

/** Core rects are 0..1 fractions of a 3:4 canvas; CSS wants percentages of the box. */
const rectToStyle = (rect: LayerRect, z: number): CSSProperties => ({
  left: `${rect.x * 100}%`,
  top: `${rect.y * 100}%`,
  width: `${rect.w * 100}%`,
  height: `${rect.h * 100}%`,
  zIndex: z,
});

const LayerImage = ({ layer }: { layer: OutfitLayer }) => (
  <img
    key={layer.key}
    src={layer.imageUrl}
    alt={layer.item.name}
    draggable={false}
    style={rectToStyle(layer.rect, layer.z)}
    className="absolute object-contain pointer-events-none select-none transition-all duration-300 drop-shadow-2xl"
  />
);

/** Soft elliptical shadow under the outfit so the full look reads as standing on a floor. */
const FloorShadow = () => (
  <div
    aria-hidden
    className="absolute left-1/2 -translate-x-1/2 pointer-events-none"
    style={{
      bottom: '3%',
      width: '58%',
      height: '7%',
      zIndex: 0,
      background: 'radial-gradient(ellipse at center, hsl(var(--foreground) / 0.18) 0%, transparent 70%)',
      filter: 'blur(4px)',
    }}
  />
);

export const OutfitPreview = ({ selectedItems, compact, defaultMode = 'steps' }: OutfitPreviewProps) => {
  const steps = useMemo(() => buildOutfitSteps(selectedItems), [selectedItems]);
  const fullLook = useMemo(() => composeOutfit(selectedItems), [selectedItems]);
  const [mode, setMode] = useState<PreviewMode>(defaultMode);
  const [stepIndex, setStepIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    setStepIndex(0);
  }, [steps.length]);

  const canvasClass = compact ? 'w-full max-w-[240px] mx-auto' : 'w-full max-w-[330px] mx-auto';

  if (!steps.length) {
    return (
      <div
        className={cn(
          'aspect-[3/4] rounded-3xl border border-dashed bg-muted/40 flex items-center justify-center text-muted-foreground text-sm text-center px-6',
          canvasClass,
        )}
      >
        Add items to preview your fit
      </div>
    );
  }

  const clampedIndex = Math.min(stepIndex, steps.length - 1);
  const activeStep = steps[clampedIndex];
  const goPrev = () => setStepIndex((prev) => Math.max(prev - 1, 0));
  const goNext = () => setStepIndex((prev) => Math.min(prev + 1, steps.length - 1));

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = (e.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < SWIPE_THRESHOLD_PX) return;
    if (delta < 0) goNext();
    else goPrev();
  };

  const layers = mode === 'full' ? fullLook : activeStep.layers;

  return (
    <div className="space-y-3">
      <div className={cn('relative', canvasClass)}>
        <div
          className="relative aspect-[3/4] overflow-hidden rounded-3xl border bg-gradient-to-b from-background to-muted shadow-inner touch-pan-y"
          onTouchStart={mode === 'steps' ? onTouchStart : undefined}
          onTouchEnd={mode === 'steps' ? onTouchEnd : undefined}
        >
          {mode === 'full' && <FloorShadow />}
          {layers.map((layer) => (
            <LayerImage key={layer.key} layer={layer} />
          ))}
        </div>

        {/* Mode toggle */}
        <div className="absolute top-2 right-2 z-20 flex rounded-full bg-background/85 backdrop-blur border border-border p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setMode('steps')}
            aria-pressed={mode === 'steps'}
            className={cn(
              'flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors',
              mode === 'steps' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
            )}
          >
            <Layers className="w-3 h-3" />
            Steps
          </button>
          <button
            type="button"
            onClick={() => setMode('full')}
            aria-pressed={mode === 'full'}
            className={cn(
              'flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors',
              mode === 'full' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
            )}
          >
            <User className="w-3 h-3" />
            Full look
          </button>
        </div>
      </div>

      {mode === 'steps' ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <Button variant="ghost" size="sm" onClick={goPrev} disabled={clampedIndex === 0} aria-label="Previous step">
              <ChevronLeft className="w-4 h-4" />
              Prev
            </Button>
            <span className="font-medium text-center flex-1 truncate px-2">{activeStep.label}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={goNext}
              disabled={clampedIndex >= steps.length - 1}
              aria-label="Next step"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex justify-center gap-1.5" aria-hidden>
            {steps.map((step, i) => (
              <span
                key={step.label + i}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  i === clampedIndex ? 'w-4 bg-primary' : 'w-1.5 bg-muted-foreground/30',
                )}
              />
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-center text-muted-foreground">
          {fullLook.length} {fullLook.length === 1 ? 'piece' : 'pieces'} layered
        </p>
      )}
    </div>
  );
};
