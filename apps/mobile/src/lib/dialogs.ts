import { Alert, Platform } from 'react-native';

/** Cross-platform confirm: window.confirm on web, Alert on native. */
export const confirmAsync = (title: string, message?: string, confirmLabel = 'Confirm'): Promise<boolean> => {
  if (Platform.OS === 'web') {
    const g = globalThis as unknown as { confirm?: (m: string) => boolean };
    return Promise.resolve(g.confirm ? g.confirm(message ? `${title}\n\n${message}` : title) : true);
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
};
