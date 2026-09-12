import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Save, Sparkles, Trash2, X } from 'lucide-react-native';
import { useApp, type ClothingItem, type Fit } from '@fitbuilder/core';
import { Button, Chip, Field, Header, Screen, SectionTitle } from '../../src/components/ui';
import { OutfitPreview } from '../../src/components/OutfitPreview';
import { FitRenders } from '../../src/components/FitRenders';
import { useToast } from '../../src/components/Toast';
import { CATEGORIES, categoryLabel, displayImage } from '../../src/lib/format';
import { colors, radius, shadow, spacing } from '../../src/theme';

type SelectionState = Record<ClothingItem['category'], ClothingItem | null>;

const emptySelection = (): SelectionState => ({
  top: null,
  bottom: null,
  outerwear: null,
  shoes: null,
  accessories: null,
});

export default function BuildScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { wardrobe, addOutfit } = useApp();
  const toast = useToast();

  const [selectedItems, setSelectedItems] = useState<SelectionState>(emptySelection);
  const [activeCategory, setActiveCategory] = useState<ClothingItem['category']>('top');
  const [saveOpen, setSaveOpen] = useState(false);
  const [outfitName, setOutfitName] = useState('');
  const [outfitNotes, setOutfitNotes] = useState('');
  const [savedFit, setSavedFit] = useState<Fit | null>(null);
  const [tryOnAfterSave, setTryOnAfterSave] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedList = useMemo(
    () => Object.values(selectedItems).filter((item): item is ClothingItem => item !== null),
    [selectedItems],
  );
  const hasItems = selectedList.length > 0;
  const categoryItems = useMemo(
    () => wardrobe.filter((item) => item.category === activeCategory),
    [wardrobe, activeCategory],
  );

  const contentWidth = Math.min(width, 720) - spacing.lg * 2;
  const cardWidth = (contentWidth - spacing.md) / 2;

  const closeSave = () => {
    setSaveOpen(false);
    setTryOnAfterSave(false);
  };

  const handleItemSelect = (item: ClothingItem) => {
    setSavedFit(null);
    setSelectedItems((prev) => ({
      ...prev,
      [activeCategory]: prev[activeCategory]?.id === item.id ? null : item,
    }));
  };

  const handleClearFit = () => {
    setSavedFit(null);
    setSelectedItems(emptySelection());
    toast.toast('Fit cleared', 'All items have been removed.');
  };

  const handleSaveFit = async () => {
    if (selectedList.length === 0) {
      toast.error('No items selected', 'Please add at least one item to your outfit.');
      return;
    }
    if (!outfitName.trim()) {
      toast.error('Name required', 'Please give your outfit a name.');
      return;
    }
    setSaving(true);
    try {
      const record = await addOutfit({
        name: outfitName.trim(),
        itemIds: selectedList.map((item) => item.id),
        notes: outfitNotes.trim(),
        source: 'manual',
      });
      setSavedFit(record);
      toast.success(
        'Outfit saved!',
        tryOnAfterSave
          ? `"${outfitName.trim()}" saved. You can render it on your photo now.`
          : `"${outfitName.trim()}" has been added to your library.`,
      );
      setOutfitName('');
      setOutfitNotes('');
      closeSave();
    } catch (e) {
      toast.error('Could not save outfit', e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <Header title="Build Your Fit" subtitle="Pick pieces and save a look" />

      <View style={styles.actionRow}>
        <Button
          title="Clear"
          variant="outline"
          size="sm"
          icon={<Trash2 size={16} color={colors.foreground} />}
          disabled={!hasItems}
          onPress={handleClearFit}
          style={styles.flexBtn}
        />
        <Button
          title="Save Fit"
          size="sm"
          icon={<Save size={16} color={colors.primaryForeground} />}
          disabled={!hasItems}
          onPress={() => setSaveOpen(true)}
          style={styles.flexBtn}
        />
      </View>

      <OutfitPreview selectedItems={selectedItems} />

      {hasItems ? (
        <View style={styles.seeOnMe}>
          <View style={styles.seeOnMeHeader}>
            <SectionTitle>See it on me</SectionTitle>
            {savedFit ? <Chip small label={`Saved as ${savedFit.name}`} tone="success" icon={<Check size={11} color={colors.success} />} /> : null}
          </View>
          {savedFit ? (
            <FitRenders fit={savedFit} items={selectedList} />
          ) : (
            <>
              <Text style={styles.hint}>Save this fit first so the render has somewhere to live, then try it on your photo.</Text>
              <Button
                title="Save and see it on me"
                size="sm"
                icon={<Sparkles size={16} color={colors.primaryForeground} />}
                onPress={() => {
                  setTryOnAfterSave(true);
                  setSaveOpen(true);
                }}
                full
              />
            </>
          )}
        </View>
      ) : null}

      <SectionTitle>Your Outfit</SectionTitle>
      <View style={styles.slotList}>
        {CATEGORIES.map((cat) => {
          const item = selectedItems[cat.key];
          const active = activeCategory === cat.key;
          return (
            <Pressable
              key={cat.key}
              accessibilityRole="button"
              onPress={() => setActiveCategory(cat.key)}
              style={({ pressed }) => [styles.slot, active && styles.slotActive, pressed && { opacity: 0.9 }]}
            >
              {item ? (
                <Image source={{ uri: displayImage(item) }} contentFit="cover" style={styles.slotImage} />
              ) : (
                <View style={styles.slotPlaceholder}>
                  <Sparkles size={22} color={colors.mutedForeground} />
                </View>
              )}
              <View style={styles.slotBody}>
                <Text style={[styles.slotTitle, !item && { color: colors.mutedForeground }]}>
                  {item ? item.name : `Select ${cat.key}`}
                </Text>
                <Text style={styles.slotMeta}>{item ? categoryLabel(cat.key) : 'Tap to choose'}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.pickerHeader}>
        <Text style={styles.pickerTitle}>Choose {categoryLabel(activeCategory).toLowerCase()}</Text>
        <Chip small label={`${categoryItems.length} ${categoryItems.length === 1 ? 'item' : 'items'}`} />
      </View>

      {categoryItems.length === 0 ? (
        <View style={styles.emptyCat}>
          <Text style={styles.hint}>No {categoryLabel(activeCategory).toLowerCase()} in your wardrobe yet</Text>
          <Button title="Add Items" variant="outline" size="sm" onPress={() => router.push('/wardrobe?add=1')} />
        </View>
      ) : (
        <View style={styles.grid}>
          {categoryItems.map((item) => {
            const isSelected = selectedItems[activeCategory]?.id === item.id;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                onPress={() => handleItemSelect(item)}
                style={({ pressed }) => [
                  styles.card,
                  { width: cardWidth },
                  isSelected && styles.cardSelected,
                  pressed && { opacity: 0.9 },
                ]}
              >
                <View style={[styles.cardImageBox, { height: cardWidth }]}>
                  <Image source={{ uri: displayImage(item) }} contentFit="cover" style={styles.cardImage} />
                  {isSelected ? (
                    <View style={styles.selectedOverlay}>
                      <View style={styles.checkBadge}>
                        <Check size={18} color={colors.primaryForeground} />
                      </View>
                    </View>
                  ) : null}
                </View>
                <View style={styles.cardBody}>
                  <Text numberOfLines={1} style={styles.cardName}>
                    {item.name}
                  </Text>
                  <Text style={styles.cardMeta}>{item.color || categoryLabel(item.category)}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      <Modal visible={saveOpen} transparent animationType="slide" onRequestClose={closeSave}>
        <Pressable style={styles.backdrop} onPress={closeSave} />
        <View style={[styles.sheet, { paddingBottom: spacing.xl + insets.bottom }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Save Your Outfit</Text>
            <Pressable accessibilityLabel="Close" onPress={closeSave} hitSlop={8}>
              <X size={22} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <Field
            label="Outfit Name"
            placeholder="e.g., Casual Friday, Date Night"
            value={outfitName}
            onChangeText={setOutfitName}
          />
          <Field
            label="Notes (optional)"
            placeholder="Occasion, weather, styling tips..."
            value={outfitNotes}
            onChangeText={setOutfitNotes}
            multiline
            style={styles.notes}
          />
          <View style={styles.sheetActions}>
            <Button title="Cancel" variant="outline" onPress={closeSave} style={styles.flexBtn} />
            <Button title="Save Outfit" loading={saving} onPress={handleSaveFit} style={styles.flexBtn} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  flexBtn: { flex: 1 },
  seeOnMe: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.card,
  },
  seeOnMeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  hint: { fontSize: 12, color: colors.mutedForeground, lineHeight: 18 },
  slotList: { gap: spacing.sm },
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  slotActive: { borderColor: colors.primary, ...shadow.card },
  slotImage: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.muted },
  slotPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: radius.sm,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotBody: { flex: 1, gap: 2 },
  slotTitle: { fontWeight: '600', fontSize: 15, color: colors.foreground },
  slotMeta: { fontSize: 13, color: colors.mutedForeground },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pickerTitle: { fontSize: 18, fontWeight: '700', color: colors.foreground },
  emptyCat: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xxl,
    backgroundColor: colors.muted,
    borderRadius: radius.lg,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow.card,
  },
  cardSelected: { borderColor: colors.primary, borderWidth: 2 },
  cardImageBox: { width: '100%', backgroundColor: colors.muted },
  cardImage: { width: '100%', height: '100%' },
  selectedOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(233,121,99,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBadge: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { padding: spacing.md, gap: 2 },
  cardName: { fontWeight: '600', color: colors.foreground, fontSize: 14 },
  cardMeta: { color: colors.mutedForeground, fontSize: 12, textTransform: 'capitalize' },
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.lg,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  sheetHandle: { width: 44, height: 5, borderRadius: radius.full, backgroundColor: colors.border, alignSelf: 'center' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: colors.foreground },
  notes: { height: 96, textAlignVertical: 'top', paddingTop: 12 },
  sheetActions: { flexDirection: 'row', gap: spacing.sm },
});
