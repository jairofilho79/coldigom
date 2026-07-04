import type { BulkFileItem } from '../lib/materialKindInference/scanFolder';
import type { InferenceResult } from '../lib/materialKindInference';

type BulkScanPhase = 'idle' | 'scanning' | 'done' | 'error';

export type BulkScanState = {
  phase: BulkScanPhase;
  processed: number;
  total: number;
  folderName: string | null;
  error: string | null;
};

export const INITIAL_BULK_SCAN: BulkScanState = {
  phase: 'idle',
  processed: 0,
  total: 0,
  folderName: null,
  error: null,
};

type BulkFolderScanStatusProps = {
  scan: BulkScanState;
  files: BulkFileItem[];
  onRetry?: () => void;
};

export function InferenceBadge({ inference }: { inference: InferenceResult }) {
  if (inference.method === 'unknown') {
    return (
      <span className="bulk-inference bulk-inference-unknown" title="Categoria não identificada pelo nome">
        Desconhecido
      </span>
    );
  }
  const level = inference.confidence >= 0.9 ? 'high' : 'medium';
  const pct = Math.round(inference.confidence * 100);
  const title = `${pct}% (${inference.method})${inference.matchedOn ? ` — ${inference.matchedOn}` : ''}`;
  return (
    <span className={`bulk-inference bulk-inference-${level}`} title={title}>
      Auto {pct}%
    </span>
  );
}

export function BulkFolderScanStatus({ scan, files, onRetry }: BulkFolderScanStatusProps) {
  if (scan.phase === 'scanning') {
    const pct = scan.total > 0 ? Math.round((scan.processed / scan.total) * 100) : 0;
    return (
      <div className="bulk-scan-status bulk-scan-status--scanning" role="status" aria-live="polite">
        <div className="bulk-scan-status-head">
          <span className="bulk-scan-spinner" aria-hidden="true" />
          <span>
            Analisando pasta
            {scan.folderName ? ` “${scan.folderName}”` : ''}… {scan.processed}/{scan.total}
          </span>
        </div>
        <div className="bulk-scan-progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} role="progressbar">
          <div className="bulk-scan-progress-bar" style={{ width: `${pct}%` }} />
        </div>
        <p className="bulk-scan-hint">Identificando categorias pelo nome dos arquivos. Aguarde…</p>
      </div>
    );
  }

  if (scan.phase === 'error') {
    return (
      <div className="bulk-scan-status bulk-scan-status--error" role="alert">
        <p className="bulk-scan-message">{scan.error ?? 'Falha ao analisar a pasta.'}</p>
        {onRetry ? (
          <button type="button" className="bulk-scan-retry" onClick={onRetry}>
            Tentar novamente
          </button>
        ) : null}
      </div>
    );
  }

  if (scan.phase === 'done' && files.length > 0) {
    const identified = files.filter((f) => f.inference.method !== 'unknown').length;
    const unknown = files.length - identified;
    return (
      <div className="bulk-scan-status bulk-scan-status--done" role="status" aria-live="polite">
        <p className="bulk-scan-message">
          {files.length} arquivo(s) prontos
          {scan.folderName ? ` em “${scan.folderName}”` : ''}.
          {' '}
          {identified} categorizado(s)
          {unknown > 0 ? `, ${unknown} Desconhecido(s)` : ''}.
        </p>
        {unknown > 0 ? (
          <p className="bulk-scan-hint">Revise os itens marcados como Desconhecido antes de enviar.</p>
        ) : null}
      </div>
    );
  }

  return null;
}
