import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTags, useDeleteTag } from '@/hooks/useTags';
import { TagForm } from '@/components/tags/TagForm';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Loading } from '@/components/ui/Loading';
import { Plus, Edit, Trash2 } from 'lucide-react';
import type { TagCreateFormData, TagUpdateFormData } from '@/utils/validation';
import { useCreateTag, useUpdateTag } from '@/hooks/useTags';
import { useEntityTranslations } from '@/hooks/useEntityTranslations';

export const TagList = () => {
  const { t } = useTranslation('common');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: tags, isLoading } = useTags({ limit: 1000 });
  const { getPraiseTagName } = useEntityTranslations();
  const createTag = useCreateTag();
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();

  const handleCreate = async (data: TagCreateFormData) => {
    try {
      await createTag.mutateAsync(data);
      setIsCreateModalOpen(false);
    } catch (error) {
      // Erro já tratado
    }
  };

  const handleUpdate = async (data: TagUpdateFormData) => {
    if (!editingTag) return;
    try {
      await updateTag.mutateAsync({ id: editingTag.id, data });
      setEditingTag(null);
    } catch (error) {
      // Erro já tratado
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteTag.mutateAsync(deleteId);
      setDeleteId(null);
    } catch (error) {
      // Erro já tratado
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Loading size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">{t('page.tags')}</h1>
        <Button onClick={() => setIsCreateModalOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          {t('action.newTag')}
        </Button>
      </div>

      {tags && tags.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tags.map((tag) => (
            <div
              key={tag.id}
              className="bg-white rounded-lg shadow-md p-4 flex justify-between items-center"
            >
              <span className="text-lg font-medium">{getPraiseTagName(tag.id, tag.name)}</span>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingTag(tag)}
                >
                  <Edit className="w-4 h-4" />
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setDeleteId(tag.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">{t('message.noTagsRegistered')}</p>
        </div>
      )}

      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title={t('modal.createTag')}
      >
        <TagForm
          onSubmit={handleCreate}
          isLoading={createTag.isPending}
        />
      </Modal>

      <Modal
        isOpen={!!editingTag}
        onClose={() => setEditingTag(null)}
        title={t('modal.editTag')}
      >
        <TagForm
          initialData={editingTag}
          onSubmit={handleUpdate}
          isLoading={updateTag.isPending}
        />
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title={t('modal.deleteTag')}
        message={t('confirmDialog.deleteTagMessage')}
        confirmText={t('button.delete')}
        variant="danger"
        isLoading={deleteTag.isPending}
      />
    </div>
  );
};
