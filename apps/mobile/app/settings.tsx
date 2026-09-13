import React, { useCallback, useEffect, useState } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BadgeCheck, Camera, KeyRound, LogOut, MailWarning, RefreshCw, Trash2 } from 'lucide-react-native';
import {
  deleteAccount,
  getHealth,
  getStorageDriver,
  getUsage,
  resendVerification,
  useApp,
  type HealthResponse,
  type MeteredAction,
  type UsageResponse,
} from '@fitbuilder/core';
import {
  Button,
  Card,
  Chip,
  ChipRow,
  Divider,
  Field,
  Header,
  Muted,
  Notice,
  Screen,
  SectionTitle,
  Sheet,
  SwitchRow,
} from '../src/components/ui';
import { useToast } from '../src/components/Toast';
import { confirmAsync } from '../src/lib/dialogs';
import { CONDITIONS, errorMessage } from '../src/lib/format';
import { deletePersistedImage, pickImage, persistImage } from '../src/lib/images';
import { ACTION_LABEL, describeApiError, formatResetDate } from '../src/lib/quota';
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

const ACTION_ORDER: MeteredAction[] = ['garments', 'tryons', 'styleframes', 'stylist'];

type UsageState =
  | { status: 'loading' }
  | { status: 'ready'; usage: UsageResponse }
  | { status: 'signedOut' }
  | { status: 'error'; message: string };

/**
 * What is left of this month's allowance. The API is the authority, so this
 * never guesses from local counts — and it has to survive being signed out or
 * having no API at all, both of which are ordinary states here.
 */
const UsageSection = () => {
  const { account } = useApp();
  const [state, setState] = useState<UsageState>({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      setState({ status: 'ready', usage: await getUsage() });
    } catch (err) {
      const described = describeApiError(err, 'Could not load your usage');
      // In local development the API runs open and answers anonymously, so a
      // signed-out reader can still get real numbers; only a 401 means the
      // deployment wants an account.
      setState(described.kind === 'auth' ? { status: 'signedOut' } : { status: 'error', message: described.message });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, account?.id]);

  return (
    <Card style={styles.section}>
      <View style={styles.rowBetween}>
        <Text style={styles.sectionHeading}>This month</Text>
        <Button
          title="Refresh"
          variant="ghost"
          size="sm"
          icon={<RefreshCw size={16} color={colors.foreground} />}
          onPress={load}
          disabled={state.status === 'loading'}
        />
      </View>

      {state.status === 'loading' ? <Muted>Loading your allowance…</Muted> : null}

      {state.status === 'signedOut' ? (
        <Muted>Sign in to see how much of this month&apos;s allowance is left.</Muted>
      ) : null}

      {state.status === 'error' ? <Muted>{state.message}</Muted> : null}

      {state.status === 'ready' ? (
        <View style={{ gap: spacing.md }}>
          {ACTION_ORDER.map((action) => {
            const line = state.usage.quota[action];
            if (!line) return null;
            const proOnly = line.limit <= 0;
            const pct = proOnly || line.limit === 0 ? 0 : Math.min(1, line.used / line.limit);
            return (
              <View key={action} style={{ gap: 6 }}>
                <View style={styles.rowBetween}>
                  <Text style={styles.usageLabel}>{ACTION_LABEL[action]}</Text>
                  {proOnly ? (
                    <Chip small label="Pro only" tone="warning" />
                  ) : (
                    <Text style={[styles.usageValue, line.remaining === 0 && { color: colors.warning }]}>
                      {line.remaining} of {line.limit} left
                    </Text>
                  )}
                </View>
                <View style={styles.meterTrack}>
                  <View
                    style={[
                      styles.meterFill,
                      {
                        width: `${Math.round(pct * 100)}%`,
                        backgroundColor: line.remaining === 0 ? colors.warning : colors.primary,
                      },
                    ]}
                  />
                </View>
              </View>
            );
          })}
          <Muted>
            {state.usage.tier === 'pro' ? 'Pro plan' : 'Free plan'} · resets on {formatResetDate(state.usage.resetsAt)}
          </Muted>
        </View>
      ) : null}
    </Card>
  );
};

/**
 * Email, verification, plan, and the destructive account actions.
 *
 * Deleting is a real deletion, not a support ticket: it asks for the password,
 * says plainly that it cannot be undone, and confirms before calling the API.
 */
