import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, ImageIcon, Plus, ShoppingBag, X } from 'lucide-react-native';
import { useApp, type ClothingCategory, type ClothingItem, type ProcessingState } from '@fitbuilder/core';
import { Button, Chip, ChipRow, EmptyState, Field, Header, Screen, Sheet } from '../../src/components/ui';
import { useToast } from '../../src/components/Toast';
import { pickImage, persistImage, type PickSource, type PickedImage } from '../../src/lib/images';
import { useProcessItem } from '../../src/lib/pipeline';
import { CATEGORIES, categoryLabel, displayImage, errorMessage } from '../../src/lib/format';
import { colors, radius, shadow, spacing } from '../../src/theme';

const processingChip = (p?: ProcessingState): { label: string; tone: 'success' | 'warning' | 'error' | 'info' } | null => {
  if (!p || p.status === 'idle') return null;
  if (p.status === 'done') return { label: 'Ghost ready', tone: 'success' };
  if (p.status === 'failed') return { label: 'Failed', tone: 'error' };
  if (p.status === 'queued') return { label: 'Queued', tone: 'info' };
  return { label: p.step ? `Processing · ${p.step}` : 'Processing', tone: 'warning' };
};

export const ProcessingChip: React.FC<{ state?: ProcessingState }> = ({ state }) => {
  const c = processingChip(state);
  return c ? <Chip small label={c.label} tone={c.tone} /> : null;
};

