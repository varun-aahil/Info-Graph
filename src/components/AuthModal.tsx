import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

export type AuthMode = 'signup' | 'signin' | 'otp';

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultMode?: AuthMode;
  onSuccess?: () => void;
}

export default function AuthModal({ open, onOpenChange, defaultMode = 'signup', onSuccess }: AuthModalProps) {
  const { signUp, signIn, signInWithGoogle, verifyOtp } = useAuth();
  const [mode, setMode] = useState<AuthMode>(defaultMode);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');

  useEffect(() => {
    if (open) setMode(defaultMode);
  }, [open, defaultMode]);

  const reset = () => {
    setName('');
    setEmail('');
    setPassword('');
    setOtpCode('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      if (mode === 'signup') {
        const registeredEmail = await signUp({ name, email, password });
        toast({ title: 'Account created', description: `Welcome to InfoGraph, ${registeredEmail}!` });
        reset();
        onOpenChange(false);
        onSuccess?.();
        return;
      } else if (mode === 'otp') {
        await verifyOtp({ email, otp_code: otpCode });
        toast({ title: 'Account verified', description: `Welcome to InfoGraph!` });
      } else {
        await signIn({ email, password });
        toast({ title: 'Welcome back', description: email });
      }
      reset();
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Please try again.';
      toast({
        title: 'Authentication failed',
        description: msg,
        variant: 'destructive',
      });
      // If sign in fails due to unverified email, switch to OTP mode
      if (mode === 'signin' && msg.includes('Email not verified')) {
        setMode('otp');
      }
    } finally {
      setLoading(false);
    }
  };


  const isSignup = mode === 'signup';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            {mode === 'signup' ? 'Create your account' : mode === 'otp' ? 'Verify your email' : 'Welcome back'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'signup'
              ? 'Sign up to start exploring your documents.'
              : mode === 'otp'
              ? `Enter the 6-digit code we sent to ${email}`
              : 'Sign in to continue to InfoGraph.'}
          </DialogDescription>
        </DialogHeader>

        {mode !== 'otp' && (
          <>
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              onClick={signInWithGoogle}
              disabled={loading}
            >
              <GoogleIcon />
              Continue with Google
            </Button>

            <div className="relative my-1">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-background px-2 text-muted-foreground">or with email</span>
              </div>
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'otp' ? (
            <div className="space-y-1.5">
              <Label htmlFor="auth-otp">Verification Code</Label>
              <Input
                id="auth-otp"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                placeholder="123456"
                required
                maxLength={6}
                className="text-center text-2xl tracking-widest"
              />
            </div>
          ) : (
            <>
              {isSignup && (
                <div className="space-y-1.5">
                  <Label htmlFor="auth-name">Full name</Label>
                  <Input
                    id="auth-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Doe"
                    required
                    autoComplete="name"
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="auth-email">Email</Label>
                <Input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="auth-password">Password</Label>
                <Input
                  id="auth-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                />
              </div>
            </>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === 'signup' ? 'Create account' : mode === 'otp' ? 'Verify Email' : 'Sign in'}
          </Button>
        </form>

        <div className="text-center text-sm text-muted-foreground">
          {mode === 'otp' ? (
            <button
              type="button"
              onClick={async () => {
                import('@/lib/api').then((m) => m.resendOtp({ email })).then(() => {
                  toast({ title: 'OTP Resent', description: `A new code was sent to ${email}` });
                }).catch((err) => {
                  toast({ title: 'Failed to resend', description: err.message, variant: 'destructive' });
                });
              }}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Didn't receive a code? Resend
            </button>
          ) : isSignup ? (
            <>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => setMode('signin')}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Sign in
              </button>
            </>
          ) : (
            <>
              New to InfoGraph?{' '}
              <button
                type="button"
                onClick={() => setMode('signup')}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Create an account
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}
