import { createContext } from 'react';
import type { AuthUser } from '../services/api';

export type AuthContextValue = {
  user: AuthUser | null;
  ready: boolean;
  isAuthenticated: boolean;
  authError: string | null;
  logout: () => Promise<void>;
  refetch: () => Promise<void>;
};

/**
 * O contexto e o hook moram fora do `AuthContext.tsx` porque um arquivo que
 * exporta componentes e não-componentes juntos quebra o fast refresh do Vite:
 * a cada salvamento o provider remonta e a sessão da aba de desenvolvimento
 * se perde, em vez de o código ser só reaplicado.
 */
export const AuthContext = createContext<AuthContextValue | null>(null);
