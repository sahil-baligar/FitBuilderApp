import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  Camera,
  Filter,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import {
  useApp,
  useGarmentPipeline,
  type AccessoryPlacement,
  type ClothingCategory,
  type ClothingItem,
  type GarmentAnalysis,
  type WeatherBand,
} from '@fitbuilder/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { stripBackground } from '@/lib/backgroundRemoval';
import { prepareImage } from '@/lib/image';
import { cn } from '@/lib/utils';

const categories: ClothingCategory[] = ['top', 'bottom', 'outerwear', 'shoes', 'accessories'];
const weatherOptions: WeatherBand[] = ['cold', 'cool', 'warm', 'hot'];
const accessoryPlacements: AccessoryPlacement[] = ['neck', 'torso', 'waist', 'wrist', 'hand', 'head'];

type ImageView = 'original' | 'cutout' | 'ghost';

interface NewItemState {
  name: string;
  originalImageUrl: string;
  cutoutImageUrl: string;
  overlayImageUrl: string;
  category: ClothingCategory;
  color: string;
  weatherSuitability: WeatherBand[];
  tags: string;
  accessoryPlacement: AccessoryPlacement;
}

interface EditState {
  name: string;
  category: ClothingCategory;
  color: string;
  weatherSuitability: WeatherBand[];
  tags: string;
  accessoryPlacement: AccessoryPlacement;
}

const emptyNewItem: NewItemState = {
  name: '',
  originalImageUrl: '',
  cutoutImageUrl: '',
  overlayImageUrl: '',
  category: 'top',
  color: '',
  weatherSuitability: [],
  tags: '',
  accessoryPlacement: 'neck',
};

const toEditState = (item: ClothingItem): EditState => ({
  name: item.name,
  category: item.category,
  color: item.color,
  weatherSuitability: item.weatherSuitability,
  tags: item.tags.join(', '),
  accessoryPlacement: item.accessoryPlacement ?? 'neck',
});

const parseTags = (raw: string) => raw.split(',').map((t) => t.trim()).filter(Boolean);

const isUnprocessed = (item: ClothingItem) =>
  !item.ghostImageUrl && item.processing?.status !== 'queued' && item.processing?.status !== 'processing';

const isMidPipeline = (item: ClothingItem) =>
  item.processing?.status === 'queued' || item.processing?.status === 'processing';

/** Small chip in the card corner that reflects the pipeline lifecycle. */
const ProcessingChip = ({
  item,
  step,
  onRetry,
}: {
  item: ClothingItem;
  step?: string;
  onRetry: () => void;
}) => {
  if (isMidPipeline(item)) {
    return (
      <span className="absolute bottom-2 left-2 right-2 flex items-center gap-1 rounded-full bg-background/90 backdrop-blur px-2 py-1 text-[11px] font-medium border border-border">
        <Loader2 className="w-3 h-3 animate-spin text-primary flex-shrink-0" />
        <span className="truncate">{step ?? (item.processing?.status === 'queued' ? 'Queued' : 'Processing')}</span>
      </span>
    );
  }
  if (item.processing?.status === 'failed') {
    return (
      <span className="absolute bottom-2 left-2 right-2 flex items-center gap-1 rounded-full bg-destructive/10 backdrop-blur px-2 py-1 text-[11px] font-medium border border-destructive/40 text-destructive">
        <AlertCircle className="w-3 h-3 flex-shrink-0" />
        <span className="truncate flex-1" title={item.processing.error}>
          Failed
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRetry();
          }}
          className="underline underline-offset-2 font-semibold"
        >
          Retry
        </button>
      </span>
    );
  }
  return null;
};

