import React, { useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Shirt } from 'lucide-react-native';
import { composeOutfit, selectionFromItemIds, type ClothingItem, type Fit } from '@fitbuilder/core';
import { colors, radius } from '../theme';
import { LayerCanvas } from './OutfitPreview';

/** Small composed thumbnail of a saved fit (3:4). */
export const FitThumb: React.FC<{ fit: Fit; wardrobe: ClothingItem[]; width: number; style?: StyleProp<ViewStyle> }> = ({
  fit,
  wardrobe,
  width,
  style,
}) => {
  const layers = useMemo(() => composeOutfit(selectionFromItemIds(fit.itemIds, wardrobe)), [fit.itemIds, wardrobe]);
  const height = (width * 4) / 3;
  return (
    <View style={[styles.box, { width, height }, style]}>
      {layers.length ? (
        <LayerCanvas layers={layers} width={width} height={height} />
      ) : (
        <View style={styles.empty}>
          <Shirt size={28} color={colors.mutedForeground} strokeWidth={1.4} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  box: { backgroundColor: colors.card, borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.muted },
});
