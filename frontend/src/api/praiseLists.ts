import apiClient from './client';
import type {
  PraiseListResponse,
  PraiseListCreate,
  PraiseListUpdate,
  PraiseListDetailResponse,
  ReorderPraisesRequest,
} from '@/types';

export interface GetPraiseListsParams {
  name?: string;
  date_from?: string; // ISO date string
  date_to?: string; // ISO date string
}

export const praiseListsApi = {
  getPraiseLists: async (params: GetPraiseListsParams = {}): Promise<PraiseListResponse[]> => {
    const response = await apiClient.get<PraiseListResponse[]>('/api/v1/praise-lists/', {
      params,
    });
    return response.data;
  },

  getPublicPraiseLists: async (params: { skip?: number; limit?: number } = {}): Promise<PraiseListResponse[]> => {
    const response = await apiClient.get<PraiseListResponse[]>('/api/v1/praise-lists/public', {
      params,
    });
    return response.data;
  },

  getPraiseListById: async (id: string): Promise<PraiseListDetailResponse> => {
    const response = await apiClient.get<PraiseListDetailResponse>(`/api/v1/praise-lists/${id}`);
    return response.data;
  },

  createPraiseList: async (data: PraiseListCreate): Promise<PraiseListResponse> => {
    const response = await apiClient.post<PraiseListResponse>('/api/v1/praise-lists/', data);
    return response.data;
  },

  updatePraiseList: async (id: string, data: PraiseListUpdate): Promise<PraiseListResponse> => {
    const response = await apiClient.put<PraiseListResponse>(`/api/v1/praise-lists/${id}`, data);
    return response.data;
  },

  deletePraiseList: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/v1/praise-lists/${id}`);
  },

  addPraiseToList: async (listId: string, praiseId: string): Promise<void> => {
    await apiClient.post(`/api/v1/praise-lists/${listId}/praises/${praiseId}`);
  },

  removePraiseFromList: async (listId: string, praiseId: string): Promise<void> => {
    await apiClient.delete(`/api/v1/praise-lists/${listId}/praises/${praiseId}`);
  },

  reorderPraisesInList: async (listId: string, data: ReorderPraisesRequest): Promise<void> => {
    await apiClient.put(`/api/v1/praise-lists/${listId}/praises/reorder`, data);
  },

  followList: async (listId: string): Promise<void> => {
    await apiClient.post(`/api/v1/praise-lists/${listId}/follow`);
  },

  unfollowList: async (listId: string): Promise<void> => {
    await apiClient.delete(`/api/v1/praise-lists/${listId}/follow`);
  },

  copyList: async (listId: string): Promise<PraiseListResponse> => {
    const response = await apiClient.post<PraiseListResponse>(`/api/v1/praise-lists/${listId}/copy`);
    return response.data;
  },
};
