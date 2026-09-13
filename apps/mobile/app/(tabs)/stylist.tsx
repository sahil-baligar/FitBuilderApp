import React, { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Bot, Plus, Sparkles, Star, Wand2 } from 'lucide-react-native';
import { nanoid } from 'nanoid/non-secure';
import {
  convertSuggestionToFit,
  requestAiSuggestions,
  useApp,
  type AiStylistSuggestion,
  type ClothingItem,
  type WeatherBand,
} from '@fitbuilder/core';
import {
  Button,
  Card,
  Chip,
  ChipRow,
  EmptyState,
  Field,
  Header,
  Muted,
  Notice,
  Screen,
  SectionTitle,
  Segmented,
  SwitchRow,
} from '../../src/components/ui';
import { useToast } from '../../src/components/Toast';
import { displayImage, formatTemp } from '../../src/lib/format';
import { describeApiError, type DescribedError } from '../../src/lib/quota';
import { colors, radius, spacing } from '../../src/theme';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  outfit?: string[];
}

interface GeneratedFit {
  id: string;
  itemIds: string[];
  label: string;
}

const weatherBandFromTemp = (tempC: number): WeatherBand => {
  if (tempC <= 5) return 'cold';
  if (tempC <= 12) return 'cool';
  if (tempC <= 22) return 'warm';
  return 'hot';
};

const feelToBand: Record<'cold' | 'cool' | 'mild' | 'warm' | 'hot', WeatherBand> = {
  cold: 'cold',
  cool: 'cool',
  mild: 'warm',
  warm: 'warm',
  hot: 'hot',
};

const filterByWeather = (items: ClothingItem[], band: WeatherBand) =>
  items.filter((item) => item.weatherSuitability.length === 0 || item.weatherSuitability.includes(band));

const tempFeelOptions = ['cold', 'cool', 'mild', 'warm', 'hot'] as const;
const eventOptions = ['everyday', 'work', 'date', 'party', 'gym'] as const;
const formalityOptions = ['casual', 'smart casual', 'formal'] as const;
const promptSuggestions = ['Cozy streetwear for 50°F', 'Professional work outfit', 'Casual date night'];

/**
 * The chat stylist is the one Pro-only action, so a refusal needs a different
 * shape from an error: what the plan includes, what still works for free, and
 * no purchase button, because there is nothing to sell yet.
 */
const StylistGate: React.FC<{ gate: DescribedError; onSignIn: () => void }> = ({ gate, onSignIn }) => {
  if (gate.kind === 'pro') {
    return (
      <Notice
        tone="pro"
        icon={<Star size={16} color={colors.primary} />}
        title="The chat stylist is part of FitBuilder Pro"
        body="Chat styling runs on a paid model, so the free plan does not include it. Quick Suggestions still builds looks from your wardrobe on this device, as often as you like."
        action={<Chip small label="Pro is coming soon" tone="info" />}
      />
    );
  }
  if (gate.kind === 'quota') {
    return <Notice tone="warning" title={gate.title} body={gate.message} />;
  }
  if (gate.kind === 'auth') {
    return (
      <Notice
        tone="info"
        title={gate.title}
        body={gate.message}
        action={<Button title="Sign in" size="sm" onPress={onSignIn} />}
      />
    );
  }
  return <Notice tone="error" title={gate.title} body={gate.message} />;
};

