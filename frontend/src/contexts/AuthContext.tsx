import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '@/api/client';

interface AuthState {
  email: string | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.auth.me()
      .then((data) => setEmail(data.email))
      .catch(() => setEmail(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (em: string, pw: string) => {
    setError(null);
    try {
      const data = await api.auth.login(em, pw);
      setEmail(data.email);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Inloggen mislukt.';
      setError(msg);
      throw e;
    }
  };

  const logout = async () => {
    await api.auth.logout();
    setEmail(null);
  };

  return (
    <AuthContext.Provider value={{ email, loading, error, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
