import { MapPin, Sparkles, Trash2, LogOut, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useApp } from '@/contexts/AppContext';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
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

export default function Settings() {
  const { settings, updateSettings, isLoggedIn, logout } = useApp();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleClearData = () => {
    localStorage.clear();
    toast({
      title: 'Data cleared',
      description: 'All wardrobe and outfit data has been removed.',
    });
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  };

  return (
    <div className="min-h-screen pb-20 page-transition">
      {/* Header */}
      <div className="bg-gradient-to-b from-primary/5 to-transparent pt-8 pb-6 px-6">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold font-heading">Settings</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-6 space-y-6">
        {/* Account Section */}
        <div className="bg-card rounded-2xl p-6 border border-border">
          <h2 className="text-lg font-semibold font-heading mb-4 flex items-center gap-2">
            <User className="w-5 h-5" />
            Account
          </h2>
          {isLoggedIn ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Signed in</p>
                  <p className="text-sm text-muted-foreground">
                    Your data syncs across devices
                  </p>
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

        {/* Outfit Preferences */}
        <div className="bg-card rounded-2xl p-6 border border-border">
          <h2 className="text-lg font-semibold font-heading mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            Outfit Preferences
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="use-location" className="font-medium">
                  Use my location
                </Label>
                <p className="text-sm text-muted-foreground">
                  Get weather-aware outfit suggestions
                </p>
              </div>
              <Switch
                id="use-location"
                checked={settings.useLocation}
                onCheckedChange={async (checked) => {
                  await updateSettings({ useLocation: checked });
                  if (checked) {
                    toast({
                      title: 'Location enabled',
                      description: 'FitForge will use weather data for suggestions.',
                    });
                  }
                }}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="virtual-items" className="font-medium">
                  Allow virtual items
                </Label>
                <p className="text-sm text-muted-foreground">
                  AI can suggest items you don't own yet
                </p>
              </div>
              <Switch
                id="virtual-items"
                checked={settings.allowVirtualItems}
                onCheckedChange={async (checked) => updateSettings({ allowVirtualItems: checked })}
              />
            </div>
          </div>
        </div>

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
                    ? 'FitForge can access your location to provide weather-based suggestions.'
                    : 'Enable location access in outfit preferences to get weather-based suggestions.'}
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
                  This will permanently delete all your wardrobe items, saved outfits, and
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
          <h2 className="text-lg font-semibold font-heading mb-4">About FitForge</h2>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>Version 1.0.0</p>
            <p>Your personal AI-powered wardrobe assistant</p>
            <p className="pt-4 text-xs">
              FitForge helps you organize your wardrobe, build amazing outfits, and discover your
              personal style with AI assistance.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
