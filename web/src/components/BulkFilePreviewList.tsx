import { useState } from 'react';
import { SearchableSelect } from './SearchableSelect';
import { InferenceBadge } from './BulkFolderScanStatus';
import type { BulkFileItem } from '../lib/materialKindInference/scanFolder';
import { isConvertibleAudio } from '../lib/audioConverter';
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

export type ConversionProgress = {
  phase: 'idle' | 'downloading' | 'converting' | 'done' | 'error';
  current?: number;
  total?: number;
  fileName?: string;
  percent?: number;
  error?: string | null;
};

export function BulkFilePreviewList({
  files,
  materialKindOptions,
  onKindChange,
  onRemove,
  onConvertToMp3,
  onConvertAllToMp3,
  converting = false,
  convertingIndex = null,
  conversionProgress = null,
  editable = true,
}: {
  files: BulkFileItem[];
  materialKindOptions: Array<{ value: string; label: string }>;
  onKindChange?: (index: number, material_kind: string) => void;
  onRemove?: (index: number) => void;
  onConvertToMp3?: (index: number) => void;
  onConvertAllToMp3?: () => void;
  converting?: boolean;
  convertingIndex?: number | null;
  conversionProgress?: ConversionProgress | null;
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

  const convertiveis = comIndice.filter((x) => (x.it.file || x.it.driveFileId) && isConvertibleAudio(x.it.type));
  const isCurrentlyConverting = converting || conversionProgress?.phase === 'converting' || conversionProgress?.phase === 'downloading';

  return (
    <div className="bulk-list">
      {problematicos.length > 0 && (
        <div className="bulk-scan-hint bulk-list-alerta" role="status">
          {problematicos.length} arquivo(s) precisam de atenção antes do envio.
        </div>
      )}
      {convertiveis.length > 0 && onConvertAllToMp3 && (
        <div
          className={`bulk-convert-bar${
            isCurrentlyConverting
              ? ' bulk-convert-bar--converting'
              : conversionProgress?.phase === 'done'
              ? ' bulk-convert-bar--done'
              : conversionProgress?.phase === 'error'
              ? ' bulk-convert-bar--error'
              : ''
          }`}
          role="status"
          aria-live="polite"
        >
          <div className="bulk-convert-bar-header">
            <div className="bulk-convert-status-text">
              {conversionProgress?.phase === 'downloading' ? (
                <>
                  <span className="bulk-scan-spinner" aria-hidden="true" />
                  <span>
                    Baixando do Drive ({conversionProgress.current ?? 1}/{conversionProgress.total ?? convertiveis.length}):{' '}
                    <strong>{conversionProgress.fileName || 'áudio'}</strong>…
                  </span>
                </>
              ) : conversionProgress?.phase === 'converting' || (isCurrentlyConverting && !conversionProgress) ? (
                <>
                  <span className="bulk-scan-spinner" aria-hidden="true" />
                  <span>
                    Convertendo para MP3 ({conversionProgress?.current ?? 1}/{conversionProgress?.total ?? convertiveis.length}):{' '}
                    <strong>{conversionProgress?.fileName || 'áudio'}</strong>
                    {conversionProgress?.percent != null ? ` (${conversionProgress.percent}%)` : ''}…
                  </span>
                </>
              ) : conversionProgress?.phase === 'done' ? (
                <span style={{ color: 'var(--color-success, #2d6a4f)' }}>
                  ✓ {conversionProgress.total ?? 'Todos os'} áudio(s) convertidos com sucesso para MP3!
                </span>
              ) : conversionProgress?.phase === 'error' ? (
                <span style={{ color: 'var(--color-danger, #c1121f)' }}>
                  ⚠️ Falha na conversão: {conversionProgress.error || 'Erro desconhecido'}
                </span>
              ) : (
                <span>🎵 {convertiveis.length} áudio(s) conversível(is) para MP3 detectado(s).</span>
              )}
            </div>
            {isCurrentlyConverting ? (
              <button
                type="button"
                className="linkish bulk-convert-btn"
                disabled
              >
                Convertendo para MP3…
              </button>
            ) : (
              <button
                type="button"
                className="linkish bulk-convert-btn"
                onClick={onConvertAllToMp3}
              >
                {conversionProgress?.phase === 'error'
                  ? 'Tentar novamente'
                  : `Converter ${convertiveis.length > 1 ? 'todos para MP3' : 'para MP3'}`}
              </button>
            )}
          </div>
          {isCurrentlyConverting && conversionProgress?.total ? (
            <div
              className="bulk-scan-progress"
              role="progressbar"
              aria-valuenow={Math.round(
                (((conversionProgress.current ? conversionProgress.current - 1 : 0) +
                  (conversionProgress.percent ?? 0) / 100) /
                  conversionProgress.total) *
                  100
              )}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="bulk-scan-progress-bar"
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(
                      5,
                      Math.round(
                        (((conversionProgress.current ? conversionProgress.current - 1 : 0) +
                          (conversionProgress.percent ?? 0) / 100) /
                          conversionProgress.total) *
                          100
                      )
                    )
                  )}%`,
                }}
              />
            </div>
          ) : null}
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
                {editable && (it.file || it.driveFileId) && isConvertibleAudio(it.type) && onConvertToMp3 ? (
                  convertingIndex === idx ? (
                    <span className="bulk-converting-indicator" title="Convertendo para MP3…">
                      <span className="bulk-scan-spinner" style={{ width: '0.85rem', height: '0.85rem' }} aria-hidden="true" />
                      <span>Convertendo…</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="bulk-remove"
                      disabled={isCurrentlyConverting}
                      aria-label={`Converter ${it.relPath} para MP3`}
                      onClick={() => onConvertToMp3(idx)}
                    >
                      → MP3
                    </button>
                  )
                ) : null}
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
