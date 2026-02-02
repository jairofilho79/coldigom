import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { praiseListsApi, type GetPraiseListsParams } from '@/api/praiseLists';
import type {
  PraiseListCreate,
  PraiseListUpdate,
  ReorderPraisesRequest,
} from '@/types';
import { toast } from 'react-hot-toast';

export const usePraiseLists = (params: GetPraiseListsParams = {}) => {
  return useQuery({
    queryKey: ['praise-lists', params],
    queryFn: () => praiseListsApi.getPraiseLists(params),
  });
};

export const usePublicPraiseLists = (params: { skip?: number; limit?: number } = {}) => {
  return useQuery({
    queryKey: ['praise-lists', 'public', params],
    queryFn: () => praiseListsApi.getPublicPraiseLists(params),
  });
};

export const usePraiseList = (id: string) => {
  return useQuery({
    queryKey: ['praise-list', id],
    queryFn: () => praiseListsApi.getPraiseListById(id),
    enabled: !!id,
  });
};

export const useCreatePraiseList = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: PraiseListCreate) => praiseListsApi.createPraiseList(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['praise-lists'], refetchType: 'active' });
      toast.success('Lista criada com sucesso!');
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Erro ao criar lista';
      toast.error(message);
    },
  });
};

export const useUpdatePraiseList = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: PraiseListUpdate }) =>
      praiseListsApi.updatePraiseList(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['praise-lists'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['praise-list', variables.id], refetchType: 'active' });
      toast.success('Lista atualizada com sucesso!');
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Erro ao atualizar lista';
      toast.error(message);
    },
  });
};

export const useDeletePraiseList = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => praiseListsApi.deletePraiseList(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['praise-lists'], refetchType: 'active' });
      toast.success('Lista deletada com sucesso!');
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Erro ao deletar lista';
      toast.error(message);
    },
  });
};

export const useAddPraiseToList = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ listId, praiseId }: { listId: string; praiseId: string }) =>
      praiseListsApi.addPraiseToList(listId, praiseId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['praise-lists'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['praise-list', variables.listId], refetchType: 'active' });
      toast.success('Praise adicionado à lista!');
    },
    onError: (error: any, variables) => {
      const message = error.response?.data?.detail || 'Erro ao adicionar praise à lista';
      // Check if praise is already in list
      if (error.response?.status === 400 && message.includes('already')) {
        // Invalidate queries to refresh the UI and show correct state
        queryClient.invalidateQueries({ queryKey: ['praise-lists'], refetchType: 'active' });
        queryClient.invalidateQueries({ queryKey: ['praise-list', variables.listId], refetchType: 'active' });
        toast.error('Este praise já está nesta lista');
      } else {
        toast.error(message);
      }
    },
  });
};

export const useRemovePraiseFromList = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ listId, praiseId }: { listId: string; praiseId: string }) =>
      praiseListsApi.removePraiseFromList(listId, praiseId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['praise-lists'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['praise-list', variables.listId], refetchType: 'active' });
      toast.success('Praise removido da lista!');
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Erro ao remover praise da lista';
      toast.error(message);
    },
  });
};

export const useReorderPraisesInList = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ listId, data }: { listId: string; data: ReorderPraisesRequest }) =>
      praiseListsApi.reorderPraisesInList(listId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['praise-list', variables.listId], refetchType: 'active' });
      toast.success('Ordem atualizada!');
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Erro ao reordenar praises';
      toast.error(message);
    },
  });
};

export const useFollowList = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (listId: string) => praiseListsApi.followList(listId),
    onSuccess: (_, listId) => {
      queryClient.invalidateQueries({ queryKey: ['praise-lists'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['praise-list', listId], refetchType: 'active' });
      toast.success('Lista seguida com sucesso!');
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Erro ao seguir lista';
      toast.error(message);
    },
  });
};

export const useUnfollowList = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (listId: string) => praiseListsApi.unfollowList(listId),
    onSuccess: (_, listId) => {
      queryClient.invalidateQueries({ queryKey: ['praise-lists'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['praise-list', listId], refetchType: 'active' });
      toast.success('Deixou de seguir a lista!');
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Erro ao deixar de seguir lista';
      toast.error(message);
    },
  });
};

export const useCopyList = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (listId: string) => praiseListsApi.copyList(listId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['praise-lists'], refetchType: 'active' });
      toast.success('Lista copiada com sucesso!');
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Erro ao copiar lista';
      toast.error(message);
    },
  });
};
