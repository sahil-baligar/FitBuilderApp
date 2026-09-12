import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Bookmark } from 'lucide-react-native';
import { useApp, type ClothingItem, type Fit } from '@fitbuilder/core';
import { Button, Chip, ChipRow, EmptyState, Header, Screen } from '../../src/components/ui';
import { FitThumb } from '../../src/components/FitThumb';
import { colors, radius, shadow, spacing } from '../../src/theme';

type Filter = 'all' | 'ai' | 'manual';

export default function LibraryScreen() {
  const router = useRouter();
  const { outfits, wardrobe } = useApp();
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = useMemo(() => {
    return outfits.filter((outfit) => {
      if (filter === 'all') return true;
      if (filter === 'ai') return outfit.source === 'ai';
      return outfit.source !== 'ai';
    });
  }, [outfits, filter]);

  const getItems = (outfit: Fit): ClothingItem[] =>
    outfit.itemIds.map((id) => wardrobe.find((item) => item.id === id)).filter((item): item is ClothingItem => !!item);

  const aiCount = outfits.filter((o) => o.source === 'ai').length;
  const manualCount = outfits.filter((o) => o.source !== 'ai').length;

  return (
    <Screen>
      <Header title="Outfit Library" subtitle={`${outfits.length} saved`} />

      <ChipRow scroll>
        <Chip label={`All (${outfits.length})`} selected={filter === 'all'} onPress={() => setFilter('all')} />
        <Chip label={`AI (${aiCount})`} selected={filter === 'ai'} onPress={() => setFilter('ai')} />
        <Chip label={`Manual (${manualCount})`} selected={filter === 'manual'} onPress={() => setFilter('manual')} />
      </ChipRow>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Bookmark size={30} color={colors.primary} />}
          title="No saved outfits yet"
          description={
            filter !== 'all' ? 'Try a different filter or create some outfits' : 'Build your first outfit to see it here'
          }
          action={<Button title="Build Your First Outfit" onPress={() => router.push('/build')} />}
        />
      ) : (
        <View style={styles.list}>
          {filtered.map((outfit) => {
            const items = getItems(outfit);
            const tryOn = outfit.renders?.find((r) => r.kind === 'tryon');
            return (
              <Pressable
                key={outfit.id}
                accessibilityRole="button"
                onPress={() => router.push(`/fit/${outfit.id}`)}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}
              >
                {tryOn ? (
                  <Image source={{ uri: tryOn.imageUrl }} contentFit="cover" style={styles.tryOnThumb} />
                ) : (
                  <FitThumb fit={outfit} wardrobe={wardrobe} width={96} style={styles.fitThumb} />
                )}
                <View style={styles.info}>
                  <View style={styles.titleRow}>
                    <Text numberOfLines={1} style={styles.name}>
                      {outfit.name}
                    </Text>
                    {outfit.source === 'ai' ? <Chip small label="AI" tone="info" /> : null}
                  </View>
                  {outfit.notes ? (
                    <Text numberOfLines={2} style={styles.notes}>
                      {outfit.notes}
                    </Text>
                  ) : null}
                  <Text style={styles.meta}>
                    {items.length} {items.length === 1 ? 'item' : 'items'}
                    {outfit.renders?.length ? ` · ${outfit.renders.length} renders` : ''}
                    {outfit.weatherContext ? ` · ${outfit.weatherContext}` : ''}
                    {outfit.occasion ? ` · ${outfit.occasion}` : ''}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadow.card,
  },
  tryOnThumb: {
    width: 96,
    height: 96,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
  },
  fitThumb: { borderRadius: radius.md },
  info: { flex: 1, minWidth: 0, gap: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.foreground },
  notes: { fontSize: 13, color: colors.mutedForeground, lineHeight: 18 },
  meta: { fontSize: 12, color: colors.mutedForeground },
});
