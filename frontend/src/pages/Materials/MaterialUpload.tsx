import { useState } from 'react';
import { useUploadMaterial } from '@/hooks/useMaterials';
import { usePraises } from '@/hooks/usePraises';
import { useMaterialKinds } from '@/hooks/useMaterialKinds';
import { MaterialUpload as MaterialUploadComponent } from '@/components/materials/MaterialUpload';
import { Button } from '@/components/ui/Button';
import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

export const MaterialUploadPage = () => {
  const navigate = useNavigate();
  const [praiseId, setPraiseId] = useState('');
  const [materialKindId, setMaterialKindId] = useState('');
  const uploadMaterial = useUploadMaterial();
  const { data: praises } = usePraises({ limit: 1000 });
  const { data: materialKinds } = useMaterialKinds({ limit: 1000 });

  const handleUpload = async (file: File) => {
    if (!praiseId || !materialKindId) {
      return;
    }
    try {
      await uploadMaterial.mutateAsync({
        file,
        materialKindId,
        praiseId,
      });
      navigate('/materials');
    } catch (error) {
      // Erro já tratado no hook
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Link to="/materials">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Voltar
          </Button>
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">Upload de Material</h1>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Praise
          </label>
          <select
            value={praiseId}
            onChange={(e) => setPraiseId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          >
            <option value="">Selecione um praise</option>
            {praises?.map((praise) => (
              <option key={praise.id} value={praise.id}>
                {praise.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tipo de Material
          </label>
          <select
            value={materialKindId}
            onChange={(e) => setMaterialKindId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          >
            <option value="">Selecione um tipo</option>
            {materialKinds?.map((kind) => (
              <option key={kind.id} value={kind.id}>
                {kind.name}
              </option>
            ))}
          </select>
        </div>

        <MaterialUploadComponent
          onUpload={handleUpload}
          isLoading={uploadMaterial.isPending}
          materialKindId={materialKindId}
          praiseId={praiseId}
        />
      </div>
    </div>
  );
};
