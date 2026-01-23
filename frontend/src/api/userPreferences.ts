import apiClient from './client';
import type {
  UserMaterialKindPreferenceResponse,
  MaterialKindOrderUpdate,
} from '@/types';

export const userPreferencesApi = {
  getUserMaterialKindPreferences: async (): Promise<UserMaterialKindPreferenceResponse[]> => {
    const response = await apiClient.get<UserMaterialKindPreferenceResponse[]>(
      '/api/v1/user-preferences/material-kinds'
    );
    return response.data;
  },

  updateMaterialKindOrder: async (data: MaterialKindOrderUpdate): Promise<UserMaterialKindPreferenceResponse[]> => {
    const response = await apiClient.put<UserMaterialKindPreferenceResponse[]>(
      '/api/v1/user-preferences/material-kinds/order',
      data
    );
    return response.data;
  },

  deleteUserMaterialKindPreferences: async (): Promise<void> => {
    await apiClient.delete('/api/v1/user-preferences/material-kinds');
  },
};
