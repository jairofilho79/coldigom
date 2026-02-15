import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { languagesApi, type LanguageResponse, type LanguageCreate, type LanguageUpdate } from '@/api/languages';
import { useAuthStore } from '@/store/authStore';
import toast from 'react-hot-toast';

export const useLanguages = () => {
  const { token } = useAuthStore();
  const [canFetch, setCanFetch] = useState(false);

  useEffect(() => {
    if (token) setCanFetch(true);
  }, [token]);

  return useQuery<LanguageResponse[]>({
    queryKey: ['languages'],
    queryFn: () => languagesApi.getAll(true),
    enabled: !!token && canFetch,
  });
};

export const useCreateLanguage = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: LanguageCreate) => languagesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['languages'], refetchType: 'active' });
      toast.success('Linguagem criada com sucesso');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Erro ao criar linguagem');
    },
  });
};

export const useUpdateLanguage = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ code, data }: { code: string; data: LanguageUpdate }) =>
      languagesApi.update(code, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['languages'], refetchType: 'active' });
      toast.success('Linguagem atualizada com sucesso');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Erro ao atualizar linguagem');
    },
  });
};

export const useDeleteLanguage = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (code: string) => languagesApi.delete(code),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['languages'], refetchType: 'active' });
      toast.success('Linguagem deletada com sucesso');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Erro ao deletar linguagem');
    },
  });
};
