import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getMe, logout as apiLogout, refreshSession, exchangeAuthCode } from '../services/api';
import { AuthContext } from './authContextValue';


const CHAVE_ERRO = 'coldigom_auth_error';

/** Acesso tolerante: armazenamento bloqueado degrada, não derruba. */
function lerErroSalvo(): string | null {
  try {
    return sessionStorage.getItem(CHAVE_ERRO);
  } catch {
    return null;
  }
}

function salvarErro(msg: string): void {
  try {
    sessionStorage.setItem(CHAVE_ERRO, msg);
  } catch {
    /* a mensagem ainda aparece nesta aba, via estado */
  }
}

function limparErroSalvo(): void {
  try {
    sessionStorage.removeItem(CHAVE_ERRO);
  } catch {
    /* nada a limpar */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  // Lido no inicializador do useState, que roda DURANTE o render: com
  // armazenamento bloqueado o acesso lança e a árvore inteira cai. É o mesmo
  // cenário Safari/iPhone que o projeto já contornou na sessão por cookie.
  const [authError, setAuthError] = useState<string | null>(() => lerErroSalvo());
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
          salvarErro(msg);
          setAuthError(msg);
        } else if (auth === 'exchange') {
          limparErroSalvo();
          setAuthError(null);
          const code = url.searchParams.get('code');
          if (!code || !(await exchangeAuthCode(code))) {
            const msg = 'Falha no login. Tente de novo.';
            salvarErro(msg);
            setAuthError(msg);
          }
        } else {
          limparErroSalvo();
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
