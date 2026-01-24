import apiClient from './client';
import type {
  RoomResponse,
  RoomCreate,
  RoomUpdate,
  RoomDetailResponse,
  RoomJoinRequest,
  RoomMessageResponse,
  RoomMessageCreate,
  RoomParticipantResponse,
  RoomJoinRequestDetail,
  RoomPraiseReorder,
} from '@/types';

export const roomsApi = {
  getRooms: async (): Promise<RoomResponse[]> => {
    const response = await apiClient.get<RoomResponse[]>('/api/v1/rooms/');
    return response.data;
  },

  getPublicRooms: async (params: { skip?: number; limit?: number } = {}): Promise<RoomResponse[]> => {
    const response = await apiClient.get<RoomResponse[]>('/api/v1/rooms/public', {
      params,
    });
    return response.data;
  },

  getRoomById: async (id: string): Promise<RoomDetailResponse> => {
    const response = await apiClient.get<RoomDetailResponse>(`/api/v1/rooms/${id}`);
    return response.data;
  },

  getRoomByCode: async (code: string): Promise<RoomDetailResponse> => {
    const response = await apiClient.get<RoomDetailResponse>(`/api/v1/rooms/code/${code}`);
    return response.data;
  },

  createRoom: async (data: RoomCreate): Promise<RoomResponse> => {
    const response = await apiClient.post<RoomResponse>('/api/v1/rooms/', data);
    return response.data;
  },

  updateRoom: async (id: string, data: RoomUpdate): Promise<RoomResponse> => {
    const response = await apiClient.put<RoomResponse>(`/api/v1/rooms/${id}`, data);
    return response.data;
  },

  deleteRoom: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/v1/rooms/${id}`);
  },

  joinRoom: async (id: string, password?: string): Promise<RoomDetailResponse> => {
    const response = await apiClient.post<RoomDetailResponse>(
      `/api/v1/rooms/${id}/join`,
      password ? { password } : {}
    );
    return response.data;
  },

  joinRoomByCode: async (code: string, password?: string): Promise<RoomDetailResponse> => {
    const response = await apiClient.post<RoomDetailResponse>(
      `/api/v1/rooms/code/${code}/join`,
      password ? { password } : {}
    );
    return response.data;
  },

  requestJoinRoom: async (code: string): Promise<RoomJoinRequestDetail> => {
    const response = await apiClient.post<RoomJoinRequestDetail>(`/api/v1/rooms/code/${code}/request-join`);
    return response.data;
  },

  approveJoinRequest: async (roomId: string, requestId: string): Promise<RoomJoinRequestDetail> => {
    const response = await apiClient.post<RoomJoinRequestDetail>(
      `/api/v1/rooms/${roomId}/approve/${requestId}`
    );
    return response.data;
  },

  rejectJoinRequest: async (roomId: string, requestId: string): Promise<RoomJoinRequestDetail> => {
    const response = await apiClient.post<RoomJoinRequestDetail>(
      `/api/v1/rooms/${roomId}/reject/${requestId}`
    );
    return response.data;
  },

  leaveRoom: async (id: string): Promise<void> => {
    await apiClient.post(`/api/v1/rooms/${id}/leave`);
  },

  addPraiseToRoom: async (roomId: string, praiseId: string): Promise<void> => {
    await apiClient.post(`/api/v1/rooms/${roomId}/praises/${praiseId}`);
  },

  removePraiseFromRoom: async (roomId: string, praiseId: string): Promise<void> => {
    await apiClient.delete(`/api/v1/rooms/${roomId}/praises/${praiseId}`);
  },

  reorderPraisesInRoom: async (roomId: string, data: RoomPraiseReorder): Promise<void> => {
    await apiClient.put(`/api/v1/rooms/${roomId}/praises/reorder`, data);
  },

  importListToRoom: async (roomId: string, listId: string): Promise<void> => {
    await apiClient.post(`/api/v1/rooms/${roomId}/import-list/${listId}`);
  },

  getRoomMessages: async (roomId: string, params: { limit?: number; offset?: number } = {}): Promise<RoomMessageResponse[]> => {
    const response = await apiClient.get<RoomMessageResponse[]>(`/api/v1/rooms/${roomId}/messages`, {
      params,
    });
    return response.data;
  },

  getRoomParticipants: async (roomId: string): Promise<RoomParticipantResponse[]> => {
    const response = await apiClient.get<RoomParticipantResponse[]>(`/api/v1/rooms/${roomId}/participants`);
    return response.data;
  },

  getRoomJoinRequests: async (roomId: string, status?: string): Promise<RoomJoinRequestDetail[]> => {
    const response = await apiClient.get<RoomJoinRequestDetail[]>(`/api/v1/rooms/${roomId}/join-requests`, {
      params: status ? { status } : {},
    });
    return response.data;
  },

  sendRoomMessage: async (roomId: string, data: RoomMessageCreate): Promise<RoomMessageResponse> => {
    const response = await apiClient.post<RoomMessageResponse>(`/api/v1/rooms/${roomId}/messages`, data);
    return response.data;
  },
};
