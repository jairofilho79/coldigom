import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { roomsApi } from '@/api/rooms';
import type { RoomMessageCreate } from '@/types';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

export const useRoomMessages = (roomId: string, params: { limit?: number; offset?: number } = {}) => {
  return useQuery({
    queryKey: ['room', roomId, 'messages', params],
    queryFn: () => roomsApi.getRoomMessages(roomId, params),
    enabled: !!roomId,
  });
};

export const useSendRoomMessage = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation('common');

  return useMutation({
    mutationFn: ({ roomId, message }: { roomId: string; message: string }) => {
      const messageData: RoomMessageCreate = { message };
      return roomsApi.getRoomMessages(roomId, { limit: 1, offset: 0 }); // This will be handled by WebSocket
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || t('room.sendMessageError') || 'Erro ao enviar mensagem';
      toast.error(message);
    },
  });
};

export const useRoomParticipants = (roomId: string) => {
  return useQuery({
    queryKey: ['room', roomId, 'participants'],
    queryFn: () => roomsApi.getRoomParticipants(roomId),
    enabled: !!roomId,
  });
};

export const useRoomJoinRequests = (roomId: string, status?: string) => {
  return useQuery({
    queryKey: ['room', roomId, 'joinRequests', status],
    queryFn: () => roomsApi.getRoomJoinRequests(roomId, status),
    enabled: !!roomId,
  });
};
