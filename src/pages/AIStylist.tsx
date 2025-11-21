import { useState } from 'react';
import { Send, Bot, User, Sparkles, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useApp } from '@/contexts/AppContext';
import { useToast } from '@/hooks/use-toast';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  outfit?: string[];
}

export default function AIStylist() {
  const { wardrobe, currentWeather, settings, updateSettings } = useApp();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<'chat' | 'quick'>('chat');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Quick suggestions state
  const [eventType, setEventType] = useState('everyday');
  const [tempFeel, setTempFeel] = useState('cool');
  const [formality, setFormality] = useState('casual');

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMessage: Message = {
      role: 'user',
      content: inputMessage,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage('');
    setIsGenerating(true);

    // Mock AI response
    setTimeout(() => {
      const mockOutfit = wardrobe.slice(0, 3).map((item) => item.id);
      const aiMessage: Message = {
        role: 'assistant',
        content: `Based on your wardrobe and the current weather (${currentWeather?.temp}°F, ${currentWeather?.condition}), I'd suggest this outfit that matches "${inputMessage}". It's comfortable and stylish!`,
        outfit: mockOutfit,
      };
      setMessages((prev) => [...prev, aiMessage]);
      setIsGenerating(false);
    }, 1500);
  };

  const handleQuickGenerate = () => {
    setIsGenerating(true);
    toast({
      title: 'Generating outfits...',
      description: 'Finding the best combinations for you.',
    });

    setTimeout(() => {
      toast({
        title: 'Outfits ready!',
        description: `Generated ${Math.min(5, wardrobe.length)} outfit suggestions.`,
      });
      setIsGenerating(false);
    }, 1500);
  };

  return (
    <div className="min-h-screen pb-20 page-transition">
      {/* Header */}
      <div className="sticky top-0 bg-background/95 backdrop-blur-sm z-10 border-b border-border">
        <div className="max-w-2xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold font-heading mb-4">AI Stylist</h1>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'chat' | 'quick')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="chat">Chat Stylist</TabsTrigger>
              <TabsTrigger value="quick">Quick Suggestions</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-6">
        <Tabs value={activeTab}>
          {/* Chat Stylist */}
          <TabsContent value="chat" className="mt-0">
            {/* Settings */}
            <div className="bg-card rounded-2xl p-4 mb-4 border border-border space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="use-weather" className="text-sm font-medium">
                    Use weather data
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {currentWeather && `${currentWeather.temp}°F · ${currentWeather.condition}`}
                  </p>
                </div>
                <Switch
                  id="use-weather"
                  checked={settings.useLocation}
                  onCheckedChange={(checked) => updateSettings({ useLocation: checked })}
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
                  onCheckedChange={(checked) => updateSettings({ allowVirtualItems: checked })}
                />
              </div>
            </div>

            {/* Chat Messages */}
            <div className="space-y-4 mb-4 min-h-[400px]">
              {messages.length === 0 ? (
                <div className="text-center py-12">
                  <div className="bg-primary/10 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
                    <Bot className="w-10 h-10 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold font-heading mb-2">
                    Your AI Stylist is Ready
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                    Describe the vibe you're going for, and I'll suggest outfits from your wardrobe.
                  </p>
                  <div className="mt-6 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Try asking:</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {['Cozy streetwear for 50°F', 'Professional work outfit', 'Casual date night'].map(
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
                  <div
                    key={index}
                    className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : ''}`}
                  >
                    {message.role === 'assistant' && (
                      <div className="bg-primary text-primary-foreground rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0">
                        <Bot className="w-5 h-5" />
                      </div>
                    )}
                    <div
                      className={`rounded-2xl p-4 max-w-[85%] ${
                        message.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-card border border-border'
                      }`}
                    >
                      <p className="text-sm">{message.content}</p>
                      {message.outfit && message.outfit.length > 0 && (
                        <div className="mt-3 grid grid-cols-3 gap-2">
                          {message.outfit.map((itemId) => {
                            const item = wardrobe.find((w) => w.id === itemId);
                            return item ? (
                              <div key={itemId} className="aspect-square rounded-lg overflow-hidden">
                                <img
                                  src={item.imageUrl}
                                  alt={item.name}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            ) : null;
                          })}
                        </div>
                      )}
                    </div>
                    {message.role === 'user' && (
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

            {/* Input */}
            <div className="sticky bottom-20 bg-background pt-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Describe your desired vibe..."
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  className="flex-1"
                />
                <Button onClick={handleSendMessage} disabled={!inputMessage.trim() || isGenerating}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Quick Suggestions */}
          <TabsContent value="quick" className="mt-0">
            <div className="space-y-6">
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
                    {['cold', 'cool', 'mild', 'warm', 'hot'].map((temp) => (
                      <Badge
                        key={temp}
                        variant={tempFeel === temp ? 'default' : 'outline'}
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
                    {['casual', 'smart casual', 'formal'].map((level) => (
                      <Badge
                        key={level}
                        variant={formality === level ? 'default' : 'outline'}
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
                    onCheckedChange={(checked) => updateSettings({ allowVirtualItems: checked })}
                  />
                </div>
              </div>

              <Button
                onClick={handleQuickGenerate}
                disabled={isGenerating}
                className="w-full h-14 text-lg"
              >
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

              {/* Mock Results */}
              {!isGenerating && wardrobe.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground">
                    Suggested Outfits
                  </h3>
                  {[1, 2, 3].slice(0, Math.min(3, Math.floor(wardrobe.length / 2))).map((i) => (
                    <div key={i} className="bg-card rounded-2xl p-4 border border-border">
                      <div className="flex items-center gap-3 mb-3">
                        <Badge variant="secondary">Option {i}</Badge>
                        <span className="text-sm text-muted-foreground capitalize">
                          {eventType} · {formality}
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {wardrobe.slice(i * 2, i * 2 + 4).map((item) => (
                          <div key={item.id} className="aspect-square rounded-lg overflow-hidden">
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
