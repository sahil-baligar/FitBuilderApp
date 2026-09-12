import React from 'react';
import { Platform, type ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BookmarkCheck, Home, ShoppingBag, Sparkles, Wand2, type LucideIcon } from 'lucide-react-native';
import { colors } from '../../src/theme';

const icon =
  (Icon: LucideIcon) =>
  ({ color, focused }: { color: ColorValue; focused: boolean }) =>
    (
      <Icon
        size={23}
        color={typeof color === 'string' ? color : colors.mutedForeground}
        strokeWidth={focused ? 2.4 : 2}
        fill={focused ? `${colors.primary}33` : 'transparent'}
      />
    );

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, Platform.OS === 'web' ? 8 : 10);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 58 + bottomPad,
          paddingBottom: bottomPad,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon(Home) }} />
      <Tabs.Screen name="wardrobe" options={{ title: 'Wardrobe', tabBarIcon: icon(ShoppingBag) }} />
      <Tabs.Screen name="build" options={{ title: 'Build', tabBarIcon: icon(Sparkles) }} />
      <Tabs.Screen name="stylist" options={{ title: 'Stylist', tabBarIcon: icon(Wand2) }} />
      <Tabs.Screen name="library" options={{ title: 'Library', tabBarIcon: icon(BookmarkCheck) }} />
    </Tabs>
  );
}
