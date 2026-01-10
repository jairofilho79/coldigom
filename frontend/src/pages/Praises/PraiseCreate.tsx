import { useNavigate } from 'react-router-dom';
import { useCreatePraise } from '@/hooks/usePraises';
import { PraiseForm } from '@/components/praises/PraiseForm';
import { Button } from '@/components/ui/Button';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { PraiseCreateFormData } from '@/utils/validation';

export const PraiseCreate = () => {
  const navigate = useNavigate();
  const createPraise = useCreatePraise();

  const handleSubmit = async (data: PraiseCreateFormData) => {
    try {
      const result = await createPraise.mutateAsync(data);
      navigate(`/praises/${result.id}`);
    } catch (error) {
      // Erro já tratado no hook
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Link to="/praises">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Voltar
          </Button>
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">Criar Novo Praise</h1>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <PraiseForm
          onSubmit={handleSubmit}
          isLoading={createPraise.isPending}
        />
      </div>
    </div>
  );
};
