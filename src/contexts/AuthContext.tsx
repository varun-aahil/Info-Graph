import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  fetchCurrentUser,
  loginUser,
  registerUser,
  setAccessToken,
  type AuthUserDto,
} from '@/lib/api';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  provider?: 'email' | 'google';
}

interface AuthContextValue {
  user: AuthUser | null;
  signUp: (data: { name: string; email: string; password: string }) => Promise<void>;
  signIn: (data: { email: string; password: string }) => Promise<void>;
  signInWithGoogle: () => void;
  signOut: () => void;
  _setUser: (user: AuthUser | null) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const STORAGE_KEY = 'infograph_auth_user';
const TOKEN_STORAGE_KEY = 'infograph_access_token';

function mapBackendUser(user: AuthUserDto): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatar_url ?? undefined,
    provider: user.provider === 'google' ? 'google' : 'email',
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);

  const persist = (nextUser: AuthUser | null, token?: string | null) => {
    setUser(nextUser);
    if (nextUser) localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser));
    else localStorage.removeItem(STORAGE_KEY);
    if (token !== undefined) setAccessToken(token);
  };

  useEffect(() => {
    let isMounted = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setUser(JSON.parse(raw));
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }

    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!token) {
      persist(null, null);
      return;
    }

    fetchCurrentUser()
      .then((backendUser) => {
        if (isMounted) persist(mapBackendUser(backendUser));
      })
      .catch(() => {
        if (isMounted) persist(null, null);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const signUp: AuthContextValue['signUp'] = async ({ name, email, password }) => {
    const response = await registerUser({ name, email, password });
    persist(mapBackendUser(response.user), response.access_token);
  };

  const signIn: AuthContextValue['signIn'] = async ({ email, password }) => {
    const response = await loginUser({ email, password });
    persist(mapBackendUser(response.user), response.access_token);
  };

  const signInWithGoogle = () => {
    window.location.href = `${API_BASE}/auth/google`;
  };

  const signOut = () => persist(null, null);

  const _setUser = (nextUser: AuthUser | null) => setUser(nextUser);

  return (
    <AuthContext.Provider value={{ user, signUp, signIn, signInWithGoogle, signOut, _setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
