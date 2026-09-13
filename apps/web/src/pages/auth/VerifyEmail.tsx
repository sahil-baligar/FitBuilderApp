import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, MailWarning } from 'lucide-react';
import { useApp, verifyEmail } from '@fitbuilder/core';
import { Button } from '@/components/ui/button';
import { describeAuthError } from '@/lib/apiErrors';
import { AuthShell } from './AuthShell';

type State =
  | { status: 'verifying' }
  | { status: 'verified' }
  | { status: 'failed'; title: string; description: string };

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const { isLoggedIn, reloadAccount } = useApp();
  const [state, setState] = useState<State>(() =>
    token
      ? { status: 'verifying' }
      : {
          status: 'failed',
          title: 'Link incomplete',
          description: 'That verification link is missing its token. Open the link straight from the email.',
        },
  );
  // The effect must fire exactly once: a verification token is single-use.
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    let active = true;
    verifyEmail(token)
      .then(async () => {
        if (isLoggedIn) await reloadAccount().catch(() => undefined);
        if (active) setState({ status: 'verified' });
      })
      .catch((err) => {
        if (!active) return;
        const message = describeAuthError(err, 'Could not verify this address');
        setState({ status: 'failed', ...message });
      });
    return () => {
      active = false;
    };
  }, [token, isLoggedIn, reloadAccount]);

  if (state.status === 'verifying') {
    return (
      <AuthShell title="Verifying" subtitle="One moment">
        <div className="flex items-center justify-center gap-3 py-6 text-muted-foreground" role="status">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Confirming your email address…</span>
        </div>
      </AuthShell>
    );
  }

  if (state.status === 'verified') {
    return (
      <AuthShell title="Email verified" subtitle="Your account is secured">
        <div className="space-y-5 text-center">
          <div className="bg-primary/10 rounded-full w-16 h-16 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground">
            Thanks — this address is confirmed, so password resets and account recovery now work.
          </p>
          <Button asChild className="w-full h-12">
            <Link to={isLoggedIn ? '/' : '/auth/login'}>{isLoggedIn ? 'Back to FitBuilder' : 'Sign in'}</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={state.title} subtitle="This link cannot be used">
      <div className="space-y-5 text-center">
        <div className="bg-destructive/10 rounded-full w-16 h-16 flex items-center justify-center mx-auto">
          <MailWarning className="w-8 h-8 text-destructive" />
        </div>
        <p className="text-sm text-muted-foreground">{state.description}</p>
        <p className="text-sm text-muted-foreground">
          Verification links expire after 24 hours and work only once. Sign in and use{' '}
          <span className="font-medium text-foreground">Resend verification</span> in Settings to get a fresh one.
        </p>
        <Button asChild className="w-full h-12">
          <Link to={isLoggedIn ? '/settings' : '/auth/login'}>{isLoggedIn ? 'Go to Settings' : 'Sign in'}</Link>
        </Button>
      </div>
    </AuthShell>
  );
}
