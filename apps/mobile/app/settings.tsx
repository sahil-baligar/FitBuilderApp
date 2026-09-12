import React, { useCallback, useEffect, useState } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Camera, RefreshCw } from 'lucide-react-native';
import {
  getHealth,
  getStorageDriver,
  useApp,
  type HealthResponse,
} from '@fitbuilder/core';
import {
  Button,
  Card,
  Chip,
  ChipRow,
  Field,
  Header,
  Muted,
  Screen,
  SectionTitle,
  SwitchRow,
} from '../src/components/ui';
import { useToast } from '../src/components/Toast';
import { confirmAsync } from '../src/lib/dialogs';
import { CONDITIONS, errorMessage } from '../src/lib/format';
import { deletePersistedImage, pickImage, persistImage } from '../src/lib/images';
import { colors, radius, spacing } from '../src/theme';

type HealthState =
  | { status: 'loading' }
  | { status: 'online'; health: HealthResponse; checkedAt: Date }
  | { status: 'offline'; error: string; checkedAt: Date };

const providerLabels: Record<keyof HealthResponse['providers'], { name: string; role: string }> = {
  fal: { name: 'fal.ai', role: 'Cutouts, ghost renders, try-on' },
  openai: { name: 'ChatGPT', role: 'Garment analysis, AI stylist' },
  ollama: { name: 'Ollama', role: 'Local garment analysis' },
  weather: { name: 'Weather', role: 'Location-based suggestions' },
};

