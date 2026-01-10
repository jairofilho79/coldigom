import apiClient from './client';
import type {
  PraiseTagResponse,
  PraiseTagCreate,
  PraiseTagUpdate,
} from '@/types';

export const praiseTagsApi = {
  getTags: async (params: { skip?: number; limit?: number } = {}): Promise<PraiseTagResponse[]> => {
    const response = await apiClient.get<PraiseTagResponse[]>('/api/v1/praise-tags/', {
      params,
    });
    return response.data;
  },

  getTagById: async (id: string): Promise<PraiseTagResponse> => {
    const response = await apiClient.get<PraiseTagResponse>(`/api/v1/praise-tags/${id}`);
    return response.data;
  },

  createTag: async (data: PraiseTagCreate): Promise<PraiseTagResponse> => {
    const response = await apiClient.post<PraiseTagResponse>('/api/v1/praise-tags/', data);
    return response.data;
  },

  updateTag: async (id: string, data: PraiseTagUpdate): Promise<PraiseTagResponse> => {
    const response = await apiClient.put<PraiseTagResponse>(`/api/v1/praise-tags/${id}`, data);
    return response.data;
  },

  deleteTag: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/v1/praise-tags/${id}`);
  },
};
