import type { ReactNode, Ref } from 'react';
import { BulkFolderScanStatus } from './BulkFolderScanStatus';
import { BulkFilePreviewList } from './BulkFilePreviewList';
import type { BulkScanState } from './bulkScanState';
import type { BulkFileItem } from '../lib/materialKindInference/scanFolder';

/**
 * Painel de mapeamento do Google Drive.
 *
 * Existia duplicado na PraiseDetailPage — uma cópia no modo de criação e outra
 * no de edição —, idênticas exceto pelo rodapé de ação e por uma frase de
 * ajuda. Duas cópias de ~95 linhas é onde uma correção entra numa e esquece a
 * outra; só o rodapé varia, então ele vem por children.
 */
export function PainelImportacaoDrive({
  painelRef,
  ajudaExtra,
  conectado,
  onConectar,
  url,
  onUrlChange,
  ocupado,
  onMapear,
  scan,
  arquivos,
  pulados,
  materialKindOptions,
  onKindChange,
  onRemove,
  acaoDoLote,
  children,
}: {
  painelRef?: Ref<HTMLDivElement>;
  ajudaExtra?: ReactNode;
  conectado: boolean | null;
  onConectar: () => void;
  url: string;
  onUrlChange: (v: string) => void;
  ocupado: boolean;
  onMapear: () => void;
  scan: BulkScanState;
  arquivos: BulkFileItem[];
  pulados: Array<{ path: string; reason: string }>;
  materialKindOptions: Array<{ value: string; label: string }>;
  onKindChange: (index: number, material_kind: string) => void;
  onRemove: (index: number) => void;
  /** Ação sobre o lote mapeado — só aparece com o scan concluído. */
  acaoDoLote?: ReactNode;
  /** Conteúdo livre no fim do painel: o acompanhamento do job, no modo edição. */
  children?: ReactNode;
}) {
  return (
    <div className="materials-panel materials-admin-bulk" ref={painelRef}>
      <h3 className="materials-panel-title">Importar do Google Drive</h3>
      <p className="materials-panel-help">
        Cole o link de uma pasta ou arquivo do Drive. Documentos nativos do Google (Docs/Sheets) são pulados com aviso.
        {ajudaExtra}
      </p>
      {conectado === false && (
        <p className="materials-panel-help">
          É preciso autorizar o Coldigom a ler seu Drive (somente leitura).
          {' '}
          <button type="button" className="linkish" onClick={onConectar}>
            Conectar Google Drive
          </button>
        </p>
      )}
      <div className="drive-url-row">
        <input
          type="url"
          className="edit-input"
          placeholder="https://drive.google.com/drive/folders/…"
          value={url}
          disabled={ocupado}
          onChange={(e) => onUrlChange(e.target.value)}
        />
        <button
          type="button"
          className="auth-btn"
          disabled={ocupado || !url.trim()}
          onClick={onMapear}
        >
          {ocupado ? 'Lendo…' : 'Mapear pasta'}
        </button>
      </div>
      <BulkFolderScanStatus scan={scan} files={arquivos} onRetry={onMapear} />
      {pulados.length > 0 && (
        <div className="drive-skipped">
          <strong>{pulados.length} item(ns) pulado(s)</strong>
          <ul>
            {pulados.slice(0, 8).map((s) => (
              <li key={`${s.path}-${s.reason}`}>
                {s.path}: {s.reason}
              </li>
            ))}
            {pulados.length > 8 && <li>… e mais {pulados.length - 8}</li>}
          </ul>
        </div>
      )}
      {scan.phase === 'done' && arquivos.length > 0 && (
        <>
          <BulkFilePreviewList
            files={arquivos}
            materialKindOptions={materialKindOptions}
            onKindChange={onKindChange}
            onRemove={onRemove}
          />
          {acaoDoLote}
        </>
      )}
      {children}
    </div>
  );
}
