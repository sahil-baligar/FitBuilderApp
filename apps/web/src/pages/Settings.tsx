import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  Camera,
  Loader2,
  LogOut,
  MapPin,
  RefreshCw,
  Sparkles,
  Trash2,
  User,
  UserRound,
  Wand2,
  X,
} from 'lucide-react';
import { getHealth, getStorageDriver, useApp, type HealthResponse } from '@fitbuilder/core';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { prepareImage } from '@/lib/image';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

type HealthState =
  | { status: 'loading' }
  | { status: 'online'; health: HealthResponse; checkedAt: Date }
  | { status: 'offline'; error: string; checkedAt: Date };

const providerLabels: Record<keyof HealthResponse['providers'], { name: string; role: string }> = {
  fal: { name: 'fal.ai', role: 'Cutouts, ghost renders, try-on' },
  openai: { name: 'OpenAI', role: 'Cloud garment analysis, stylist' },
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
    <div className="bg-card rounded-2xl p-6 border border-border">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h2 className="text-lg font-semibold font-heading flex items-center gap-2">
          <Activity className="w-5 h-5" />
          API status
        </h2>
        <Button variant="ghost" size="sm" onClick={check} disabled={state.status === 'loading'} aria-label="Re-check API">
          {state.status === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </Button>
      </div>

      {state.status === 'loading' && <p className="text-sm text-muted-foreground">Checking…</p>}

      {state.status === 'offline' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-destructive" aria-hidden />
            <p className="font-medium text-sm">Offline</p>
          </div>
          <p className="text-sm text-muted-foreground">
            {state.error}. Image processing, try-on and the AI stylist are unavailable until the API is running; your
            wardrobe still works locally.
          </p>
        </div>
      )}

      {state.status === 'online' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`w-2.5 h-2.5 rounded-full ${state.health.ok ? 'bg-green-500' : 'bg-amber-500'}`} aria-hidden />
            <p className="font-medium text-sm">{state.health.ok ? 'Online' : 'Degraded'}</p>
            <Badge variant="outline" className="text-xs font-mono">
              v{state.health.version}
            </Badge>
            <span className="text-xs text-muted-foreground ml-auto">
              {state.checkedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <ul className="space-y-2">
            {(Object.keys(providerLabels) as (keyof HealthResponse['providers'])[]).map((key) => {
              const live = !!state.health.providers[key];
              return (
                <li key={key} className="flex items-center gap-3 text-sm">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${live ? 'bg-green-500' : 'bg-muted-foreground/40'}`} aria-hidden />
                  <span className="font-medium w-20 flex-shrink-0">{providerLabels[key].name}</span>
                  <span className="text-muted-foreground flex-1 truncate">{providerLabels[key].role}</span>
                  <span className={`text-xs ${live ? 'text-green-600' : 'text-muted-foreground'}`}>{live ? 'live' : 'off'}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

export default function Settings() {
  const { settings, updateSettings, isLoggedIn, logout } = useApp();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const bodyPhotoInputRef = useRef<HTMLInputElement>(null);
  const bodyPhotoSectionRef = useRef<HTMLDivElement>(null);
  const [bodyPhotoBusy, setBodyPhotoBusy] = useState(false);

  // Deep link from "See it on me" when no body photo is set.
  useEffect(() => {
    if (location.hash === '#body-photo') {
      bodyPhotoSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [location.hash]);

  const handleBodyPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBodyPhotoBusy(true);
    try {
      const prepared = await prepareImage(file);
      await updateSettings({ bodyPhotoUrl: prepared.dataUrl });
      toast({ title: 'Body photo saved', description: 'It stays on this device and is only sent when you render a try-on.' });
    } catch {
      toast({ title: 'Could not read that photo', description: 'Please try another image.', variant: 'destructive' });
    } finally {
      setBodyPhotoBusy(false);
    }
  };

  const handleClearData = async () => {
    try {
      const driver = getStorageDriver();
      if (driver.clear) await driver.clear();
      else localStorage.clear();
    } catch (err) {
      console.error('Failed to clear storage', err);
    }
    toast({
      title: 'Data cleared',
      description: 'All wardrobe and outfit data has been removed.',
    });
    setTimeout(() => {
      window.location.reload();
    }, 800);
  };

  return (
    <div className="min-h-screen pb-24 page-transition">
      {/* Header */}
      <div className="bg-gradient-to-b from-primary/5 to-transparent pt-8 pb-6 px-4 sm:px-6">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold font-heading">Settings</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Account Section */}
        <div className="bg-card rounded-2xl p-6 border border-border">
          <h2 className="text-lg font-semibold font-heading mb-4 flex items-center gap-2">
            <User className="w-5 h-5" />
            Account
          </h2>
          {isLoggedIn ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">Signed in</p>
                  <p className="text-sm text-muted-foreground">Your data syncs across devices</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    logout();
                    toast({
                      title: 'Logged out',
                      description: 'You have been logged out successfully.',
                    });
                  }}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Log out
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Sign in to sync your wardrobe and outfits across all your devices.
              </p>
              <Button onClick={() => navigate('/auth/login')} className="w-full">
                Log in or Sign up
              </Button>
            </div>
          )}
        </div>

        {/* Try-on */}
        <div ref={bodyPhotoSectionRef} id="body-photo" className="bg-card rounded-2xl p-6 border border-border scroll-mt-24">
          <h2 className="text-lg font-semibold font-heading mb-1 flex items-center gap-2">
            <UserRound className="w-5 h-5" />
            Body photo for try-on
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            A full-body photo, front-facing, in fitted clothes on a plain background works best. Stored only on this
            device.
          </p>
          <input ref={bodyPhotoInputRef} type="file" accept="image/*" className="hidden" onChange={handleBodyPhoto} />
          {settings.bodyPhotoUrl ? (
            <div className="flex gap-4 items-start">
              <div className="w-28 aspect-[3/4] rounded-xl overflow-hidden bg-muted border border-border flex-shrink-0">
                <img src={settings.bodyPhotoUrl} alt="Your body photo for try-on" className="w-full h-full object-cover" />
              </div>
              <div className="flex flex-col gap-2 flex-1 min-w-0">
                <Button variant="outline" size="sm" onClick={() => bodyPhotoInputRef.current?.click()} disabled={bodyPhotoBusy}>
                  {bodyPhotoBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Camera className="w-4 h-4 mr-2" />}
                  Replace photo
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={async () => {
                    await updateSettings({ bodyPhotoUrl: undefined });
                    toast({ title: 'Body photo removed' });
                  }}
                >
                  <X className="w-4 h-4 mr-2" />
                  Remove
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" className="w-full h-20 border-dashed" onClick={() => bodyPhotoInputRef.current?.click()} disabled={bodyPhotoBusy}>
              {bodyPhotoBusy ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Camera className="w-5 h-5 mr-2" />}
              {bodyPhotoBusy ? 'Preparing…' : 'Add a body photo'}
            </Button>
          )}
        </div>

        {/* Outfit Preferences */}
        <div className="bg-card rounded-2xl p-6 border border-border">
          <h2 className="text-lg font-semibold font-heading mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            Outfit Preferences
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="auto-process" className="font-medium flex items-center gap-1.5">
                  <Wand2 className="w-4 h-4" />
                  Auto-process uploads
                </Label>
                <p className="text-sm text-muted-foreground">
                  Remove the background, tag the garment and make a ghost render on every upload
                </p>
              </div>
              <Switch
                id="auto-process"
                checked={!!settings.autoProcessUploads}
                onCheckedChange={async (checked) => updateSettings({ autoProcessUploads: checked })}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="use-location" className="font-medium">
                  Use my location
                </Label>
                <p className="text-sm text-muted-foreground">Get weather-aware outfit suggestions</p>
              </div>
              <Switch
                id="use-location"
                checked={settings.useLocation}
                onCheckedChange={async (checked) => {
                  await updateSettings({ useLocation: checked });
                  if (checked) {
                    toast({
                      title: 'Location enabled',
                      description: 'FitBuilder will use weather data for suggestions.',
                    });
                  }
                }}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="virtual-items" className="font-medium">
                  Allow virtual items
                </Label>
                <p className="text-sm text-muted-foreground">AI can suggest items you don't own yet</p>
              </div>
              <Switch
                id="virtual-items"
                checked={settings.allowVirtualItems}
                onCheckedChange={async (checked) => updateSettings({ allowVirtualItems: checked })}
              />
            </div>
          </div>
        </div>

        <ApiStatus />

        {/* Privacy & Permissions */}
        <div className="bg-card rounded-2xl p-6 border border-border">
          <h2 className="text-lg font-semibold font-heading mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Privacy & Permissions
          </h2>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="bg-muted rounded-full p-2 mt-1">
                <MapPin className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm">Location Access</p>
                <p className="text-sm text-muted-foreground">
                  {settings.useLocation
                    ? 'FitBuilder can access your location to provide weather-based suggestions.'
                    : 'Enable location access in outfit preferences to get weather-based suggestions.'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="bg-muted rounded-full p-2 mt-1">
                <Camera className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm">Photos</p>
                <p className="text-sm text-muted-foreground">
                  Garment and body photos stay on this device. They are sent to the API only when you process an item
                  or render a try-on.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Data Management */}
        <div className="bg-card rounded-2xl p-6 border border-border">
          <h2 className="text-lg font-semibold font-heading mb-4 flex items-center gap-2">
            <Trash2 className="w-5 h-5" />
            Data Management
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Clear all locally stored wardrobe and outfit data. This action cannot be undone.
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="w-full">
                <Trash2 className="w-4 h-4 mr-2" />
                Clear All Data
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all your wardrobe items, saved outfits, renders, body photo and
                  preferences. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleClearData}>Delete Everything</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* About */}
        <div className="bg-card rounded-2xl p-6 border border-border">
          <h2 className="text-lg font-semibold font-heading mb-4">About FitBuilder</h2>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>Version 0.2.0</p>
            <p>Your personal AI-powered wardrobe assistant</p>
            <p className="pt-4 text-xs">
              FitBuilder helps you organize your wardrobe, build amazing outfits, and discover your personal style
              with AI assistance.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
