import { create } from 'zustand';
import type { UserResponse } from '@/types';

interface AuthState {
  token: string | null;
  user: UserResponse | null;
  isAuthenticated: boolean;
  setAuth: (token: string, user: UserResponse) => void;
  logout: () => void;
  checkAuth: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => {
  // Inicializa verificando o localStorage imediatamente
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const userStr = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
  
  let initialAuth = false;
  let initialUser = null;
  
  if (token && userStr) {
    try {
      initialUser = JSON.parse(userStr);
      initialAuth = true;
    } catch {
      // Se houver erro ao parsear, mantém false
    }
  }

  return {
    token: initialAuth ? token : null,
    user: initialUser,
    isAuthenticated: initialAuth,
    setAuth: (token: string, user: UserResponse) => {
      if (typeof window !== 'undefined') {
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
      }
      set({ token, user, isAuthenticated: true });
    },
    logout: () => {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
      set({ token: null, user: null, isAuthenticated: false });
    },
    checkAuth: () => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const userStr = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
      if (token && userStr) {
        try {
          const user = JSON.parse(userStr);
          set({ token, user, isAuthenticated: true });
        } catch {
          set({ token: null, user: null, isAuthenticated: false });
        }
      } else {
        set({ token: null, user: null, isAuthenticated: false });
      }
    },
  };
});
