import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useApp } from '@fitbuilder/core';
import { useToast } from '@/hooks/use-toast';
import { describeAuthError } from '@/lib/apiErrors';
import { AuthShell } from './AuthShell';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useApp();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await login(email, password);
      toast({ title: 'Welcome back', description: 'Your wardrobe is syncing.' });
      navigate('/');
    } catch (err) {
      const message = describeAuthError(err, 'Sign in failed');
      setError(`${message.title}. ${message.description}`);
      toast({ ...message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to sync your wardrobe">
      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <div className="relative mt-2">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10"
              required
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/auth/forgot-password" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative mt-2">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10"
              required
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full h-12" disabled={isLoading}>
          {isLoading ? 'Signing in…' : 'Sign In'}
        </Button>
      </form>

      <div className="mt-6 text-center space-y-3">
        <p className="text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link to="/auth/signup" className="text-primary font-medium hover:underline">
            Sign up
          </Link>
        </p>
        <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="text-muted-foreground">
          Continue as Guest
        </Button>
      </div>
    </AuthShell>
  );
}
