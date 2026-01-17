import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePraise, useDeletePraise } from '@/hooks/usePraises';
import { useEntityTranslations } from '@/hooks/useEntityTranslations';
import { Loading } from '@/components/ui/Loading';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PraiseMaterialsList } from '@/components/praises/PraiseMaterialsList';
import { Edit, Trash2, ArrowLeft, Tag } from 'lucide-react';
import { useState } from 'react';

export const PraiseDetail = () => {
  const { t } = useTranslation('common');
  const { getPraiseTagName } = useEntityTranslations();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const { data: praise, isLoading, error } = usePraise(id || '');
  const deletePraise = useDeletePraise();

  const handleDelete = async () => {
    if (!id) return;
    try {
      await deletePraise.mutateAsync(id);
      navigate('/praises');
    } catch (error) {
      // Erro já tratado no hook
    }
    setShowDeleteDialog(false);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Loading size="lg" />
      </div>
    );
  }

  if (error || !praise) {
    return (
      <div className="text-center text-red-600">
        {t('message.errorLoadingData')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Link to="/praises">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1" />
            {t('button.back')}
          </Button>
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">{praise.name}</h1>
        {praise.number && (
          <span className="text-lg text-gray-500">#{praise.number}</span>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-md p-6 space-y-6">
        <div>
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <Tag className="w-5 h-5 mr-2" />
            {t('label.tags')}
          </h2>
          {praise.tags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {praise.tags.map((tag) => (
                <Link
                  key={tag.id}
                  to={`/praises?tag_id=${tag.id}`}
                  className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm hover:bg-blue-200 transition-colors cursor-pointer"
                >
                  {getPraiseTagName(tag.id, tag.name)}
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">{t('message.noTags')}</p>
          )}
        </div>

        <div>
          <PraiseMaterialsList materials={praise.materials} praiseId={id || ''} />
        </div>

        <div className="flex justify-end space-x-3 pt-4 border-t">
          <Link to={`/praises/${id}/edit`}>
            <Button variant="secondary">
              <Edit className="w-4 h-4 mr-2" />
              {t('button.edit')}
            </Button>
          </Link>
          <Button
            variant="danger"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            {t('button.delete')}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDelete}
        title={t('modal.deletePraise')}
        message={t('confirmDialog.deletePraiseMessage')}
        confirmText={t('button.delete')}
        variant="danger"
        isLoading={deletePraise.isPending}
      />
    </div>
  );
};
