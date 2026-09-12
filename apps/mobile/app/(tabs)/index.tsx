import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Cloud, CloudRain, CloudSun, Plus, Settings, Snowflake, Sparkles, Sun, Wind, type LucideIcon } from 'lucide-react-native';
import { tempCToBand, useApp } from '@fitbuilder/core';
import { Card, Header, IconButton, Muted, Screen, SectionTitle } from '../../src/components/ui';
import { FitThumb } from '../../src/components/FitThumb';
import { capitalize, formatTemp, greeting } from '../../src/lib/format';
import { colors, radius, spacing } from '../../src/theme';

const conditionIcon = (condition: string): LucideIcon => {
  const c = condition.toLowerCase();
  if (c.includes('rain')) return CloudRain;
  if (c.includes('snow')) return Snowflake;
  if (c.includes('wind')) return Wind;
  if (c.includes('cloud')) return c.includes('part') ? CloudSun : Cloud;
  return Sun;
};

export default function HomeScreen() {
  const router = useRouter();
  const { wardrobe, outfits, settings, currentWeather } = useApp();
  const recent = settings.recentFitIds
    .map((id) => outfits.find((f) => f.id === id))
    .filter((f): f is NonNullable<typeof f> => !!f)
    .slice(0, 4);
  const WeatherIcon = currentWeather ? conditionIcon(currentWeather.condition) : CloudSun;

  return (
    <Screen>
      <Header
        title={`${greeting()} 👋`}
        subtitle="Let's put a fit together."
        right={
          <IconButton accessibilityLabel="Settings" onPress={() => router.push('/settings')}>
            <Settings size={20} color={colors.foreground} />
          </IconButton>
        }
      />

      <View style={styles.statsRow}>
        <Pressable style={styles.stat} onPress={() => router.push('/wardrobe')}>
          <Text style={styles.statValue}>{wardrobe.length}</Text>
          <Text style={styles.statLabel}>{wardrobe.length === 1 ? 'garment' : 'garments'}</Text>
        </Pressable>
        <Pressable style={styles.stat} onPress={() => router.push('/library')}>
          <Text style={styles.statValue}>{outfits.length}</Text>
          <Text style={styles.statLabel}>{outfits.length === 1 ? 'saved fit' : 'saved fits'}</Text>
        </Pressable>
      </View>

      <Pressable onPress={() => router.push('/settings')}>
        <Card style={styles.weather}>
          <View style={styles.weatherIcon}>
            <WeatherIcon size={28} color={colors.secondary} />
          </View>
          <View style={{ flex: 1 }}>
            {currentWeather ? (
              <>
                <Text style={styles.weatherTemp}>{formatTemp(currentWeather.tempC, settings.temperatureUnit)}</Text>
                <Muted>
                  {currentWeather.condition} · {capitalize(tempCToBand(currentWeather.tempC))} weather · {currentWeather.location}
                </Muted>
              </>
            ) : (
              <>
                <Text style={styles.weatherTemp}>No weather set</Text>
                <Muted>Tap to set today's weather in Settings</Muted>
              </>
            )}
          </View>
        </Card>
      </Pressable>

      <SectionTitle>Quick actions</SectionTitle>
      <View style={styles.actions}>
        <Pressable style={[styles.action, { backgroundColor: colors.primary }]} onPress={() => router.push('/wardrobe?add=1')}>
          <Plus size={22} color={colors.primaryForeground} />
          <Text style={[styles.actionText, { color: colors.primaryForeground }]}>Add item</Text>
        </Pressable>
        <Pressable style={[styles.action, { backgroundColor: colors.secondary }]} onPress={() => router.push('/build')}>
          <Sparkles size={22} color={colors.secondaryForeground} />
          <Text style={[styles.actionText, { color: colors.secondaryForeground }]}>Build fit</Text>
        </Pressable>
      </View>

      {recent.length > 0 && (
        <>
          <SectionTitle>Recent fits</SectionTitle>
          <View style={styles.recentRow}>
            {recent.map((fit) => (
              <Pressable key={fit.id} style={styles.recent} onPress={() => router.push(`/fit/${fit.id}`)}>
                <FitThumb fit={fit} wardrobe={wardrobe} width={96} />
                <Text numberOfLines={1} style={styles.recentName}>
                  {fit.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  statsRow: { flexDirection: 'row', gap: spacing.md },
  stat: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  statValue: { fontSize: 30, fontWeight: '700', color: colors.foreground, letterSpacing: -0.5 },
  statLabel: { fontSize: 13, color: colors.mutedForeground },
  weather: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  weatherIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.secondarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weatherTemp: { fontSize: 20, fontWeight: '700', color: colors.foreground },
  actions: { flexDirection: 'row', gap: spacing.md },
  action: {
    flex: 1,
    height: 84,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionText: { fontWeight: '600', fontSize: 14 },
  recentRow: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
  recent: { width: 96, gap: 6 },
  recentName: { fontSize: 12, fontWeight: '500', color: colors.foreground },
});
