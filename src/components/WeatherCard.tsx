import { Cloud, MapPin } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';

export const WeatherCard = () => {
  const { currentWeather } = useApp();

  if (!currentWeather) return null;

  return (
    <div className="bg-card rounded-2xl p-4 shadow-sm border border-border">
      <div className="flex items-center gap-3">
        <div className="bg-secondary/10 rounded-full p-3">
          <Cloud className="w-6 h-6 text-secondary" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
            <MapPin className="w-3 h-3" />
            <span>{currentWeather.location}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-heading">{currentWeather.temp}°F</span>
            <span className="text-sm text-muted-foreground">{currentWeather.condition}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
