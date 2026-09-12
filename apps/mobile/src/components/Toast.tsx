import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '../theme';

type ToastKind = 'info' | 'success' | 'error';

interface ToastMessage {
  id: number;
  title: string;
  description?: string;
  kind: ToastKind;
}

interface ToastApi {
  toast: (title: string, description?: string, kind?: ToastKind) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
};

const kindStyle: Record<ToastKind, { bg: string; fg: string; sub: string }> = {
  info: { bg: colors.foreground, fg: '#fff', sub: 'rgba(255,255,255,0.75)' },
  success: { bg: colors.success, fg: '#fff', sub: 'rgba(255,255,255,0.8)' },
  error: { bg: colors.destructive, fg: '#fff', sub: 'rgba(255,255,255,0.8)' },
};

const ToastItem: React.FC<{ item: ToastMessage; onDone: (id: number) => void }> = ({ item, onDone }) => {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: Platform.OS !== 'web' }).start();
    const t = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: Platform.OS !== 'web' }).start(() =>
        onDone(item.id),
      );
    }, 3200);
    return () => clearTimeout(t);
  }, [item.id, onDone, opacity]);
  const s = kindStyle[item.kind];
  return (
    <Animated.View style={[styles.toast, { backgroundColor: s.bg, opacity }]}>
      <Pressable onPress={() => onDone(item.id)}>
        <Text style={[styles.title, { color: s.fg }]}>{item.title}</Text>
        {item.description ? <Text style={[styles.desc, { color: s.sub }]}>{item.description}</Text> : null}
      </Pressable>
    </Animated.View>
  );
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<ToastMessage[]>([]);
  const counter = useRef(0);
  const insets = useSafeAreaInsets();

  const toast = useCallback((title: string, description?: string, kind: ToastKind = 'info') => {
    counter.current += 1;
    const id = counter.current;
    setItems((prev) => [...prev.slice(-2), { id, title, description, kind }]);
  }, []);

  const remove = useCallback((id: number) => setItems((prev) => prev.filter((t) => t.id !== id)), []);

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      success: (t, d) => toast(t, d, 'success'),
      error: (t, d) => toast(t, d, 'error'),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <View pointerEvents="box-none" style={[styles.host, { top: insets.top + spacing.md }]}>
        {items.map((item) => (
          <ToastItem key={item.id} item={item} onDone={remove} />
        ))}
      </View>
    </ToastContext.Provider>
  );
};

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 1000,
    gap: spacing.sm,
    alignItems: 'center',
  },
  toast: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    maxWidth: 420,
    width: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  title: { fontWeight: '600', fontSize: 14 },
  desc: { fontSize: 12, marginTop: 2 },
});
