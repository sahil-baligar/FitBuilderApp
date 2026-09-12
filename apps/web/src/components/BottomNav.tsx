import { Home, ShoppingBag, Sparkles, BookmarkCheck, Settings } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/wardrobe', icon: ShoppingBag, label: 'Wardrobe' },
  { to: '/build', icon: Sparkles, label: 'Build' },
  { to: '/library', icon: BookmarkCheck, label: 'Library' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export const BottomNav = () => {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur border-t border-border bottom-nav-safe z-50"
      style={{ paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}
      aria-label="Primary"
    >
      <div className="flex justify-around items-center h-16 max-w-2xl mx-auto px-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end
            className="flex flex-col items-center justify-center flex-1 min-w-0 h-full tap-target transition-colors"
            activeClassName="text-primary"
          >
            {({ isActive }) => (
              <>
                <item.icon className={cn('w-6 h-6 mb-1', isActive && 'fill-primary/20')} />
                <span
                  className={cn(
                    'text-[11px] font-medium truncate max-w-full',
                    isActive ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  {item.label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
};
