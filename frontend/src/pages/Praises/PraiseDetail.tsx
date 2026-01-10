import { useParams, Link, useNavigate } from 'react-router-dom';
import { usePraise, useDeletePraise } from '@/hooks/usePraises';
import { Loading } from '@/components/ui/Loading';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PraiseMaterialsList } from '@/components/praises/PraiseMaterialsList';
import { Edit, Trash2, ArrowLeft, Tag } from 'lucide-react';
import { useState } from 'react';

export const PraiseDetail = () => {
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
        Erro ao carregar praise ou praise não encontrado.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Link to="/praises">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Voltar
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
            Tags
          </h2>
          {praise.tags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {praise.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                >
                  {tag.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">Nenhuma tag associada</p>
          )}
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4">Materiais</h2>
          <PraiseMaterialsList materials={praise.materials} />
        </div>

        <div className="flex justify-end space-x-3 pt-4 border-t">
          <Link to={`/praises/${id}/edit`}>
            <Button variant="secondary">
              <Edit className="w-4 h-4 mr-2" />
              Editar
            </Button>
          </Link>
          <Button
            variant="danger"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Deletar
          </Button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDelete}
        title="Deletar Praise"
        message="Tem certeza que deseja deletar este praise? Esta ação não pode ser desfeita."
        confirmText="Deletar"
        variant="danger"
        isLoading={deletePraise.isPending}
      />
    </div>
  );
};
