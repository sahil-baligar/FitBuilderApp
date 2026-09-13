import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

/** Shared chrome for every account screen so they stay visually identical. */
export const AuthShell = ({ title, subtitle, children }: AuthShellProps) => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 to-secondary/10 flex flex-col page-transition">
      <div className="p-6">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')} aria-label="Back to FitBuilder">
          <ArrowLeft className="w-5 h-5" />
        </Button>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 pb-24">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold font-heading mb-2">{title}</h1>
            {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="bg-card rounded-3xl p-8 border border-border shadow-lg">{children}</div>
        </div>
      </div>
    </div>
  );
};
