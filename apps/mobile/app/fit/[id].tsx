import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { selectionFromItemIds, useApp, type ClothingItem } from '@fitbuilder/core';
import { Button, Chip, ChipRow, EmptyState, Header, Muted, Screen, SectionTitle } from '../../src/components/ui';
import { OutfitPreview } from '../../src/components/OutfitPreview';
import { FitRenders } from '../../src/components/FitRenders';
import { useToast } from '../../src/components/Toast';
import { confirmAsync } from '../../src/lib/dialogs';
import { categoryLabel, displayImage } from '../../src/lib/format';
import { colors, radius, spacing } from '../../src/theme';

export default function FitDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { outfits, wardrobe, removeOutfit } = useApp();
  const toast = useToast();

  const fit = outfits.find((f) => f.id === id);

  const items = useMemo((): ClothingItem[] => {
    if (!fit) return [];
    return fit.itemIds.map((itemId) => wardrobe.find((item) => item.id === itemId)).filter((item): item is ClothingItem => !!item);
  }, [fit, wardrobe]);

  const selection = useMemo(() => (fit ? selectionFromItemIds(fit.itemIds, wardrobe) : {}), [fit, wardrobe]);

  const handleDelete = async () => {
    if (!fit) return;
    const ok = await confirmAsync('Delete outfit?', `"${fit.name}" will be removed from your library.`, 'Delete');
    if (!ok) return;
    await removeOutfit(fit.id);
    toast.success('Outfit deleted', 'The outfit has been removed from your library.');
    if (router.canGoBack()) router.back();
    else router.replace('/library');
  };

  if (!fit) {
    return (
      <Screen>
        <Header title="Outfit" back />
        <EmptyState
          title="Outfit not found"
          description="This fit may have been deleted."
          action={<Button title="Back to library" onPress={() => router.replace('/library')} />}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header
        title={fit.name}
        back
        right={fit.source === 'ai' ? <Chip small label="AI" tone="info" /> : undefined}
      />

      {fit.notes ? (
        <View style={styles.notesBox}>
          <Muted>{fit.notes}</Muted>
        </View>
      ) : null}

      <ChipRow>
        {fit.weatherContext ? <Chip small label={fit.weatherContext} /> : null}
        {fit.occasion ? <Chip small label={fit.occasion} /> : null}
        <Chip small label={new Date(fit.createdAt).toLocaleDateString()} />
      </ChipRow>

      <OutfitPreview selectedItems={selection} />

      <SectionTitle>Renders</SectionTitle>
      <FitRenders fit={fit} items={items} />

      <SectionTitle>Items</SectionTitle>
      <View style={styles.itemGrid}>
        {items.map((item) => (
          <View key={item.id} style={styles.itemCard}>
            <Image source={{ uri: displayImage(item) }} contentFit="cover" style={styles.itemImage} />
            <Text numberOfLines={1} style={styles.itemName}>
              {item.name}
            </Text>
            <Text style={styles.itemMeta}>{categoryLabel(item.category)}</Text>
          </View>
        ))}
      </View>

      <Button title="Delete outfit" variant="destructive" onPress={handleDelete} full />
    </Screen>
  );
}

const styles = StyleSheet.create({
  notesBox: {
    backgroundColor: colors.muted,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  itemGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  itemCard: { width: '47%', flexGrow: 1, gap: 4 },
  itemImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
  },
  itemName: { fontSize: 13, fontWeight: '600', color: colors.foreground },
  itemMeta: { fontSize: 12, color: colors.mutedForeground },
});
