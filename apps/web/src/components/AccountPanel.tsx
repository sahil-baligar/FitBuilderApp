import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  BadgeCheck,
  Gauge,
  KeyRound,
  Loader2,
  LogOut,
  MailWarning,
  RefreshCw,
  Trash2,
  User,
} from 'lucide-react';
import {
  ApiError,
  changePassword,
  deleteAccount,
  getUsage,
  resendVerification,
  useApp,
  type MeteredAction,
  type UsageResponse,
} from '@fitbuilder/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  actionLabelPlural,
  describeApiError,
  describeAuthError,
  formatResetDate,
  freeTierCopy,
  isOfflineError,
  isSignedOutError,
} from '@/lib/apiErrors';

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

const ChangePasswordDialog = ({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError('Those passwords do not match.');
      return;
    }
    if (next.length < 8) {
      setError('Please choose a password of at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      await changePassword(current, next);
      // Changing the password revokes every session, this one included.
      toast({ title: 'Password changed', description: 'All your devices were signed out. Please sign in again.' });
      onOpenChange(false);
      navigate('/auth/login');
    } catch (err) {
      const message = describeAuthError(err, 'Could not change your password');
      setError(`${message.title}. ${message.description}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>
            Setting a new password signs you out on every device, including this one.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              className="mt-2"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              className="mt-2"
              minLength={8}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground mt-1">At least 8 characters</p>
          </div>
          <div>
            <Label htmlFor="confirm-new-password">Confirm new password</Label>
            <Input
              id="confirm-new-password"
              type="password"
              autoComplete="new-password"
              className="mt-2"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Change password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const DeleteAccountDialog = ({
  email,
  open,
  onOpenChange,
}: {
  email: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState<'warn' | 'confirm'>('warn');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = (value: boolean) => {
    onOpenChange(value);
    if (!value) {
      setStep('warn');
      setPassword('');
      setError(null);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await deleteAccount(password);
      toast({ title: 'Account deleted', description: 'Your FitBuilder account and its cloud data are gone.' });
      close(false);
      navigate('/');
    } catch (err) {
      const message = describeAuthError(err, 'Could not delete your account');
      setError(`${message.title}. ${message.description}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            Delete your account
          </DialogTitle>
          <DialogDescription>
            This permanently deletes the account for {email}. It cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {step === 'warn' ? (
          <div className="space-y-4">
            <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
              <li>Your account, email address and sign-in details are erased.</li>
              <li>Wardrobe items, saved fits and renders stored in the cloud are deleted.</li>
              <li>Your remaining monthly allowance is forfeited and cannot be restored.</li>
              <li>There is no recovery, no export and no grace period.</li>
            </ul>
            <p className="text-sm text-muted-foreground">
              Anything already downloaded to this browser stays until you clear local data below.
            </p>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => close(false)}>
                Keep my account
              </Button>
              <Button type="button" variant="destructive" onClick={() => setStep('confirm')}>
                Continue
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm font-medium text-destructive">
              Last step. Enter your password to permanently delete this account.
            </p>
            <div>
              <Label htmlFor="delete-password">Password</Label>
              <Input
                id="delete-password"
                type="password"
                autoComplete="current-password"
                className="mt-2"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setStep('warn')}>
                Back
              </Button>
              <Button type="submit" variant="destructive" disabled={busy || !password}>
                {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                Permanently delete
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export const AccountSection = () => {
  const { account, isLoggedIn, logout } = useApp();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [resending, setResending] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleResend = async () => {
    setResending(true);
    try {
      await resendVerification();
      toast({ title: 'Verification email sent', description: 'Check your inbox — the link expires in 24 hours.' });
    } catch (err) {
      toast({ ...describeAuthError(err, 'Could not send that email'), variant: 'destructive' });
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="bg-card rounded-2xl p-6 border border-border">
      <h2 className="text-lg font-semibold font-heading mb-4 flex items-center gap-2">
        <User className="w-5 h-5" />
        Account
      </h2>

      {isLoggedIn && account ? (
        <div className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="font-medium truncate">{account.email}</p>
                <p className="text-sm text-muted-foreground">Your wardrobe syncs across devices</p>
              </div>
              <Badge variant={account.tier === 'pro' ? 'default' : 'secondary'} className="capitalize">
                {account.tier} plan
              </Badge>
            </div>

            {account.emailVerified ? (
              <Badge variant="outline" className="text-green-600 border-green-600/40">
                <BadgeCheck className="w-3.5 h-3.5 mr-1" />
                Email verified
              </Badge>
            ) : (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
                <p className="text-sm font-medium flex items-center gap-2">
                  <MailWarning className="w-4 h-4 text-amber-600" />
                  Email not verified
                </p>
                <p className="text-sm text-muted-foreground">
                  Confirm your address so you can reset your password if you ever lose it.
                </p>
                <Button variant="outline" size="sm" onClick={handleResend} disabled={resending}>
                  {resending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Resend verification
                </Button>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              {account.tier === 'pro'
                ? 'Pro includes the AI stylist and higher monthly limits.'
                : `Free includes ${freeTierCopy}. The AI stylist is Pro only — Pro is coming soon.`}
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="outline" onClick={() => setPasswordOpen(true)}>
              <KeyRound className="w-4 h-4 mr-2" />
              Change password
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                await logout();
                toast({ title: 'Signed out', description: 'Your local wardrobe stays on this device.' });
              }}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign out
            </Button>
          </div>

          <div className="pt-2 border-t border-border">
            <p className="text-sm text-muted-foreground mb-3">
              Deleting your account permanently erases it and everything stored in the cloud. This cannot be undone.
            </p>
            <Button variant="destructive" className="w-full" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="w-4 h-4 mr-2" />
              Delete account
            </Button>
          </div>

          <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
          <DeleteAccountDialog email={account.email} open={deleteOpen} onOpenChange={setDeleteOpen} />
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Sign in to sync your wardrobe, process garments and render try-ons. Free accounts include {freeTierCopy}.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button onClick={() => navigate('/auth/login')}>Sign in</Button>
            <Button variant="outline" onClick={() => navigate('/auth/signup')}>
              Create account
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

type UsageState =
  | { status: 'loading' }
  | { status: 'ready'; usage: UsageResponse }
  | { status: 'signed-out' }
  | { status: 'error'; title: string; description: string };

const usageOrder: MeteredAction[] = ['garments', 'tryons', 'styleframes', 'stylist'];

export const UsageSection = () => {
  const { account } = useApp();
  const navigate = useNavigate();
  const [state, setState] = useState<UsageState>({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      // In local dev the API runs open and answers for a single dev user, so a
      // signed-out browser can still get real numbers back here.
      setState({ status: 'ready', usage: await getUsage() });
    } catch (err) {
      if (isSignedOutError(err)) {
        setState({ status: 'signed-out' });
        return;
      }
      if (err instanceof ApiError && err.status === 404) {
        setState({
          status: 'error',
          title: 'Usage unavailable',
          description: 'The API answered but does not serve /me/usage. Check that apps/api is running the current build.',
        });
        return;
      }
      const message = describeApiError(err, isOfflineError(err) ? 'Usage unavailable' : 'Could not load your usage');
      setState({ status: 'error', ...message });
    }
  }, []);

  useEffect(() => {
    void load();
    // Re-read after sign-in or sign-out so the numbers match the account shown above.
  }, [load, account?.id]);

  return (
    <div className="bg-card rounded-2xl p-6 border border-border">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h2 className="text-lg font-semibold font-heading flex items-center gap-2">
          <Gauge className="w-5 h-5" />
          Monthly usage
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={load}
          disabled={state.status === 'loading'}
          aria-label="Refresh usage"
        >
          {state.status === 'loading' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
        </Button>
      </div>

      {state.status === 'loading' && <p className="text-sm text-muted-foreground">Checking your allowance…</p>}

      {state.status === 'signed-out' && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Sign in to see how much of this month&apos;s allowance you have left.
          </p>
          <Button size="sm" onClick={() => navigate('/auth/login')}>
            Sign in
          </Button>
        </div>
      )}

      {state.status === 'error' && (
        <div className="space-y-2">
          <p className="font-medium text-sm">{state.title}</p>
          <p className="text-sm text-muted-foreground">{state.description}</p>
        </div>
      )}

      {state.status === 'ready' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={state.usage.tier === 'pro' ? 'default' : 'secondary'} className="capitalize">
              {state.usage.tier} plan
            </Badge>
            <span className="text-xs text-muted-foreground">
              Resets on {formatResetDate(state.usage.resetsAt)}
            </span>
          </div>

          <ul className="space-y-3">
            {usageOrder.map((action) => {
              const line = state.usage.quota[action];
              if (!line) return null;
              const proOnly = line.limit === 0;
              const percent = line.limit > 0 ? Math.min(100, Math.round((line.used / line.limit) * 100)) : 0;
              return (
                <li key={action} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium capitalize">{actionLabelPlural[action]}</span>
                    {proOnly ? (
                      <span className="text-xs text-muted-foreground">Pro only — coming soon</span>
                    ) : (
                      <span className="text-muted-foreground">
                        {line.remaining} of {line.limit} left
                      </span>
                    )}
                  </div>
                  {!proOnly && <Progress value={percent} className="h-1.5" />}
                </li>
              );
            })}
          </ul>

          <p className="text-xs text-muted-foreground">
            Counted per calendar month ({state.usage.period}). Going over returns a clear message rather than a
            surprise charge.
          </p>
        </div>
      )}
    </div>
  );
};
