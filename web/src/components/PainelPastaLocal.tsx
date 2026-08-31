import type { ReactNode } from 'react';
import { StyledFileInput } from './StyledFileInput';
import { BulkFolderScanStatus } from './BulkFolderScanStatus';
import { BulkFilePreviewList } from './BulkFilePreviewList';
import type { BulkScanState } from './bulkScanState';
import type { BulkFileItem } from '../lib/materialKindInference/scanFolder';

/**
 * Painel de importação de uma pasta local.
 *
 * Existia duplicado na PraiseDetailPage — uma cópia no modo de criação e outra
 * no de edição —, diferindo só no texto de ajuda, no que desabilita o seletor
 * e no rodapé de ação.
 */
export function PainelPastaLocal({
  ajuda,
  desabilitado,
  scan,
  arquivos,
  onEscolherPasta,
  onTentarDeNovo,
  materialKindOptions,
  onKindChange,
  onRemove,
  children,
}: {
  ajuda?: ReactNode;
  desabilitado?: boolean;
  scan: BulkScanState;
  arquivos: BulkFileItem[];
  onEscolherPasta: (files: File[]) => void;
  onTentarDeNovo: () => void;
  materialKindOptions: Array<{ value: string; label: string }>;
  onKindChange: (index: number, material_kind: string) => void;
  onRemove: (index: number) => void;
  /** Rodapé de ação — a única parte que difere entre criar e editar. */
  children?: ReactNode;
}) {
  return (
    <div className="materials-panel materials-admin-bulk">
      <h3 className="materials-panel-title">Importação em lote (pasta)</h3>
      {ajuda}
      <StyledFileInput
        label="Escolher pasta"
        directory
        disabled={scan.phase === 'scanning' || Boolean(desabilitado)}
        selectedName={
          scan.folderName
            ? `${scan.folderName} (${scan.total || arquivos.length} arquivo(s))`
            : arquivos.length > 0
              ? `${arquivos.length} arquivo(s)`
              : null
        }
        onChange={onEscolherPasta}
      />
      <BulkFolderScanStatus scan={scan} files={arquivos} onRetry={onTentarDeNovo} />
      {scan.phase === 'done' && arquivos.length > 0 && (
        <>
          <BulkFilePreviewList
            files={arquivos}
            materialKindOptions={materialKindOptions}
            onKindChange={onKindChange}
            onRemove={onRemove}
          />
          {children}
        </>
      )}
    </div>
  );
}
