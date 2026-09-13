import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, MailCheck } from 'lucide-react';
import { requestPasswordReset } from '@fitbuilder/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isOfflineError, offlineMessage } from '@/lib/apiErrors';
import { AuthShell } from './AuthShell';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await requestPasswordReset(email);
    } catch (err) {
      // Never let the outcome reveal whether the address has an account: only a
      // failure to reach the server at all is worth reporting.
      if (isOfflineError(err)) {
        setError(offlineMessage('').description);
        setIsLoading(false);
        return;
      }
    }
    setSent(true);
    setIsLoading(false);
  };

  if (sent) {
    return (
      <AuthShell title="Check your inbox" subtitle="One link is on its way">
        <div className="space-y-5 text-center">
          <div className="bg-primary/10 rounded-full w-16 h-16 flex items-center justify-center mx-auto">
            <MailCheck className="w-8 h-8 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground">
            If an account exists for <span className="font-medium text-foreground">{email}</span>, we have sent it a
            link to choose a new password. The link expires in an hour and can only be used once.
          </p>
          <p className="text-xs text-muted-foreground">
            Nothing arrived? Check your spam folder, then try again in a few minutes.
          </p>
          <Button asChild className="w-full h-12">
            <Link to="/auth/login">Back to sign in</Link>
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setSent(false)}>
            Use a different email
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Forgot password" subtitle="We will email you a link to reset it">
      <form onSubmit={handleSubmit} className="space-y-4">
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

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full h-12" disabled={isLoading}>
          {isLoading ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>

      <div className="mt-6 text-center">
        <p className="text-sm text-muted-foreground">
          Remembered it?{' '}
          <Link to="/auth/login" className="text-primary font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
