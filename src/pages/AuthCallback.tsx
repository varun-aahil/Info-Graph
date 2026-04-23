import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { setAccessToken, fetchCurrentUser } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

const STORAGE_KEY = 'infograph_auth_user';
const TOKEN_STORAGE_KEY = 'infograph_access_token';

export default function AuthCallback() {
  const navigate = useNavigate();
  const { _setUser } = useAuth() as any;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const error = params.get('oauth_error');

    if (error || !token) {
      navigate('/?oauth_error=true', { replace: true });
      return;
    }

    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    setAccessToken(token);

    fetchCurrentUser()
      .then((user) => {
        const mapped = { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatar_url ?? undefined, provider: user.provider as 'email' | 'google' };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(mapped));
        if (_setUser) _setUser(mapped);
        navigate('/dashboard', { replace: true });
      })
      .catch(() => {
        navigate('/?oauth_error=true', { replace: true });
      });
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-muted-foreground text-sm">Signing you in with Google…</p>
      </div>
    </div>
  );
}
