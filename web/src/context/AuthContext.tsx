import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getMe, logout as apiLogout, refreshSession, exchangeAuthCode, type AuthUser } from '../services/api';

type AuthContextValue = {
  user: AuthUser | null;
  ready: boolean;
  isAuthenticated: boolean;
  authError: string | null;
  logout: () => Promise<void>;
  refetch: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(() =>
    sessionStorage.getItem('coldigom_auth_error')
  );
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
    let cancelled = false;
    void (async () => {
      const url = new URL(window.location.href);
      const auth = url.searchParams.get('auth');

      if (auth) {
        if (auth === 'error' || auth === 'drive_error') {
          const msg = 'Falha no login. Tente de novo.';
          sessionStorage.setItem('coldigom_auth_error', msg);
          setAuthError(msg);
        } else if (auth === 'exchange') {
          sessionStorage.removeItem('coldigom_auth_error');
          setAuthError(null);
          const code = url.searchParams.get('code');
          if (!code || !(await exchangeAuthCode(code))) {
            const msg = 'Falha no login. Tente de novo.';
            sessionStorage.setItem('coldigom_auth_error', msg);
            setAuthError(msg);
          }
        } else {
          sessionStorage.removeItem('coldigom_auth_error');
          setAuthError(null);
          const attempts = auth === 'success' ? 4 : 1;
          for (let i = 0; i < attempts; i += 1) {
            if (cancelled) return;
            if (auth === 'success') await refetch();
            if (auth !== 'success') break;
            if (i < attempts - 1) {
              await new Promise(resolve => setTimeout(resolve, 350));
            }
          }
        }

        if (!cancelled) {
          const clean = new URL(window.location.href);
          clean.searchParams.delete('auth');
          clean.searchParams.delete('code');
          window.history.replaceState({}, '', `${clean.pathname}${clean.search}${clean.hash}`);
        }
      }

      if (!cancelled) await refetch();
      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [refetch]);

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
    };
  }, [revalidateIfReady]);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      ready,
      isAuthenticated: Boolean(user),
      authError,
      logout,
      refetch,
    }),
    [user, ready, authError, logout, refetch]
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
