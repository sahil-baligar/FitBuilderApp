/**
 * Design tokens mirrored from apps/web/src/index.css (HSL → hex) so the
 * mobile app and the web app read as one product family.
 */
export const colors = {
  background: '#FAF9F7', // hsl(30 20% 98%)
  foreground: '#2A2523', // hsl(20 10% 15%)
  card: '#FFFFFF',
  cardForeground: '#2A2523',
  primary: '#E97963', // hsl(10 75% 65%)
  primaryForeground: '#FFFFFF',
  primarySoft: '#FBE7E2',
  secondary: '#70A9A9', // hsl(180 25% 55%)
  secondaryForeground: '#FFFFFF',
  secondarySoft: '#E3F0F0',
  muted: '#EEEBE7', // hsl(30 15% 92%)
  mutedForeground: '#7C706A', // hsl(20 8% 45%)
  accent: '#E4DBCD', // hsl(35 30% 85%)
  accentForeground: '#332D29',
  destructive: '#D74242', // hsl(0 65% 55%)
  destructiveForeground: '#FFFFFF',
  destructiveSoft: '#FBE4E4',
  border: '#E4E0DD', // hsl(30 12% 88%)
  input: '#E4E0DD',
  ring: '#E97963',
  success: '#3E9C6C',
  successSoft: '#E1F3E9',
  warning: '#D9922B',
  warningSoft: '#FBEEDA',
  overlay: 'rgba(42, 37, 35, 0.45)',
} as const;

export const radius = { sm: 10, md: 16, lg: 24, xl: 32, full: 999 } as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const shadow = {
  card: {
    shadowColor: colors.primary,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  fab: {
    shadowColor: colors.foreground,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
};
