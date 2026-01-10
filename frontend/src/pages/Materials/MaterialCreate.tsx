import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useCreateMaterial } from '@/hooks/useMaterials';
import { MaterialForm } from '@/components/materials/MaterialForm';
import { Button } from '@/components/ui/Button';
import { ArrowLeft } from 'lucide-react';
import type { MaterialCreateFormData } from '@/utils/validation';

export const MaterialCreate = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const praiseId = searchParams.get('praise_id') || '';
  const createMaterial = useCreateMaterial();

  const handleSubmit = async (data: MaterialCreateFormData) => {
    try {
      await createMaterial.mutateAsync(data);
      navigate(praiseId ? `/praises/${praiseId}` : '/materials');
    } catch (error) {
      // Erro já tratado no hook
    }
  };

  if (!praiseId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 mb-4">
          É necessário fornecer um praise_id para criar um material
        </p>
        <Link to="/materials">
          <Button>Voltar para Materiais</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Link to={praiseId ? `/praises/${praiseId}` : '/materials'}>
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Voltar
          </Button>
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">Criar Material</h1>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <MaterialForm
          praiseId={praiseId}
          onSubmit={handleSubmit}
          isLoading={createMaterial.isPending}
        />
      </div>
    </div>
  );
};
