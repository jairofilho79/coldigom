import { useState } from 'react';
import { useMaterials, useDeleteMaterial, useDownloadUrl } from '@/hooks/useMaterials';
import { MaterialCard } from '@/components/materials/MaterialCard';
import { Loading } from '@/components/ui/Loading';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from 'react-hot-toast';

export const MaterialList = () => {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { data: materials, isLoading } = useMaterials({ limit: 100 });
  const deleteMaterial = useDeleteMaterial();
  const downloadUrl = useDownloadUrl();

  const handleDelete = async (id: string) => {
    setDeleteId(id);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteMaterial.mutateAsync(deleteId);
      setDeleteId(null);
    } catch (error) {
      // Erro já tratado no hook
    }
  };

  const handleDownload = async (id: string) => {
    try {
      const result = await downloadUrl.mutateAsync({ id });
      window.open(result.download_url, '_blank');
    } catch (error: any) {
      toast.error('Erro ao obter URL de download');
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
      <h1 className="text-3xl font-bold text-gray-900">Materiais</h1>
      {materials && materials.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {materials.map((material) => (
            <MaterialCard
              key={material.id}
              material={material}
              onDelete={handleDelete}
              onDownload={handleDownload}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">Nenhum material cadastrado</p>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={confirmDelete}
        title="Deletar Material"
        message="Tem certeza que deseja deletar este material? Esta ação não pode ser desfeita."
        confirmText="Deletar"
        variant="danger"
        isLoading={deleteMaterial.isPending}
      />
    </div>
  );
};
