import { useEffect, useMemo, useState } from "react";
import { Send, Bot, User, Sparkles, Wand2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  QuotaError,
  useApp,
  requestAiSuggestions,
  convertSuggestionToFit,
  type AiStylistSuggestion,
  type ClothingItem,
  type WeatherBand,
} from "@fitbuilder/core";
import { useToast } from "@/hooks/use-toast";
import { describeApiError } from "@/lib/apiErrors";
import { nanoid } from "nanoid";

interface Message {
  role: "user" | "assistant";
  content: string;
  outfit?: string[];
}

interface GeneratedFit {
  id: string;
  itemIds: string[];
  label: string;
}

const weatherBandFromTemp = (tempC: number): WeatherBand => {
  if (tempC <= 5) return "cold";
  if (tempC <= 12) return "cool";
  if (tempC <= 22) return "warm";
  return "hot";
};

const feelToBand: Record<"cold" | "cool" | "mild" | "warm" | "hot", WeatherBand> = {
  cold: "cold",
  cool: "cool",
  mild: "warm",
  warm: "warm",
  hot: "hot",
};

const filterByWeather = (items: ClothingItem[], band: WeatherBand) =>
  items.filter(
    (item) => item.weatherSuitability.length === 0 || item.weatherSuitability.includes(band)
  );

const tempFeelOptions = ["cold", "cool", "mild", "warm", "hot"] as const;