export default function StylistScreen() {
  const router = useRouter();
  const { wardrobe, currentWeather, settings, updateSettings, addOutfit } = useApp();
  const toast = useToast();
  // Why the chat stylist could not answer: Pro-only, out of allowance, signed
  // out, or genuinely broken. It stays on screen next to the composer.
  const [gate, setGate] = useState<DescribedError | null>(null);

  const [activeTab, setActiveTab] = useState<'chat' | 'quick'>('chat');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [ownershipFilter, setOwnershipFilter] = useState<'owned-only' | 'include-new'>(
    settings.allowVirtualItems ? 'include-new' : 'owned-only',
  );
  const [suggestions, setSuggestions] = useState<AiStylistSuggestion[]>([]);
  const [generatedFits, setGeneratedFits] = useState<GeneratedFit[]>([]);
  const [eventType, setEventType] = useState<(typeof eventOptions)[number]>('everyday');
  const [tempFeel, setTempFeel] = useState<(typeof tempFeelOptions)[number]>('cool');
  const [formality, setFormality] = useState<(typeof formalityOptions)[number]>('casual');

  useEffect(() => {
    setOwnershipFilter(settings.allowVirtualItems ? 'include-new' : 'owned-only');
  }, [settings.allowVirtualItems]);

  const wardrobeByCategory = useMemo(() => {
    const groups: Record<ClothingItem['category'], ClothingItem[]> = {
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
    ? `${formatTemp(currentWeather.tempC, settings.temperatureUnit)} · ${currentWeather.condition}`
    : 'Weather unavailable';

  const activeWeatherBand = useMemo(() => {
    if (currentWeather) return weatherBandFromTemp(currentWeather.tempC);
    return feelToBand[tempFeel];
  }, [currentWeather, tempFeel]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMessage: Message = { role: 'user', content: inputMessage };
    setMessages((prev) => [...prev, userMessage]);
    setInputMessage('');
    setGate(null);
    setIsGenerating(true);

    try {
      const response = await requestAiSuggestions({
        prompt: userMessage.content,
        wardrobe,
        mode: 'ai',
        ownershipFilter,
        weather: currentWeather
          ? { tempC: currentWeather.tempC, condition: currentWeather.condition }
          : undefined,
      });
      setSuggestions(response.suggestions);

      const aiMessage: Message = {
        role: 'assistant',
        content:
          response.suggestions.length > 0
            ? `Here are ${response.suggestions.length} outfits tailored to "${userMessage.content}".`
            : "I couldn't form a complete outfit with the current wardrobe. Try adding more pieces.",
        outfit: response.suggestions[0]?.ownedItemIds ?? [],
      };
      setMessages((prev) => [...prev, aiMessage]);
    } catch (e) {
      const described = describeApiError(e, 'Stylist unavailable');
      setGate(described);
      // Quota, Pro and sign-in are states, not failures, so they are explained
      // in place rather than thrown at the reader as a red toast.
      if (described.kind === 'error' || described.kind === 'offline') {
        toast.error(described.title, described.message);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const buildCombo = (band: WeatherBand) => {
    const combo: string[] = [];
    const addFromCategory = (category: ClothingItem['category'], required = true) => {
      const pool = filterByWeather(wardrobeByCategory[category] ?? [], band).filter((item) => !combo.includes(item.id));
      if (pool.length === 0) return !required;
      const picked = pool[Math.floor(Math.random() * pool.length)];
      combo.push(picked.id);
      return true;
    };

    const requiredCategories: ClothingItem['category'][] = ['top', 'bottom', 'shoes'];
    if (!requiredCategories.every((category) => addFromCategory(category))) return [];
    if (band === 'cold' || band === 'cool') addFromCategory('outerwear', false);
    if (Math.random() > 0.5) addFromCategory('accessories', false);
    return combo;
  };

  const handleQuickGenerate = () => {
    if (!wardrobe.length) {
      toast.error('Add wardrobe items', 'Quick suggestions need at least one top, bottom, and shoes.');
      return;
    }

    setIsGenerating(true);
    const nextFits: GeneratedFit[] = [];
    const seen = new Set<string>();
    let attempts = 0;

    while (nextFits.length < 3 && attempts < 15) {
      const combo = buildCombo(activeWeatherBand);
      if (combo.length >= 3) {
        const key = [...combo].sort().join('-');
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

    if (nextFits.length) {
      toast.success('Outfits ready!', `Generated ${nextFits.length} looks for ${eventType}.`);
    } else {
      toast.toast('Need more variety', 'Try adding more wardrobe items for fresh combos.');
    }
  };

  const handleSaveSuggestion = async (suggestion: AiStylistSuggestion) => {
    try {
      await addOutfit({
        ...convertSuggestionToFit(suggestion),
        weatherContext: currentWeather ? weatherSummary : undefined,
      });
      toast.success('Fit saved', `Added "${suggestion.title}" to your library.`);
    } catch (e) {
      toast.error('Save failed', describeApiError(e, 'Save failed').message);
    }
  };

  const handleSaveGeneratedFit = async (fit: GeneratedFit) => {
    try {
      await addOutfit({
        name: fit.label,
        itemIds: fit.itemIds,
        source: 'generator',
        notes: `Generated for ${eventType} (${formality}).`,
        weatherContext: currentWeather ? weatherSummary : undefined,
      });
      toast.success('Fit saved', `"${fit.label}" was added to your library.`);
    } catch (e) {
      toast.error('Save failed', describeApiError(e, 'Save failed').message);
    }
  };

  const renderItemGrid = (itemIds: string[]) => (
    <View style={styles.grid}>
      {itemIds.map((itemId) => {
        const item = wardrobe.find((w) => w.id === itemId);
        return item ? (
          <View key={itemId} style={styles.gridCell}>
            {item.imageUrl || item.ghostImageUrl || item.cutoutImageUrl ? (
              <Image source={{ uri: displayImage(item) }} style={styles.gridImage} />
            ) : (
              <View style={styles.gridFallback}>
                <Text style={styles.gridFallbackText} numberOfLines={2}>
                  {item.name}
                </Text>
              </View>
            )}
          </View>
        ) : (
          <View key={itemId} style={[styles.gridCell, styles.gridFallback]}>
            <Plus size={16} color={colors.mutedForeground} />
          </View>
        );
      })}
    </View>
  );

  return (
    <Screen>
      <Header title="AI Stylist" subtitle="Chat or quick generate looks from your wardrobe" />

      <Segmented
        options={[
          { key: 'chat', label: 'Chat Stylist' },
          { key: 'quick', label: 'Quick Suggestions' },
        ]}
        value={activeTab}
        onChange={(key) => setActiveTab(key as 'chat' | 'quick')}
      />

      {activeTab === 'chat' ? (
        <View style={{ gap: spacing.lg }}>
          <Card style={{ gap: spacing.sm }}>
            <SwitchRow
              label="Use weather data"
              description={weatherSummary}
              value={settings.useLocation}
              onValueChange={(checked) => updateSettings({ useLocation: checked })}
            />
            <SwitchRow
              label="Include items I don't own"
              description="AI can suggest new pieces"
              value={settings.allowVirtualItems}
              onValueChange={(checked) => updateSettings({ allowVirtualItems: checked })}
            />
          </Card>

          {messages.length === 0 ? (
            <EmptyState
              icon={<Bot size={30} color={colors.primary} />}
              title="Your AI Stylist is Ready"
              description="Describe the vibe you're going for, and I'll suggest outfits from your wardrobe."
              action={
                <ChipRow>
                  {promptSuggestions.map((suggestion) => (
                    <Chip key={suggestion} label={suggestion} onPress={() => setInputMessage(suggestion)} />
                  ))}
                </ChipRow>
              }
            />
          ) : (
            <View style={{ gap: spacing.md }}>
              {messages.map((message, index) => (
                <View
                  key={`${message.role}-${index}`}
                  style={[styles.bubbleRow, message.role === 'user' && styles.bubbleRowUser]}
                >
                  <View
                    style={[
                      styles.bubble,
                      message.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant,
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        color: message.role === 'user' ? colors.primaryForeground : colors.foreground,
                      }}
                    >
                      {message.content}
                    </Text>
                    {message.outfit && message.outfit.length > 0 ? (
                      <View style={{ marginTop: spacing.md }}>{renderItemGrid(message.outfit)}</View>
                    ) : null}
                  </View>
                </View>
              ))}
              {isGenerating ? (
                <View style={styles.bubbleRow}>
                  <View style={[styles.bubble, styles.bubbleAssistant]}>
                    <Muted>Thinking…</Muted>
                  </View>
                </View>
              ) : null}
            </View>
          )}

          {gate ? <StylistGate gate={gate} onSignIn={() => router.push('/auth/login')} /> : null}

          <View style={styles.composer}>
            <View style={{ flex: 1 }}>
              <Field
                placeholder="Describe your desired vibe..."
                value={inputMessage}
                onChangeText={setInputMessage}
                onSubmitEditing={handleSendMessage}
                returnKeyType="send"
              />
            </View>
            <Button
              title="Send"
              onPress={handleSendMessage}
              disabled={!inputMessage.trim() || isGenerating}
              loading={isGenerating}
            />
          </View>

          {suggestions.length > 0 && (
            <View style={{ gap: spacing.md }}>
              <SectionTitle>AI Suggestions</SectionTitle>
              {suggestions.map((suggestion) => (
                <Card key={suggestion.id} style={{ gap: spacing.md }}>
                  <View style={styles.rowBetween}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={styles.cardTitle}>{suggestion.title}</Text>
                      <Muted>{suggestion.rationale}</Muted>
                    </View>
                    <Chip
                      small
                      label={ownershipFilter === 'include-new' ? 'Owned + New' : 'Owned'}
                      tone="info"
                    />
                  </View>
                  {suggestion.ownedItemIds.length > 0 ? renderItemGrid(suggestion.ownedItemIds) : null}
                  {suggestion.suggestedItems.length > 0 ? (
                    <View style={{ gap: spacing.xs }}>
                      <Text style={styles.subhead}>Suggested new pieces</Text>
                      {suggestion.suggestedItems.map((item) => (
                        <View key={item.tempId} style={styles.suggestedRow}>
                          <Chip small label={item.category} />
                          <Muted style={{ flex: 1 }}>
                            {item.description}
                            {item.color ? ` · ${item.color}` : ''}
                          </Muted>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  <Button title="Save to Library" full onPress={() => handleSaveSuggestion(suggestion)} />
                </Card>
              ))}
            </View>
          )}
        </View>
      ) : (
        <View style={{ gap: spacing.lg }}>
          <Card style={{ gap: spacing.lg }}>
            <View>
              <Text style={styles.subhead}>Event type</Text>
              <ChipRow>
                {eventOptions.map((event) => (
                  <Chip
                    key={event}
                    label={event}
                    selected={eventType === event}
                    onPress={() => setEventType(event)}
                  />
                ))}
              </ChipRow>
            </View>

            <View>
              <Text style={styles.subhead}>Temperature feel</Text>
              <ChipRow>
                {tempFeelOptions.map((temp) => (
                  <Chip
                    key={temp}
                    label={temp}
                    selected={tempFeel === temp}
                    onPress={() => setTempFeel(temp)}
                  />
                ))}
              </ChipRow>
            </View>

            <View>
              <Text style={styles.subhead}>Formality</Text>
              <ChipRow>
                {formalityOptions.map((level) => (
                  <Chip
                    key={level}
                    label={level}
                    selected={formality === level}
                    onPress={() => setFormality(level)}
                  />
                ))}
              </ChipRow>
            </View>

            <SwitchRow
              label="Include virtual items"
              description="Suggest new pieces"
              value={settings.allowVirtualItems}
              onValueChange={(checked) => updateSettings({ allowVirtualItems: checked })}
            />
          </Card>

          <Button
            title={isGenerating ? 'Generating...' : 'Generate Outfits'}
            size="lg"
            full
            loading={isGenerating}
            icon={
              isGenerating ? (
                <Wand2 size={20} color={colors.primaryForeground} />
              ) : (
                <Sparkles size={20} color={colors.primaryForeground} />
              )
            }
            onPress={handleQuickGenerate}
          />

          {generatedFits.length > 0 && (
            <View style={{ gap: spacing.md }}>
              <SectionTitle>Suggested Outfits</SectionTitle>
              {generatedFits.map((fit, index) => (
                <Card key={fit.id} style={{ gap: spacing.md }}>
                  <View style={styles.rowBetween}>
                    <View style={styles.rowBetween}>
                      <Chip small label={`Option ${index + 1}`} tone="info" />
                      <Muted style={{ textTransform: 'capitalize' }}>{fit.label}</Muted>
                    </View>
                    <Chip small label={activeWeatherBand} />
                  </View>
                  {renderItemGrid(fit.itemIds)}
                  <Button title="Save Fit" variant="outline" full onPress={() => handleSaveGeneratedFit(fit)} />
                </Card>
              ))}
            </View>
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowUser: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '85%', borderRadius: radius.lg, padding: spacing.lg },
  bubbleUser: { backgroundColor: colors.primary },
  bubbleAssistant: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  gridCell: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.muted,
  },
  gridImage: { width: '100%', height: '100%' },
  gridFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.sm },
  gridFallbackText: { fontSize: 11, color: colors.mutedForeground, textAlign: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, justifyContent: 'space-between' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.foreground },
  subhead: { fontSize: 13, fontWeight: '600', color: colors.foreground, marginBottom: spacing.sm, textTransform: 'capitalize' },
  suggestedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
