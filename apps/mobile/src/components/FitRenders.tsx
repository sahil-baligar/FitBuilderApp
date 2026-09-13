import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { nanoid } from 'nanoid/non-secure';
import { Camera, Frame, UserRound } from 'lucide-react-native';
import {
  layerImageFor,
  renderStyleFrames,
  renderTryOn,
  useApp,
  type ClothingItem,
  type Fit,
  type FitRender,
} from '@fitbuilder/core';
import { Button, Chip, Notice } from './ui';
import { useToast } from './Toast';
import { persistImage, toDataUrl } from '../lib/images';
import { describeApiError, type DescribedError } from '../lib/quota';
import { colors, radius, spacing } from '../theme';

interface FitRendersProps {
  /** The saved fit to render for. Renders are appended to `fit.renders` via updateOutfit. */
  fit: Fit;
  /** Wardrobe items in this fit (already resolved by the caller). */
  items: ClothingItem[];
}

type Job = { kind: 'tryon' | 'styleframe'; step: string; progress?: number } | null;

const viewLabel = (render: FitRender) => {
  if (render.kind === 'tryon') return 'Try-on';
  if (render.kind === 'flatlay') return 'Flat lay';
  return render.view ? `${render.view[0].toUpperCase()}${render.view.slice(1)} view` : 'Style frame';
};

/**
 * "See it on me" + "Style frames" actions and a horizontal gallery of a fit's renders.
 * Reads the latest fit from context so new renders appear without the parent re-fetching.
 */
