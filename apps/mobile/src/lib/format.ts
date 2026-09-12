import type { ClothingCategory, ClothingItem, UserPreferences, WeatherBand } from '@fitbuilder/core';

export const CATEGORIES: { key: ClothingCategory; label: string }[] = [
  { key: 'top', label: 'Tops' },
  { key: 'bottom', label: 'Bottoms' },
  { key: 'outerwear', label: 'Outerwear' },
  { key: 'shoes', label: 'Shoes' },
  { key: 'accessories', label: 'Accessories' },
];

export const categoryLabel = (c: ClothingCategory) => CATEGORIES.find((x) => x.key === c)?.label ?? c;

export const WEATHER_BANDS: WeatherBand[] = ['cold', 'cool', 'warm', 'hot'];

export const CONDITIONS = ['Sunny', 'Cloudy', 'Rainy', 'Windy', 'Snowy'];

export const displayImage = (item: ClothingItem) => item.ghostImageUrl ?? item.cutoutImageUrl ?? item.imageUrl;

export const formatTemp = (tempC: number, unit: UserPreferences['temperatureUnit']) =>
  `${Math.round(unit === 'f' ? (tempC * 9) / 5 + 32 : tempC)}°${unit.toUpperCase()}`;

export const errorMessage = (e: unknown, fallback = 'Something went wrong') =>
  e instanceof Error && e.message ? e.message : fallback;

export const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
};

export const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
