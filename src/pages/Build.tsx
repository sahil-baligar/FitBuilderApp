import { useState } from 'react';
import { Save, Trash2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useApp, ClothingItem } from '@/contexts/AppContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

const categories: ClothingItem['category'][] = ['top', 'bottom', 'outerwear', 'shoes', 'accessories'];

export default function Build() {
  const { wardrobe, addOutfit } = useApp();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [selectedItems, setSelectedItems] = useState<Record<string, ClothingItem | null>>({
    top: null,
    bottom: null,
    outerwear: null,
    shoes: null,
    accessories: null,
  });

  const [activeCategory, setActiveCategory] = useState<ClothingItem['category']>('top');
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [outfitName, setOutfitName] = useState('');
  const [outfitNotes, setOutfitNotes] = useState('');

  const handleItemSelect = (item: ClothingItem) => {
    setSelectedItems({
      ...selectedItems,
      [activeCategory]: selectedItems[activeCategory]?.id === item.id ? null : item,
    });
  };

  const handleClearFit = () => {
    setSelectedItems({
      top: null,
      bottom: null,
      outerwear: null,
      shoes: null,
      accessories: null,
    });
    toast({
      title: 'Fit cleared',
      description: 'All items have been removed.',
    });
  };

  const handleSaveFit = () => {
    const itemIds = Object.values(selectedItems)
      .filter((item): item is ClothingItem => item !== null)
      .map((item) => item.id);

    if (itemIds.length === 0) {
      toast({
        title: 'No items selected',
        description: 'Please add at least one item to your outfit.',
        variant: 'destructive',
      });
      return;
    }

    if (!outfitName.trim()) {
      toast({
        title: 'Name required',
        description: 'Please give your outfit a name.',
        variant: 'destructive',
      });
      return;
    }

    addOutfit({
      name: outfitName,
      items: itemIds,
      notes: outfitNotes,
      isAiGenerated: false,
    });

    toast({
      title: 'Outfit saved!',
      description: `"${outfitName}" has been added to your library.`,
    });

    setIsSaveDialogOpen(false);
    setOutfitName('');
    setOutfitNotes('');
    handleClearFit();
  };

  const categoryItems = wardrobe.filter((item) => item.category === activeCategory);
  const hasItems = Object.values(selectedItems).some((item) => item !== null);

  return (
    <div className="min-h-screen pb-20 page-transition">
      {/* Header */}
      <div className="sticky top-0 bg-background/95 backdrop-blur-sm z-10 border-b border-border">
        <div className="max-w-2xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold font-heading mb-4">Build Your Fit</h1>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearFit}
              disabled={!hasItems}
              className="flex-1"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear
            </Button>
            <Button
              size="sm"
              onClick={() => setIsSaveDialogOpen(true)}
              disabled={!hasItems}
              className="flex-1"
            >
              <Save className="w-4 h-4 mr-2" />
              Save Fit
            </Button>
          </div>
        </div>
      </div>

      {/* Outfit Canvas */}
      <div className="max-w-2xl mx-auto px-6 py-6">
        <div className="bg-gradient-to-br from-primary/5 to-secondary/5 rounded-2xl p-6 mb-6 border border-border">
          <h2 className="text-sm font-semibold text-muted-foreground mb-4">Your Outfit</h2>
          <div className="space-y-3">
            {categories.map((category) => {
              const item = selectedItems[category];
              return (
                <button
                  key={category}
                  onClick={() => setActiveCategory(category)}
                  className={`w-full bg-card rounded-xl p-4 border transition-all tap-target ${
                    activeCategory === category
                      ? 'border-primary shadow-lg scale-105'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {item ? (
                      <>
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="w-16 h-16 object-cover rounded-lg"
                        />
                        <div className="flex-1 text-left">
                          <p className="font-semibold">{item.name}</p>
                          <p className="text-sm text-muted-foreground capitalize">{category}</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center">
                          <Sparkles className="w-6 h-6 text-muted-foreground" />
                        </div>
                        <div className="flex-1 text-left">
                          <p className="font-medium text-muted-foreground capitalize">
                            Select {category}
                          </p>
                          <p className="text-sm text-muted-foreground">Tap to choose</p>
                        </div>
                      </>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Item Selector */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold font-heading capitalize">
              Choose {activeCategory}
            </h2>
            <Badge variant="secondary">{categoryItems.length} items</Badge>
          </div>

          {categoryItems.length === 0 ? (
            <div className="text-center py-12 bg-muted/30 rounded-2xl">
              <p className="text-muted-foreground mb-4">
                No {activeCategory} items in your wardrobe yet
              </p>
              <Button variant="outline" size="sm" onClick={() => navigate('/wardrobe?action=add')}>
                Add Items
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {categoryItems.map((item) => {
                const isSelected = selectedItems[activeCategory]?.id === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleItemSelect(item)}
                    className={`bg-card rounded-2xl overflow-hidden border transition-all hover:shadow-lg ${
                      isSelected
                        ? 'border-primary shadow-lg ring-2 ring-primary/20'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="aspect-square bg-muted relative">
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                      {isSelected && (
                        <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                          <div className="bg-primary text-primary-foreground rounded-full p-2">
                            <Save className="w-6 h-6" />
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <h3 className="font-semibold truncate">{item.name}</h3>
                      <p className="text-xs text-muted-foreground capitalize">{item.color}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Save Dialog */}
      <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Save Your Outfit</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="outfit-name">Outfit Name</Label>
              <Input
                id="outfit-name"
                placeholder="e.g., Casual Friday, Date Night"
                value={outfitName}
                onChange={(e) => setOutfitName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="outfit-notes">Notes (optional)</Label>
              <Textarea
                id="outfit-notes"
                placeholder="Occasion, weather, styling tips..."
                value={outfitNotes}
                onChange={(e) => setOutfitNotes(e.target.value)}
                rows={3}
              />
            </div>
            <div className="flex gap-3 pt-4">
              <Button variant="outline" onClick={() => setIsSaveDialogOpen(false)} className="flex-1">
                Cancel
              </Button>
              <Button onClick={handleSaveFit} className="flex-1">
                Save Outfit
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