const AnalysisPanel = ({ analysis, onApply }: { analysis: GarmentAnalysis; onApply: () => void }) => (
  <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-3">
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="w-4 h-4 text-primary" />
        Auto-tags
        {analysis.confidence !== undefined && (
          <span className="text-xs font-normal text-muted-foreground">{Math.round(analysis.confidence * 100)}%</span>
        )}
      </div>
      <Button size="sm" variant="outline" onClick={onApply}>
        Apply to item
      </Button>
    </div>
    <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
      <div className="col-span-2 flex items-center gap-2">
        <span
          className="inline-block w-5 h-5 rounded-full border border-border flex-shrink-0"
          style={{ backgroundColor: analysis.primaryColor.hex }}
          aria-hidden
        />
        <span className="font-medium capitalize">{analysis.primaryColor.name}</span>
        <span className="text-muted-foreground font-mono">{analysis.primaryColor.hex}</span>
        {analysis.secondaryColors?.map((c) => (
          <span
            key={c.hex}
            title={`${c.name} ${c.hex}`}
            className="inline-block w-3.5 h-3.5 rounded-full border border-border"
            style={{ backgroundColor: c.hex }}
          />
        ))}
      </div>
      <div>
        <span className="text-muted-foreground">Category</span>
        <p className="font-medium capitalize">
          {analysis.category}
          {analysis.subcategory ? ` · ${analysis.subcategory}` : ''}
        </p>
      </div>
      <div>
        <span className="text-muted-foreground">Pattern</span>
        <p className="font-medium capitalize">{analysis.pattern ?? '—'}</p>
      </div>
      <div>
        <span className="text-muted-foreground">Material</span>
        <p className="font-medium capitalize">{analysis.material ?? '—'}</p>
      </div>
      <div>
        <span className="text-muted-foreground">Fit</span>
        <p className="font-medium capitalize">{analysis.fit ?? '—'}</p>
      </div>
      <div className="col-span-2">
        <span className="text-muted-foreground">Weather</span>
        <div className="flex gap-1 mt-1 flex-wrap">
          {analysis.weatherSuitability.length ? (
            analysis.weatherSuitability.map((w) => (
              <Badge key={w} variant="secondary" className="capitalize text-[10px]">
                {w}
              </Badge>
            ))
          ) : (
            <span>—</span>
          )}
        </div>
      </div>
      {analysis.tags.length > 0 && (
        <div className="col-span-2">
          <span className="text-muted-foreground">Tags</span>
          <div className="flex gap-1 mt-1 flex-wrap">
            {analysis.tags.map((t) => (
              <Badge key={t} variant="outline" className="text-[10px]">
                {t}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  </div>
);

export default function Wardrobe() {
  const { wardrobe, settings, addClothingItem, removeClothingItem, updateClothingItem } = useApp();
  const pipeline = useGarmentPipeline();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(searchParams.get('action') === 'add');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [imageView, setImageView] = useState<ImageView>('original');
  const [edit, setEdit] = useState<EditState | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const overlayInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const [newItem, setNewItem] = useState<NewItemState>(emptyNewItem);
  const [uploadBusy, setUploadBusy] = useState({ primary: false, overlay: false });
  const [cutoutPending, setCutoutPending] = useState(false);
  // The local cutout keeps running after the user hits "Add"; this lets us attach it to the saved item.
  const cutoutPromiseRef = useRef<Promise<string> | null>(null);

  // Always read the freshest copy so pipeline updates show up inside the open dialog.
  const selectedItem = useMemo(() => wardrobe.find((i) => i.id === selectedId) ?? null, [wardrobe, selectedId]);
  const wardrobeRef = useRef(wardrobe);
  wardrobeRef.current = wardrobe;

  useEffect(() => {
    if (!selectedItem) return;
    setEdit((prev) => prev ?? toEditState(selectedItem));
    setImageView((prev) => {
      if (prev === 'ghost' && selectedItem.ghostImageUrl) return prev;
      if (prev === 'cutout' && selectedItem.cutoutImageUrl) return prev;
      return selectedItem.ghostImageUrl ? 'ghost' : selectedItem.cutoutImageUrl ? 'cutout' : 'original';
    });
  }, [selectedItem]);

  const runPipeline = useCallback(
    async (item: ClothingItem) => {
      try {
        await pipeline.run(item);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Processing failed';
        toast({ title: `Could not process ${item.name}`, description: message, variant: 'destructive' });
      }
    },
    [pipeline, toast],
  );

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: 'primary' | 'overlay') => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadBusy((prev) => ({ ...prev, [target]: true }));
    try {
      const prepared = await prepareImage(file);
      if (target === 'overlay') {
        // Overlays are only used for layering, so the cutout is the thing we keep.
        const cleaned = await stripBackground(file);
        setNewItem((prev) => ({ ...prev, overlayImageUrl: cleaned }));
        return;
      }
      setNewItem((prev) => ({ ...prev, originalImageUrl: prepared.dataUrl, cutoutImageUrl: '' }));
      // Non-blocking local cutout: the form stays usable while the model runs.
      setCutoutPending(true);
      const promise = stripBackground(file);
      cutoutPromiseRef.current = promise;
      promise
        .then((cleaned) => {
          if (cutoutPromiseRef.current === promise) {
            setNewItem((prev) => ({ ...prev, cutoutImageUrl: cleaned }));
          }
        })
        .catch(() => {
          toast({
            title: 'Background removal skipped',
            description: 'The original photo will be used until the server processes it.',
          });
        })
        .finally(() => {
          if (cutoutPromiseRef.current === promise) setCutoutPending(false);
        });
    } catch {
      toast({
        title: 'Could not read that image',
        description: 'Please try another photo.',
        variant: 'destructive',
      });
    } finally {
      setUploadBusy((prev) => ({ ...prev, [target]: false }));
    }
  };

  const resetAddForm = () => {
    setNewItem(emptyNewItem);
    cutoutPromiseRef.current = null;
    setCutoutPending(false);
  };

  const handleAddItem = async () => {
    if (!newItem.name || !newItem.originalImageUrl) {
      toast({
        title: 'Missing information',
        description: 'Please provide a name and image for the item.',
        variant: 'destructive',
      });
      return;
    }

    const accessoryPlacement = newItem.category === 'accessories' ? newItem.accessoryPlacement : undefined;
    const layers =
      newItem.category === 'outerwear' && newItem.overlayImageUrl
        ? [{ id: 'overlay', label: `${newItem.name} overlay`, imageUrl: newItem.overlayImageUrl, mode: 'overlay' as const }]
        : undefined;

    const pendingCutout = cutoutPending ? cutoutPromiseRef.current : null;
    const record = await addClothingItem({
      name: newItem.name,
      originalImageUrl: newItem.originalImageUrl,
      cutoutImageUrl: newItem.cutoutImageUrl || undefined,
      imageUrl: newItem.cutoutImageUrl || newItem.originalImageUrl,
      category: newItem.category,
      color: newItem.color,
      weatherSuitability: newItem.weatherSuitability,
      tags: parseTags(newItem.tags),
      layers,
      accessoryPlacement,
      processing: { status: 'idle', updatedAt: new Date().toISOString() },
    });

    if (pendingCutout) {
      pendingCutout
        .then(async (cleaned) => {
          const current = wardrobeRef.current.find((i) => i.id === record.id);
          if (!current || current.cutoutImageUrl) return;
          await updateClothingItem(record.id, {
            cutoutImageUrl: cleaned,
            ...(current.ghostImageUrl ? {} : { imageUrl: cleaned }),
          });
        })
        .catch(() => undefined);
    }

    toast({ title: 'Item added!', description: `${newItem.name} has been added to your wardrobe.` });
    setIsAddDialogOpen(false);
    setSearchParams({});
    resetAddForm();

    if (settings.autoProcessUploads) void runPipeline(record);
  };

  const handleSaveEdit = async () => {
    if (!selectedItem || !edit) return;
    await updateClothingItem(selectedItem.id, {
      name: edit.name.trim() || selectedItem.name,
      category: edit.category,
      color: edit.color,
      weatherSuitability: edit.weatherSuitability,
      tags: parseTags(edit.tags),
      accessoryPlacement: edit.category === 'accessories' ? edit.accessoryPlacement : undefined,
    });
    toast({ title: 'Saved', description: `${edit.name || selectedItem.name} updated.` });
    setSelectedId(null);
    setEdit(null);
  };

  const applyAnalysis = () => {
    const analysis = selectedItem?.analysis;
    if (!analysis) return;
    setEdit((prev) =>
      prev
        ? {
            ...prev,
            category: analysis.category,
            color: analysis.primaryColor.name,
            weatherSuitability: analysis.weatherSuitability,
            tags: Array.from(
              new Set([
                ...parseTags(prev.tags),
                ...analysis.tags,
                ...(analysis.pattern && analysis.pattern !== 'solid' ? [analysis.pattern] : []),
                ...(analysis.material ? [analysis.material] : []),
              ]),
            ).join(', '),
          }
        : prev,
    );
    toast({ title: 'Auto-tags applied', description: 'Review the fields and press Save.' });
  };

  const handleProcessAll = async () => {
    const pending = wardrobe.filter((item) => isUnprocessed(item) && !pipeline.isRunning(item.id));
    if (!pending.length) {
      toast({ title: 'Nothing to process', description: 'Every item already has a ghost render.' });
      return;
    }
    setBatchRunning(true);
    toast({ title: 'Processing wardrobe', description: `${pending.length} item${pending.length === 1 ? '' : 's'} queued.` });
    // Two at a time keeps the API responsive without starving the UI.
    const queue = [...pending];
    const worker = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        await pipeline.run(next).catch(() => undefined);
      }
    };
    await Promise.all([worker(), worker()]);
    setBatchRunning(false);
  };

  const unprocessedCount = wardrobe.filter(isUnprocessed).length;

  const filteredWardrobe = wardrobe.filter((item) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = item.name.toLowerCase().includes(q) || item.tags.some((tag) => tag.toLowerCase().includes(q));
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const viewUrl = (item: ClothingItem, view: ImageView) =>
    view === 'ghost' ? item.ghostImageUrl : view === 'cutout' ? item.cutoutImageUrl : item.originalImageUrl ?? item.imageUrl;

  return (
    <div className="min-h-screen pb-24 page-transition">
      {/* Header */}
      <div className="sticky top-0 bg-background/95 backdrop-blur-sm z-10 border-b border-border">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h1 className="text-2xl font-bold font-heading">My Wardrobe</h1>
            <div className="flex items-center gap-2">
              {wardrobe.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleProcessAll}
                  disabled={batchRunning || unprocessedCount === 0}
                  title="Run the ghost-mannequin pipeline on every unprocessed item"
                >
                  {batchRunning ? <Loader2 className="w-4 h-4 animate-spin sm:mr-2" /> : <Wand2 className="w-4 h-4 sm:mr-2" />}
                  <span className="hidden sm:inline">Process all</span>
                  {unprocessedCount > 0 && <span className="ml-1 text-xs text-muted-foreground">({unprocessedCount})</span>}
                </Button>
              )}
              <Button onClick={() => setIsAddDialogOpen(true)} size="sm">
                <Plus className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Add Item</span>
              </Button>
            </div>
          </div>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or tag..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
            <Badge
              variant={selectedCategory === 'all' ? 'default' : 'outline'}
              className="cursor-pointer tap-target flex-shrink-0"
              onClick={() => setSelectedCategory('all')}
            >
              All
            </Badge>
            {categories.map((cat) => (
              <Badge
                key={cat}
                variant={selectedCategory === cat ? 'default' : 'outline'}
                className="cursor-pointer capitalize tap-target flex-shrink-0"
                onClick={() => setSelectedCategory(cat)}
              >
                {cat}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        {filteredWardrobe.length === 0 ? (
          <div className="text-center py-12">
            <div className="bg-muted rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
              <Filter className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold font-heading mb-2">No items found</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery || selectedCategory !== 'all' ? 'Try adjusting your filters' : 'Add your first clothing item to get started'}
            </p>
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Item
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {filteredWardrobe.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setEdit(null);
                  setSelectedId(item.id);
                }}
                className="bg-card rounded-2xl overflow-hidden border border-border text-left transition-all hover:shadow-lg active:scale-95"
              >
                <div className="aspect-square bg-muted relative">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Camera className="w-12 h-12 text-muted-foreground" />
                    </div>
                  )}
                  <Badge className="absolute top-2 right-2 capitalize text-xs">{item.category}</Badge>
                  {item.ghostImageUrl && (
                    <Badge variant="secondary" className="absolute top-2 left-2 text-[10px] gap-1">
                      <Sparkles className="w-3 h-3" />
                      Ghost render
                    </Badge>
                  )}
                  <ProcessingChip item={item} step={pipeline.active[item.id]?.step} onRetry={() => runPipeline(item)} />
                </div>
                <div className="p-3">
                  <h3 className="font-semibold truncate mb-1">{item.name}</h3>
                  <p className="text-xs text-muted-foreground capitalize">{item.color || ' '}</p>
                  {item.tags.length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {item.tags.slice(0, 2).map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Add Item Dialog */}
      <Dialog
        open={isAddDialogOpen}
        onOpenChange={(open) => {
          setIsAddDialogOpen(open);
          if (!open) setSearchParams({});
        }}
      >
        <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">Add Clothing Item</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Photo</Label>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-24"
                  disabled={uploadBusy.primary}
                >
                  {uploadBusy.primary ? <Loader2 className="w-6 h-6 mr-2 animate-spin" /> : <Upload className="w-6 h-6 mr-2" />}
                  {uploadBusy.primary ? 'Reading…' : 'Upload'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-24"
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.setAttribute('capture', 'environment');
                      fileInputRef.current.click();
                      fileInputRef.current.removeAttribute('capture');
                    }
                  }}
                >
                  <Camera className="w-6 h-6 mr-2" />
                  Camera
                </Button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => handleFileUpload(e, 'primary')}
                className="hidden"
              />
              {newItem.category === 'outerwear' && (
                <>
                  <div className="mt-4">
                    <Label>Overlay Variant (for stacking)</Label>
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => overlayInputRef.current?.click()}
                        className="h-24"
                        disabled={uploadBusy.overlay}
                      >
                        {uploadBusy.overlay ? <Loader2 className="w-6 h-6 mr-2 animate-spin" /> : <Upload className="w-6 h-6 mr-2" />}
                        {uploadBusy.overlay ? 'Processing…' : 'Add Overlay'}
                      </Button>
                    </div>
                  </div>
                  <input
                    ref={overlayInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFileUpload(e, 'overlay')}
                    className="hidden"
                  />
                </>
              )}
              {newItem.originalImageUrl && (
                <div className="mt-3 relative">
                  <img
                    src={newItem.cutoutImageUrl || newItem.originalImageUrl}
                    alt="Preview"
                    className="w-full h-40 object-contain rounded-lg bg-muted"
                  />
                  <Badge variant="secondary" className="absolute top-2 left-2 text-xs gap-1">
                    {cutoutPending ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Removing background…
                      </>
                    ) : newItem.cutoutImageUrl ? (
                      'Cutout preview'
                    ) : (
                      'Original'
                    )}
                  </Badge>
                  <Button
                    size="icon"
                    variant="destructive"
                    className="absolute top-2 right-2"
                    aria-label="Remove photo"
                    onClick={() => {
                      cutoutPromiseRef.current = null;
                      setCutoutPending(false);
                      setNewItem((prev) => ({ ...prev, originalImageUrl: '', cutoutImageUrl: '' }));
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}
              {newItem.overlayImageUrl && (
                <div className="mt-3 relative">
                  <img
                    src={newItem.overlayImageUrl}
                    alt="Overlay preview"
                    className="w-full h-32 object-contain rounded-lg border border-dashed bg-muted"
                  />
                  <Badge className="absolute top-2 left-2 text-xs">Overlay Layer</Badge>
                  <Button
                    size="icon"
                    variant="destructive"
                    className="absolute top-2 right-2"
                    aria-label="Remove overlay"
                    onClick={() => setNewItem((prev) => ({ ...prev, overlayImageUrl: '' }))}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="name">Item Name</Label>
              <Input
                id="name"
                placeholder="e.g., Blue Denim Jacket"
                value={newItem.name}
                onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="category">Category</Label>
              <Select
                value={newItem.category}
                onValueChange={(value: ClothingCategory) =>
                  setNewItem({
                    ...newItem,
                    category: value,
                    overlayImageUrl: value === 'outerwear' ? newItem.overlayImageUrl : '',
                  })
                }
              >
                <SelectTrigger id="category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat} className="capitalize">
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {newItem.category === 'accessories' && (
              <div>
                <Label htmlFor="placement">Placement</Label>
                <Select
                  value={newItem.accessoryPlacement}
                  onValueChange={(value: AccessoryPlacement) => setNewItem({ ...newItem, accessoryPlacement: value })}
                >
                  <SelectTrigger id="placement">
                    <SelectValue placeholder="Select area" />
                  </SelectTrigger>
                  <SelectContent>
                    {accessoryPlacements.map((zone) => (
                      <SelectItem key={zone} value={zone} className="capitalize">
                        {zone}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label htmlFor="color">Color</Label>
              <Input
                id="color"
                placeholder={settings.autoProcessUploads ? 'Leave blank to auto-detect' : 'e.g., Blue'}
                value={newItem.color}
                onChange={(e) => setNewItem({ ...newItem, color: e.target.value })}
              />
            </div>

            <div>
              <Label>Weather</Label>
              <div className="flex gap-2 mt-2 flex-wrap">
                {weatherOptions.map((weather) => (
                  <Badge
                    key={weather}
                    variant={newItem.weatherSuitability.includes(weather) ? 'default' : 'outline'}
                    className="cursor-pointer capitalize tap-target"
                    onClick={() =>
                      setNewItem({
                        ...newItem,
                        weatherSuitability: newItem.weatherSuitability.includes(weather)
                          ? newItem.weatherSuitability.filter((w) => w !== weather)
                          : [...newItem.weatherSuitability, weather],
                      })
                    }
                  >
                    {weather}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="tags">Tags (comma separated)</Label>
              <Input
                id="tags"
                placeholder="e.g., casual, streetwear, vintage"
                value={newItem.tags}
                onChange={(e) => setNewItem({ ...newItem, tags: e.target.value })}
              />
            </div>

            {settings.autoProcessUploads && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Wand2 className="w-3.5 h-3.5" />
                Ghost render and auto-tags will run after you add this item.
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsAddDialogOpen(false);
                  setSearchParams({});
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button onClick={handleAddItem} className="flex-1" disabled={uploadBusy.primary || uploadBusy.overlay}>
                Add Item
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Item Detail / Edit Dialog */}
      <Dialog
        open={!!selectedItem}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedId(null);
            setEdit(null);
          }
        }}
      >
        <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
          {selectedItem && edit && (
            <>
              <DialogHeader>
                <DialogTitle className="font-heading">{selectedItem.name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {/* Image with segmented view toggle */}
                <div className="space-y-2">
                  <div className="relative rounded-lg bg-muted overflow-hidden">
                    <img
                      src={viewUrl(selectedItem, imageView) ?? selectedItem.imageUrl}
                      alt={`${selectedItem.name} (${imageView})`}
                      className="w-full h-64 object-contain"
                    />
                    <ProcessingChip
                      item={selectedItem}
                      step={pipeline.active[selectedItem.id]?.step}
                      onRetry={() => runPipeline(selectedItem)}
                    />
                  </div>
                  <div className="flex rounded-lg border border-border p-0.5 text-xs" role="tablist" aria-label="Image version">
                    {(
                      [
                        ['original', 'Original', selectedItem.originalImageUrl ?? selectedItem.imageUrl],
                        ['cutout', 'Cutout', selectedItem.cutoutImageUrl],
                        ['ghost', 'Ghost', selectedItem.ghostImageUrl],
                      ] as [ImageView, string, string | undefined][]
                    )
                      .filter(([, , url]) => !!url)
                      .map(([view, label]) => (
                        <button
                          key={view}
                          type="button"
                          role="tab"
                          aria-selected={imageView === view}
                          onClick={() => setImageView(view)}
                          className={cn(
                            'flex-1 rounded-md py-1.5 font-medium transition-colors',
                            imageView === view ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {label}
                        </button>
                      ))}
                  </div>
                </div>

                {selectedItem.processing?.status === 'failed' && selectedItem.processing.error && (
                  <p className="text-xs text-destructive flex items-start gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    {selectedItem.processing.error}
                  </p>
                )}

                {selectedItem.analysis && <AnalysisPanel analysis={selectedItem.analysis} onApply={applyAnalysis} />}

                {/* Editable fields */}
                <div>
                  <Label htmlFor="edit-name">Name</Label>
                  <Input id="edit-name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="edit-category">Category</Label>
                    <Select value={edit.category} onValueChange={(value: ClothingCategory) => setEdit({ ...edit, category: value })}>
                      <SelectTrigger id="edit-category">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat} value={cat} className="capitalize">
                            {cat}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="edit-color">Color</Label>
                    <Input id="edit-color" value={edit.color} onChange={(e) => setEdit({ ...edit, color: e.target.value })} />
                  </div>
                </div>
                {edit.category === 'accessories' && (
                  <div>
                    <Label htmlFor="edit-placement">Placement</Label>
                    <Select
                      value={edit.accessoryPlacement}
                      onValueChange={(value: AccessoryPlacement) => setEdit({ ...edit, accessoryPlacement: value })}
                    >
                      <SelectTrigger id="edit-placement">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {accessoryPlacements.map((zone) => (
                          <SelectItem key={zone} value={zone} className="capitalize">
                            {zone}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <Label>Weather</Label>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {weatherOptions.map((weather) => (
                      <Badge
                        key={weather}
                        variant={edit.weatherSuitability.includes(weather) ? 'default' : 'outline'}
                        className="cursor-pointer capitalize tap-target"
                        onClick={() =>
                          setEdit({
                            ...edit,
                            weatherSuitability: edit.weatherSuitability.includes(weather)
                              ? edit.weatherSuitability.filter((w) => w !== weather)
                              : [...edit.weatherSuitability, weather],
                          })
                        }
                      >
                        {weather}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <Label htmlFor="edit-tags">Tags (comma separated)</Label>
                  <Input id="edit-tags" value={edit.tags} onChange={(e) => setEdit({ ...edit, tags: e.target.value })} />
                </div>

                {selectedItem.layers?.length ? (
                  <div>
                    <span className="text-sm text-muted-foreground">Layers</span>
                    <div className="grid grid-cols-2 gap-3 mt-2">
                      {selectedItem.layers.map((layer) => (
                        <div key={layer.id} className="space-y-1">
                          <div className="aspect-square rounded-lg overflow-hidden border bg-muted">
                            <img src={layer.imageUrl} alt={layer.label} className="w-full h-full object-contain" />
                          </div>
                          <p className="text-xs text-muted-foreground capitalize">{layer.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    disabled={isMidPipeline(selectedItem) || pipeline.isRunning(selectedItem.id)}
                    onClick={() => runPipeline(selectedItem)}
                  >
                    {isMidPipeline(selectedItem) ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                    {selectedItem.ghostImageUrl ? 'Reprocess' : 'Process'}
                  </Button>
                  <Button className="flex-1" onClick={handleSaveEdit}>
                    Save
                  </Button>
                </div>
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={async () => {
                    const itemName = selectedItem.name;
                    pipeline.cancel(selectedItem.id);
                    await removeClothingItem(selectedItem.id);
                    setSelectedId(null);
                    setEdit(null);
                    toast({ title: 'Item removed', description: `${itemName} has been removed from your wardrobe.` });
                  }}
                >
                  Delete Item
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
