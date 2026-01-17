import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { PraiseTagSelector } from './PraiseTagSelector';
import { useTags } from '@/hooks/useTags';
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
  const { data: allTags = [] } = useTags({ limit: 1000 });
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<PraiseCreateFormData | PraiseUpdateFormData>({
    resolver: zodResolver(schema),
    defaultValues: initialData
      ? {
          name: initialData.name,
          number: initialData.number ?? undefined,
          tag_ids: initialData.tags?.map((tag) => tag.id) || [],
        }
      : undefined,
  });

  // Inicializar selectedTagIds quando initialData mudar
  useEffect(() => {
    if (initialData?.tags) {
      const tagIds = initialData.tags.map((tag) => tag.id);
      setSelectedTagIds(tagIds);
      setValue('tag_ids', tagIds);
    }
  }, [initialData, setValue]);

  const handleSelectTag = (tagId: string) => {
    const newTagIds = [...selectedTagIds, tagId];
    setSelectedTagIds(newTagIds);
    setValue('tag_ids', newTagIds);
  };

  const handleRemoveTag = (tagId: string) => {
    const newTagIds = selectedTagIds.filter((id) => id !== tagId);
    setSelectedTagIds(newTagIds);
    setValue('tag_ids', newTagIds.length > 0 ? newTagIds : null);
  };

  const handleFormSubmit = (data: PraiseCreateFormData | PraiseUpdateFormData) => {
    const submitData = {
      ...data,
      tag_ids: selectedTagIds.length > 0 ? selectedTagIds : (initialData ? null : undefined),
    };
    onSubmit(submitData);
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
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
      <PraiseTagSelector
        tags={allTags}
        selectedTagIds={selectedTagIds}
        onSelect={handleSelectTag}
        onRemove={handleRemoveTag}
      />
      <div className="flex justify-end space-x-3">
        <Button type="submit" isLoading={isLoading}>
          {initialData ? t('button.update') : t('button.create')}
        </Button>
      </div>
    </form>
  );
};