const AccountSection = () => {
  const router = useRouter();
  const { account, logout, reloadAccount } = useApp();
  const toast = useToast();
  const [resending, setResending] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleResend = async () => {
    setResending(true);
    try {
      await resendVerification();
      toast.success('Email sent', 'Check your inbox for a fresh confirmation link.');
    } catch (e) {
      const described = describeApiError(e, 'Could not resend the email');
      toast.error(described.title, described.message);
    } finally {
      setResending(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Signed out', 'Your wardrobe stays on this device.');
    } catch (e) {
      toast.error('Sign out failed', errorMessage(e));
    }
  };

  const closeDelete = () => {
    setDeleteOpen(false);
    setDeletePassword('');
    setDeleteError(null);
  };

  const handleDelete = async () => {
    if (!deletePassword) {
      setDeleteError('Enter your password to confirm.');
      return;
    }
    const ok = await confirmAsync(
      'Delete your FitBuilder account?',
      'Your account, synced wardrobe, outfits and renders are permanently deleted. This cannot be undone.',
      'Delete account',
    );
    if (!ok) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccount(deletePassword);
      closeDelete();
      toast.success('Account deleted', 'Everything stored on our servers has been removed.');
      router.replace('/');
    } catch (e) {
      setDeleteError(describeApiError(e, 'Could not delete the account').message);
    } finally {
      setDeleting(false);
    }
  };

  if (!account) {
    return (
      <Card style={styles.section}>
        <View style={{ gap: spacing.md }}>
          <Muted>
            Sign in to sync your wardrobe across devices and to use garment processing, try-on and style frames.
          </Muted>
          <Button title="Sign in or create an account" full onPress={() => router.push('/auth/login')} />
        </View>
      </Card>
    );
  }

  return (
    <Card style={styles.section}>
      <View style={{ gap: spacing.md }}>
        <View>
          <Text style={styles.accountEmail}>{account.email}</Text>
          <View style={[styles.statusRow, { marginTop: spacing.sm, flexWrap: 'wrap' }]}>
            <Chip
              small
              label={account.emailVerified ? 'Email verified' : 'Email not verified'}
              tone={account.emailVerified ? 'success' : 'warning'}
              icon={
                account.emailVerified ? (
                  <BadgeCheck size={11} color={colors.success} />
                ) : (
                  <MailWarning size={11} color={colors.warning} />
                )
              }
            />
            <Chip small label={account.tier === 'pro' ? 'Pro plan' : 'Free plan'} tone="info" />
          </View>
        </View>

        {!account.emailVerified ? (
          <Notice
            tone="warning"
            title="Confirm your email address"
            body="Until this address is confirmed we cannot send you a password reset."
            action={
              <>
                <Button
                  title={resending ? 'Sending…' : 'Resend verification'}
                  size="sm"
                  loading={resending}
                  onPress={handleResend}
                />
                <Button title="I confirmed it" size="sm" variant="outline" onPress={() => void reloadAccount()} />
              </>
            }
          />
        ) : null}

        <Divider />

        <Button
          title="Change password"
          variant="outline"
          full
          icon={<KeyRound size={16} color={colors.foreground} />}
          onPress={() => router.push('/auth/change-password')}
        />
        <Button
          title="Sign out"
          variant="ghost"
          full
          icon={<LogOut size={16} color={colors.foreground} />}
          onPress={handleLogout}
        />
        <Button
          title="Delete account"
          variant="destructive"
          full
          icon={<Trash2 size={16} color={colors.destructive} />}
          onPress={() => setDeleteOpen(true)}
        />
      </View>

      <Sheet visible={deleteOpen} onClose={closeDelete}>
        <View style={{ gap: spacing.lg }}>
          <Text style={styles.sheetTitle}>Delete your account</Text>
          <Notice
            tone="error"
            title="This is permanent"
            body={`Deleting removes the account for ${account.email} along with everything synced to our servers: wardrobe items, outfits and renders. It cannot be undone, and the email address can be used to sign up again from scratch.`}
          />
          {deleteError ? <Notice tone="error" title="Could not delete the account" body={deleteError} /> : null}
          <Field
            label="Confirm with your password"
            value={deletePassword}
            onChangeText={(v) => {
              setDeletePassword(v);
              setDeleteError(null);
            }}
            placeholder="••••••••"
            secureTextEntry
            autoComplete="password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={handleDelete}
          />
          <View style={{ gap: spacing.sm }}>
            <Button
              title={deleting ? 'Deleting…' : 'Delete my account'}
              variant="destructive"
              full
              loading={deleting}
              disabled={!deletePassword}
              onPress={handleDelete}
            />
            <Button title="Keep my account" variant="ghost" full onPress={closeDelete} />
          </View>
        </View>
      </Sheet>
    </Card>
  );
};

export default function SettingsScreen() {
  const { settings, updateSettings, refresh, setCurrentWeather } = useApp();
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

  return (
    <Screen>
      <Header title="Settings" back />

      <SectionTitle>Account</SectionTitle>
      <AccountSection />

      <SectionTitle>Usage</SectionTitle>
      <UsageSection />

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
  accountEmail: { fontSize: 16, fontWeight: '600', color: colors.foreground },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: colors.foreground },
  usageLabel: { fontSize: 14, fontWeight: '500', color: colors.foreground },
  usageValue: { fontSize: 13, color: colors.mutedForeground },
  meterTrack: { height: 6, borderRadius: radius.full, backgroundColor: colors.muted, overflow: 'hidden' },
  meterFill: { height: '100%', borderRadius: radius.full },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.foreground, marginBottom: spacing.sm },
});
