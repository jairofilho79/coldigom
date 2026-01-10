import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { praisesApi, type GetPraisesParams } from '@/api/praises';
import type { PraiseCreate, PraiseUpdate } from '@/types';
import { toast } from 'react-hot-toast';

export const usePraises = (params: GetPraisesParams = {}) => {
  return useQuery({
    queryKey: ['praises', params],
    queryFn: () => praisesApi.getPraises(params),
  });
};

export const usePraise = (id: string) => {
  return useQuery({
    queryKey: ['praise', id],
    queryFn: () => praisesApi.getPraiseById(id),
    enabled: !!id,
  });
};

export const useCreatePraise = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: PraiseCreate) => praisesApi.createPraise(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['praises'] });
      toast.success('Praise criado com sucesso!');
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Erro ao criar praise';
      toast.error(message);
    },
  });
};

export const useUpdatePraise = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: PraiseUpdate }) =>
      praisesApi.updatePraise(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['praises'] });
      queryClient.invalidateQueries({ queryKey: ['praise', variables.id] });
      toast.success('Praise atualizado com sucesso!');
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Erro ao atualizar praise';
      toast.error(message);
    },
  });
};

export const useDeletePraise = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => praisesApi.deletePraise(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['praises'] });
      toast.success('Praise deletado com sucesso!');
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Erro ao deletar praise';
      toast.error(message);
    },
  });
};