export default function AIStylist() {
  const { wardrobe, currentWeather, settings, updateSettings, addOutfit } = useApp();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<"chat" | "quick">("chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [ownershipFilter, setOwnershipFilter] = useState<"owned-only" | "include-new">(
    settings.allowVirtualItems ? "include-new" : "owned-only"
  );
  const [suggestions, setSuggestions] = useState<AiStylistSuggestion[]>([]);
  const [generatedFits, setGeneratedFits] = useState<GeneratedFit[]>([]);
  const [eventType, setEventType] = useState("everyday");
  const [tempFeel, setTempFeel] = useState<(typeof tempFeelOptions)[number]>("cool");
  const [formality, setFormality] = useState("casual");

  useEffect(() => {
    setOwnershipFilter(settings.allowVirtualItems ? "include-new" : "owned-only");
  }, [settings.allowVirtualItems]);

  const wardrobeByCategory = useMemo(() => {
    const groups: Record<ClothingItem["category"], ClothingItem[]> = {
      top: [],
      bottom: [],
      outerwear: [],
      shoes: [],
      accessories: [],
    };
    wardrobe.forEach((item) => {
      groups[item.category]?.push(item);
    });
    return groups;
  }, [wardrobe]);

  const weatherSummary = currentWeather
    ? `${Math.round(
        settings.temperatureUnit === "f"
          ? (currentWeather.tempC * 9) / 5 + 32
          : currentWeather.tempC
      )}°${settings.temperatureUnit.toUpperCase()} · ${currentWeather.condition}`
    : "Weather unavailable";

  const activeWeatherBand = useMemo(() => {
    if (currentWeather) {
      return weatherBandFromTemp(currentWeather.tempC);
    }
    return feelToBand[tempFeel];
  }, [currentWeather, tempFeel]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMessage: Message = {
      role: "user",
      content: inputMessage,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage("");
    setIsGenerating(true);

    try {
      const response = await requestAiSuggestions({
        prompt: userMessage.content,
        wardrobe,
        mode: "ai",
        ownershipFilter,
        weather: currentWeather
          ? { tempC: currentWeather.tempC, condition: currentWeather.condition }
          : undefined,
      });
      setSuggestions(response.suggestions);

      const aiMessage: Message = {
        role: "assistant",
        content:
          response.suggestions.length > 0
            ? `Here are ${response.suggestions.length} outfits tailored to "${userMessage.content}".`
            : "I couldn't form a complete outfit with the current wardrobe. Try adding more pieces.",
        outfit: response.suggestions[0]?.ownedItemIds ?? [],
      };
      setMessages((prev) => [...prev, aiMessage]);
    } catch (err) {
      // The stylist is Pro-only, so a 402 here is an explanation, not a failure.
      const message = describeApiError(err, "Stylist unavailable");
      const proOnly = err instanceof QuotaError;
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `${message.title}. ${message.description}` },
      ]);
      toast({ ...message, variant: proOnly ? "default" : "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const buildCombo = (band: WeatherBand) => {
    const combo: string[] = [];
    const addFromCategory = (category: ClothingItem["category"], required = true) => {
      const pool = filterByWeather(wardrobeByCategory[category] ?? [], band).filter(
        (item) => !combo.includes(item.id)
      );
      if (pool.length === 0) return !required;
      const picked = pool[Math.floor(Math.random() * pool.length)];
      combo.push(picked.id);
      return true;
    };

    const requiredCategories: ClothingItem["category"][] = ["top", "bottom", "shoes"];
    if (!requiredCategories.every((category) => addFromCategory(category))) {
      return [];
    }
    if (band === "cold" || band === "cool") {
      addFromCategory("outerwear", false);
    }
    if (Math.random() > 0.5) {
      addFromCategory("accessories", false);
    }
    return combo;
  };

  const handleQuickGenerate = () => {
    if (!wardrobe.length) {
      toast({
        title: "Add wardrobe items",
        description: "Quick suggestions need at least one top, bottom, and shoes.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    const nextFits: GeneratedFit[] = [];
    const seen = new Set<string>();
    let attempts = 0;

    while (nextFits.length < 3 && attempts < 15) {
      const combo = buildCombo(activeWeatherBand);
      if (combo.length >= 3) {
        const key = [...combo].sort().join("-");
        if (!seen.has(key)) {
          seen.add(key);
          nextFits.push({
            id: nanoid(),
            itemIds: combo,
            label: `${eventType} · ${formality}`,
          });
        }
      }
      attempts += 1;
    }

    setGeneratedFits(nextFits);
    setIsGenerating(false);

    toast({
      title: nextFits.length ? "Outfits ready!" : "Need more variety",
      description: nextFits.length
        ? `Generated ${nextFits.length} looks for ${eventType}.`
        : "Try adding more wardrobe items for fresh combos.",
    });
  };

  const handleSaveSuggestion = async (suggestion: AiStylistSuggestion) => {
    try {
      await addOutfit({
        ...convertSuggestionToFit(suggestion),
        weatherContext: currentWeather ? weatherSummary : undefined,
      });
      toast({
        title: "Fit saved",
        description: `Added "${suggestion.title}" to your library.`,
      });
    } catch (error) {
      toast({
        title: "Save failed",
        description: "Unable to save this fit. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleSaveGeneratedFit = async (fit: GeneratedFit) => {
    try {
      await addOutfit({
        name: fit.label,
        itemIds: fit.itemIds,
        source: "generator",
        notes: `Generated for ${eventType} (${formality}).`,
        weatherContext: currentWeather ? weatherSummary : undefined,
      });
      toast({
        title: "Fit saved",
        description: `"${fit.label}" was added to your library.`,
      });
    } catch (error) {
      toast({
        title: "Save failed",
        description: "Unable to save this fit. Please try again.",
        variant: "destructive",
      });
    }
  };

  const renderItemGrid = (itemIds: string[]) => (
    <div className="grid grid-cols-3 gap-2">
      {itemIds.map((itemId) => {
        const item = wardrobe.find((w) => w.id === itemId);
        return item ? (
          <div key={itemId} className="aspect-square rounded-lg overflow-hidden bg-muted">
            {item.imageUrl ? (
              <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                {item.name}
              </div>
            )}
          </div>
        ) : (
          <div key={itemId} className="aspect-square rounded-lg bg-muted flex items-center justify-center">
            <Plus className="w-4 h-4 text-muted-foreground" />
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen pb-24 page-transition">
      <div className="sticky top-0 bg-background/95 backdrop-blur-sm z-10 border-b border-border">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4">
          <h1 className="text-2xl font-bold font-heading mb-4">AI Stylist</h1>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "chat" | "quick")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="chat">Chat Stylist</TabsTrigger>
              <TabsTrigger value="quick">Quick Suggestions</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        <Tabs value={activeTab}>
          <TabsContent value="chat" className="mt-0 space-y-6">
            <div className="bg-card rounded-2xl p-4 border border-border space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="use-weather" className="text-sm font-medium">
                    Use weather data
                  </Label>
                  <p className="text-xs text-muted-foreground">{weatherSummary}</p>
                </div>
                <Switch
                  id="use-weather"
                  checked={settings.useLocation}
                  onCheckedChange={async (checked) => {
                    await updateSettings({ useLocation: checked });
                  }}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="virtual-items" className="text-sm font-medium">
                    Include items I don't own
                  </Label>
                  <p className="text-xs text-muted-foreground">AI can suggest new pieces</p>
                </div>
                <Switch
                  id="virtual-items"
                  checked={settings.allowVirtualItems}
                  onCheckedChange={async (checked) => {
                    await updateSettings({ allowVirtualItems: checked });
                  }}
                />
              </div>
            </div>

            <div className="space-y-4 min-h-[400px]">
              {messages.length === 0 ? (
                <div className="text-center py-12">
                  <div className="bg-primary/10 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
                    <Bot className="w-10 h-10 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold font-heading mb-2">Your AI Stylist is Ready</h3>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                    Describe the vibe you're going for, and I'll suggest outfits from your wardrobe.
                  </p>
                  <div className="mt-6 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Try asking:</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {["Cozy streetwear for 50°F", "Professional work outfit", "Casual date night"].map(
                        (suggestion) => (
                          <Badge
                            key={suggestion}
                            variant="outline"
                            className="cursor-pointer tap-target"
                            onClick={() => setInputMessage(suggestion)}
                          >
                            {suggestion}
                          </Badge>
                        )
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                messages.map((message, index) => (
                  <div key={index} className={`flex gap-3 ${message.role === "user" ? "justify-end" : ""}`}>
                    {message.role === "assistant" && (
                      <div className="bg-primary text-primary-foreground rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0">
                        <Bot className="w-5 h-5" />
                      </div>
                    )}
                    <div
                      className={`rounded-2xl p-4 max-w-[85%] ${
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-card border border-border"
                      }`}
                    >
                      <p className="text-sm">{message.content}</p>
                      {message.outfit && message.outfit.length > 0 && (
                        <div className="mt-3">{renderItemGrid(message.outfit)}</div>
                      )}
                    </div>
                    {message.role === "user" && (
                      <div className="bg-secondary text-secondary-foreground rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0">
                        <User className="w-5 h-5" />
                      </div>
                    )}
                  </div>
                ))
              )}
              {isGenerating && (
                <div className="flex gap-3">
                  <div className="bg-primary text-primary-foreground rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div className="bg-card border border-border rounded-2xl p-4">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" />
                      <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:0.2s]" />
                      <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:0.4s]" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="sticky bottom-20 bg-background pt-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Describe your desired vibe..."
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                  className="flex-1"
                />
                <Button onClick={handleSendMessage} disabled={!inputMessage.trim() || isGenerating}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {suggestions.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground">AI Suggestions</h3>
                {suggestions.map((suggestion) => (
                  <div key={suggestion.id} className="bg-card rounded-2xl p-4 border border-border space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h4 className="font-semibold font-heading">{suggestion.title}</h4>
                        <p className="text-xs text-muted-foreground">{suggestion.rationale}</p>
                      </div>
                      <Badge variant="secondary">
                        {ownershipFilter === "include-new" ? "Owned + New" : "Owned"}
                      </Badge>
                    </div>
                    {suggestion.ownedItemIds.length > 0 && renderItemGrid(suggestion.ownedItemIds)}
                    {suggestion.suggestedItems.length > 0 && (
                      <div className="text-xs text-muted-foreground space-y-1">
                        <p className="font-medium">Suggested new pieces:</p>
                        {suggestion.suggestedItems.map((item) => (
                          <div key={item.tempId} className="flex items-center gap-2">
                            <Badge variant="outline" className="capitalize">
                              {item.category}
                            </Badge>
                            <span>
                              {item.description} {item.color && `· ${item.color}`}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    <Button className="w-full" onClick={() => handleSaveSuggestion(suggestion)}>
                      Save to Library
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="quick" className="mt-0 space-y-6">
            <div className="bg-card rounded-2xl p-6 border border-border space-y-4">
              <div>
                <Label htmlFor="event-type" className="mb-2 block">
                  Event Type
                </Label>
                <Select value={eventType} onValueChange={setEventType}>
                  <SelectTrigger id="event-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="everyday">Everyday</SelectItem>
                    <SelectItem value="work">Work</SelectItem>
                    <SelectItem value="date">Date</SelectItem>
                    <SelectItem value="party">Party</SelectItem>
                    <SelectItem value="gym">Gym</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="mb-2 block">Temperature Feel</Label>
                <div className="flex gap-2 flex-wrap">
                  {tempFeelOptions.map((temp) => (
                    <Badge
                      key={temp}
                      variant={tempFeel === temp ? "default" : "outline"}
                      className="cursor-pointer capitalize tap-target"
                      onClick={() => setTempFeel(temp)}
                    >
                      {temp}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <Label className="mb-2 block">Formality</Label>
                <div className="flex gap-2 flex-wrap">
                  {["casual", "smart casual", "formal"].map((level) => (
                    <Badge
                      key={level}
                      variant={formality === level ? "default" : "outline"}
                      className="cursor-pointer capitalize tap-target"
                      onClick={() => setFormality(level)}
                    >
                      {level}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div>
                  <Label htmlFor="quick-virtual" className="text-sm font-medium">
                    Include virtual items
                  </Label>
                  <p className="text-xs text-muted-foreground">Suggest new pieces</p>
                </div>
                <Switch
                  id="quick-virtual"
                  checked={settings.allowVirtualItems}
                  onCheckedChange={async (checked) => {
                    await updateSettings({ allowVirtualItems: checked });
                  }}
                />
              </div>
            </div>

            <Button onClick={handleQuickGenerate} disabled={isGenerating} className="w-full h-14 text-lg">
              {isGenerating ? (
                <>
                  <Wand2 className="w-5 h-5 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 mr-2" />
                  Generate Outfits
                </>
              )}
            </Button>

            {generatedFits.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground">Suggested Outfits</h3>
                {generatedFits.map((fit, index) => (
                  <div key={fit.id} className="bg-card rounded-2xl p-4 border border-border space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <Badge variant="secondary">Option {index + 1}</Badge>
                        <span className="ml-2 text-sm text-muted-foreground capitalize">{fit.label}</span>
                      </div>
                      <Badge variant="outline" className="capitalize">
                        {activeWeatherBand}
                      </Badge>
                    </div>
                    {renderItemGrid(fit.itemIds)}
                    <Button variant="outline" className="w-full" onClick={() => handleSaveGeneratedFit(fit)}>
                      Save Fit
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
