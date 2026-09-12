import { useNavigate } from 'react-router-dom';
import { Shirt, Sparkles, BookmarkCheck, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WeatherCard } from '@/components/WeatherCard';
import { useApp } from '@/contexts/AppContext';

export default function Home() {
  const navigate = useNavigate();
  const { wardrobe, outfits, isLoggedIn } = useApp();

  const quickActions = [
    {
      icon: Plus,
      label: 'Add Clothes',
      description: 'Photo or upload',
      color: 'bg-primary',
      onClick: () => navigate('/wardrobe?action=add'),
    },
    {
      icon: Sparkles,
      label: 'Build a Fit',
      description: 'Create outfit',
      color: 'bg-secondary',
      onClick: () => navigate('/build'),
    },
    {
      icon: Shirt,
      label: 'AI Stylist',
      description: 'Get suggestions',
      color: 'bg-accent',
      onClick: () => navigate('/ai-stylist'),
    },
    {
      icon: BookmarkCheck,
      label: 'Saved Fits',
      description: `${outfits.length} outfits`,
      color: 'bg-muted',
      onClick: () => navigate('/library'),
    },
  ];

  return (
    <div className="min-h-screen pb-20 page-transition">
      {/* Header */}
      <div className="bg-gradient-to-b from-primary/5 to-transparent pt-8 pb-12 px-6">
        <div className="max-w-2xl mx-auto">
          <div className="mb-6">
            <h1 className="text-4xl font-bold font-heading text-foreground mb-2">
              FitForge
            </h1>
            <p className="text-muted-foreground">
              Your personal style assistant
            </p>
          </div>

          {!isLoggedIn && (
            <div className="bg-card/80 backdrop-blur-sm rounded-2xl p-4 border border-border/50 mb-6">
              <p className="text-sm text-muted-foreground mb-3">
                Sign in to sync your wardrobe across devices
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/auth/login')}
                className="w-full"
              >
                Log in or Sign up
              </Button>
            </div>
          )}

          <WeatherCard />
        </div>
      </div>

      {/* Quick Stats */}
      <div className="px-6 mb-8 max-w-2xl mx-auto">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-card rounded-2xl p-4 border border-border">
            <div className="text-3xl font-bold font-heading text-primary mb-1">
              {wardrobe.length}
            </div>
            <div className="text-sm text-muted-foreground">Items in wardrobe</div>
          </div>
          <div className="bg-card rounded-2xl p-4 border border-border">
            <div className="text-3xl font-bold font-heading text-secondary mb-1">
              {outfits.length}
            </div>
            <div className="text-sm text-muted-foreground">Saved outfits</div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="px-6 max-w-2xl mx-auto">
        <h2 className="text-lg font-semibold font-heading mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-4">
          {quickActions.map((action, index) => (
            <button
              key={index}
              onClick={action.onClick}
              className="bg-card rounded-2xl p-6 border border-border text-left transition-all hover:shadow-lg hover:scale-105 active:scale-95 tap-target"
            >
              <div className={`${action.color} w-12 h-12 rounded-xl flex items-center justify-center mb-3`}>
                <action.icon className="w-6 h-6 text-white" />
              </div>
              <div className="font-semibold font-heading mb-1">{action.label}</div>
              <div className="text-xs text-muted-foreground">{action.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Onboarding Section */}
      {wardrobe.length === 0 && (
        <div className="px-6 mt-8 max-w-2xl mx-auto">
          <div className="bg-gradient-to-br from-primary/10 to-secondary/10 rounded-2xl p-6 border border-primary/20">
            <h3 className="text-lg font-semibold font-heading mb-2">
              Welcome to FitForge! 👋
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Start by adding some clothes to your wardrobe. Take photos or upload images of your favorite pieces.
            </p>
            <Button onClick={() => navigate('/wardrobe?action=add')} className="w-full">
              Add Your First Item
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
