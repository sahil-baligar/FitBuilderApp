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
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border bottom-nav-safe z-50">
      <div className="flex justify-around items-center h-16 max-w-2xl mx-auto px-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end
            className="flex flex-col items-center justify-center flex-1 h-full tap-target transition-colors"
            activeClassName="text-primary"
          >
            {({ isActive }) => (
              <>
                <item.icon className={cn("w-6 h-6 mb-1", isActive && "fill-primary/20")} />
                <span className={cn("text-xs font-medium", isActive ? "text-primary" : "text-muted-foreground")}>
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
