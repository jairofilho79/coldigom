import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PraiseMaterialSimple } from '@/types';
import { 
  File, 
  Youtube, 
  Music, 
  FileText, 
  Link as LinkIcon,
  Edit, 
  Trash2,
  FileText as PdfIcon,
  Headphones,
  ExternalLink,
  Plus
} from 'lucide-react';
import { useDeleteMaterial, useUpdateMaterial, useUpdateMaterialWithFile, useCreateMaterial, useUploadMaterial } from '@/hooks/useMaterials';
import { useEntityTranslations } from '@/hooks/useEntityTranslations';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Modal } from '@/components/ui/Modal';
import { MaterialForm } from '@/components/materials/MaterialForm';
import { Button } from '@/components/ui/Button';
import type { MaterialUpdateFormData, MaterialCreateFormData } from '@/utils/validation';

interface PraiseMaterialsListProps {
  materials: PraiseMaterialSimple[];
  praiseId: string;
}

export const PraiseMaterialsList = ({ materials, praiseId }: PraiseMaterialsListProps) => {
  const { t } = useTranslation('common');
  const { getMaterialKindName } = useEntityTranslations();
  const [editingMaterial, setEditingMaterial] = useState<PraiseMaterialSimple | null>(null);
  const [creatingMaterial, setCreatingMaterial] = useState<boolean>(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showOldMaterials, setShowOldMaterials] = useState<boolean>(false);

  const hasOldMaterials = materials.some((m) => m.is_old === true);
  const displayedMaterials = showOldMaterials ? materials : materials.filter((m) => !m.is_old);

  const deleteMaterial = useDeleteMaterial();
  const updateMaterial = useUpdateMaterial();
  const updateMaterialWithFile = useUpdateMaterialWithFile();
  const createMaterial = useCreateMaterial();
  const uploadMaterial = useUploadMaterial();

  // Função para obter a URL do material
  const getMaterialUrl = (material: PraiseMaterialSimple): string => {
    // Se for texto, não retorna URL clicável
    if (material.type === 'text') {
      return '#';
    }

    // Se for YouTube ou Spotify, retorna a URL externa diretamente
    if (material.type === 'youtube' || material.type === 'spotify') {
      return material.path;
    }

    // Se for link externo (http/https), retorna a URL diretamente
    if (material.path.startsWith('http://') || material.path.startsWith('https://')) {
      return material.path;
    }

    // Para arquivos, retorna a URL do endpoint de download do backend
    // O token será passado via query parameter para permitir autenticação via <a>
    const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
    const token = localStorage.getItem('token');
    
    // URL do endpoint que serve o arquivo diretamente (redireciona para URL assinada)
    // Token é passado como query parameter porque <a> não envia headers
    // Adiciona hash do path para cache-busting (muda quando o path muda)
    // O path pode mudar quando o arquivo é substituído (mesmo material_id, mas pode ter extensão diferente)
    const pathHash = material.path ? `&v=${btoa(material.path).slice(-16).replace(/[^a-zA-Z0-9]/g, '')}` : '';
    const tokenParam = token ? `?token=${encodeURIComponent(token)}${pathHash}` : pathHash ? `?${pathHash.substring(1)}` : '';
    return `${baseUrl}/api/v1/praise-materials/${material.id}/download${tokenParam}`;
  };

  // Handler para cliques nos botões de ação
  const handleActionClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  const getIcon = (type: string, path: string) => {
    // Detecta PDF pela extensão
    if (path.toLowerCase().endsWith('.pdf')) {
      return <PdfIcon className="w-5 h-5 text-red-600" />;
    }
    
    // Detecta áudio pelas extensões comuns
    const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'];
    if (audioExtensions.some(ext => path.toLowerCase().endsWith(ext))) {
      return <Headphones className="w-5 h-5 text-blue-600" />;
    }

    switch (type) {
      case 'file':
        return <File className="w-5 h-5 text-gray-600" />;
      case 'youtube':
        return <Youtube className="w-5 h-5 text-red-600" />;
      case 'spotify':
        return <Music className="w-5 h-5 text-green-600" />;
      case 'text':
        return <FileText className="w-5 h-5 text-gray-600" />;
      default:
        // Se começar com http/https, assume ser um link
        if (path.startsWith('http://') || path.startsWith('https://')) {
          return <LinkIcon className="w-5 h-5 text-blue-600" />;
        }
        return <File className="w-5 h-5 text-gray-600" />;
    }
  };


  const handleEdit = (material: PraiseMaterialSimple) => {
    setEditingMaterial(material);
  };

  const handleUpdate = async (data: MaterialUpdateFormData | { file: File; material_kind_id?: string; is_old?: boolean; old_description?: string | null }) => {
    if (!editingMaterial) return;
    
    console.log('handleUpdate - dados recebidos', { data, editingMaterial });
    
    try {
      // Se o data contém file, usa updateMaterialWithFile
      if ('file' in data && data.file) {
        const fileData = data as { file: File; material_kind_id?: string; is_old?: boolean; old_description?: string | null };
        console.log('handleUpdate - usando updateMaterialWithFile', {
          id: editingMaterial.id,
          fileName: data.file.name,
          materialKindId: fileData.material_kind_id,
          praiseId,
        });
        await updateMaterialWithFile.mutateAsync({
          id: editingMaterial.id,
          file: data.file,
          materialKindId: fileData.material_kind_id,
          praiseId: praiseId,
          isOld: fileData.is_old,
          oldDescription: fileData.old_description,
        });
      } else {
        console.log('handleUpdate - usando updateMaterial', {
          id: editingMaterial.id,
          data,
        });
        // Senão, usa updateMaterial normalmente
        await updateMaterial.mutateAsync({
          id: editingMaterial.id,
          data: data as MaterialUpdateFormData,
        });
      }
      setEditingMaterial(null);
    } catch (error) {
      console.error('handleUpdate - erro capturado', error);
      // Erro já tratado no hook
    }
  };

  const handleCreate = async (data: MaterialCreateFormData | { file?: File; material_kind_id?: string; is_old?: boolean; old_description?: string | null }) => {
    try {
      // Se tiver arquivo, usa upload
      if ('file' in data && data.file) {
        const { file, material_kind_id, is_old, old_description } = data as { file: File; material_kind_id: string; is_old?: boolean; old_description?: string | null };
        await uploadMaterial.mutateAsync({
          file,
          materialKindId: material_kind_id,
          praiseId,
          isOld: is_old,
          oldDescription: old_description,
        });
      } else {
        // Senão, cria normalmente (link, texto, etc)
        await createMaterial.mutateAsync(data as MaterialCreateFormData);
      }
      setCreatingMaterial(false);
    } catch (error) {
      // Erro já tratado no hook
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteMaterial.mutateAsync(deleteId);
      setDeleteId(null);
    } catch (error) {
      // Erro já tratado no hook
    }
  };

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">{t('label.materials')}</h2>
        <div className="flex items-center gap-2">
          {hasOldMaterials && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowOldMaterials((v) => !v)}
            >
              {showOldMaterials ? t('label.hideOldMaterials') : t('label.viewOldMaterials')}
            </Button>
          )}
          <Button
            onClick={() => setCreatingMaterial(true)}
            size="sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            {t('action.newMaterial')}
          </Button>
        </div>
      </div>
      {displayedMaterials.length === 0 ? (
        <div className="text-sm text-gray-500 mb-4">{t('message.noMaterialsAdded')}</div>
      ) : (
        <div className="space-y-3">
        {displayedMaterials.map((material) => {
          const materialUrl = getMaterialUrl(material);
          const isFile = material.type === 'file';
          const isText = material.type === 'text';
          const isClickable = !isText;
          
          const content = (
            <>
              {getIcon(material.type, material.path)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2 flex-wrap gap-1">
                  {material.material_kind ? (
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {getMaterialKindName(material.material_kind.id, material.material_kind.name)}
                    </span>
                  ) : (
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {t('entity.material')}
                    </span>
                  )}
                  {material.is_old && (
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800"
                      title={material.old_description || undefined}
                    >
                      {t('label.badgeOld')}
                    </span>
                  )}
                  {isClickable && (
                    <ExternalLink className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </div>
              </div>
            </>
          );
          
          return (
            <div
              key={material.id}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-md hover:bg-gray-100 transition-colors group"
            >
              {isText ? (
                // Para textos, não é clicável
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                  {content}
                </div>
              ) : isFile ? (
                // Para arquivos, usa <a> que aponta para o endpoint de download do backend
                // O backend redireciona para a URL assinada do storage
                <a
                  href={materialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center space-x-3 flex-1 min-w-0 no-underline text-inherit"
                >
                  {content}
                </a>
              ) : (
                // Para links externos (YouTube, Spotify, URLs http/https)
                <a
                  href={materialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center space-x-3 flex-1 min-w-0 no-underline text-inherit"
                >
                  {content}
                </a>
              )}
              <div className="flex items-center space-x-2 ml-3">
                <button
                  onClick={(e) => {
                    handleActionClick(e);
                    handleEdit(material);
                  }}
                  className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  title={t('button.edit')}
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => {
                    handleActionClick(e);
                    setDeleteId(material.id);
                  }}
                  className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                  title={t('button.delete')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
        </div>
      )}

      {/* Modal de Criação */}
      {creatingMaterial && (
        <Modal
          isOpen={creatingMaterial}
          onClose={() => setCreatingMaterial(false)}
          title={t('action.newMaterial')}
          size="lg"
        >
          <MaterialForm
            praiseId={praiseId}
            onSubmit={handleCreate}
            isLoading={createMaterial.isPending || uploadMaterial.isPending}
          />
        </Modal>
      )}

      {/* Modal de Edição */}
      {editingMaterial && (
        <Modal
          isOpen={!!editingMaterial}
          onClose={() => setEditingMaterial(null)}
          title={t('button.edit') + ' ' + t('label.materials').toLowerCase()}
          size="lg"
        >
          <MaterialForm
            praiseId={praiseId}
            initialData={editingMaterial}
            onSubmit={handleUpdate}
            isLoading={updateMaterial.isPending || updateMaterialWithFile.isPending}
          />
        </Modal>
      )}

      {/* Dialog de Confirmação de Remoção */}
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title={t('button.delete') + ' ' + t('label.materials').toLowerCase()}
        message={t('confirmDialog.deleteMaterialMessage')}
        confirmText={t('button.delete')}
        variant="danger"
        isLoading={deleteMaterial.isPending}
      />
    </>
  );
};
