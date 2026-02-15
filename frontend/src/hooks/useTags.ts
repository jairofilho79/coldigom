import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { praiseTagsApi } from '@/api/praiseTags';
import { useAuthStore } from '@/store/authStore';
import type { PraiseTagCreate, PraiseTagUpdate } from '@/types';
import { toast } from 'react-hot-toast';

export const useTags = (params: { skip?: number; limit?: number } = {}) => {
  const { token } = useAuthStore();
  const [canFetch, setCanFetch] = useState(false);

  useEffect(() => {
    if (token) setCanFetch(true);
  }, [token]);

  return useQuery({
    queryKey: ['tags', params],
    queryFn: () => praiseTagsApi.getTags(params),
    enabled: !!token && canFetch,
  });
};

export const useTag = (id: string) => {
  return useQuery({
    queryKey: ['tag', id],
    queryFn: () => praiseTagsApi.getTagById(id),
    enabled: !!id,
  });
};

export const useCreateTag = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: PraiseTagCreate) => praiseTagsApi.createTag(data),
    onSuccess: () => {
      // Força refetch imediato de todas as queries de tags ativas
      queryClient.invalidateQueries({ queryKey: ['tags'], refetchType: 'active' });
      // Tags podem estar relacionadas a praises, então invalida também
      queryClient.invalidateQueries({ queryKey: ['praises'], refetchType: 'active' });
      toast.success('Tag criada com sucesso!');
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Erro ao criar tag';
      toast.error(message);
    },
  });
};

export const useUpdateTag = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: PraiseTagUpdate }) =>
      praiseTagsApi.updateTag(id, data),
    onSuccess: (_, variables) => {
      // Força refetch imediato de todas as queries de tags ativas
      queryClient.invalidateQueries({ queryKey: ['tags'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['tag', variables.id], refetchType: 'active' });
      // Tags podem estar relacionadas a praises, então invalida também
      queryClient.invalidateQueries({ queryKey: ['praises'], refetchType: 'active' });
      toast.success('Tag atualizada com sucesso!');
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Erro ao atualizar tag';
      toast.error(message);
    },
  });
};

export const useDeleteTag = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => praiseTagsApi.deleteTag(id),
    onSuccess: () => {
      // Força refetch imediato de todas as queries de tags ativas
      queryClient.invalidateQueries({ queryKey: ['tags'], refetchType: 'active' });
      // Também invalida queries individuais de tag
      queryClient.invalidateQueries({ queryKey: ['tag'], refetchType: 'active' });
      // Tags podem estar relacionadas a praises, então invalida também
      queryClient.invalidateQueries({ queryKey: ['praises'], refetchType: 'active' });
      toast.success('Tag deletada com sucesso!');
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Erro ao deletar tag';
      toast.error(message);
    },
  });
};
