import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import type { PraiseListResponse, PraiseListCreate, PraiseListUpdate } from '@/types';

const praiseListCreateSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(255, 'Nome muito longo'),
  description: z.string().max(1000, 'Descrição muito longa').optional().nullable(),
  is_public: z.boolean().default(true),
});

const praiseListUpdateSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(255, 'Nome muito longo').optional(),
  description: z.string().max(1000, 'Descrição muito longa').optional().nullable(),
  is_public: z.boolean().optional(),
});

type PraiseListCreateFormData = z.infer<typeof praiseListCreateSchema>;
type PraiseListUpdateFormData = z.infer<typeof praiseListUpdateSchema>;

interface PraiseListFormProps {
  initialData?: PraiseListResponse;
  onSubmit: (data: PraiseListCreate | PraiseListUpdate) => void;
  isLoading?: boolean;
}

export const PraiseListForm = ({
  initialData,
  onSubmit,
  isLoading = false,
}: PraiseListFormProps) => {
  const { t } = useTranslation('common');
  const schema = initialData ? praiseListUpdateSchema : praiseListCreateSchema;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PraiseListCreateFormData | PraiseListUpdateFormData>({
    resolver: zodResolver(schema),
    defaultValues: initialData
      ? {
          name: initialData.name,
          description: initialData.description || '',
          is_public: initialData.is_public,
        }
      : {
          name: '',
          description: '',
          is_public: true,
        },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Input
        label={t('label.listName') || 'Nome da Lista'}
        error={errors.name?.message}
        {...register('name')}
      />
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {t('label.description') || 'Descrição'}
        </label>
        <textarea
          {...register('description')}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        {errors.description && (
          <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>
        )}
      </div>
      <div className="flex items-center">
        <input
          type="checkbox"
          id="is_public"
          {...register('is_public')}
          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
        />
        <label htmlFor="is_public" className="ml-2 block text-sm text-gray-700">
          {t('label.publicList') || 'Lista pública (outros usuários podem ver e seguir)'}
        </label>
      </div>
      <div className="flex justify-end space-x-3">
        <Button type="submit" isLoading={isLoading}>
          {initialData ? t('button.update') || 'Atualizar' : t('button.create') || 'Criar'}
        </Button>
      </div>
    </form>
  );
};
