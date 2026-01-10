import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@/api/auth';
import type { UserCreate } from '@/types';
import { toast } from 'react-hot-toast';

export const useAuth = () => {
  const { setAuth, logout, user, isAuthenticated } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const login = async (username: string, password: string) => {
    try {
      setIsLoading(true);
      const tokenData = await authApi.login(username, password);
      
      // Buscar dados do usuário (o backend não retorna no login, então vamos buscar)
      // Por enquanto, vamos criar um objeto básico
      // Em uma implementação real, você pode ter um endpoint /me ou similar
      const userData = {
        id: '',
        email: '',
        username,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      setAuth(tokenData.access_token, userData);
      toast.success('Login realizado com sucesso!');
      navigate('/');
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Erro ao fazer login';
      toast.error(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (userData: UserCreate) => {
    try {
      setIsLoading(true);
      const newUser = await authApi.register(userData);
      toast.success('Registro realizado com sucesso! Faça login para continuar.');
      navigate('/login');
      return newUser;
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Erro ao registrar';
      toast.error(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    toast.success('Logout realizado com sucesso!');
    navigate('/login');
  };

  return {
    user,
    isAuthenticated,
    isLoading,
    login,
    register,
    logout: handleLogout,
  };
};