export const FitRenders: React.FC<FitRendersProps> = ({ fit: fitProp, items }) => {
  const { outfits, settings, updateOutfit } = useApp();
  const toast = useToast();
  const router = useRouter();
  const [job, setJob] = useState<Job>(null);
  const [problem, setProblem] = useState<DescribedError | null>(null);

  /**
   * Renders are metered, so a refusal is usually "you have used this month's
   * three" or "sign in first" rather than a breakage. Both stay on the card,
   * next to the button that was pressed; only a real failure gets a red toast.
   */
  const reportFailure = (err: unknown, fallbackTitle: string) => {
    const described = describeApiError(err, fallbackTitle);
    setProblem(described);
    if (described.kind === 'error' || described.kind === 'offline') {
      toast.error(described.title, described.message);
    }
  };

  const fit = outfits.find((f) => f.id === fitProp.id) ?? fitProp;
  const renders = fit.renders ?? [];
  const tryOn = [...renders].reverse().find((r) => r.kind === 'tryon');

  const appendRenders = async (next: FitRender[]) => {
    const latest = outfits.find((f) => f.id === fit.id) ?? fit;
    await updateOutfit(fit.id, { renders: [...(latest.renders ?? []), ...next] });
  };

  const handleTryOn = async () => {
    if (!settings.bodyPhotoUrl) {
      toast.toast('Add a body photo first', 'Try-on needs a full-body photo. You can add one in Settings.');
      router.push('/settings');
      return;
    }
    if (!items.length) {
      toast.error('No items in this fit');
      return;
    }
    setProblem(null);
    setJob({ kind: 'tryon', step: 'Starting try-on' });
    try {
      const [bodyImage, ...garmentImages] = await Promise.all([
        toDataUrl(settings.bodyPhotoUrl),
        ...items.map((item) => toDataUrl(layerImageFor(item))),
      ]);
      const result = await renderTryOn(
        {
          bodyImage,
          garments: items.map((item, i) => ({
            itemId: item.id,
            image: garmentImages[i],
            category: item.category,
          })),
          fitId: fit.id,
        },
        { onUpdate: (j) => setJob({ kind: 'tryon', step: j.step ?? 'Rendering', progress: j.progress }) },
      );
      if (!result.result) throw new Error('Render finished without an image');
      const imageUrl = await persistImage(result.result.imageUrl, `${fit.id}-tryon-${nanoid(8)}`);
      await appendRenders([
        {
          id: nanoid(),
          kind: 'tryon',
          imageUrl,
          provider: result.result.provider,
          createdAt: new Date().toISOString(),
        },
      ]);
      toast.success('Try-on ready', `Rendered "${fit.name}" on your photo.`);
    } catch (err) {
      reportFailure(err, 'Try-on failed');
    } finally {
      setJob(null);
    }
  };

  const handleStyleFrames = async () => {
    if (!tryOn) return;
    setProblem(null);
    setJob({ kind: 'styleframe', step: 'Starting style frames' });
    try {
      const sourceImage = await toDataUrl(tryOn.imageUrl);
      const result = await renderStyleFrames(
        { sourceImage, views: ['front', 'side', 'back'], fitId: fit.id },
        { onUpdate: (j) => setJob({ kind: 'styleframe', step: j.step ?? 'Rendering', progress: j.progress }) },
      );
      const frames = result.result?.frames ?? [];
      if (!frames.length) throw new Error('No frames were returned');
      const createdAt = new Date().toISOString();
      const persisted = await Promise.all(
        frames.map(async (frame) => ({
          id: nanoid(),
          kind: 'styleframe' as const,
          view: frame.view,
          imageUrl: await persistImage(frame.imageUrl, `${fit.id}-frame-${frame.view}-${nanoid(6)}`),
          provider: result.result?.provider,
          createdAt,
        })),
      );
      await appendRenders(persisted);
      toast.success('Style frames ready', `${frames.length} views added.`);
    } catch (err) {
      reportFailure(err, 'Style frames failed');
    } finally {
      setJob(null);
    }
  };

  const progressPct = job?.progress !== undefined ? Math.round(job.progress * 100) : undefined;

  return (
    <View style={styles.wrap}>
      <View style={styles.actions}>
        <Button
          title="See it on me"
          size="sm"
          icon={
            job?.kind === 'tryon' ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <UserRound size={16} color={colors.primaryForeground} />
            )
          }
          loading={job?.kind === 'tryon'}
          disabled={!!job}
          onPress={handleTryOn}
          style={styles.actionBtn}
        />
        {tryOn ? (
          <Button
            title="Style frames"
            size="sm"
            variant="outline"
            icon={
              job?.kind === 'styleframe' ? (
                <ActivityIndicator size="small" color={colors.foreground} />
              ) : (
                <Frame size={16} color={colors.foreground} />
              )
            }
            loading={job?.kind === 'styleframe'}
            disabled={!!job}
            onPress={handleStyleFrames}
            style={styles.actionBtn}
          />
        ) : null}
      </View>

      {job ? (
        <View style={styles.jobBox} accessibilityRole="summary">
          <View style={styles.jobRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text numberOfLines={1} style={styles.jobStep}>
              {job.step}
            </Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: progressPct !== undefined ? `${progressPct}%` : '35%' }]} />
          </View>
        </View>
      ) : null}

      {problem && !job ? (
        <Notice
          tone={problem.kind === 'quota' ? 'warning' : problem.kind === 'auth' ? 'info' : problem.kind === 'pro' ? 'pro' : 'error'}
          title={problem.title}
          body={problem.message}
          action={
            problem.kind === 'auth' ? (
              <Button title="Sign in" size="sm" onPress={() => router.push('/auth/login')} />
            ) : undefined
          }
        />
      ) : null}

      {renders.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gallery}>
          {renders.map((render) => (
            <View key={render.id} style={styles.figure}>
              <View style={styles.thumb}>
                <Image
                  source={{ uri: render.imageUrl }}
                  contentFit="cover"
                  transition={150}
                  style={styles.thumbImage}
                  accessibilityLabel={`${fit.name} ${viewLabel(render)}`}
                />
              </View>
              <View style={styles.caption}>
                <Text numberOfLines={1} style={styles.captionText}>
                  {viewLabel(render)}
                </Text>
                {render.kind === 'tryon' ? <Chip small label="you" tone="info" icon={<Camera size={11} color={colors.secondary} />} /> : null}
              </View>
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actionBtn: { flexGrow: 1, flexBasis: 140 },
  jobBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.muted,
    padding: spacing.md,
    gap: spacing.sm,
  },
  jobRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  jobStep: { flex: 1, fontSize: 13, color: colors.foreground },
  progressTrack: {
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  gallery: { gap: spacing.md, paddingVertical: 2 },
  figure: { width: 144, gap: 6 },
  thumb: {
    aspectRatio: 3 / 4,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.muted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumbImage: { width: '100%', height: '100%' },
  caption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  captionText: { flex: 1, fontSize: 12, color: colors.mutedForeground },
});
