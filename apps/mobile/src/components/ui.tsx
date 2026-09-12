import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch as RNSwitch,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { colors, radius, shadow, spacing } from '../theme';

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/**
 * iOS slides the whole view; Android resizes the window itself, so `height`
 * there would double-count and leave a gap.
 */
const kavBehavior = Platform.OS === 'ios' ? 'padding' : undefined;

export const Screen: React.FC<{
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  /** Lift content above the on-screen keyboard. On by default. */
  avoidKeyboard?: boolean;
  /** Extra offset when a header or tab bar sits above the content. */
  keyboardOffset?: number;
}> = ({
  children,
  scroll = true,
  padded = true,
  style,
  contentStyle,
  edges = ['top', 'left', 'right'],
  avoidKeyboard = true,
  keyboardOffset = 0,
}) => (
  <SafeAreaView edges={edges} style={[styles.screen, style]}>
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={avoidKeyboard ? kavBehavior : undefined}
      keyboardVerticalOffset={keyboardOffset}
      enabled={avoidKeyboard}
    >
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[padded && styles.padded, styles.scrollContent, contentStyle]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, padded && styles.padded, contentStyle]}>{children}</View>
      )}
    </KeyboardAvoidingView>
  </SafeAreaView>
);

/**
 * Bottom sheet that stays above the keyboard.
 *
 * A plain `Modal` with a bottom-anchored child leaves any `TextInput` hidden
 * behind the keyboard, which is what happened on the add-garment and save-fit
 * sheets. The content also scrolls, so a tall sheet stays reachable on a short
 * screen once the keyboard takes half the viewport.
 */
export const Sheet: React.FC<{
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}> = ({ visible, onClose, children, contentStyle }) => {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.sheetRoot}>
        <Pressable style={styles.sheetBackdrop} onPress={onClose} accessibilityLabel="Close" />
        <KeyboardAvoidingView behavior={kavBehavior} style={styles.sheetShift}>
          <View style={[styles.sheetBody, { paddingBottom: spacing.xl + insets.bottom }, contentStyle]}>
            <View style={styles.sheetGrip} />
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.sheetScroll}
              bounces={false}
            >
              {children}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

export const Header: React.FC<{
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: React.ReactNode;
}> = ({ title, subtitle, back, right }) => {
  const router = useRouter();
  return (
    <View style={styles.header}>
      {back ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={styles.backBtn}
          hitSlop={8}
        >
          <ChevronLeft size={22} color={colors.foreground} />
        </Pressable>
      ) : null}
      <View style={styles.flex}>
        <Text style={styles.h1}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
};

export const Card: React.FC<{ children: React.ReactNode; style?: StyleProp<ViewStyle> }> = ({ children, style }) => (
  <View style={[styles.card, style]}>{children}</View>
);

export const SectionTitle: React.FC<{ children: React.ReactNode; right?: React.ReactNode }> = ({ children, right }) => (
  <View style={styles.sectionRow}>
    <Text style={styles.sectionTitle}>{children}</Text>
    {right}
  </View>
);

export const Muted: React.FC<{ children: React.ReactNode; style?: StyleProp<TextStyle> }> = ({ children, style }) => (
  <Text style={[styles.muted, style]}>{children}</Text>
);

export const EmptyState: React.FC<{ icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode }> = ({
  icon,
  title,
  description,
  action,
}) => (
  <View style={styles.empty}>
    {icon ? <View style={styles.emptyIcon}>{icon}</View> : null}
    <Text style={styles.emptyTitle}>{title}</Text>
    {description ? <Text style={styles.emptyDesc}>{description}</Text> : null}
    {action ? <View style={{ marginTop: spacing.lg }}>{action}</View> : null}
  </View>
);

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
type ButtonSize = 'sm' | 'md' | 'lg';

const variantStyles: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.primary, fg: colors.primaryForeground },
  secondary: { bg: colors.secondary, fg: colors.secondaryForeground },
  outline: { bg: colors.card, fg: colors.foreground, border: colors.border },
  ghost: { bg: 'transparent', fg: colors.foreground },
  destructive: { bg: colors.destructiveSoft, fg: colors.destructive },
};

const sizeStyles: Record<ButtonSize, { h: number; px: number; fs: number }> = {
  sm: { h: 36, px: 14, fs: 13 },
  md: { h: 46, px: 18, fs: 15 },
  lg: { h: 54, px: 22, fs: 16 },
};

export const Button: React.FC<
  PressableProps & {
    title: string;
    variant?: ButtonVariant;
    size?: ButtonSize;
    icon?: React.ReactNode;
    loading?: boolean;
    full?: boolean;
    style?: StyleProp<ViewStyle>;
  }
> = ({ title, variant = 'primary', size = 'md', icon, loading, full, disabled, style, ...rest }) => {
  const v = variantStyles[variant];
  const s = sizeStyles[size];
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: v.bg,
          height: s.h,
          paddingHorizontal: s.px,
          borderWidth: v.border ? 1 : 0,
          borderColor: v.border,
          opacity: isDisabled ? 0.55 : pressed ? 0.85 : 1,
          alignSelf: full ? 'stretch' : 'flex-start',
        },
        style,
      ]}
      {...rest}
    >
      {loading ? <ActivityIndicator color={v.fg} size="small" /> : icon}
      <Text style={[styles.buttonText, { color: v.fg, fontSize: s.fs }]}>{title}</Text>
    </Pressable>
  );
};

