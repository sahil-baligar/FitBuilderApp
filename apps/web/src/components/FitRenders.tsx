import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { nanoid } from 'nanoid';
import { Camera, Frame, Loader2, UserRound } from 'lucide-react';
import {
  ApiError,
  layerImageFor,
  renderStyleFrames,
  renderTryOn,
  useApp,
  type ClothingItem,
  type Fit,
  type FitRender,
} from '@fitbuilder/core';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';

interface FitRendersProps {
  /** The saved fit to render for. Renders are appended to `fit.renders` via updateOutfit. */
  fit: Fit;
  /** Wardrobe items in this fit (already resolved by the caller). */
  items: ClothingItem[];
}

type Job = { kind: 'tryon' | 'styleframe'; step: string; progress?: number } | null;

const viewLabel = (render: FitRender) => {
  if (render.kind === 'tryon') return 'Try-on';
  if (render.kind === 'flatlay') return 'Flat lay';
  return render.view ? `${render.view[0].toUpperCase()}${render.view.slice(1)} view` : 'Style frame';
};

const describeError = (err: unknown) => {
  if (err instanceof ApiError) {
    if (err.status === 0 || err.message.includes('Failed to fetch')) return 'API is offline';
    return err.message;
  }
  if (err instanceof TypeError) return 'API is offline';
  return err instanceof Error ? err.message : 'Render failed';
};

/**
 * "See it on me" + "Style frames" actions and the horizontal gallery of a fit's renders.
 * Reads the latest copy of the fit from context so new renders appear without the parent re-fetching.
 */
export const FitRenders = ({ fit: fitProp, items }: FitRendersProps) => {
  const { outfits, settings, updateOutfit } = useApp();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [job, setJob] = useState<Job>(null);
  const [error, setError] = useState<string | null>(null);

  const fit = outfits.find((f) => f.id === fitProp.id) ?? fitProp;
  const renders = fit.renders ?? [];
  const tryOn = [...renders].reverse().find((r) => r.kind === 'tryon');

  const appendRenders = async (next: FitRender[]) => {
    const latest = outfits.find((f) => f.id === fit.id) ?? fit;
    await updateOutfit(fit.id, { renders: [...(latest.renders ?? []), ...next] });
  };

  const handleTryOn = async () => {
    if (!settings.bodyPhotoUrl) {
      toast({
        title: 'Add a body photo first',
        description: 'Try-on needs a full-body photo. You can add one in Settings.',
      });
      navigate('/settings#body-photo');
      return;
    }
    if (!items.length) {
      toast({ title: 'No items in this fit', variant: 'destructive' });
      return;
    }
    setError(null);
    setJob({ kind: 'tryon', step: 'Starting try-on' });
    try {
      const result = await renderTryOn(
        {
          bodyImage: settings.bodyPhotoUrl,
          garments: items.map((item) => ({ itemId: item.id, image: layerImageFor(item), category: item.category })),
          fitId: fit.id,
        },
        { onUpdate: (j) => setJob({ kind: 'tryon', step: j.step ?? 'Rendering', progress: j.progress }) },
      );
      if (!result.result) throw new Error('Render finished without an image');
      await appendRenders([
        {
          id: nanoid(),
          kind: 'tryon',
          imageUrl: result.result.imageUrl,
          provider: result.result.provider,
          createdAt: new Date().toISOString(),
        },
      ]);
      toast({ title: 'Try-on ready', description: `Rendered "${fit.name}" on your photo.` });
    } catch (err) {
      const message = describeError(err);
      setError(message);
      toast({ title: 'Try-on failed', description: message, variant: 'destructive' });
    } finally {
      setJob(null);
    }
  };

  const handleStyleFrames = async () => {
    if (!tryOn) return;
    setError(null);
    setJob({ kind: 'styleframe', step: 'Starting style frames' });
    try {
      const result = await renderStyleFrames(
        { sourceImage: tryOn.imageUrl, views: ['front', 'side', 'back'], fitId: fit.id },
        { onUpdate: (j) => setJob({ kind: 'styleframe', step: j.step ?? 'Rendering', progress: j.progress }) },
      );
      const frames = result.result?.frames ?? [];
      if (!frames.length) throw new Error('No frames were returned');
      const createdAt = new Date().toISOString();
      await appendRenders(
        frames.map((frame) => ({
          id: nanoid(),
          kind: 'styleframe' as const,
          view: frame.view,
          imageUrl: frame.imageUrl,
          provider: result.result?.provider,
          createdAt,
        })),
      );
      toast({ title: 'Style frames ready', description: `${frames.length} views added.` });
    } catch (err) {
      const message = describeError(err);
      setError(message);
      toast({ title: 'Style frames failed', description: message, variant: 'destructive' });
    } finally {
      setJob(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" onClick={handleTryOn} disabled={!!job} className="flex-1 min-w-[140px]">
          {job?.kind === 'tryon' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserRound className="w-4 h-4 mr-2" />}
          See it on me
        </Button>
        {tryOn && (
          <Button size="sm" variant="outline" onClick={handleStyleFrames} disabled={!!job} className="flex-1 min-w-[140px]">
            {job?.kind === 'styleframe' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Frame className="w-4 h-4 mr-2" />}
            Style frames
          </Button>
        )}
      </div>

      {job && (
        <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-2" role="status" aria-live="polite">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span className="truncate">{job.step}</span>
          </div>
          <Progress value={job.progress !== undefined ? Math.round(job.progress * 100) : undefined} className="h-1.5" />
        </div>
      )}

      {error && !job && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}

      {renders.length > 0 && (
        <div className="-mx-1 overflow-x-auto scrollbar-hide">
          <div className="flex gap-3 px-1 pb-1">
            {renders.map((render) => (
              <figure key={render.id} className="flex-shrink-0 w-36 space-y-1">
                <div className="aspect-[3/4] rounded-xl overflow-hidden bg-muted border border-border">
                  <img src={render.imageUrl} alt={`${fit.name} ${viewLabel(render)}`} className="w-full h-full object-cover" />
                </div>
                <figcaption className="flex items-center justify-between gap-1 text-xs text-muted-foreground">
                  <span className="truncate">{viewLabel(render)}</span>
                  {render.kind === 'tryon' && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      <Camera className="w-3 h-3 mr-0.5" />
                      you
                    </Badge>
                  )}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
