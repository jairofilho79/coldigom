import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  praiseMaterialsApi,
  type GetMaterialsParams,
} from '@/api/praiseMaterials';
import type { PraiseMaterialCreate, PraiseMaterialUpdate } from '@/types';
import { toast } from 'react-hot-toast';

export const useMaterials = (params: GetMaterialsParams = {}) => {
  return useQuery({
    queryKey: ['materials', params],
    queryFn: () => praiseMaterialsApi.getMaterials(params),
  });
};

export const useMaterial = (id: string) => {
  return useQuery({
    queryKey: ['material', id],
    queryFn: () => praiseMaterialsApi.getMaterialById(id),
    enabled: !!id,
  });
};

export const useUploadMaterial = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      file,
      materialKindId,
      praiseId,
    }: {
      file: File;
      materialKindId: string;
      praiseId: string;
    }) => praiseMaterialsApi.uploadMaterial(file, materialKindId, praiseId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      queryClient.invalidateQueries({ queryKey: ['praise', variables.praiseId] });
      toast.success('Material enviado com sucesso!');
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Erro ao enviar material';
      toast.error(message);
    },
  });
};

export const useCreateMaterial = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: PraiseMaterialCreate) =>
      praiseMaterialsApi.createMaterial(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      queryClient.invalidateQueries({ queryKey: ['praise', variables.praise_id] });
      toast.success('Material criado com sucesso!');
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Erro ao criar material';
      toast.error(message);
    },
  });
};

export const useUpdateMaterial = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: PraiseMaterialUpdate }) =>
      praiseMaterialsApi.updateMaterial(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      queryClient.invalidateQueries({ queryKey: ['material', variables.id] });
      toast.success('Material atualizado com sucesso!');
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Erro ao atualizar material';
      toast.error(message);
    },
  });
};

export const useDeleteMaterial = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => praiseMaterialsApi.deleteMaterial(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      toast.success('Material deletado com sucesso!');
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Erro ao deletar material';
      toast.error(message);
    },
  });
};

export const useDownloadUrl = () => {
  return useMutation({
    mutationFn: ({ id, expiration }: { id: string; expiration?: number }) =>
      praiseMaterialsApi.getDownloadUrl(id, expiration),
  });
};