export const IconButton: React.FC<PressableProps & { children: React.ReactNode; tone?: 'muted' | 'primary'; style?: StyleProp<ViewStyle> }> = ({
  children,
  tone = 'muted',
  style,
  ...rest
}) => (
  <Pressable
    accessibilityRole="button"
    hitSlop={6}
    style={({ pressed }) => [
      styles.iconBtn,
      tone === 'primary' && { backgroundColor: colors.primarySoft },
      pressed && { opacity: 0.7 },
      style,
    ]}
    {...rest}
  >
    {children}
  </Pressable>
);

export const Chip: React.FC<{
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: 'default' | 'success' | 'warning' | 'error' | 'info';
  icon?: React.ReactNode;
  small?: boolean;
}> = ({ label, selected, onPress, tone = 'default', icon, small }) => {
  const toneBg =
    tone === 'success' ? colors.successSoft : tone === 'warning' ? colors.warningSoft : tone === 'error' ? colors.destructiveSoft : tone === 'info' ? colors.secondarySoft : undefined;
  const toneFg =
    tone === 'success' ? colors.success : tone === 'warning' ? colors.warning : tone === 'error' ? colors.destructive : tone === 'info' ? colors.secondary : undefined;
  const bg = selected ? colors.foreground : toneBg ?? colors.card;
  const fg = selected ? colors.background : toneFg ?? colors.foreground;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.chip,
        small && styles.chipSmall,
        { backgroundColor: bg, borderColor: selected || toneBg ? bg : colors.border, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      {icon}
      <Text style={[styles.chipText, small && { fontSize: 11 }, { color: fg }]}>{label}</Text>
    </Pressable>
  );
};

export const ChipRow: React.FC<{ children: React.ReactNode; scroll?: boolean; style?: StyleProp<ViewStyle> }> = ({ children, scroll, style }) =>
  scroll ? (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chipRow, style]}>
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.chipRow, styles.wrap, style]}>{children}</View>
  );

export const Field: React.FC<TextInputProps & { label?: string; hint?: string }> = ({ label, hint, style, ...rest }) => (
  <View style={styles.field}>
    {label ? <Text style={styles.label}>{label}</Text> : null}
    <TextInput placeholderTextColor={colors.mutedForeground} style={[styles.input, style]} {...rest} />
    {hint ? <Text style={styles.hint}>{hint}</Text> : null}
  </View>
);

export const Segmented: React.FC<{
  options: { key: string; label: string; disabled?: boolean }[];
  value: string;
  onChange: (key: string) => void;
}> = ({ options, value, onChange }) => (
  <View style={styles.segmented}>
    {options.map((o) => {
      const active = o.key === value;
      return (
        <Pressable
          key={o.key}
          accessibilityRole="button"
          disabled={o.disabled}
          onPress={() => onChange(o.key)}
          style={[styles.segment, active && styles.segmentActive, o.disabled && { opacity: 0.4 }]}
        >
          <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{o.label}</Text>
        </Pressable>
      );
    })}
  </View>
);

export const SwitchRow: React.FC<{ label: string; description?: string; value: boolean; onValueChange: (v: boolean) => void }> = ({
  label,
  description,
  value,
  onValueChange,
}) => (
  <View style={styles.switchRow}>
    <View style={styles.flex}>
      <Text style={styles.switchLabel}>{label}</Text>
      {description ? <Text style={styles.hint}>{description}</Text> : null}
    </View>
    <RNSwitch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ true: colors.primary, false: colors.muted }}
      thumbColor={colors.card}
    />
  </View>
);

export const Divider = () => <View style={styles.divider} />;

// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.background },
  padded: { paddingHorizontal: spacing.lg },
  scrollContent: { paddingBottom: 120, gap: spacing.lg, maxWidth: 720, width: '100%', alignSelf: 'center' },

  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(20,18,16,0.45)',
  },
  sheetShift: { width: '100%' },
  sheetBody: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    // Never taller than most of the screen, so the sheet stays dismissable.
    maxHeight: '88%',
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  sheetGrip: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  sheetScroll: { gap: spacing.lg, paddingBottom: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.xs },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  h1: { fontSize: 26, fontWeight: '700', color: colors.foreground, letterSpacing: -0.4 },
  subtitle: { fontSize: 13, color: colors.mutedForeground, marginTop: 2 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadow.card,
  },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.mutedForeground, textTransform: 'uppercase', letterSpacing: 0.6 },
  muted: { color: colors.mutedForeground, fontSize: 13 },
  empty: { alignItems: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: colors.foreground, textAlign: 'center' },
  emptyDesc: { fontSize: 13, color: colors.mutedForeground, textAlign: 'center', marginTop: spacing.xs, maxWidth: 300 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
  },
  buttonText: { fontWeight: '600' },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 34,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  chipSmall: { height: 24, paddingHorizontal: 9 },
  chipText: { fontSize: 13, fontWeight: '500' },
  chipRow: { flexDirection: 'row', gap: spacing.sm },
  wrap: { flexWrap: 'wrap' },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: colors.foreground },
  hint: { fontSize: 12, color: colors.mutedForeground },
  input: {
    height: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.input,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    fontSize: 15,
    color: colors.foreground,
  },
  segmented: { flexDirection: 'row', backgroundColor: colors.muted, borderRadius: radius.md, padding: 4 },
  segment: { flex: 1, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  segmentActive: { backgroundColor: colors.card, ...shadow.card },
  segmentText: { fontSize: 13, fontWeight: '500', color: colors.mutedForeground },
  segmentTextActive: { color: colors.foreground, fontWeight: '600' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  switchLabel: { fontSize: 15, fontWeight: '500', color: colors.foreground },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
});
