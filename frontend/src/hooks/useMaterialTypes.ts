import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { materialTypesApi } from '@/api/materialTypes';
import type { MaterialTypeCreate, MaterialTypeUpdate } from '@/types';
import { toast } from 'react-hot-toast';

interface UseMaterialTypesParams {
  skip?: number;
  limit?: number;
}

export const useMaterialTypes = (params: UseMaterialTypesParams = {}) => {
  return useQuery({
    queryKey: ['materialTypes', params],
    queryFn: () => materialTypesApi.getMaterialTypes(params),
  });
};

export const useMaterialType = (id: string) => {
  return useQuery({
    queryKey: ['materialTypes', id],
    queryFn: () => materialTypesApi.getMaterialTypeById(id),
    enabled: !!id,
  });
};

export const useCreateMaterialType = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: MaterialTypeCreate) => materialTypesApi.createMaterialType(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materialTypes'] });
      toast.success('Tipo de arquivo criado com sucesso!');
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Erro ao criar tipo de arquivo';
      toast.error(message);
    },
  });
};

export const useUpdateMaterialType = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: MaterialTypeUpdate }) =>
      materialTypesApi.updateMaterialType(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materialTypes'] });
      toast.success('Tipo de arquivo atualizado com sucesso!');
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Erro ao atualizar tipo de arquivo';
      toast.error(message);
    },
  });
};

export const useDeleteMaterialType = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => materialTypesApi.deleteMaterialType(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materialTypes'] });
      toast.success('Tipo de arquivo deletado com sucesso!');
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Erro ao deletar tipo de arquivo';
      toast.error(message);
    },
  });
};
