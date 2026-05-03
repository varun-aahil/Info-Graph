import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import AuthModal, { type AuthMode } from '@/components/AuthModal';
import Logo from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

export default function DesktopAuth() {
  const navigate = useNavigate();
  const { user, isInitialized } = useAuth();
  const [authOpen, setAuthOpen] = useState(true);
  const [authMode, setAuthMode] = useState<AuthMode>('signup');

  useEffect(() => {
    if (isInitialized && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [isInitialized, navigate, user]);

  const openAuth = (mode: AuthMode) => {
    setAuthMode(mode);
    setAuthOpen(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-8 flex items-center gap-3">
          <Logo className="h-8 w-8 text-foreground" />
          <div>
            <h1 className="text-2xl font-semibold text-foreground">InfoGraph Desktop</h1>
            <p className="text-sm text-muted-foreground">Sign in to open your dashboard.</p>
          </div>
        </div>

        <div className="space-y-3">
          <Button className="w-full" size="lg" onClick={() => openAuth('signup')}>
            Create account
          </Button>
          <Button className="w-full" size="lg" variant="outline" onClick={() => openAuth('signin')}>
            Sign in
          </Button>
        </div>
      </div>

      <AuthModal
        open={authOpen}
        onOpenChange={setAuthOpen}
        defaultMode={authMode}
        onSuccess={() => navigate('/dashboard', { replace: true })}
      />
    </div>
  );
}
