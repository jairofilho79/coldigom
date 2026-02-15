import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMaterialKinds, useDeleteMaterialKind } from '@/hooks/useMaterialKinds';
import { MaterialKindForm } from '@/components/materialKinds/MaterialKindForm';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Loading } from '@/components/ui/Loading';
import { Plus, Edit, Trash2 } from 'lucide-react';
import type { MaterialKindCreateFormData, MaterialKindUpdateFormData } from '@/utils/validation';
import { useCreateMaterialKind, useUpdateMaterialKind } from '@/hooks/useMaterialKinds';
import { useEntityTranslations } from '@/hooks/useEntityTranslations';

export const MaterialKindList = () => {
  const { t } = useTranslation('common');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingKind, setEditingKind] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: kinds, isLoading } = useMaterialKinds({ limit: 1000 });
  const { getMaterialKindName } = useEntityTranslations();
  const createKind = useCreateMaterialKind();
  const updateKind = useUpdateMaterialKind();
  const deleteKind = useDeleteMaterialKind();

  const handleCreate = async (
    data: MaterialKindCreateFormData | MaterialKindUpdateFormData
  ) => {
    try {
      await createKind.mutateAsync(data as MaterialKindCreateFormData);
      setIsCreateModalOpen(false);
    } catch (error) {
      // Erro já tratado
    }
  };

  const handleUpdate = async (data: MaterialKindUpdateFormData) => {
    if (!editingKind) return;
    try {
      await updateKind.mutateAsync({ id: editingKind.id, data });
      setEditingKind(null);
    } catch (error) {
      // Erro já tratado
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteKind.mutateAsync(deleteId);
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
        <h1 className="text-3xl font-bold text-gray-900">{t('page.materialKinds')}</h1>
        <Button onClick={() => setIsCreateModalOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          {t('action.newType')}
        </Button>
      </div>

      {kinds && kinds.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {kinds.map((kind) => (
            <div
              key={kind.id}
              className="bg-white rounded-lg shadow-md p-4 flex justify-between items-center"
            >
              <span className="text-lg font-medium">{getMaterialKindName(kind.id, kind.name)}</span>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingKind(kind)}
                >
                  <Edit className="w-4 h-4" />
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setDeleteId(kind.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">{t('message.noMaterialKindsRegistered')}</p>
        </div>
      )}

      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title={t('modal.createMaterialKind')}
      >
        <MaterialKindForm
          onSubmit={handleCreate}
          isLoading={createKind.isPending}
        />
      </Modal>

      <Modal
        isOpen={!!editingKind}
        onClose={() => setEditingKind(null)}
        title={t('modal.editMaterialKind')}
      >
        <MaterialKindForm
          initialData={editingKind}
          onSubmit={handleUpdate}
          isLoading={updateKind.isPending}
        />
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title={t('modal.deleteMaterialKind')}
        message={t('confirmDialog.deleteMaterialKindMessage')}
        confirmText={t('button.delete')}
        variant="danger"
        isLoading={deleteKind.isPending}
      />
    </div>
  );
};
