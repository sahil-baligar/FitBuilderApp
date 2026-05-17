import { useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, Filter, Camera, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useApp } from '@/contexts/AppContext';
import type { AccessoryPlacement, ClothingItem } from '@/types/models';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { stripBackground } from '@/lib/backgroundRemoval';

const categories = ['top', 'bottom', 'outerwear', 'shoes', 'accessories'] as const;
const weatherOptions = ['cold', 'cool', 'warm', 'hot'] as const;
const accessoryPlacements = ['neck', 'torso', 'waist', 'wrist', 'hand', 'head'] as const;

type NewItemState = {
  name: string;
  imageUrl: string;
  overlayImageUrl: string;
  category: ClothingItem['category'];
  color: string;
  weatherSuitability: ClothingItem['weatherSuitability'];
  tags: string;
  accessoryPlacement: AccessoryPlacement;
};

export default function Wardrobe() {
  const { wardrobe, addClothingItem, removeClothingItem } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(searchParams.get('action') === 'add');
  const [selectedItem, setSelectedItem] = useState<ClothingItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const overlayInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const [newItem, setNewItem] = useState<NewItemState>({
    name: '',
    imageUrl: '',
    overlayImageUrl: '',
    category: 'top',
    color: '',
    weatherSuitability: [],
    tags: '',
    accessoryPlacement: 'neck',
  });
  const [imageProcessing, setImageProcessing] = useState({ primary: false, overlay: false });

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'primary' | 'overlay',
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setImageProcessing((prev) => ({ ...prev, [target]: true }));
      const cleaned = await stripBackground(file);
      setNewItem((prev) =>
        target === 'primary' ? { ...prev, imageUrl: cleaned } : { ...prev, overlayImageUrl: cleaned },
      );
    } catch (error) {
      toast({
        title: 'Image processing failed',
        description: 'We could not clean the background. Please try another photo.',
        variant: 'destructive',
      });
    } finally {
      setImageProcessing((prev) => ({ ...prev, [target]: false }));
    }
  };

  const handleAddItem = async () => {
    if (!newItem.name || !newItem.imageUrl) {
      toast({
        title: 'Missing information',
        description: 'Please provide a name and image for the item.',
        variant: 'destructive',
      });
      return;
    }

    const accessoryPlacement =
      newItem.category === 'accessories' ? newItem.accessoryPlacement : undefined;
    const layers =
      newItem.category === 'outerwear' && newItem.overlayImageUrl
        ? [
            {
              id: 'overlay',
              label: `${newItem.name} overlay`,
              imageUrl: newItem.overlayImageUrl,
              mode: 'overlay' as const,
            },
          ]
        : undefined;

    await addClothingItem({
      name: newItem.name,
      imageUrl: newItem.imageUrl,
      category: newItem.category,
      color: newItem.color,
      weatherSuitability: newItem.weatherSuitability,
      tags: newItem.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      layers,
      accessoryPlacement,
    });

    toast({
      title: 'Item added!',
      description: `${newItem.name} has been added to your wardrobe.`,
    });

    setIsAddDialogOpen(false);
    setSearchParams({});
    setNewItem({
      name: '',
      imageUrl: '',
      overlayImageUrl: '',
      category: 'top',
      color: '',
      weatherSuitability: [],
      tags: '',
      accessoryPlacement: 'neck',
    });
  };

  const filteredWardrobe = wardrobe.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen pb-20 page-transition">
      {/* Header */}
      <div className="sticky top-0 bg-background/95 backdrop-blur-sm z-10 border-b border-border">
        <div className="max-w-2xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold font-heading">My Wardrobe</h1>
            <Button onClick={() => setIsAddDialogOpen(true)} size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Add Item
            </Button>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or tag..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Category Filter */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            <Badge
              variant={selectedCategory === 'all' ? 'default' : 'outline'}
              className="cursor-pointer tap-target"
              onClick={() => setSelectedCategory('all')}
            >
              All
            </Badge>
            {categories.map((cat) => (
              <Badge
                key={cat}
                variant={selectedCategory === cat ? 'default' : 'outline'}
                className="cursor-pointer capitalize tap-target"
                onClick={() => setSelectedCategory(cat)}
              >
                {cat}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {/* Wardrobe Grid */}
      <div className="max-w-2xl mx-auto px-6 py-6">
        {filteredWardrobe.length === 0 ? (
          <div className="text-center py-12">
            <div className="bg-muted rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
              <Filter className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold font-heading mb-2">No items found</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery || selectedCategory !== 'all'
                ? 'Try adjusting your filters'
                : 'Add your first clothing item to get started'}
            </p>
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Item
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {filteredWardrobe.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelectedItem(item)}
                className="bg-card rounded-2xl overflow-hidden border border-border transition-all hover:shadow-lg hover:scale-105 active:scale-95"
              >
                <div className="aspect-square bg-muted relative">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Camera className="w-12 h-12 text-muted-foreground" />
                    </div>
                  )}
                  <Badge className="absolute top-2 right-2 capitalize text-xs">
                    {item.category}
                  </Badge>
                </div>
                <div className="p-3">
                  <h3 className="font-semibold truncate mb-1">{item.name}</h3>
                  <p className="text-xs text-muted-foreground capitalize">{item.color}</p>
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
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Add Clothing Item</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Image Upload */}
            <div>
              <Label>Photo</Label>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-24"
                  disabled={imageProcessing.primary}
                >
                  <Upload className="w-6 h-6 mr-2" />
                  {imageProcessing.primary ? 'Processing…' : 'Upload'}
                </Button>
                <Button type="button" variant="outline" className="h-24">
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
                        disabled={imageProcessing.overlay}
                      >
                        <Upload className="w-6 h-6 mr-2" />
                        {imageProcessing.overlay ? 'Processing…' : 'Add Overlay'}
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
              {newItem.imageUrl && (
                <div className="mt-3 relative">
                  <img
                    src={newItem.imageUrl}
                    alt="Preview"
                    className="w-full h-32 object-cover rounded-lg"
                  />
                  <Button
                    size="icon"
                    variant="destructive"
                    className="absolute top-2 right-2"
                    onClick={() => setNewItem({ ...newItem, imageUrl: '' })}
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
                    className="w-full h-32 object-cover rounded-lg border border-dashed"
                  />
                  <Badge className="absolute top-2 left-2 text-xs">Overlay Layer</Badge>
                  <Button
                    size="icon"
                    variant="destructive"
                    className="absolute top-2 right-2"
                    onClick={() => setNewItem({ ...newItem, overlayImageUrl: '' })}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>

            {/* Name */}
            <div>
              <Label htmlFor="name">Item Name</Label>
              <Input
                id="name"
                placeholder="e.g., Blue Denim Jacket"
                value={newItem.name}
                onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
              />
            </div>

            {/* Category */}
            <div>
              <Label htmlFor="category">Category</Label>
              <Select
                value={newItem.category}
                onValueChange={(value: ClothingItem['category']) =>
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
                  onValueChange={(value: AccessoryPlacement) =>
                    setNewItem({ ...newItem, accessoryPlacement: value })
                  }
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

            {/* Color */}
            <div>
              <Label htmlFor="color">Color</Label>
              <Input
                id="color"
                placeholder="e.g., Blue"
                value={newItem.color}
                onChange={(e) => setNewItem({ ...newItem, color: e.target.value })}
              />
            </div>

            {/* Weather Suitability */}
            <div>
              <Label>Weather</Label>
              <div className="flex gap-2 mt-2 flex-wrap">
                {weatherOptions.map((weather) => (
                  <Badge
                    key={weather}
                    variant={newItem.weatherSuitability.includes(weather) ? 'default' : 'outline'}
                    className="cursor-pointer capitalize tap-target"
                    onClick={() => {
                      setNewItem({
                        ...newItem,
                        weatherSuitability: newItem.weatherSuitability.includes(weather)
                          ? newItem.weatherSuitability.filter((w) => w !== weather)
                          : [...newItem.weatherSuitability, weather],
                      });
                    }}
                  >
                    {weather}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Tags */}
            <div>
              <Label htmlFor="tags">Tags (comma separated)</Label>
              <Input
                id="tags"
                placeholder="e.g., casual, streetwear, vintage"
                value={newItem.tags}
                onChange={(e) => setNewItem({ ...newItem, tags: e.target.value })}
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={handleAddItem}
                className="flex-1"
                disabled={imageProcessing.primary || imageProcessing.overlay}
              >
                Add Item
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Item Detail Dialog */}
      <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
        <DialogContent className="max-w-md">
          {selectedItem && (
            <>
              <DialogHeader>
                <DialogTitle className="font-heading">{selectedItem.name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <img
                  src={selectedItem.imageUrl}
                  alt={selectedItem.name}
                  className="w-full h-64 object-cover rounded-lg"
                />
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Category</span>
                    <p className="font-medium capitalize">{selectedItem.category}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Color</span>
                    <p className="font-medium capitalize">{selectedItem.color}</p>
                  </div>
                </div>
                {selectedItem.weatherSuitability.length > 0 && (
                  <div>
                    <span className="text-sm text-muted-foreground">Weather</span>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {selectedItem.weatherSuitability.map((w) => (
                        <Badge key={w} variant="secondary" className="capitalize">
                          {w}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {selectedItem.tags.length > 0 && (
                  <div>
                    <span className="text-sm text-muted-foreground">Tags</span>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {selectedItem.tags.map((tag) => (
                        <Badge key={tag} variant="outline">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {selectedItem.layers?.length ? (
                  <div>
                    <span className="text-sm text-muted-foreground">Layers</span>
                    <div className="grid grid-cols-2 gap-3 mt-2">
                      {selectedItem.layers.map((layer) => (
                        <div key={layer.id} className="space-y-1">
                          <div className="aspect-square rounded-lg overflow-hidden border">
                            <img
                              src={layer.imageUrl}
                              alt={layer.label}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <p className="text-xs text-muted-foreground capitalize">{layer.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {selectedItem.accessoryPlacement && (
                  <div>
                    <span className="text-sm text-muted-foreground">Accessory placement</span>
                    <p className="font-medium capitalize">{selectedItem.accessoryPlacement}</p>
                  </div>
                )}
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={async () => {
                    const itemName = selectedItem.name;
                    await removeClothingItem(selectedItem.id);
                    setSelectedItem(null);
                    toast({
                      title: 'Item removed',
                      description: `${itemName} has been removed from your wardrobe.`,
                    });
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
