import apiClient from './client';
import type {
  PraiseMaterialResponse,
  PraiseMaterialCreate,
  PraiseMaterialUpdate,
  DownloadUrlResponse,
} from '@/types';

export interface GetMaterialsParams {
  skip?: number;
  limit?: number;
  praise_id?: string;
}

export const praiseMaterialsApi = {
  getMaterials: async (
    params: GetMaterialsParams = {}
  ): Promise<PraiseMaterialResponse[]> => {
    const response = await apiClient.get<PraiseMaterialResponse[]>(
      '/api/v1/praise-materials/',
      { params }
    );
    return response.data;
  },

  getMaterialById: async (id: string): Promise<PraiseMaterialResponse> => {
    const response = await apiClient.get<PraiseMaterialResponse>(
      `/api/v1/praise-materials/${id}`
    );
    return response.data;
  },

  uploadMaterial: async (
    file: File,
    materialKindId: string,
    praiseId: string,
    isOld?: boolean,
    oldDescription?: string | null
  ): Promise<PraiseMaterialResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('material_kind_id', materialKindId);
    formData.append('praise_id', praiseId);
    formData.append('is_old', String(isOld ?? false));
    if (oldDescription != null && oldDescription !== '') {
      formData.append('old_description', oldDescription);
    }

    const response = await apiClient.post<PraiseMaterialResponse>(
      '/api/v1/praise-materials/upload',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  },

  createMaterial: async (
    data: PraiseMaterialCreate
  ): Promise<PraiseMaterialResponse> => {
    const response = await apiClient.post<PraiseMaterialResponse>(
      '/api/v1/praise-materials/',
      data
    );
    return response.data;
  },

  updateMaterial: async (
    id: string,
    data: PraiseMaterialUpdate
  ): Promise<PraiseMaterialResponse> => {
    const response = await apiClient.put<PraiseMaterialResponse>(
      `/api/v1/praise-materials/${id}`,
      data
    );
    return response.data;
  },

  updateMaterialWithFile: async (
    id: string,
    file: File,
    materialKindId?: string,
    isOld?: boolean,
    oldDescription?: string | null
  ): Promise<PraiseMaterialResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    if (materialKindId) {
      formData.append('material_kind_id', materialKindId);
    }
    if (isOld !== undefined) {
      formData.append('is_old', String(isOld));
    }
    if (oldDescription !== undefined) {
      formData.append('old_description', oldDescription ?? '');
    }

    const response = await apiClient.put<PraiseMaterialResponse>(
      `/api/v1/praise-materials/${id}/upload`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  },

  deleteMaterial: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/v1/praise-materials/${id}`);
  },

  getDownloadUrl: async (
    id: string,
    expiration: number = 3600
  ): Promise<DownloadUrlResponse> => {
    const response = await apiClient.get<DownloadUrlResponse>(
      `/api/v1/praise-materials/${id}/download-url`,
      { params: { expiration } }
    );
    return response.data;
  },
};
