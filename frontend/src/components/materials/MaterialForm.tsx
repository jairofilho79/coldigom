import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import {
  materialCreateSchema,
  materialUpdateSchema,
  type MaterialCreateFormData,
  type MaterialUpdateFormData,
} from '@/utils/validation';
import { MaterialType } from '@/types';

interface MaterialFormProps {
  praiseId: string;
  initialData?: any;
  onSubmit: (data: MaterialCreateFormData | MaterialUpdateFormData) => void;
  isLoading?: boolean;
}

export const MaterialForm = ({
  praiseId,
  initialData,
  onSubmit,
  isLoading = false,
}: MaterialFormProps) => {
  const schema = initialData ? materialUpdateSchema : materialCreateSchema;
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<MaterialCreateFormData | MaterialUpdateFormData>({
    resolver: zodResolver(schema),
    defaultValues: initialData
      ? {
          material_kind_id: initialData.material_kind_id,
          path: initialData.path,
          type: initialData.type,
        }
      : {
          praise_id: praiseId,
          type: MaterialType.TEXT,
        },
  });

  const materialType = watch('type');

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {!initialData && (
        <input type="hidden" {...register('praise_id')} value={praiseId} />
      )}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Tipo de Material
        </label>
        <select
          {...register('type')}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        >
          <option value={MaterialType.FILE}>Arquivo</option>
          <option value={MaterialType.YOUTUBE}>YouTube</option>
          <option value={MaterialType.SPOTIFY}>Spotify</option>
          <option value={MaterialType.TEXT}>Texto</option>
        </select>
        {errors.type && (
          <p className="mt-1 text-sm text-red-600">{errors.type.message}</p>
        )}
      </div>
      <Input
        label={
          materialType === MaterialType.TEXT
            ? 'Texto'
            : materialType === MaterialType.FILE
            ? 'Caminho do Arquivo'
            : 'URL'
        }
        error={errors.path?.message}
        {...register('path')}
        {...(materialType === MaterialType.TEXT && { as: 'textarea', rows: 5 })}
      />
      <Input
        label="ID do Tipo de Material"
        type="text"
        error={errors.material_kind_id?.message}
        {...register('material_kind_id')}
      />
      <div className="flex justify-end space-x-3">
        <Button type="submit" isLoading={isLoading}>
          {initialData ? 'Atualizar' : 'Criar'}
        </Button>
      </div>
    </form>
  );
};
