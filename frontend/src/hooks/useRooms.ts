import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { roomsApi } from '@/api/rooms';
import type { RoomCreate, RoomUpdate, RoomPraiseReorder } from '@/types';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

export const useRooms = () => {
  return useQuery({
    queryKey: ['rooms'],
    queryFn: () => roomsApi.getRooms(),
  });
};

export const usePublicRooms = (params: { skip?: number; limit?: number } = {}) => {
  return useQuery({
    queryKey: ['rooms', 'public', params],
    queryFn: () => roomsApi.getPublicRooms(params),
  });
};

export const useRoom = (id: string) => {
  return useQuery({
    queryKey: ['room', id],
    queryFn: () => roomsApi.getRoomById(id),
    enabled: !!id,
  });
};

export const useRoomByCode = (code: string) => {
  return useQuery({
    queryKey: ['room', 'code', code],
    queryFn: () => roomsApi.getRoomByCode(code),
    enabled: !!code,
  });
};

export const useCreateRoom = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation('common');

  return useMutation({
    mutationFn: (data: RoomCreate) => roomsApi.createRoom(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      toast.success(t('room.createSuccess') || 'Sala criada com sucesso');
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || t('room.createError') || 'Erro ao criar sala';
      toast.error(message);
    },
  });
};

export const useUpdateRoom = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation('common');

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: RoomUpdate }) => roomsApi.updateRoom(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['room', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      toast.success(t('room.updateSuccess') || 'Sala atualizada com sucesso');
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || t('room.updateError') || 'Erro ao atualizar sala';
      toast.error(message);
    },
  });
};

export const useDeleteRoom = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation('common');

  return useMutation({
    mutationFn: (id: string) => roomsApi.deleteRoom(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      toast.success(t('room.deleteSuccess') || 'Sala deletada com sucesso');
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || t('room.deleteError') || 'Erro ao deletar sala';
      toast.error(message);
    },
  });
};

export const useJoinRoom = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation('common');

  return useMutation({
    mutationFn: ({ id, password }: { id: string; password?: string }) => roomsApi.joinRoom(id, password),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['room', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      toast.success(t('room.joinSuccess') || 'Entrou na sala com sucesso');
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || t('room.joinError') || 'Erro ao entrar na sala';
      toast.error(message);
    },
  });
};

export const useJoinRoomByCode = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation('common');

  return useMutation({
    mutationFn: ({ code, password }: { code: string; password?: string }) => roomsApi.joinRoomByCode(code, password),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['room', data.id] });
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      toast.success(t('room.joinSuccess') || 'Entrou na sala com sucesso');
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || t('room.joinError') || 'Erro ao entrar na sala';
      toast.error(message);
    },
  });
};

export const useRequestJoinRoom = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation('common');

  return useMutation({
    mutationFn: (code: string) => roomsApi.requestJoinRoom(code),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      toast.success(t('room.requestJoinSuccess') || 'Solicitação de entrada enviada');
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || t('room.requestJoinError') || 'Erro ao solicitar entrada';
      toast.error(message);
    },
  });
};

export const useLeaveRoom = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation('common');

  return useMutation({
    mutationFn: (id: string) => roomsApi.leaveRoom(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['room', id] });
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      toast.success(t('room.leaveSuccess') || 'Saiu da sala com sucesso');
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || t('room.leaveError') || 'Erro ao sair da sala';
      toast.error(message);
    },
  });
};

export const useAddPraiseToRoom = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation('common');

  return useMutation({
    mutationFn: ({ roomId, praiseId }: { roomId: string; praiseId: string }) =>
      roomsApi.addPraiseToRoom(roomId, praiseId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['room', variables.roomId] });
      toast.success(t('room.addPraiseSuccess') || 'Praise adicionado com sucesso');
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || t('room.addPraiseError') || 'Erro ao adicionar praise';
      toast.error(message);
    },
  });
};

export const useRemovePraiseFromRoom = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation('common');

  return useMutation({
    mutationFn: ({ roomId, praiseId }: { roomId: string; praiseId: string }) =>
      roomsApi.removePraiseFromRoom(roomId, praiseId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['room', variables.roomId] });
      toast.success(t('room.removePraiseSuccess') || 'Praise removido com sucesso');
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || t('room.removePraiseError') || 'Erro ao remover praise';
      toast.error(message);
    },
  });
};

export const useReorderRoomPraises = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation('common');

  return useMutation({
    mutationFn: ({ roomId, data }: { roomId: string; data: RoomPraiseReorder }) =>
      roomsApi.reorderPraisesInRoom(roomId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['room', variables.roomId] });
      toast.success(t('room.reorderSuccess') || 'Praises reordenados com sucesso');
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || t('room.reorderError') || 'Erro ao reordenar praises';
      toast.error(message);
    },
  });
};

export const useImportListToRoom = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation('common');

  return useMutation({
    mutationFn: ({ roomId, listId }: { roomId: string; listId: string }) =>
      roomsApi.importListToRoom(roomId, listId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['room', variables.roomId] });
      toast.success(t('room.importListSuccess') || 'Lista importada com sucesso');
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || t('room.importListError') || 'Erro ao importar lista';
      toast.error(message);
    },
  });
};

export const useApproveJoinRequest = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation('common');

  return useMutation({
    mutationFn: ({ roomId, requestId }: { roomId: string; requestId: string }) =>
      roomsApi.approveJoinRequest(roomId, requestId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['room', variables.roomId] });
      queryClient.invalidateQueries({ queryKey: ['room', variables.roomId, 'joinRequests'] });
      toast.success(t('room.approveRequestSuccess') || 'Solicitação aprovada');
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || t('room.approveRequestError') || 'Erro ao aprovar solicitação';
      toast.error(message);
    },
  });
};

export const useRejectJoinRequest = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation('common');

  return useMutation({
    mutationFn: ({ roomId, requestId }: { roomId: string; requestId: string }) =>
      roomsApi.rejectJoinRequest(roomId, requestId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['room', variables.roomId, 'joinRequests'] });
      toast.success(t('room.rejectRequestSuccess') || 'Solicitação rejeitada');
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || t('room.rejectRequestError') || 'Erro ao rejeitar solicitação';
      toast.error(message);
    },
  });
};
