import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePraise, useUpdatePraise } from '@/hooks/usePraises';
import { PraiseForm } from '@/components/praises/PraiseForm';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { ArrowLeft } from 'lucide-react';
import type { PraiseUpdateFormData } from '@/utils/validation';

export const PraiseEdit = () => {
  const { t } = useTranslation('common');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: praise, isLoading } = usePraise(id || '');
  const updatePraise = useUpdatePraise();

  const handleSubmit = async (data: PraiseUpdateFormData) => {
    if (!id) return;
    try {
      await updatePraise.mutateAsync({ id, data });
      navigate(`/praises/${id}`);
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

  if (!praise) {
    return <div>{t('message.praiseNotFound')}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Link to={`/praises/${id}`}>
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1" />
            {t('button.back')}
          </Button>
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">{t('page.editPraise')}</h1>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <PraiseForm
          initialData={praise}
          onSubmit={handleSubmit}
          isLoading={updatePraise.isPending}
        />
      </div>
    </div>
  );
};
