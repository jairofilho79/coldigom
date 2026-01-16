import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import {
  materialTypeCreateSchema,
  materialTypeUpdateSchema,
  type MaterialTypeCreateFormData,
  type MaterialTypeUpdateFormData,
} from '@/utils/validation';
import type { MaterialTypeResponse } from '@/types';

interface MaterialTypeFormProps {
  initialData?: MaterialTypeResponse;
  onSubmit: (data: MaterialTypeCreateFormData | MaterialTypeUpdateFormData) => void;
  isLoading?: boolean;
}

export const MaterialTypeForm = ({
  initialData,
  onSubmit,
  isLoading = false,
}: MaterialTypeFormProps) => {
  const { t } = useTranslation('common');
  const schema = initialData ? materialTypeUpdateSchema : materialTypeCreateSchema;
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MaterialTypeCreateFormData | MaterialTypeUpdateFormData>({
    resolver: zodResolver(schema),
    defaultValues: initialData ? { name: initialData.name } : undefined,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Input
        label={t('label.materialTypeName')}
        error={errors.name?.message}
        {...register('name')}
      />
      <div className="flex justify-end space-x-3">
        <Button type="submit" isLoading={isLoading}>
          {initialData ? t('button.update') : t('button.create')}
        </Button>
      </div>
    </form>
  );
};
