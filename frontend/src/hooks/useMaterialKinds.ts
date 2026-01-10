import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { materialKindsApi } from '@/api/materialKinds';
import type { MaterialKindCreate, MaterialKindUpdate } from '@/types';
import { toast } from 'react-hot-toast';

export const useMaterialKinds = (params: { skip?: number; limit?: number } = {}) => {
  return useQuery({
    queryKey: ['materialKinds', params],
    queryFn: () => materialKindsApi.getMaterialKinds(params),
  });
};

export const useMaterialKind = (id: string) => {
  return useQuery({
    queryKey: ['materialKind', id],
    queryFn: () => materialKindsApi.getMaterialKindById(id),
    enabled: !!id,
  });
};

export const useCreateMaterialKind = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: MaterialKindCreate) => materialKindsApi.createMaterialKind(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materialKinds'] });
      toast.success('Tipo de material criado com sucesso!');
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Erro ao criar tipo de material';
      toast.error(message);
    },
  });
};

export const useUpdateMaterialKind = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: MaterialKindUpdate }) =>
      materialKindsApi.updateMaterialKind(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['materialKinds'] });
      queryClient.invalidateQueries({ queryKey: ['materialKind', variables.id] });
      toast.success('Tipo de material atualizado com sucesso!');
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Erro ao atualizar tipo de material';
      toast.error(message);
    },
  });
};

export const useDeleteMaterialKind = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => materialKindsApi.deleteMaterialKind(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materialKinds'] });
      toast.success('Tipo de material deletado com sucesso!');
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Erro ao deletar tipo de material';
      toast.error(message);
    },
  });
};
