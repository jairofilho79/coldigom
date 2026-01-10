import apiClient from './client';
import type { UserCreate, UserResponse, Token } from '@/types';

export const authApi = {
  register: async (userData: UserCreate): Promise<UserResponse> => {
    const response = await apiClient.post<UserResponse>('/api/v1/auth/register', userData);
    return response.data;
  },

  login: async (username: string, password: string): Promise<Token> => {
    const formData = new FormData();
    formData.append('username', username);
    formData.append('password', password);

    const response = await apiClient.post<Token>('/api/v1/auth/login', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
};
