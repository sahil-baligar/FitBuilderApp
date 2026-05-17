import type { WeatherInfo } from '@/types/models';
import { PreferencesRepository } from './repositories';

const apiBase = import.meta.env.VITE_API_BASE_URL ?? '/api';

export const fetchWeatherByCoords = async (lat: number, lon: number): Promise<WeatherInfo> => {
  const res = await fetch(`${apiBase}/weather?lat=${lat}&lon=${lon}`);
  if (!res.ok) {
    throw new Error('Unable to fetch weather');
  }
  return res.json();
};

export const useManualWeather = async () => {
  const prefs = await PreferencesRepository.get();
  if (!prefs.manualWeather) {
    throw new Error('Manual weather not configured');
  }
  return {
    tempC: prefs.temperatureUnit === 'f' ? ((prefs.manualWeather.temp - 32) * 5) / 9 : prefs.manualWeather.temp,
    condition: prefs.manualWeather.condition,
    location: 'Manual',
    source: 'manual',
    fetchedAt: new Date().toISOString(),
  } satisfies WeatherInfo;
};


