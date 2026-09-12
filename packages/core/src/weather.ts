import { getCoreConfig } from './env';
import { PreferencesRepository } from './repositories';
import type { WeatherInfo } from './types/models';

export const fetchWeatherByCoords = async (lat: number, lon: number): Promise<WeatherInfo> => {
  const { apiBaseUrl } = getCoreConfig();
  const res = await fetch(`${apiBaseUrl}/weather?lat=${lat}&lon=${lon}`);
  if (!res.ok) {
    throw new Error('Unable to fetch weather');
  }
  return res.json();
};

export const getManualWeather = async (): Promise<WeatherInfo> => {
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
  };
};

export const tempCToBand = (tempC: number): 'cold' | 'cool' | 'warm' | 'hot' => {
  if (tempC < 8) return 'cold';
  if (tempC < 18) return 'cool';
  if (tempC < 27) return 'warm';
  return 'hot';
};
