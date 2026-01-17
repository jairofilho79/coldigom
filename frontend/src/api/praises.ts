import apiClient from './client';
import type {
  PraiseResponse,
  PraiseCreate,
  PraiseUpdate,
} from '@/types';

export interface GetPraisesParams {
  skip?: number;
  limit?: number;
  name?: string;
  tag_id?: string;
}

export const praisesApi = {
  getPraises: async (params: GetPraisesParams = {}): Promise<PraiseResponse[]> => {
    const response = await apiClient.get<PraiseResponse[]>('/api/v1/praises/', {
      params,
    });
    return response.data;
  },

  getPraiseById: async (id: string): Promise<PraiseResponse> => {
    const response = await apiClient.get<PraiseResponse>(`/api/v1/praises/${id}`);
    return response.data;
  },

  createPraise: async (data: PraiseCreate): Promise<PraiseResponse> => {
    const response = await apiClient.post<PraiseResponse>('/api/v1/praises/', data);
    return response.data;
  },

  updatePraise: async (
    id: string,
    data: PraiseUpdate
  ): Promise<PraiseResponse> => {
    const response = await apiClient.put<PraiseResponse>(
      `/api/v1/praises/${id}`,
      data
    );
    return response.data;
  },

  deletePraise: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/v1/praises/${id}`);
  },
};
