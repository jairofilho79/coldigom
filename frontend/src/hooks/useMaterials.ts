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
      isOld,
      oldDescription,
    }: {
      file: File;
      materialKindId: string;
      praiseId: string;
      isOld?: boolean;
      oldDescription?: string | null;
    }) => praiseMaterialsApi.uploadMaterial(file, materialKindId, praiseId, isOld, oldDescription),
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
    onSuccess: (response, variables) => {
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      queryClient.invalidateQueries({ queryKey: ['material', variables.id] });
      // Invalida todos os praises para garantir que o praise com este material seja atualizado
      queryClient.invalidateQueries({ queryKey: ['praises'] });
      // Invalida o praise específico se tiver praise_id no response
      if (response.praise_id) {
        queryClient.invalidateQueries({ queryKey: ['praise', response.praise_id] });
      } else {
        // Se não tiver, invalida todos os praises
        queryClient.invalidateQueries({ queryKey: ['praise'] });
      }
      toast.success('Material atualizado com sucesso!');
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Erro ao atualizar material';
      toast.error(message);
    },
  });
};

export const useUpdateMaterialWithFile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      file,
      materialKindId,
      praiseId,
      isOld,
      oldDescription,
    }: {
      id: string;
      file: File;
      materialKindId?: string;
      praiseId?: string;
      isOld?: boolean;
      oldDescription?: string | null;
    }) => {
      console.log('useUpdateMaterialWithFile - chamando API', { id, fileName: file.name, materialKindId, praiseId });
      return praiseMaterialsApi.updateMaterialWithFile(id, file, materialKindId, isOld, oldDescription);
    },
    onSuccess: (response, variables) => {
      console.log('useUpdateMaterialWithFile - sucesso', { response, variables });
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      queryClient.invalidateQueries({ queryKey: ['material', variables.id] });
      // Invalida todos os praises para garantir que o praise com este material seja atualizado
      queryClient.invalidateQueries({ queryKey: ['praises'] });
      // Invalida o praise específico se fornecido, ou tenta pegar do response
      const praiseIdToInvalidate = variables.praiseId || response.praise_id;
      console.log('useUpdateMaterialWithFile - invalidando praise', { praiseIdToInvalidate });
      if (praiseIdToInvalidate) {
        queryClient.invalidateQueries({ queryKey: ['praise', praiseIdToInvalidate] });
      } else {
        // Se não tiver, invalida todos os praises
        queryClient.invalidateQueries({ queryKey: ['praise'] });
      }
      toast.success('Material atualizado com sucesso!');
    },
    onError: (error: any) => {
      console.error('useUpdateMaterialWithFile - erro', error);
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
      // Invalida todos os praises para garantir que o praise com este material seja atualizado
      queryClient.invalidateQueries({ queryKey: ['praises'] });
      queryClient.invalidateQueries({ queryKey: ['praise'] });
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
