import apiClient from './client';
import type {
  MaterialTypeResponse,
  MaterialTypeCreate,
  MaterialTypeUpdate,
} from '@/types';

export const materialTypesApi = {
  getMaterialTypes: async (params: { skip?: number; limit?: number } = {}): Promise<MaterialTypeResponse[]> => {
    const response = await apiClient.get<MaterialTypeResponse[]>('/api/v1/material-types/', {
      params,
    });
    return response.data;
  },

  getMaterialTypeById: async (id: string): Promise<MaterialTypeResponse> => {
    const response = await apiClient.get<MaterialTypeResponse>(`/api/v1/material-types/${id}`);
    return response.data;
  },

  createMaterialType: async (data: MaterialTypeCreate): Promise<MaterialTypeResponse> => {
    const response = await apiClient.post<MaterialTypeResponse>('/api/v1/material-types/', data);
    return response.data;
  },

  updateMaterialType: async (id: string, data: MaterialTypeUpdate): Promise<MaterialTypeResponse> => {
    const response = await apiClient.put<MaterialTypeResponse>(`/api/v1/material-types/${id}`, data);
    return response.data;
  },

  deleteMaterialType: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/v1/material-types/${id}`);
  },
};
