import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePraiseList, useUpdatePraiseList } from '@/hooks/usePraiseLists';
import { PraiseListForm } from '@/components/praiseLists/PraiseListForm';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { PraiseListUpdate } from '@/types';

export const PraiseListEdit = () => {
  const { t } = useTranslation('common');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: list, isLoading } = usePraiseList(id || '');
  const updateList = useUpdatePraiseList();

  const handleSubmit = async (data: PraiseListUpdate) => {
    if (!id) return;
    try {
      await updateList.mutateAsync({ id, data });
      navigate(`/praise-lists/${id}`);
    } catch (error) {
      // Erro já tratado no hook
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Loading size="lg" />
      </div>
    );
  }

  if (!list) {
    return (
      <div className="text-center text-red-600">
        {t('message.errorLoadingData') || 'Erro ao carregar dados'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Link to={`/praise-lists/${id}`}>
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1" />
            {t('button.back') || 'Voltar'}
          </Button>
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">
          {t('page.editList') || 'Editar Lista'}
        </h1>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <PraiseListForm
          initialData={list}
          onSubmit={handleSubmit}
          isLoading={updateList.isPending}
        />
      </div>
    </div>
  );
};
