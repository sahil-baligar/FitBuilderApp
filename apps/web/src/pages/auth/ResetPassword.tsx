import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { resetPassword } from '@fitbuilder/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { describeAuthError } from '@/lib/apiErrors';
import { AuthShell } from './AuthShell';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const navigate = useNavigate();
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <AuthShell title="Link incomplete" subtitle="That reset link is missing its token">
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Open the link straight from the email, or request a fresh one — reset links expire after an hour.
          </p>
          <Button asChild className="w-full h-12">
            <Link to="/auth/forgot-password">Request a new link</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Those passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Please choose a password of at least 8 characters.');
      return;
    }

    setIsLoading(true);
    try {
      await resetPassword(token, password);
      toast({ title: 'Password updated', description: 'Sign in with your new password.' });
      navigate('/auth/login');
    } catch (err) {
      const message = describeAuthError(err, 'Could not reset your password');
      setError(`${message.title}. ${message.description}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell title="Choose a new password" subtitle="This signs you out everywhere else">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="password">New password</Label>
          <div className="relative mt-2">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10"
              minLength={8}
              required
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">At least 8 characters</p>
        </div>

        <div>
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <div className="relative mt-2">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pl-10"
              required
            />
          </div>
        </div>

        {error && (
          <div className="space-y-2" role="alert">
            <p className="text-sm text-destructive">{error}</p>
            <Link to="/auth/forgot-password" className="text-sm text-primary hover:underline">
              Request a new reset link
            </Link>
          </div>
        )}

        <Button type="submit" className="w-full h-12" disabled={isLoading}>
          {isLoading ? 'Saving…' : 'Set new password'}
        </Button>
      </form>

      <div className="mt-6 text-center">
        <Link to="/auth/login" className="text-sm text-muted-foreground hover:underline">
          Back to sign in
        </Link>
      </div>
    </AuthShell>
  );
}
