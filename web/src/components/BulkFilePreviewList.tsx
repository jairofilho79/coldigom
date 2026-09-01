import { useState } from 'react';
import { SearchableSelect } from './SearchableSelect';
import { InferenceBadge } from './BulkFolderScanStatus';
import type { BulkFileItem } from '../lib/materialKindInference/scanFolder';
import {
  MAX_UPLOAD_BYTES,
  formatarMB,
  problemaDoArquivo,
  type ProblemaDeArquivo,
} from '../lib/uploadLimits';

/**
 * Lista de revisão dos arquivos mapeados, antes do envio — usada pela pasta
 * local e pelo Google Drive, nos modos de criação e de edição.
 */
const BULK_LIST_PREVIEW = 25;

function drivePreviewUrl(driveFileId: string): string {
  return `https://drive.google.com/file/d/${driveFileId}/view`;
}

function openLocalFilePreview(file: File): void {
  const url = URL.createObjectURL(file);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Frase do problema, para quem só vê a lista e precisa saber o que fazer. */
function textoDoProblema(problema: ProblemaDeArquivo): string {
  return problema === 'grande'
    ? `acima do limite de ${formatarMB(MAX_UPLOAD_BYTES)} por arquivo`
    : 'sem extensão reconhecida — a API recusa o lote inteiro por causa dele';
}

export function BulkFilePreviewList({
  files,
  materialKindOptions,
  onKindChange,
  onRemove,
  editable = true,
}: {
  files: BulkFileItem[];
  materialKindOptions: Array<{ value: string; label: string }>;
  onKindChange?: (index: number, material_kind: string) => void;
  onRemove?: (index: number) => void;
  editable?: boolean;
}) {
  const [verTodos, setVerTodos] = useState(false);
  if (files.length === 0) return null;

  // Um arquivo problemático além do 25º ficava sem seletor de categoria e sem
  // botão Remover — impossível de corrigir pela tela, e ele sozinho derrubava o
  // envio inteiro. Os problemáticos entram sempre; o resto respeita a prévia.
  const comIndice = files.map((it, idx) => ({ it, idx, problema: problemaDoArquivo(it) }));
  const problematicos = comIndice.filter((x) => x.problema);
  const visiveis = verTodos
    ? comIndice
    : [
        ...problematicos,
        ...comIndice.filter((x) => !x.problema).slice(0, BULK_LIST_PREVIEW),
      ].sort((a, b) => a.idx - b.idx);
  const ocultos = files.length - visiveis.length;

  return (
    <div className="bulk-list">
      {problematicos.length > 0 && (
        <div className="bulk-scan-hint bulk-list-alerta" role="status">
          {problematicos.length} arquivo(s) precisam de atenção antes do envio.
        </div>
      )}
      {visiveis.map(({ it, idx, problema }) => {
        const size = it.sizeBytes ?? it.file?.size;
        const canPreview = Boolean(it.driveFileId || it.file);
        return (
          <div key={`${it.driveFileId || ''}-${it.relPath}-${idx}`} className="bulk-row">
            <div className="bulk-main">
              <div className="bulk-name">{it.relPath}</div>
              <div className="bulk-meta">
                <span className="pill">{it.type}</span>
                <InferenceBadge inference={it.inference} />
                {problema ? (
                  <span className="pill bulk-problema">{textoDoProblema(problema)}</span>
                ) : null}
                {typeof size === 'number' ? (
                  <span className="bulk-size">{Math.round(size / 1024)} KB</span>
                ) : null}
              </div>
            </div>
            {editable && onKindChange ? (
              <SearchableSelect
                compact
                value={it.material_kind}
                onChange={(v) => onKindChange(idx, v)}
                options={materialKindOptions}
                aria-label="Categoria do material"
              />
            ) : (
              <span className="bulk-kind-readonly pill">
                {materialKindOptions.find((o) => o.value === it.material_kind)?.label ?? '—'}
              </span>
            )}
            {canPreview || (editable && onRemove) ? (
              <div className="bulk-actions">
                {it.driveFileId ? (
                  <a
                    className="bulk-remove"
                    href={drivePreviewUrl(it.driveFileId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Ver ${it.relPath} no Google Drive`}
                  >
                    Ver
                  </a>
                ) : it.file ? (
                  <button
                    type="button"
                    className="bulk-remove"
                    aria-label={`Ver ${it.relPath}`}
                    onClick={() => openLocalFilePreview(it.file!)}
                  >
                    Ver
                  </button>
                ) : null}
                {editable && onRemove ? (
                  <button
                    type="button"
                    className="bulk-remove"
                    aria-label="Remover da importação"
                    onClick={() => onRemove(idx)}
                  >
                    Remover
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
      {ocultos > 0 && (
        <button
          type="button"
          className="linkish bulk-list-ver-todos"
          onClick={() => setVerTodos(true)}
        >
          Ver os {files.length} arquivo(s) — {ocultos} fora da prévia
        </button>
      )}
    </div>
  );
}
