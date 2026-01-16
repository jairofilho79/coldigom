import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import {
  praiseCreateSchema,
  praiseUpdateSchema,
  type PraiseCreateFormData,
  type PraiseUpdateFormData,
} from '@/utils/validation';
import type { PraiseResponse } from '@/types';

interface PraiseFormProps {
  initialData?: PraiseResponse;
  onSubmit: (data: PraiseCreateFormData | PraiseUpdateFormData) => void;
  isLoading?: boolean;
}

export const PraiseForm = ({
  initialData,
  onSubmit,
  isLoading = false,
}: PraiseFormProps) => {
  const { t } = useTranslation('common');
  const schema = initialData ? praiseUpdateSchema : praiseCreateSchema;
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PraiseCreateFormData | PraiseUpdateFormData>({
    resolver: zodResolver(schema),
    defaultValues: initialData
      ? {
          name: initialData.name,
          number: initialData.number ?? undefined,
        }
      : undefined,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Input
        label={t('label.praiseName')}
        error={errors.name?.message}
        {...register('name')}
      />
      <Input
        label={t('label.numberOptional')}
        type="number"
        error={errors.number?.message}
        {...register('number', { valueAsNumber: true })}
      />
      <div className="flex justify-end space-x-3">
        <Button type="submit" isLoading={isLoading}>
          {initialData ? t('button.update') : t('button.create')}
        </Button>
      </div>
    </form>
  );
};
