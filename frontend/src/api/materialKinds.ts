import apiClient from './client';
import type {
  MaterialKindResponse,
  MaterialKindCreate,
  MaterialKindUpdate,
} from '@/types';

export const materialKindsApi = {
  getMaterialKinds: async (params: { skip?: number; limit?: number } = {}): Promise<MaterialKindResponse[]> => {
    const response = await apiClient.get<MaterialKindResponse[]>('/api/v1/material-kinds/', {
      params,
    });
    return response.data;
  },

  getMaterialKindById: async (id: string): Promise<MaterialKindResponse> => {
    const response = await apiClient.get<MaterialKindResponse>(`/api/v1/material-kinds/${id}`);
    return response.data;
  },

  createMaterialKind: async (data: MaterialKindCreate): Promise<MaterialKindResponse> => {
    const response = await apiClient.post<MaterialKindResponse>('/api/v1/material-kinds/', data);
    return response.data;
  },

  updateMaterialKind: async (id: string, data: MaterialKindUpdate): Promise<MaterialKindResponse> => {
    const response = await apiClient.put<MaterialKindResponse>(`/api/v1/material-kinds/${id}`, data);
    return response.data;
  },

  deleteMaterialKind: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/v1/material-kinds/${id}`);
  },
};
