import { useState } from 'react';
import { useMaterialTypes, useDeleteMaterialType } from '@/hooks/useMaterialTypes';
import { MaterialTypeForm } from '@/components/materialTypes/MaterialTypeForm';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Loading } from '@/components/ui/Loading';
import { Plus, Edit, Trash2 } from 'lucide-react';
import type { MaterialTypeCreateFormData, MaterialTypeUpdateFormData } from '@/utils/validation';
import { useCreateMaterialType, useUpdateMaterialType } from '@/hooks/useMaterialTypes';
import { useEntityTranslations } from '@/hooks/useEntityTranslations';

export const MaterialTypeList = () => {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: types, isLoading } = useMaterialTypes({ limit: 1000 });
  const createType = useCreateMaterialType();
  const updateType = useUpdateMaterialType();
  const deleteType = useDeleteMaterialType();
  const { getMaterialTypeName } = useEntityTranslations();

  const handleCreate = async (data: MaterialTypeCreateFormData) => {
    try {
      await createType.mutateAsync(data);
      setIsCreateModalOpen(false);
    } catch (error) {
      // Erro já tratado
    }
  };

  const handleUpdate = async (data: MaterialTypeUpdateFormData) => {
    if (!editingType) return;
    try {
      await updateType.mutateAsync({ id: editingType.id, data });
      setEditingType(null);
    } catch (error) {
      // Erro já tratado
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteType.mutateAsync(deleteId);
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
        <h1 className="text-3xl font-bold text-gray-900">{t('page.materialTypes')}</h1>
        <Button onClick={() => setIsCreateModalOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          {t('action.newType')}
        </Button>
      </div>

      {types && types.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {types.map((type) => (
            <div
              key={type.id}
              className="bg-white rounded-lg shadow-md p-4 flex justify-between items-center"
            >
              <span className="text-lg font-medium">{getMaterialTypeName(type.id, type.name)}</span>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingType(type)}
                >
                  <Edit className="w-4 h-4" />
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setDeleteId(type.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">{t('message.noMaterialTypesRegistered')}</p>
        </div>
      )}

      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title={t('modal.createMaterialType')}
      >
        <MaterialTypeForm
          onSubmit={handleCreate}
          isLoading={createType.isPending}
        />
      </Modal>

      <Modal
        isOpen={!!editingType}
        onClose={() => setEditingType(null)}
        title={t('modal.editMaterialType')}
      >
        <MaterialTypeForm
          initialData={editingType}
          onSubmit={handleUpdate}
          isLoading={updateType.isPending}
        />
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title={t('modal.deleteMaterialType')}
        message={t('confirmDialog.deleteMaterialTypeMessage')}
        confirmText={t('button.delete')}
        variant="danger"
        isLoading={deleteType.isPending}
      />
    </div>
  );
};
