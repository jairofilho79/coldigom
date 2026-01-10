import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { praiseTagsApi } from '@/api/praiseTags';
import type { PraiseTagCreate, PraiseTagUpdate } from '@/types';
import { toast } from 'react-hot-toast';

export const useTags = (params: { skip?: number; limit?: number } = {}) => {
  return useQuery({
    queryKey: ['tags', params],
    queryFn: () => praiseTagsApi.getTags(params),
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
      queryClient.invalidateQueries({ queryKey: ['tags'] });
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
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      queryClient.invalidateQueries({ queryKey: ['tag', variables.id] });
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
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      toast.success('Tag deletada com sucesso!');
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Erro ao deletar tag';
      toast.error(message);
    },
  });
};
