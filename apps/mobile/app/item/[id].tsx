import React, { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { RefreshCw, Trash2 } from 'lucide-react-native';
import {
  useApp,
  type AccessoryPlacement,
  type ClothingCategory,
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
  Screen,
  SectionTitle,
} from '../../src/components/ui';
import { useToast } from '../../src/components/Toast';
import { ProcessingChip } from '../(tabs)/wardrobe';
import { confirmAsync } from '../../src/lib/dialogs';
import { CATEGORIES, WEATHER_BANDS, categoryLabel, errorMessage } from '../../src/lib/format';
import { deletePersistedImage } from '../../src/lib/images';
import { useProcessItem } from '../../src/lib/pipeline';
import { colors, spacing } from '../../src/theme';

type ImageView = 'original' | 'cutout' | 'ghost';

const PLACEMENTS: AccessoryPlacement[] = ['head', 'neck', 'torso', 'waist', 'wrist', 'hand'];

const parseTags = (raw: string) =>
  raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

const isMidPipeline = (item: ClothingItem) =>
  item.processing?.status === 'queued' || item.processing?.status === 'processing';

const viewUrl = (item: ClothingItem, view: ImageView) => {
  if (view === 'ghost') return item.ghostImageUrl;
  if (view === 'cutout') return item.cutoutImageUrl;
  return item.originalImageUrl ?? item.imageUrl;
};

export default function ItemDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { wardrobe, updateClothingItem, removeClothingItem } = useApp();
  const { process, isRunning, cancel } = useProcessItem();
  const toast = useToast();

  const item = useMemo(() => wardrobe.find((i) => i.id === id) ?? null, [wardrobe, id]);

  const [name, setName] = useState('');
  const [category, setCategory] = useState<ClothingCategory>('top');
  const [color, setColor] = useState('');
  const [tags, setTags] = useState('');
  const [weatherSuitability, setWeatherSuitability] = useState<WeatherBand[]>([]);
  const [accessoryPlacement, setAccessoryPlacement] = useState<AccessoryPlacement>('neck');
  const [imageView, setImageView] = useState<ImageView>('original');
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!item) return;
    setName(item.name);
    setCategory(item.category);
    setColor(item.color);
    setTags(item.tags.join(', '));
    setWeatherSuitability(item.weatherSuitability);
    setAccessoryPlacement(item.accessoryPlacement ?? 'neck');
    setImageView(item.ghostImageUrl ? 'ghost' : item.cutoutImageUrl ? 'cutout' : 'original');
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- sync form when navigating to a different item

  if (!item) {
    return (
      <Screen>
        <Header title="Item" back />
        <EmptyState
          title="Item not found"
          description="This garment may have been deleted."
          action={<Button title="Back to wardrobe" onPress={() => router.replace('/wardrobe')} />}
        />
      </Screen>
    );
  }

  const running = busy || isRunning(item.id) || isMidPipeline(item);
  const uri = viewUrl(item, imageView) ?? item.imageUrl;

  const toggleWeather = (band: WeatherBand) => {
    setWeatherSuitability((prev) =>
      prev.includes(band) ? prev.filter((w) => w !== band) : [...prev, band],
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateClothingItem(item.id, {
        name: name.trim() || item.name,
        category,
        color: color.trim(),
        tags: parseTags(tags),
        weatherSuitability,
        accessoryPlacement: category === 'accessories' ? accessoryPlacement : undefined,
      });
      toast.success('Saved', `${name.trim() || item.name} updated.`);
    } catch (e) {
      toast.error('Save failed', errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleReprocess = async () => {
    setBusy(true);
    try {
      await process(item);
      toast.success(item.ghostImageUrl ? 'Reprocessed' : 'Processed', 'Ghost render updated.');
    } catch (e) {
      toast.error('Processing failed', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    const ok = await confirmAsync(
      'Delete this item?',
      `"${item.name}" will be removed from your wardrobe.`,
      'Delete',
    );
    if (!ok) return;
    try {
      cancel(item.id);
      await Promise.all([
        deletePersistedImage(item.originalImageUrl),
        deletePersistedImage(item.cutoutImageUrl),
        deletePersistedImage(item.ghostImageUrl),
        deletePersistedImage(item.imageUrl),
      ]);
      await removeClothingItem(item.id);
      toast.success('Deleted', `${item.name} removed.`);
      if (router.canGoBack()) router.back();
      else router.replace('/wardrobe');
    } catch (e) {
      toast.error('Delete failed', errorMessage(e));
    }
  };

  return (
    <Screen>
      <Header title={item.name} subtitle={categoryLabel(item.category)} back />

      <Card style={{ gap: spacing.md, padding: 0, overflow: 'hidden' }}>
        <View style={styles.imageBox}>
          {uri ? (
            <Image source={{ uri }} style={styles.image} resizeMode="contain" />
          ) : (
            <View style={styles.imageFallback}>
              <Muted>No image</Muted>
            </View>
          )}
          <View style={styles.chipOverlay}>
            <ProcessingChip state={item.processing} />
          </View>
        </View>
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <ChipRow>
            {(
              [
                ['original', 'Original', item.originalImageUrl ?? item.imageUrl],
                ['cutout', 'Cutout', item.cutoutImageUrl],
                ['ghost', 'Ghost', item.ghostImageUrl],
              ] as const
            ).map(([key, label, src]) => (
              <Chip
                key={key}
                label={label}
                selected={imageView === key}
                onPress={src ? () => setImageView(key) : undefined}
              />
            ))}
          </ChipRow>
          {item.processing?.status === 'failed' && item.processing.error ? (
            <Text style={styles.errorText}>{item.processing.error}</Text>
          ) : null}
        </View>
      </Card>

      <SectionTitle>Details</SectionTitle>
      <Card style={{ gap: spacing.lg }}>
        <Field label="Name" value={name} onChangeText={setName} placeholder="Garment name" />

        <View>
          <Text style={styles.label}>Category</Text>
          <ChipRow>
            {CATEGORIES.map((c) => (
              <Chip
                key={c.key}
                label={c.label}
                selected={category === c.key}
                onPress={() => setCategory(c.key)}
              />
            ))}
          </ChipRow>
        </View>

        <Field label="Color" value={color} onChangeText={setColor} placeholder="e.g. Navy" />

        <Field
          label="Tags"
          value={tags}
          onChangeText={setTags}
          placeholder="casual, linen, summer"
          hint="Comma separated"
        />

        <View>
          <Text style={styles.label}>Weather suitability</Text>
          <ChipRow>
            {WEATHER_BANDS.map((band) => (
              <Chip
                key={band}
                label={band}
                selected={weatherSuitability.includes(band)}
                onPress={() => toggleWeather(band)}
              />
            ))}
          </ChipRow>
        </View>

        {category === 'accessories' ? (
          <View>
            <Text style={styles.label}>Placement</Text>
            <ChipRow>
              {PLACEMENTS.map((p) => (
                <Chip
                  key={p}
                  label={p}
                  selected={accessoryPlacement === p}
                  onPress={() => setAccessoryPlacement(p)}
                />
              ))}
            </ChipRow>
          </View>
        ) : null}
      </Card>

      <View style={styles.actions}>
        <Button
          title={item.ghostImageUrl ? 'Reprocess' : 'Process'}
          variant="outline"
          icon={<RefreshCw size={16} color={colors.foreground} />}
          loading={running}
          disabled={running}
          onPress={handleReprocess}
          style={{ flex: 1 }}
        />
        <Button title="Save" loading={saving} onPress={handleSave} style={{ flex: 1 }} />
      </View>

      <Button
        title="Delete item"
        variant="destructive"
        full
        icon={<Trash2 size={16} color={colors.destructive} />}
        onPress={handleDelete}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  imageBox: {
    width: '100%',
    aspectRatio: 3 / 4,
    backgroundColor: colors.muted,
    position: 'relative',
  },
  image: { width: '100%', height: '100%' },
  imageFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  chipOverlay: { position: 'absolute', top: spacing.md, left: spacing.md },
  label: { fontSize: 13, fontWeight: '600', color: colors.foreground, marginBottom: spacing.sm },
  errorText: { fontSize: 12, color: colors.destructive },
  actions: { flexDirection: 'row', gap: spacing.sm },
});
