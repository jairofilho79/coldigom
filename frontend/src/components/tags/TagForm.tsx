import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import {
  tagCreateSchema,
  tagUpdateSchema,
  type TagCreateFormData,
  type TagUpdateFormData,
} from '@/utils/validation';
import type { PraiseTagResponse } from '@/types';

interface TagFormProps {
  initialData?: PraiseTagResponse;
  onSubmit: (data: TagCreateFormData | TagUpdateFormData) => void;
  isLoading?: boolean;
}

export const TagForm = ({
  initialData,
  onSubmit,
  isLoading = false,
}: TagFormProps) => {
  const { t } = useTranslation('common');
  const schema = initialData ? tagUpdateSchema : tagCreateSchema;
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TagCreateFormData | TagUpdateFormData>({
    resolver: zodResolver(schema),
    defaultValues: initialData ? { name: initialData.name } : undefined,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Input
        label={t('label.tagName')}
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
