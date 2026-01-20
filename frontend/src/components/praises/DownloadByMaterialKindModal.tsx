import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMaterialKinds } from '@/hooks/useMaterialKinds';
import { useEntityTranslations } from '@/hooks/useEntityTranslations';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { AlertTriangle } from 'lucide-react';
import { praisesApi } from '@/api/praises';

interface DownloadByMaterialKindModalProps {
  isOpen: boolean;
  onClose: () => void;
  tagId?: string;
  tagName?: string;
}

export const DownloadByMaterialKindModal = ({
  isOpen,
  onClose,
  tagId,
  tagName,
}: DownloadByMaterialKindModalProps) => {
  const { t } = useTranslation('common');
  const { data: materialKinds, isLoading: materialKindsLoading } = useMaterialKinds({ limit: 1000 });
  const { getMaterialKindName } = useEntityTranslations();
  const [selectedMaterialKindId, setSelectedMaterialKindId] = useState<string>('');
  const [maxZipSizeMb, setMaxZipSizeMb] = useState<number>(100);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    if (!selectedMaterialKindId) {
      return;
    }

    setIsDownloading(true);
    try {
      const blob = await praisesApi.downloadPraisesByMaterialKind(
        selectedMaterialKindId,
        tagId,
        maxZipSizeMb
      );

      // Criar URL do blob
      const url = window.URL.createObjectURL(blob);

      // Criar elemento <a> temporário para download
      const link = document.createElement('a');
      link.href = url;

      // Obter nome do material kind para nomear o arquivo
      const materialKind = materialKinds?.find(k => k.id === selectedMaterialKindId);
      const materialKindName = materialKind ? getMaterialKindName(materialKind.id, materialKind.name) : 'materials';
      const fileName = `materials_${materialKindName.replace(/[^a-z0-9._-]/gi, '_').toLowerCase()}.zip`;

      link.download = fileName;

      // Disparar download
      document.body.appendChild(link);
      link.click();

      // Limpar
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      // Fechar modal e resetar
      onClose();
      setSelectedMaterialKindId('');
      setMaxZipSizeMb(100);
    } catch (error) {
      console.error('Erro ao baixar ZIP:', error);
      // TODO: Mostrar mensagem de erro ao usuário
    } finally {
      setIsDownloading(false);
    }
  };

  const handleClose = () => {
    if (!isDownloading) {
      onClose();
      setSelectedMaterialKindId('');
      setMaxZipSizeMb(100);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('button.downloadByMaterialKind') || 'Baixar por Material Kind'}
      size="md"
    >
      <div className="space-y-4">
        {tagId && tagName && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-800">
                {t('message.tagFilterActive') || 'Filtro de tag ativo'}
              </p>
              <p className="text-sm text-yellow-700 mt-1">
                {t('message.downloadLimitedToTag') || 'O download será limitado aos praises com a tag'} <span className="font-semibold">"{tagName}"</span>
              </p>
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('label.materialKind')}
          </label>
          {materialKindsLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loading size="sm" />
            </div>
          ) : (
            <select
              value={selectedMaterialKindId}
              onChange={(e) => setSelectedMaterialKindId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={isDownloading}
            >
              <option value="">
                {t('label.selectMaterialKind')}
              </option>
              {materialKinds?.map((kind) => (
                <option key={kind.id} value={kind.id}>
                  {getMaterialKindName(kind.id, kind.name)}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('label.maxZipSize') || 'Tamanho máximo por ZIP (MB)'}
          </label>
          <input
            type="number"
            min="10"
            max="1000"
            value={maxZipSizeMb}
            onChange={(e) => setMaxZipSizeMb(parseInt(e.target.value) || 100)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            disabled={isDownloading}
          />
          <p className="mt-1 text-xs text-gray-500">
            {t('message.maxZipSizeHint') || 'Os arquivos serão divididos em múltiplos ZIPs quando excederem este tamanho'}
          </p>
        </div>

        <div className="flex justify-end space-x-3 pt-4 border-t">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isDownloading}
          >
            {t('button.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={handleDownload}
            disabled={!selectedMaterialKindId || isDownloading}
            isLoading={isDownloading}
          >
            {isDownloading ? (t('button.downloading') || 'Baixando...') : (t('button.download') || 'Baixar')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