export default function WardrobeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ add?: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { wardrobe, settings, addClothingItem } = useApp();
  const { process } = useProcessItem();
  const toast = useToast();

  const [filter, setFilter] = useState<ClothingCategory | 'all'>('all');
  const [sheet, setSheet] = useState(false);
  const [picked, setPicked] = useState<PickedImage | null>(null);
  const [category, setCategory] = useState<ClothingCategory>('top');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (params.add === '1') {
      setSheet(true);
      router.setParams({ add: '' });
    }
  }, [params.add, router]);

  const items = useMemo(() => {
    const list = filter === 'all' ? wardrobe : wardrobe.filter((i) => i.category === filter);
    return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [wardrobe, filter]);

  const columns = width >= 640 ? 3 : 2;
  const contentWidth = Math.min(width, 720) - spacing.lg * 2;
  const cardWidth = (contentWidth - spacing.md * (columns - 1)) / columns;

  const closeSheet = () => {
    setSheet(false);
    setPicked(null);
    setName('');
    setCategory('top');
  };

  const choose = async (source: PickSource) => {
    try {
      const result = await pickImage(source);
      if (result) setPicked(result);
    } catch (e) {
      toast.error('Could not pick image', errorMessage(e));
    }
  };

  const save = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const uri = await persistImage(picked.uri, `${id}-original`);
      const shouldProcess = !!settings.autoProcessUploads;
      const record = await addClothingItem({
        name: name.trim() || `${categoryLabel(category).replace(/s$/, '')} ${wardrobe.length + 1}`,
        imageUrl: uri,
        originalImageUrl: uri,
        category,
        color: '',
        weatherSuitability: [],
        tags: [],
        processing: { status: shouldProcess ? 'queued' : 'idle', updatedAt: new Date().toISOString() },
      });
      closeSheet();
      toast.success('Added to wardrobe', shouldProcess ? 'Processing in the background…' : undefined);
      if (shouldProcess) {
        process(record).catch((e) => toast.error('Processing failed', errorMessage(e)));
      }
    } catch (e) {
      toast.error('Could not save item', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const renderItem = useCallback(
    ({ item }: { item: ClothingItem }) => (
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push(`/item/${item.id}`)}
        style={({ pressed }) => [styles.card, { width: cardWidth, opacity: pressed ? 0.85 : 1 }]}
      >
        <View style={[styles.imageBox, { height: cardWidth * 1.15 }]}>
          <Image source={{ uri: displayImage(item) }} contentFit="contain" transition={150} style={styles.image} />
          <View style={styles.chipOverlay}>
            <ProcessingChip state={item.processing} />
          </View>
        </View>
        <View style={styles.cardBody}>
          <Text numberOfLines={1} style={styles.cardName}>
            {item.name}
          </Text>
          <Text style={styles.cardMeta}>
            {categoryLabel(item.category)}
            {item.color ? ` · ${item.color}` : ''}
          </Text>
        </View>
      </Pressable>
    ),
    [cardWidth, router],
  );

  return (
    <Screen scroll={false} padded={false}>
      <FlatList
        key={columns}
        data={items}
        keyExtractor={(i) => i.id}
        numColumns={columns}
        renderItem={renderItem}
        columnWrapperStyle={{ gap: spacing.md }}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Header title="Wardrobe" subtitle={`${wardrobe.length} ${wardrobe.length === 1 ? 'piece' : 'pieces'}`} />
            <ChipRow scroll style={{ paddingVertical: 2 }}>
              <Chip label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
              {CATEGORIES.map((c) => (
                <Chip key={c.key} label={c.label} selected={filter === c.key} onPress={() => setFilter(c.key)} />
              ))}
            </ChipRow>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon={<ShoppingBag size={30} color={colors.primary} />}
            title={filter === 'all' ? 'Your wardrobe is empty' : `No ${categoryLabel(filter as ClothingCategory).toLowerCase()} yet`}
            description="Snap a photo of a garment and FitBuilder will cut it out and turn it into a ghost-mannequin render."
            action={<Button title="Add your first item" icon={<Plus size={18} color="#fff" />} onPress={() => setSheet(true)} />}
          />
        }
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add item"
        onPress={() => setSheet(true)}
        style={({ pressed }) => [styles.fab, { bottom: spacing.xl + insets.bottom, opacity: pressed ? 0.9 : 1 }]}
      >
        <Plus size={26} color={colors.primaryForeground} />
      </Pressable>

      <Sheet visible={sheet} onClose={closeSheet}>
        <View>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{picked ? 'New garment' : 'Add to wardrobe'}</Text>
            <Pressable accessibilityLabel="Close" onPress={closeSheet} hitSlop={8}>
              <X size={22} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {!picked ? (
            <View style={styles.sourceRow}>
              <Pressable style={styles.source} onPress={() => choose('camera')}>
                <View style={styles.sourceIcon}>
                  <Camera size={26} color={colors.primary} />
                </View>
                <Text style={styles.sourceText}>Camera</Text>
              </Pressable>
              <Pressable style={styles.source} onPress={() => choose('library')}>
                <View style={styles.sourceIcon}>
                  <ImageIcon size={26} color={colors.primary} />
                </View>
                <Text style={styles.sourceText}>Library</Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ gap: spacing.lg }}>
              <View style={styles.previewRow}>
                <Image source={{ uri: picked.uri }} contentFit="cover" style={styles.preview} />
                <View style={{ flex: 1, gap: spacing.sm }}>
                  <Text style={styles.label}>Category</Text>
                  <ChipRow>
                    {CATEGORIES.map((c) => (
                      <Chip key={c.key} label={c.label} selected={category === c.key} onPress={() => setCategory(c.key)} />
                    ))}
                  </ChipRow>
                </View>
              </View>
              <Field label="Name (optional)" placeholder="e.g. Navy linen shirt" value={name} onChangeText={setName} />
              <View style={styles.sheetActions}>
                <Button title="Retake" variant="outline" onPress={() => setPicked(null)} />
                <Button title="Add to wardrobe" loading={busy} onPress={save} style={{ flex: 1 }} />
              </View>
              {settings.autoProcessUploads ? (
                <Text style={styles.hint}>Auto-processing is on: background removal + ghost render will start right away.</Text>
              ) : null}
            </View>
          )}
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: spacing.lg, paddingBottom: 140, gap: spacing.md, maxWidth: 720, width: '100%', alignSelf: 'center' },
  listHeader: { gap: spacing.md, marginBottom: spacing.xs },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow.card,
  },
  imageBox: { backgroundColor: colors.muted, width: '100%' },
  image: { width: '100%', height: '100%' },
  chipOverlay: { position: 'absolute', top: spacing.sm, left: spacing.sm },
  cardBody: { padding: spacing.md, gap: 2 },
  cardName: { fontWeight: '600', color: colors.foreground, fontSize: 14 },
  cardMeta: { color: colors.mutedForeground, fontSize: 12 },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    width: 58,
    height: 58,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.fab,
  },
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
  sourceRow: { flexDirection: 'row', gap: spacing.md },
  source: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  sourceIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceText: { fontWeight: '600', color: colors.foreground },
  previewRow: { flexDirection: 'row', gap: spacing.lg },
  preview: { width: 120, height: 150, borderRadius: radius.md, backgroundColor: colors.muted },
  label: { fontSize: 13, fontWeight: '600', color: colors.foreground },
  sheetActions: { flexDirection: 'row', gap: spacing.sm },
  hint: { fontSize: 12, color: colors.mutedForeground },
});
