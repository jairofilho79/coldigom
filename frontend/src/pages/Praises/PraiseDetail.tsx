import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePraise, useDeletePraise, useReviewAction } from '@/hooks/usePraises';
import { useEntityTranslations } from '@/hooks/useEntityTranslations';
import { Loading } from '@/components/ui/Loading';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Modal } from '@/components/ui/Modal';
import { PraiseMaterialsList } from '@/components/praises/PraiseMaterialsList';
import { Edit, Trash2, ArrowLeft, Tag, Download, FileSearch, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { praisesApi } from '@/api/praises';
import type { ReviewEventType } from '@/types';

const REVIEW_EVENT_LABEL: Record<ReviewEventType, string> = {
  in_review: 'review.inReview',
  review_cancelled: 'review.reviewCancelled',
  review_finished: 'review.reviewFinished',
};

const REVIEW_EVENT_DOT: Record<ReviewEventType, string> = {
  in_review: 'bg-amber-500',
  review_cancelled: 'bg-red-400',
  review_finished: 'bg-green-500',
};

export const PraiseDetail = () => {
  const { t } = useTranslation('common');
  const { getPraiseTagName } = useEntityTranslations();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showStartReviewModal, setShowStartReviewModal] = useState(false);
  const [showCancelReviewDialog, setShowCancelReviewDialog] = useState(false);
  const [showFinishReviewDialog, setShowFinishReviewDialog] = useState(false);
  const [startReviewDescription, setStartReviewDescription] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  const { data: praise, isLoading, error } = usePraise(id || '');
  const deletePraise = useDeletePraise();
  const reviewAction = useReviewAction();

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

  const handleStartReview = async () => {
    if (!id) return;
    try {
      await reviewAction.mutateAsync({
        id,
        data: { action: 'start', in_review_description: startReviewDescription || undefined },
      });
      setShowStartReviewModal(false);
      setStartReviewDescription('');
    } catch {
      // Erro já tratado no hook
    }
  };

  const handleCancelReview = async () => {
    if (!id) return;
    try {
      await reviewAction.mutateAsync({ id, data: { action: 'cancel' } });
      setShowCancelReviewDialog(false);
    } catch {
      // Erro já tratado no hook
    }
  };

  const handleFinishReview = async () => {
    if (!id) return;
    try {
      await reviewAction.mutateAsync({ id, data: { action: 'finish' } });
      setShowFinishReviewDialog(false);
    } catch {
      // Erro já tratado no hook
    }
  };

  const handleDownloadZip = async () => {
    if (!id) return;
    
    setIsDownloading(true);
    try {
      const blob = await praisesApi.downloadPraiseZip(id);
      
      // Criar URL do blob
      const url = window.URL.createObjectURL(blob);
      
      // Criar elemento <a> temporário para download
      const link = document.createElement('a');
      link.href = url;
      
      // Obter nome do arquivo do Content-Disposition header ou usar padrão
      const praiseName = praise?.name || 'praise';
      const praiseNumber = praise?.number;
      const fileName = praiseNumber 
        ? `${praiseName}_${praiseNumber}.zip`
        : `${praiseName}.zip`;
      
      // Sanitizar nome do arquivo
      const sanitizedFileName = fileName.replace(/[^a-z0-9._-]/gi, '_').toLowerCase();
      link.download = sanitizedFileName;
      
      // Disparar download
      document.body.appendChild(link);
      link.click();
      
      // Limpar
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erro ao baixar ZIP:', error);
      // TODO: Mostrar mensagem de erro ao usuário
    } finally {
      setIsDownloading(false);
    }
  };

  if (isLoading && !praise) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Loading size="lg" />
      </div>
    );
  }

  // Mostra erro apenas se não houver dados em cache (stale ou não)
  // O React Query mantém dados stale disponíveis mesmo quando há erro de rede
  if (error && !praise) {
    return (
      <div className="text-center text-red-600">
        {t('message.errorLoadingData')}
      </div>
    );
  }

  // Se não houver dados e não houver erro, ainda está carregando
  if (!praise) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Loading size="lg" />
      </div>
    );
  }

  const tags = praise.tags ?? [];
  const materials = praise.materials ?? [];
  const reviewHistory = praise.review_history ?? [];

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
          {tags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
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
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <FileSearch className="w-5 h-5 mr-2" />
            {t('review.sectionTitle')}
          </h2>
          {praise.in_review ? (
            <div className="space-y-3">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-800">
                {t('review.inReview')}
              </span>
              {praise.in_review_description && (
                <p className="text-gray-600">{praise.in_review_description}</p>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCancelReviewDialog(true)}
                  disabled={reviewAction.isPending}
                >
                  {t('review.cancelReview')}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setShowFinishReviewDialog(true)}
                  disabled={reviewAction.isPending}
                >
                  {t('review.finishReview')}
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowStartReviewModal(true)}
                disabled={reviewAction.isPending}
              >
                {t('review.markInReview')}
              </Button>
            </div>
          )}
          {reviewHistory.length > 0 && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setHistoryExpanded((v) => !v)}
                className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer hover:text-gray-900 transition-colors"
              >
                {historyExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                {t('review.history')} ({reviewHistory.length})
              </button>
              {historyExpanded && (
                <div className="mt-2 max-h-48 overflow-y-auto border-l-2 border-gray-200 pl-3">
                  <ul className="space-y-2 text-sm text-gray-600">
                    {(() => {
                      const reversed = [...reviewHistory].reverse();
                      const firstInReviewIndex = reversed.findIndex((e) => e.type === 'in_review');
                      return reversed.map((evt, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span
                            className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${REVIEW_EVENT_DOT[evt.type]}`}
                          />
                          <div className="min-w-0">
                              <span className="font-medium">{t(REVIEW_EVENT_LABEL[evt.type])}</span>
                              <span> – </span>
                              <span>{new Date(evt.date).toLocaleString()}</span>
                              {i === firstInReviewIndex && praise.in_review_description && (
                                <p className="text-gray-500 text-xs mt-0.5">
                                  {praise.in_review_description}
                                </p>
                              )}
                          </div>
                        </li>
                      ));
                    })()}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div>
          <PraiseMaterialsList materials={materials} praiseId={id || ''} />
        </div>

        <div className="flex justify-end space-x-3 pt-4 border-t">
          <Button
            variant="primary"
            onClick={handleDownloadZip}
            disabled={isDownloading}
          >
            <Download className="w-4 h-4 mr-2" />
            {isDownloading ? t('button.downloading') || 'Baixando...' : t('button.downloadZip') || 'Download ZIP'}
          </Button>
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

      <Modal
        isOpen={showStartReviewModal}
        onClose={() => { setShowStartReviewModal(false); setStartReviewDescription(''); }}
        title={t('review.startReview')}
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('review.inReviewDescription')}
            </label>
            <textarea
              value={startReviewDescription}
              onChange={(e) => setStartReviewDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder={t('review.inReviewDescription')}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => { setShowStartReviewModal(false); setStartReviewDescription(''); }}
              disabled={reviewAction.isPending}
            >
              {t('button.close')}
            </Button>
            <Button
              variant="primary"
              onClick={handleStartReview}
              isLoading={reviewAction.isPending}
            >
              {t('review.startReview')}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={showCancelReviewDialog}
        onClose={() => setShowCancelReviewDialog(false)}
        onConfirm={handleCancelReview}
        title={t('review.cancelReview')}
        message={t('review.confirmCancel')}
        confirmText={t('review.cancelReview')}
        variant="danger"
        isLoading={reviewAction.isPending}
      />

      <ConfirmDialog
        isOpen={showFinishReviewDialog}
        onClose={() => setShowFinishReviewDialog(false)}
        onConfirm={handleFinishReview}
        title={t('review.finishReview')}
        message={t('review.confirmFinish')}
        confirmText={t('review.finishReview')}
        variant="primary"
        isLoading={reviewAction.isPending}
      />
    </div>
  );
};
