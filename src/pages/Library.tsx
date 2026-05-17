import { useState } from 'react';
import { Trash2, Edit, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useApp } from '@/contexts/AppContext';
import type { ClothingItem, Fit } from '@/types/models';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { OutfitPreview } from '@/components/OutfitPreview';

export default function Library() {
  const { outfits, wardrobe, removeOutfit } = useApp();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [selectedOutfit, setSelectedOutfit] = useState<Fit | null>(null);
  const [filter, setFilter] = useState<'all' | 'ai' | 'manual'>('all');

  const filteredOutfits = outfits.filter((outfit) => {
    if (filter === 'all') return true;
    if (filter === 'ai') return outfit.source === 'ai';
    if (filter === 'manual') return outfit.source !== 'ai';
    return true;
  });

  const getOutfitItems = (outfit: Fit) => {
    return outfit.itemIds.map((id) => wardrobe.find((item) => item.id === id)).filter(Boolean);
  };

  const handleDelete = (outfitId: string) => {
    removeOutfit(outfitId);
    setSelectedOutfit(null);
    toast({
      title: 'Outfit deleted',
      description: 'The outfit has been removed from your library.',
    });
  };

  return (
    <div className="min-h-screen pb-20 page-transition">
      {/* Header */}
      <div className="sticky top-0 bg-background/95 backdrop-blur-sm z-10 border-b border-border">
        <div className="max-w-2xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold font-heading mb-4">Outfit Library</h1>

          {/* Filter */}
          <div className="flex gap-2">
            <Badge
              variant={filter === 'all' ? 'default' : 'outline'}
              className="cursor-pointer tap-target"
              onClick={() => setFilter('all')}
            >
              All ({outfits.length})
            </Badge>
            <Badge
              variant={filter === 'ai' ? 'default' : 'outline'}
              className="cursor-pointer tap-target"
              onClick={() => setFilter('ai')}
            >
              AI Generated ({outfits.filter((o) => o.source === 'ai').length})
            </Badge>
            <Badge
              variant={filter === 'manual' ? 'default' : 'outline'}
              className="cursor-pointer tap-target"
              onClick={() => setFilter('manual')}
            >
              Manual ({outfits.filter((o) => o.source !== 'ai').length})
            </Badge>
          </div>
        </div>
      </div>

      {/* Outfit Grid */}
      <div className="max-w-2xl mx-auto px-6 py-6">
        {filteredOutfits.length === 0 ? (
          <div className="text-center py-12">
            <div className="bg-muted rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
              <Calendar className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold font-heading mb-2">No saved outfits yet</h3>
            <p className="text-muted-foreground mb-4">
              {filter !== 'all'
                ? 'Try a different filter or create some outfits'
                : 'Build your first outfit to see it here'}
            </p>
            <Button onClick={() => navigate('/build')}>Build Your First Outfit</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredOutfits.map((outfit) => {
              const items = getOutfitItems(outfit);
              return (
                <button
                  key={outfit.id}
                  onClick={() => setSelectedOutfit(outfit)}
                  className="w-full bg-card rounded-2xl p-4 border border-border text-left transition-all hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
                >
                  <div className="flex items-start gap-4">
                    {/* Thumbnail Grid */}
                    <div className="grid grid-cols-2 gap-1 w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-muted">
                      {items.slice(0, 4).map((item, index) => (
                        <div key={item?.id || index} className="aspect-square">
                          {item?.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-muted" />
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="font-semibold font-heading truncate">{outfit.name}</h3>
                        {outfit.source === 'ai' && (
                          <Badge variant="secondary" className="flex-shrink-0 text-xs">
                            AI
                          </Badge>
                        )}
                      </div>
                      {outfit.notes && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                          {outfit.notes}
                        </p>
                      )}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{items.length} items</span>
                        {outfit.weatherContext && <span>· {outfit.weatherContext}</span>}
                        {outfit.occasion && <span>· {outfit.occasion}</span>}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Outfit Detail Dialog */}
      <Dialog open={!!selectedOutfit} onOpenChange={() => setSelectedOutfit(null)}>
        <DialogContent className="max-w-md">
          {selectedOutfit &&
            (() => {
              const previewSelection = selectedOutfit.itemIds.reduce(
                (acc, id) => {
                  const match = wardrobe.find((item) => item.id === id);
                  if (match && !acc[match.category]) {
                    acc[match.category] = match;
                  }
                  return acc;
                },
                {} as Partial<Record<ClothingItem['category'], ClothingItem | null>>,
              );
              return (
                <>
                  <DialogHeader>
                    <DialogTitle className="font-heading flex items-center gap-2">
                      {selectedOutfit.name}
                      {selectedOutfit.source === 'ai' && (
                        <Badge variant="secondary" className="text-xs">
                          AI Generated
                        </Badge>
                      )}
                    </DialogTitle>
                  </DialogHeader>

                  <div className="space-y-4">
                    <OutfitPreview selectedItems={previewSelection} compact />

                    <div className="grid grid-cols-2 gap-3">
                      {getOutfitItems(selectedOutfit).map((item) =>
                        item ? (
                          <div key={item.id} className="space-y-2">
                            <div className="aspect-square rounded-lg overflow-hidden bg-muted">
                              <img
                                src={item.imageUrl}
                                alt={item.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div>
                              <p className="text-sm font-medium truncate">{item.name}</p>
                              <p className="text-xs text-muted-foreground capitalize">
                                {item.category}
                              </p>
                            </div>
                          </div>
                        ) : null,
                      )}
                    </div>

                    {selectedOutfit.notes && (
                      <div className="bg-muted/50 rounded-lg p-3">
                        <p className="text-sm text-muted-foreground">{selectedOutfit.notes}</p>
                      </div>
                    )}

                    <div className="flex gap-2 flex-wrap text-sm text-muted-foreground">
                      {selectedOutfit.weatherContext && (
                        <Badge variant="outline">{selectedOutfit.weatherContext}</Badge>
                      )}
                      {selectedOutfit.occasion && (
                        <Badge variant="outline">{selectedOutfit.occasion}</Badge>
                      )}
                      <Badge variant="outline">
                        {new Date(selectedOutfit.createdAt).toLocaleDateString()}
                      </Badge>
                    </div>

                    <div className="flex gap-3 pt-4">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => {
                          setSelectedOutfit(null);
                          navigate('/build');
                        }}
                      >
                        <Edit className="w-4 h-4 mr-2" />
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        className="flex-1"
                        onClick={() => handleDelete(selectedOutfit.id)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </>
              );
            })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
