import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { praisesApi, type GetPraisesParams } from '@/api/praises';
import { useAuthStore } from '@/store/authStore';
import type { PraiseCreate, PraiseUpdate, ReviewActionRequest } from '@/types';
import { toast } from 'react-hot-toast';

export const usePraises = (params: GetPraisesParams = {}) => {
  const { token } = useAuthStore();
  const [canFetch, setCanFetch] = useState(false);

  useEffect(() => {
    if (token) setCanFetch(true);
  }, [token]);

  return useQuery({
    queryKey: ['praises', params],
    queryFn: () => praisesApi.getPraises(params),
    enabled: !!token && canFetch,
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
      // Força refetch imediato de todas as queries de praises ativas
      queryClient.invalidateQueries({ queryKey: ['praises'], refetchType: 'active' });
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
      // Força refetch imediato de todas as queries de praises ativas
      queryClient.invalidateQueries({ queryKey: ['praises'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['praise', variables.id], refetchType: 'active' });
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
      // Força refetch imediato de todas as queries de praises ativas
      queryClient.invalidateQueries({ queryKey: ['praises'], refetchType: 'active' });
      // Também invalida queries individuais de praise
      queryClient.invalidateQueries({ queryKey: ['praise'], refetchType: 'active' });
      toast.success('Praise deletado com sucesso!');
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Erro ao deletar praise';
      toast.error(message);
    },
  });
};

export const useReviewAction = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ReviewActionRequest }) =>
      praisesApi.reviewAction(id, data),
    onSuccess: (_, variables) => {
      // Força refetch imediato de todas as queries de praises ativas
      queryClient.invalidateQueries({ queryKey: ['praises'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['praise', variables.id], refetchType: 'active' });
      toast.success('Revisão atualizada com sucesso!');
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Erro ao atualizar revisão';
      toast.error(message);
    },
  });
};
