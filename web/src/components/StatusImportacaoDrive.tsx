import type { ImportJobSummary } from '../services/api';

function rotuloDoItem(status: string): string {
  if (status === 'done') return 'Ok';
  if (status === 'failed') return 'Falha';
  if (status === 'running') return 'Importando…';
  return 'Na fila';
}

const TERMINAL = ['done', 'completed_with_errors', 'failed'];

/**
 * Acompanhamento de uma importação do Google Drive: barra geral, linha por
 * arquivo com o motivo da falha, e a retentativa dos que falharam.
 */
export function StatusImportacaoDrive({
  job,
  erro,
  ocupado,
  onTentarFalhas,
}: {
  job: ImportJobSummary | null;
  /** Quando o acompanhamento em si falhou — o job pode ter terminado assim mesmo. */
  erro: string | null;
  ocupado: boolean;
  onTentarFalhas: () => void;
}) {
  return (
    <>
    {erro ? (
      <p className="drive-job-support" role="status">
        {erro}
      </p>
    ) : null}
    {job && (
      <div className="drive-job-status">
        {!TERMINAL.includes(job.status) && (
          <p className="drive-job-stay">
            Não saia desta tela enquanto acompanha o progresso. Fechar a aba não cancela a
            importação no servidor, mas você deixa de ver o andamento.
          </p>
        )}
        <p className="drive-job-summary">
          <span>
            {job.done_count}/{job.total_count} importados
            {job.failed_count > 0
              ? ` · ${job.failed_count} com erro`
              : ''}
          </span>
          <span
            className={`drive-job-pill drive-job-pill--${
              job.status === 'done'
                ? 'ok'
                : job.status === 'completed_with_errors' ||
                    job.status === 'failed'
                  ? 'err'
                  : 'run'
            }`}
          >
            {job.status === 'done'
              ? 'Concluída'
              : job.status === 'completed_with_errors'
                ? 'Concluída com erros'
                : job.status === 'failed'
                  ? 'Falhou'
                  : job.status === 'running'
                    ? 'Em andamento'
                    : 'Na fila'}
          </span>
        </p>
        <div
          className="bulk-scan-progress drive-job-overall"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={job.total_count}
          aria-valuenow={job.done_count + job.failed_count}
        >
          <div
            className="bulk-scan-progress-bar"
            style={{
              width: `${
                job.total_count
                  ? Math.round(
                      ((job.done_count + job.failed_count) /
                        job.total_count) *
                        100
                    )
                  : 0
              }%`,
            }}
          />
        </div>
        {job.items && job.items.length > 0 && (
          <ul className="drive-job-items">
            {job.items.map((item) => (
              <li
                key={item.id}
                className={`drive-job-item drive-job-item--${item.status}`}
              >
                <div className="drive-job-item-head">
                  <span className="drive-job-item-name">
                    {item.file_path_legacy || item.drive_file_id}
                  </span>
                  <span className="drive-job-item-label">{rotuloDoItem(item.status)}</span>
                </div>
                {item.status === 'failed' && item.error ? (
                  <div className="drive-job-item-erro">{item.error}</div>
                ) : null}
                <div
                  className={`bulk-scan-progress${
                    item.status === 'running' ? ' drive-job-item-progress--run' : ''
                  }`}
                >
                  <div
                    className={`bulk-scan-progress-bar${
                      item.status === 'failed' ? ' drive-job-item-bar--err' : ''
                    }${item.status === 'done' ? ' drive-job-item-bar--ok' : ''}`}
                    style={{
                      width:
                        item.status === 'done' || item.status === 'failed'
                          ? '100%'
                          : item.status === 'running'
                            ? '70%'
                            : '0%',
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        {job.failed_count > 0 &&
          TERMINAL.includes(job.status) && (
            <>
              <p className="drive-job-support">
                Não foi possível importar alguns arquivos. Tente de novo ou contate o suporte.
              </p>
              <button
                type="button"
                className="auth-btn"
                disabled={ocupado}
                onClick={onTentarFalhas}
              >
                Tentar de novo os que falharam
              </button>
            </>
          )}
      </div>
    )}
    </>
  );
}
