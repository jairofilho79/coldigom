import apiClient from './client';
import type { AxiosResponse } from 'axios';

export interface LanguageResponse {
  code: string;
  name: string;
  is_active: boolean;
}

export interface LanguageCreate {
  code: string;
  name: string;
  is_active?: boolean;
}

export interface LanguageUpdate {
  name?: string;
  is_active?: boolean;
}

export const languagesApi = {
  getAll: async (activeOnly: boolean = false): Promise<LanguageResponse[]> => {
    const response: AxiosResponse<LanguageResponse[]> = await apiClient.get(
      '/api/v1/languages',
      {
        params: { active_only: activeOnly },
      }
    );
    return response.data;
  },

  getByCode: async (code: string): Promise<LanguageResponse> => {
    const response: AxiosResponse<LanguageResponse> = await apiClient.get(
      `/api/v1/languages/${code}`
    );
    return response.data;
  },

  create: async (data: LanguageCreate): Promise<LanguageResponse> => {
    const response: AxiosResponse<LanguageResponse> = await apiClient.post(
      '/api/v1/languages',
      data
    );
    return response.data;
  },

  update: async (code: string, data: LanguageUpdate): Promise<LanguageResponse> => {
    const response: AxiosResponse<LanguageResponse> = await apiClient.put(
      `/api/v1/languages/${code}`,
      data
    );
    return response.data;
  },

  delete: async (code: string): Promise<void> => {
    await apiClient.delete(`/api/v1/languages/${code}`);
  },
};
