import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import {
  materialKindCreateSchema,
  materialKindUpdateSchema,
  type MaterialKindCreateFormData,
  type MaterialKindUpdateFormData,
} from '@/utils/validation';
import type { MaterialKindResponse } from '@/types';

interface MaterialKindFormProps {
  initialData?: MaterialKindResponse;
  onSubmit: (data: MaterialKindCreateFormData | MaterialKindUpdateFormData) => void;
  isLoading?: boolean;
}

export const MaterialKindForm = ({
  initialData,
  onSubmit,
  isLoading = false,
}: MaterialKindFormProps) => {
  const { t } = useTranslation('common');
  const schema = initialData ? materialKindUpdateSchema : materialKindCreateSchema;
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MaterialKindCreateFormData | MaterialKindUpdateFormData>({
    resolver: zodResolver(schema),
    defaultValues: initialData ? { name: initialData.name } : undefined,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Input
        label={t('label.materialKindName')}
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
