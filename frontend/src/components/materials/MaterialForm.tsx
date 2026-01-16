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
import { useMaterialKinds } from '@/hooks/useMaterialKinds';
import { useMaterialTypes } from '@/hooks/useMaterialTypes';
import { useState, useRef, useEffect } from 'react';
import { Upload, X } from 'lucide-react';

interface MaterialFormProps {
  praiseId: string;
  initialData?: any;
  onSubmit: (data: MaterialCreateFormData | MaterialUpdateFormData | { file: File; material_kind_id: string } | { file: File; material_kind_id?: string }) => void;
  isLoading?: boolean;
}

export const MaterialForm = ({
  praiseId,
  initialData,
  onSubmit,
  isLoading = false,
}: MaterialFormProps) => {
  const { data: materialKinds, isLoading: materialKindsLoading } = useMaterialKinds({ limit: 1000 });
  const { data: materialTypes, isLoading: materialTypesLoading } = useMaterialTypes({ limit: 1000 });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isCreating = !initialData;
  const isCreatingFile = isCreating && !selectedFile; // Se está criando e ainda não selecionou arquivo
  
  // Helper function to detect material type from file extension
  const detectMaterialTypeFromExtension = (fileName: string): string | null => {
    const ext = fileName.toLowerCase().split('.').pop() || '';
    const audioExtensions = ['mp3', 'wav', 'm4a', 'wma', 'ogg', 'flac'];
    
    if (ext === 'pdf') {
      return materialTypes?.find(t => t.name.toLowerCase() === 'pdf')?.id || null;
    } else if (audioExtensions.includes(ext)) {
      return materialTypes?.find(t => t.name.toLowerCase() === 'audio')?.id || null;
    }
    return null;
  };
  
  const schema = initialData ? materialUpdateSchema : materialCreateSchema;
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    getValues,
    setValue,
  } = useForm<MaterialCreateFormData | MaterialUpdateFormData>({
    resolver: zodResolver(schema),
    defaultValues: initialData
      ? {
          material_kind_id: initialData.material_kind_id,
          material_type_id: initialData.material_type_id,
          path: initialData.path,
        }
      : {
          praise_id: praiseId,
          path: '', // Path vazio para criação (será ignorado se for arquivo)
        },
  });

  const materialTypeId = watch('material_type_id');
  const materialKindId = watch('material_kind_id');
  
  // Get material type name for display
  const materialType = materialTypes?.find(t => t.id === materialTypeId);
  const isFileType = materialType?.name.toLowerCase() === 'pdf' || materialType?.name.toLowerCase() === 'audio';

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      
      // Auto-detect material type from file extension
      if (isCreating) {
        const detectedTypeId = detectMaterialTypeFromExtension(file.name);
        if (detectedTypeId) {
          setValue('material_type_id', detectedTypeId);
        }
      }
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const onFormSubmit = (data: MaterialCreateFormData | MaterialUpdateFormData) => {
    console.log('MaterialForm - onFormSubmit', {
      materialTypeId,
      selectedFile: selectedFile?.name,
      isCreating,
      data,
    });
    
    // Se é um arquivo (PDF ou AUDIO) e tem arquivo selecionado (criando ou editando), usa upload
    if (isFileType && selectedFile) {
      const kindId = materialKindId || getValues('material_kind_id');
      if (!kindId) {
        // material_kind_id será validado pelo schema
        console.log('MaterialForm - material_kind_id não encontrado');
        return;
      }
      console.log('MaterialForm - enviando arquivo', { file: selectedFile.name, material_kind_id: kindId });
      onSubmit({
        file: selectedFile,
        material_kind_id: kindId,
      });
    } else if (isCreating && isFileType && !selectedFile) {
      // Se está criando arquivo mas não tem arquivo selecionado, não submete
      console.log('MaterialForm - criando arquivo mas nenhum arquivo selecionado');
      return;
    } else {
      // Senão, cria/atualiza normalmente (link, texto, etc ou edição sem novo arquivo)
      console.log('MaterialForm - enviando dados normais', data);
      onSubmit(data);
    }
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
      {!initialData && (
        <input type="hidden" {...register('praise_id')} value={praiseId} />
      )}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Tipo de Arquivo
        </label>
        <select
          {...register('material_type_id')}
          className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
            errors.material_type_id ? 'border-red-500' : 'border-gray-300'
          }`}
          disabled={materialTypesLoading || (isCreating && isFileType && !!selectedFile)}
          onChange={(e) => {
            register('material_type_id').onChange(e);
            const selectedType = materialTypes?.find(t => t.id === e.target.value);
            const isFile = selectedType?.name.toLowerCase() === 'pdf' || selectedType?.name.toLowerCase() === 'audio';
            // Limpa arquivo selecionado quando muda para tipo não-arquivo
            if (!isFile) {
              setSelectedFile(null);
              if (fileInputRef.current) {
                fileInputRef.current.value = '';
              }
            }
          }}
        >
          <option value="">
            {materialTypesLoading ? 'Carregando...' : 'Selecione um tipo de arquivo'}
          </option>
          {materialTypes?.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name.charAt(0).toUpperCase() + type.name.slice(1)}
            </option>
          ))}
        </select>
        {errors.material_type_id && (
          <p className="mt-1 text-sm text-red-600">{errors.material_type_id.message}</p>
        )}
        {isCreating && isFileType && selectedFile && (
          <p className="mt-1 text-sm text-gray-500">Tipo detectado automaticamente do arquivo</p>
        )}
      </div>
      
      {materialType?.name.toLowerCase() === 'text' ? (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Texto
          </label>
          <textarea
            {...register('path')}
            rows={5}
            className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              errors.path ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {errors.path && (
            <p className="mt-1 text-sm text-red-600">{errors.path.message}</p>
          )}
        </div>
      ) : isFileType ? (
        // Quando é arquivo (criando ou editando), mostra input de arquivo
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Arquivo
          </label>
          <div className="space-y-2">
            {initialData && !selectedFile && (
              <div className="mb-2 p-2 bg-gray-50 rounded border border-gray-200">
                <span className="text-sm text-gray-600">
                  Arquivo atual: {initialData.path?.split('/').pop() || initialData.path}
                </span>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              className="hidden"
              id="file-upload-input"
              accept="*/*"
            />
            <label
              htmlFor="file-upload-input"
              className="cursor-pointer inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              <Upload className="w-4 h-4 mr-2" />
              {selectedFile ? 'Trocar Arquivo' : (initialData ? 'Substituir Arquivo' : 'Selecionar Arquivo')}
            </label>
            {selectedFile && (
              <div className="flex items-center space-x-2 mt-2">
                <span className="text-sm text-gray-600">{selectedFile.name}</span>
                <button
                  type="button"
                  onClick={handleRemoveFile}
                  className="text-red-600 hover:text-red-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            {!selectedFile && isCreating && errors.path && (
              <p className="mt-1 text-sm text-red-600">Arquivo é obrigatório</p>
            )}
          </div>
        </div>
      ) : (
        // Para outros tipos (YouTube, Spotify, links)
        <Input
          label="URL"
          error={errors.path?.message}
          {...register('path')}
        />
      )}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Tipo de Material (Kind)
        </label>
        <select
          {...register('material_kind_id')}
          className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
            errors.material_kind_id ? 'border-red-500' : 'border-gray-300'
          }`}
          disabled={materialKindsLoading}
        >
          <option value="">
            {materialKindsLoading ? 'Carregando...' : 'Selecione um tipo de material'}
          </option>
          {materialKinds?.map((kind) => (
            <option key={kind.id} value={kind.id}>
              {kind.name}
            </option>
          ))}
        </select>
        {errors.material_kind_id && (
          <p className="mt-1 text-sm text-red-600">{errors.material_kind_id.message}</p>
        )}
      </div>
      <div className="flex justify-end space-x-3">
        <Button 
          type="submit" 
          isLoading={isLoading}
          disabled={isCreating && isFileType && !selectedFile}
        >
          {initialData ? 'Atualizar' : 'Criar'}
        </Button>
      </div>
    </form>
  );
};
