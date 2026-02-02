import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userPreferencesApi } from '@/api/userPreferences';
import type { MaterialKindOrderUpdate } from '@/types';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

export const useUserMaterialKindPreferences = () => {
  return useQuery({
    queryKey: ['userMaterialKindPreferences'],
    queryFn: () => userPreferencesApi.getUserMaterialKindPreferences(),
  });
};

export const useUpdateMaterialKindOrder = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation('common');

  return useMutation({
    mutationFn: (data: MaterialKindOrderUpdate) => userPreferencesApi.updateMaterialKindOrder(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userMaterialKindPreferences'], refetchType: 'active' });
      toast.success(t('preferences.materialKind.saveSuccess'));
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || t('preferences.materialKind.saveError');
      toast.error(message);
    },
  });
};

export const useDeleteUserMaterialKindPreferences = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation('common');

  return useMutation({
    mutationFn: () => userPreferencesApi.deleteUserMaterialKindPreferences(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userMaterialKindPreferences'], refetchType: 'active' });
      toast.success(t('preferences.materialKind.saveSuccess'));
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || t('preferences.materialKind.saveError');
      toast.error(message);
    },
  });
};
