import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getMe, logout as apiLogout, refreshSession, type AuthUser } from '../services/api';

type AuthContextValue = {
  user: AuthUser | null;
  ready: boolean;
  isAuthenticated: boolean;
  logout: () => Promise<void>;
  refetch: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const refetchInFlight = useRef<Promise<void> | null>(null);

  const refetch = useCallback(async () => {
    if (refetchInFlight.current) return refetchInFlight.current;
    refetchInFlight.current = (async () => {
      let u = await getMe();
      if (!u) {
        const ok = await refreshSession();
        if (ok) {
          u = await getMe();
        }
      }
      setUser(u);
    })().finally(() => {
      refetchInFlight.current = null;
    });
    return refetchInFlight.current;
  }, []);

  const revalidateIfReady = useCallback(() => {
    if (!ready) return;
    void refetch();
  }, [ready, refetch]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') revalidateIfReady();
    };
    const onFocus = () => revalidateIfReady();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    }
  }, [revalidateIfReady]);

  useEffect(() => {
    void (async () => {
      await refetch();
      setReady(true);
    })();
  }, [refetch]);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      ready,
      isAuthenticated: Boolean(user),
      logout,
      refetch,
    }),
    [user, ready, logout, refetch]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
