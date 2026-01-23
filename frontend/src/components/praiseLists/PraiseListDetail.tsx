import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePraiseList, useDeletePraiseList, useFollowList, useUnfollowList, useCopyList, useRemovePraiseFromList, useUpdatePraiseList, useReorderPraisesInList } from '@/hooks/usePraiseLists';
import { Loading } from '@/components/ui/Loading';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Edit, Trash2, ArrowLeft, Users, Lock, Copy, UserPlus, UserMinus, X, ChevronUp, ChevronDown, Save } from 'lucide-react';
import { useState } from 'react';
import type { PraiseListUpdate, ReorderPraisesRequest } from '@/types';

export const PraiseListDetail = () => {
  const { t } = useTranslation('common');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditNameModal, setShowEditNameModal] = useState(false);
  const [editingName, setEditingName] = useState('');
  const [removingPraiseId, setRemovingPraiseId] = useState<string | null>(null);

  const { data: list, isLoading, error } = usePraiseList(id || '');
  const deleteList = useDeletePraiseList();
  const followList = useFollowList();
  const unfollowList = useUnfollowList();
  const copyList = useCopyList();
  const removePraise = useRemovePraiseFromList();
  const updateList = useUpdatePraiseList();
  const reorderPraises = useReorderPraisesInList();

  const handleDelete = async () => {
    if (!id) return;
    try {
      await deleteList.mutateAsync(id);
      navigate('/praise-lists');
    } catch (error) {
      // Erro já tratado no hook
    }
    setShowDeleteDialog(false);
  };

  const handleFollow = async () => {
    if (!id) return;
    await followList.mutateAsync(id);
  };

  const handleUnfollow = async () => {
    if (!id) return;
    await unfollowList.mutateAsync(id);
  };

  const handleCopy = async () => {
    if (!id) return;
    try {
      const newList = await copyList.mutateAsync(id);
      navigate(`/praise-lists/${newList.id}`);
    } catch (error) {
      // Erro já tratado no hook
    }
  };

  const handleRemovePraise = async (praiseId: string) => {
    if (!id) return;
    setRemovingPraiseId(praiseId);
    try {
      await removePraise.mutateAsync({ listId: id, praiseId });
    } catch (error) {
      // Erro já tratado no hook
    } finally {
      setRemovingPraiseId(null);
    }
  };

  const handleEditName = () => {
    if (list) {
      setEditingName(list.name);
      setShowEditNameModal(true);
    }
  };

  const handleSaveName = async () => {
    if (!id || !editingName.trim()) return;
    try {
      await updateList.mutateAsync({ id, data: { name: editingName.trim() } });
      setShowEditNameModal(false);
    } catch (error) {
      // Erro já tratado no hook
    }
  };

  const handleMovePraise = async (praiseId: string, direction: 'up' | 'down') => {
    if (!id || !list) return;
    
    const currentIndex = list.praises.findIndex(p => p.id === praiseId);
    if (currentIndex === -1) return;
    
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= list.praises.length) return;

    // Create new order array
    const praiseOrders = list.praises.map((praise, index) => {
      if (index === currentIndex) {
        return { praise_id: praise.id, order: newIndex };
      } else if (index === newIndex) {
        return { praise_id: praise.id, order: currentIndex };
      }
      return { praise_id: praise.id, order: index };
    });

    try {
      await reorderPraises.mutateAsync({
        listId: id,
        data: { praise_orders: praiseOrders }
      });
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

  if (error || !list) {
    return (
      <div className="text-center text-red-600">
        {t('message.errorLoadingData') || 'Erro ao carregar dados'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link to="/praise-lists">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t('button.back') || 'Voltar'}
            </Button>
          </Link>
          <div className="flex items-center space-x-2">
            <h1 className="text-3xl font-bold text-gray-900">{list.name}</h1>
            {list.is_public ? (
              <Users className="w-5 h-5 text-gray-400" title={t('label.public') || 'Pública'} />
            ) : (
              <Lock className="w-5 h-5 text-gray-400" title={t('label.private') || 'Privada'} />
            )}
            {list.is_owner && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleEditName}
                className="ml-2"
              >
                <Edit className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {list.is_owner ? (
            <>
              <Button
                variant="danger"
                size="sm"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {t('button.delete') || 'Deletar'}
              </Button>
            </>
          ) : (
            <>
              {list.is_following ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUnfollow}
                  disabled={unfollowList.isPending}
                >
                  <UserMinus className="w-4 h-4 mr-2" />
                  {t('button.unfollow') || 'Deixar de seguir'}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleFollow}
                  disabled={followList.isPending}
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  {t('button.follow') || 'Seguir'}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                disabled={copyList.isPending}
              >
                <Copy className="w-4 h-4 mr-2" />
                {t('button.copy') || 'Copiar'}
              </Button>
            </>
          )}
        </div>
      </div>

      {list.description && (
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-gray-700">{list.description}</p>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">
          {t('praise.praises') || 'Praises'} ({list.praises.length})
        </h2>
        {list.praises.length > 0 ? (
          <div className="space-y-2">
            {list.praises.map((praise, index) => (
              <div
                key={praise.id}
                className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <div className="flex items-center space-x-3 flex-1">
                  {list.is_owner && (
                    <div className="flex flex-col space-y-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleMovePraise(praise.id, 'up')}
                        disabled={index === 0 || reorderPraises.isPending}
                        className="p-1 h-6 w-6"
                      >
                        <ChevronUp className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleMovePraise(praise.id, 'down')}
                        disabled={index === list.praises.length - 1 || reorderPraises.isPending}
                        className="p-1 h-6 w-6"
                      >
                        <ChevronDown className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                  <span className="text-sm font-medium text-gray-500 w-8">
                    {praise.order + 1}.
                  </span>
                  <Link
                    to={`/praises/${praise.id}`}
                    className="flex-1 flex items-center space-x-3"
                  >
                    <div>
                      <h3 className="font-medium text-gray-900">{praise.name}</h3>
                      {praise.number && (
                        <span className="text-sm text-gray-500">#{praise.number}</span>
                      )}
                    </div>
                  </Link>
                </div>
                {list.is_owner && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRemovePraise(praise.id)}
                    disabled={removingPraiseId === praise.id}
                    className="ml-2"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">
            {t('message.noPraisesInList') || 'Nenhum praise nesta lista'}
          </p>
        )}
      </div>

      <ConfirmDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDelete}
        title={t('dialog.confirmDelete') || 'Confirmar exclusão'}
        message={t('dialog.confirmDeleteList') || 'Tem certeza que deseja deletar esta lista?'}
      />

      <Modal
        isOpen={showEditNameModal}
        onClose={() => setShowEditNameModal(false)}
        title={t('dialog.editListName') || 'Editar Nome da Lista'}
        size="sm"
      >
        <div className="space-y-4">
          <Input
            label={t('label.listName') || 'Nome da Lista'}
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleSaveName();
              }
            }}
          />
          <div className="flex justify-end space-x-2">
            <Button
              variant="outline"
              onClick={() => setShowEditNameModal(false)}
            >
              {t('button.cancel') || 'Cancelar'}
            </Button>
            <Button
              onClick={handleSaveName}
              disabled={!editingName.trim() || updateList.isPending}
            >
              <Save className="w-4 h-4 mr-2" />
              {t('button.save') || 'Salvar'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
