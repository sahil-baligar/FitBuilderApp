import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { ChevronLeft, ChevronRight, Layers, Shirt } from 'lucide-react-native';
import { buildOutfitSteps, composeOutfit, type OutfitLayer, type SelectedItems } from '@fitbuilder/core';
import { colors, radius, spacing } from '../theme';

/** Paints normalized `OutfitLayer`s into a box of known pixel size. */
export const LayerCanvas: React.FC<{
  layers: OutfitLayer[];
  width: number;
  height: number;
  style?: StyleProp<ViewStyle>;
}> = ({ layers, width, height, style }) => (
  <View style={[{ width, height }, style]} pointerEvents="none">
    {[...layers]
      .sort((a, b) => a.z - b.z)
      .map((layer) => (
        <Image
          key={layer.key}
          source={{ uri: layer.imageUrl }}
          contentFit="contain"
          transition={120}
          style={{
            position: 'absolute',
            left: layer.rect.x * width,
            top: layer.rect.y * height,
            width: layer.rect.w * width,
            height: layer.rect.h * height,
            zIndex: layer.z,
          }}
        />
      ))}
  </View>
);

interface OutfitPreviewProps {
  selectedItems: SelectedItems;
  /** Hide the step navigation and always show the full look. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * 3:4 portrait preview. `onLayout` gives the pixel size; every layer is an
 * absolutely-positioned expo-image at `rect * size` in z order. Step mode
 * walks the "dressing" sequence from `buildOutfitSteps`; full-look mode uses
 * `composeOutfit`.
 */
export const OutfitPreview: React.FC<OutfitPreviewProps> = ({ selectedItems, compact, style }) => {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [mode, setMode] = useState<'steps' | 'full'>('full');
  const [stepIndex, setStepIndex] = useState(0);

  const steps = useMemo(() => buildOutfitSteps(selectedItems), [selectedItems]);
  const full = useMemo(() => composeOutfit(selectedItems), [selectedItems]);

  const safeIndex = Math.min(stepIndex, Math.max(steps.length - 1, 0));
  const showSteps = mode === 'steps' && !compact && steps.length > 0;
  const layers = showSteps ? steps[safeIndex].layers : full;
  const label = showSteps ? steps[safeIndex].label : full.length ? 'Full look' : 'Pick items to preview';

  const onLayout = (e: LayoutChangeEvent) => {
    const { width } = e.nativeEvent.layout;
    setSize({ w: width, h: (width * 4) / 3 });
  };

  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.canvas} onLayout={onLayout}>
        {size.w > 0 && layers.length > 0 ? (
          <LayerCanvas layers={layers} width={size.w} height={size.h} />
        ) : size.w > 0 ? (
          <View style={[styles.placeholder, { width: size.w, height: size.h }]}>
            <Shirt size={40} color={colors.mutedForeground} strokeWidth={1.4} />
            <Text style={styles.placeholderText}>Your fit will appear here</Text>
          </View>
        ) : (
          <View style={{ width: '100%', aspectRatio: 3 / 4 }} />
        )}
        <View style={styles.labelPill} pointerEvents="none">
          <Text style={styles.labelText}>{label}</Text>
        </View>
      </View>

      {!compact && (
        <View style={styles.controls}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setMode((m) => (m === 'full' ? 'steps' : 'full'))}
            style={[styles.modeBtn, mode === 'steps' && styles.modeBtnActive]}
          >
            <Layers size={15} color={mode === 'steps' ? colors.primaryForeground : colors.foreground} />
            <Text style={[styles.modeText, mode === 'steps' && { color: colors.primaryForeground }]}>
              {mode === 'steps' ? 'Step by step' : 'Full look'}
            </Text>
          </Pressable>
          {showSteps && (
            <View style={styles.stepNav}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous step"
                disabled={safeIndex === 0}
                onPress={() => setStepIndex((i) => Math.max(0, i - 1))}
                style={[styles.navBtn, safeIndex === 0 && styles.navDisabled]}
              >
                <ChevronLeft size={18} color={colors.foreground} />
              </Pressable>
              <Text style={styles.stepCount}>
                {safeIndex + 1} / {steps.length}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next step"
                disabled={safeIndex >= steps.length - 1}
                onPress={() => setStepIndex((i) => Math.min(steps.length - 1, i + 1))}
                style={[styles.navBtn, safeIndex >= steps.length - 1 && styles.navDisabled]}
              >
                <ChevronRight size={18} color={colors.foreground} />
              </Pressable>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  canvas: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  placeholder: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.muted },
  placeholderText: { color: colors.mutedForeground, fontSize: 13 },
  labelPill: {
    position: 'absolute',
    bottom: spacing.md,
    left: spacing.md,
    backgroundColor: 'rgba(42,37,35,0.78)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  labelText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  modeText: { fontSize: 13, fontWeight: '600', color: colors.foreground },
  stepNav: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navDisabled: { opacity: 0.4 },
  stepCount: { fontSize: 13, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
});