const ApiStatus = () => {
  const [state, setState] = useState<HealthState>({ status: 'loading' });

  const check = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const health = await getHealth();
      setState({ status: 'online', health, checkedAt: new Date() });
    } catch (err) {
      const message =
        err instanceof TypeError ? 'Could not reach the API' : err instanceof Error ? err.message : 'Unknown error';
      setState({ status: 'offline', error: message, checkedAt: new Date() });
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  return (
    <Card style={styles.section}>
      <View style={styles.rowBetween}>
        <Text style={styles.sectionHeading}>API status</Text>
        <Button
          title="Refresh"
          variant="ghost"
          size="sm"
          icon={<RefreshCw size={16} color={colors.foreground} />}
          onPress={check}
          disabled={state.status === 'loading'}
          loading={state.status === 'loading'}
        />
      </View>

      {state.status === 'loading' && <Muted>Checking…</Muted>}

      {state.status === 'offline' && (
        <View style={{ gap: spacing.sm }}>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: colors.destructive }]} />
            <Text style={styles.statusLabel}>Offline</Text>
          </View>
          <Muted>
            {state.error}. Image processing, try-on and the AI stylist are unavailable until the API is running; your
            wardrobe still works locally.
          </Muted>
        </View>
      )}

      {state.status === 'online' && (
        <View style={{ gap: spacing.md }}>
          <View style={[styles.statusRow, { flexWrap: 'wrap' }]}>
            <View
              style={[
                styles.dot,
                { backgroundColor: state.health.ok ? colors.success : colors.warning },
              ]}
            />
            <Text style={styles.statusLabel}>{state.health.ok ? 'Online' : 'Degraded'}</Text>
            <Chip small label={`v${state.health.version}`} />
            <Muted style={{ marginLeft: 'auto' }}>
              {state.checkedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Muted>
          </View>
          {(Object.keys(providerLabels) as (keyof HealthResponse['providers'])[]).map((key) => {
            const live = !!state.health.providers[key];
            return (
              <View key={key} style={styles.providerRow}>
                <View style={[styles.dotSm, { backgroundColor: live ? colors.success : colors.mutedForeground }]} />
                <Text style={styles.providerName}>{providerLabels[key].name}</Text>
                <Text style={styles.providerRole} numberOfLines={1}>
                  {providerLabels[key].role}
                </Text>
                <Text style={{ fontSize: 12, color: live ? colors.success : colors.mutedForeground }}>
                  {live ? 'live' : 'off'}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </Card>
  );
};

export default function SettingsScreen() {
  const router = useRouter();
  const { settings, updateSettings, isLoggedIn, logout, refresh, setCurrentWeather, cloudAvailable } = useApp();
  const toast = useToast();
  const [bodyPhotoBusy, setBodyPhotoBusy] = useState(false);
  const [tempDraft, setTempDraft] = useState(
    settings.manualWeather ? String(settings.manualWeather.temp) : '',
  );

  useEffect(() => {
    setTempDraft(settings.manualWeather ? String(settings.manualWeather.temp) : '');
  }, [settings.manualWeather]);

  const handleBodyPhoto = async () => {
    setBodyPhotoBusy(true);
    try {
      const picked = await pickImage('library');
      if (!picked) return;
      const uri = await persistImage(picked.uri, `body-photo-${Date.now().toString(36)}`);
      if (settings.bodyPhotoUrl) await deletePersistedImage(settings.bodyPhotoUrl);
      await updateSettings({ bodyPhotoUrl: uri });
      toast.success('Body photo saved', 'It stays on this device and is only sent when you render a try-on.');
    } catch (e) {
      toast.error('Could not read that photo', errorMessage(e, 'Please try another image.'));
    } finally {
      setBodyPhotoBusy(false);
    }
  };

  const handleClearBodyPhoto = async () => {
    if (settings.bodyPhotoUrl) await deletePersistedImage(settings.bodyPhotoUrl);
    await updateSettings({ bodyPhotoUrl: undefined });
    toast.success('Body photo removed');
  };

  const applyManualWeather = async (tempRaw: string, condition: string) => {
    const temp = Number(tempRaw);
    if (!Number.isFinite(temp)) {
      toast.error('Invalid temperature', 'Enter a number.');
      return;
    }
    await updateSettings({ manualWeather: { temp, condition } });
    const tempC = settings.temperatureUnit === 'f' ? ((temp - 32) * 5) / 9 : temp;
    setCurrentWeather({
      tempC,
      condition,
      location: 'Manual',
      source: 'manual',
      fetchedAt: new Date().toISOString(),
    });
    toast.success('Weather updated');
  };

  const handleClearData = async () => {
    const ok = await confirmAsync(
      'Are you absolutely sure?',
      'This will permanently delete all your wardrobe items, saved outfits, renders, body photo and preferences.',
      'Delete Everything',
    );
    if (!ok) return;
    try {
      if (settings.bodyPhotoUrl) await deletePersistedImage(settings.bodyPhotoUrl);
      const driver = getStorageDriver();
      if (driver.clear) await driver.clear();
      await refresh();
      toast.success('Data cleared', 'All wardrobe and outfit data has been removed.');
    } catch (e) {
      toast.error('Could not clear data', errorMessage(e));
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Logged out', 'You have been logged out successfully.');
    } catch (e) {
      toast.error('Logout failed', errorMessage(e));
    }
  };

  return (
    <Screen>
      <Header title="Settings" back />

      <SectionTitle>Account</SectionTitle>
      <Card style={styles.section}>
        {isLoggedIn ? (
          <View style={{ gap: spacing.md }}>
            <View>
              <Text style={styles.statusLabel}>Signed in</Text>
              <Muted>Your data syncs across devices</Muted>
            </View>
            <Button title="Log out" variant="outline" onPress={handleLogout} />
          </View>
        ) : (
          <View style={{ gap: spacing.md }}>
            <Muted>
              {cloudAvailable
                ? 'Sign in to sync your wardrobe and outfits across all your devices.'
                : 'Cloud sync is not configured. You can still use FitBuilder offline on this device.'}
            </Muted>
            <Button title="Log in or Sign up" full onPress={() => router.push('/auth/login')} />
          </View>
        )}
      </Card>

      <SectionTitle>Body photo for try-on</SectionTitle>
      <Card style={styles.section}>
        <Muted style={{ marginBottom: spacing.md }}>
          A full-body photo, front-facing, in fitted clothes on a plain background works best. Stored only on this
          device.
        </Muted>
        {settings.bodyPhotoUrl ? (
          <View style={styles.bodyPhotoRow}>
            <Image source={{ uri: settings.bodyPhotoUrl }} style={styles.bodyPhoto} />
            <View style={{ flex: 1, gap: spacing.sm }}>
              <Button
                title="Replace photo"
                variant="outline"
                size="sm"
                icon={<Camera size={16} color={colors.foreground} />}
                loading={bodyPhotoBusy}
                onPress={handleBodyPhoto}
              />
              <Button title="Remove" variant="ghost" size="sm" onPress={handleClearBodyPhoto} />
            </View>
          </View>
        ) : (
          <Button
            title={bodyPhotoBusy ? 'Preparing…' : 'Add a body photo'}
            variant="outline"
            full
            icon={<Camera size={18} color={colors.foreground} />}
            loading={bodyPhotoBusy}
            onPress={handleBodyPhoto}
            style={styles.dashedBtn}
          />
        )}
      </Card>

      <SectionTitle>Weather</SectionTitle>
      <Card style={styles.section}>
        <Text style={styles.fieldLabel}>Temperature unit</Text>
        <ChipRow style={{ marginBottom: spacing.md }}>
          <Chip
            label="°C"
            selected={settings.temperatureUnit === 'c'}
            onPress={() => updateSettings({ temperatureUnit: 'c' })}
          />
          <Chip
            label="°F"
            selected={settings.temperatureUnit === 'f'}
            onPress={() => updateSettings({ temperatureUnit: 'f' })}
          />
        </ChipRow>

        <SwitchRow
          label="Use my location"
          description="Get weather-aware outfit suggestions when location is available"
          value={settings.useLocation}
          onValueChange={async (checked) => {
            await updateSettings({ useLocation: checked });
            if (checked) toast.success('Location enabled', 'FitBuilder will use weather data for suggestions.');
          }}
        />

        <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>Manual weather</Text>
        <Muted style={{ marginBottom: spacing.sm }}>
          Set today's conditions when location weather is unavailable.
        </Muted>
        <Field
          label={`Temperature (°${settings.temperatureUnit.toUpperCase()})`}
          keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'}
          value={tempDraft}
          onChangeText={setTempDraft}
          placeholder={settings.temperatureUnit === 'f' ? '68' : '20'}
        />
        <Text style={[styles.fieldLabel, { marginTop: spacing.sm }]}>Condition</Text>
        <ChipRow>
          {CONDITIONS.map((c) => (
            <Chip
              key={c}
              label={c}
              selected={settings.manualWeather?.condition === c}
              onPress={() =>
                applyManualWeather(tempDraft || String(settings.manualWeather?.temp ?? (settings.temperatureUnit === 'f' ? 68 : 20)), c)
              }
            />
          ))}
        </ChipRow>
        <Button
          title="Save weather"
          variant="secondary"
          size="sm"
          style={{ marginTop: spacing.md }}
          onPress={() =>
            applyManualWeather(
              tempDraft || String(settings.manualWeather?.temp ?? (settings.temperatureUnit === 'f' ? 68 : 20)),
              settings.manualWeather?.condition ?? 'Sunny',
            )
          }
        />
      </Card>

      <SectionTitle>Outfit preferences</SectionTitle>
      <Card style={styles.section}>
        <SwitchRow
          label="Auto-process uploads"
          description="Remove the background, tag the garment and make a ghost render on every upload"
          value={!!settings.autoProcessUploads}
          onValueChange={(checked) => updateSettings({ autoProcessUploads: checked })}
        />
        <SwitchRow
          label="Allow virtual items"
          description="AI can suggest items you don't own yet"
          value={settings.allowVirtualItems}
          onValueChange={(checked) => updateSettings({ allowVirtualItems: checked })}
        />
      </Card>

      <SectionTitle>API</SectionTitle>
      <ApiStatus />

      <SectionTitle>Data management</SectionTitle>
      <Card style={styles.section}>
        <Muted style={{ marginBottom: spacing.md }}>
          Clear all locally stored wardrobe and outfit data. This action cannot be undone.
        </Muted>
        <Button title="Clear all data" variant="destructive" full onPress={handleClearData} />
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionHeading}>About FitBuilder</Text>
        <Muted>Version 0.2.0</Muted>
        <Muted>Your personal AI-powered wardrobe assistant</Muted>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  sectionHeading: { fontSize: 17, fontWeight: '600', color: colors.foreground },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusLabel: { fontWeight: '600', fontSize: 14, color: colors.foreground },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotSm: { width: 8, height: 8, borderRadius: 4 },
  providerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  providerName: { fontWeight: '600', width: 72, fontSize: 13, color: colors.foreground },
  providerRole: { flex: 1, fontSize: 12, color: colors.mutedForeground },
  bodyPhotoRow: { flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' },
  bodyPhoto: {
    width: 112,
    height: 148,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dashedBtn: { borderStyle: 'dashed', height: 72 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.foreground, marginBottom: spacing.sm },
});
