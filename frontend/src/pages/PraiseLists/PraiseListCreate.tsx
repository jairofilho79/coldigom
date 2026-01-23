import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCreatePraiseList } from '@/hooks/usePraiseLists';
import { PraiseListForm } from '@/components/praiseLists/PraiseListForm';
import { Button } from '@/components/ui/Button';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { PraiseListCreate } from '@/types';

export const PraiseListCreate = () => {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const createList = useCreatePraiseList();

  const handleSubmit = async (data: PraiseListCreate) => {
    try {
      const result = await createList.mutateAsync(data);
      navigate(`/praise-lists/${result.id}`);
    } catch (error) {
      // Erro já tratado no hook
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Link to="/praise-lists">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1" />
            {t('button.back') || 'Voltar'}
          </Button>
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">
          {t('page.createList') || 'Criar Lista'}
        </h1>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <PraiseListForm
          onSubmit={handleSubmit}
          isLoading={createList.isPending}
        />
      </div>
    </div>
  );
};
