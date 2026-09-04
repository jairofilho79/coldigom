import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthControl } from '../components/AuthControl';
import { FindingEvidence } from '../components/FindingEvidence';
import { Pagination } from '../components/Pagination';
import { useAuth } from '../context/useAuth';
import {
  bulkDecideValidationFindings,
  decideValidationFinding,
  listValidationFindings,
} from '../services/api';
import type { FindingConfidence, FindingDecision, FindingStatus, PaginationInfo, ValidationFinding } from '../types';

const FAIXAS: FindingConfidence[] = ['alta', 'media', 'baixa', 'discussao'];
const STATUS: FindingStatus[] = ['pendente', 'discussao', 'aprovado', 'rejeitado', 'aplicado'];
const ROTULO_FAIXA: Record<FindingConfidence, string> = { alta: 'alta', media: 'média', baixa: 'baixa', discussao: 'discussão' };
const ROTULO_STATUS: Record<FindingStatus, string> = {
  pendente: 'pendente', discussao: 'em discussão', aprovado: 'aprovado', rejeitado: 'rejeitado', aplicado: 'aplicado',
};

export type Grupo = { chave: string; titulo: string; itens: ValidationFinding[] };

/**
 * Os candidatos concorrentes do mesmo louvor ficam juntos. É a resposta ao
 * teto estrutural da faixa média (RESIDUOS-P2.md): uma fonte com 7 candidatos
 * gera 7 achados, e só um pode estar certo — decidir um de cada vez, sem ver
 * os outros, é o que a tela não pode permitir.
 */
export function agruparPorAlvo(findings: ValidationFinding[]): Grupo[] {
  const grupos = new Map<string, ValidationFinding[]>();
  for (const f of findings) {
    const chave = f.praise_id ?? f.target_id;
    const lista = grupos.get(chave);
    if (lista) lista.push(f);
    else grupos.set(chave, [f]);
  }
  return [...grupos.entries()].map(([chave, itens]) => ({
    chave,
    titulo: itens[0].target_name ?? itens[0].target_id,
    itens,
  }));
}

type Filtros = { detector: string; confidence: '' | FindingConfidence; status: '' | FindingStatus; page: number };

function decidivel(f: ValidationFinding): boolean {
  return f.status === 'pendente' || f.status === 'discussao';
}

export function ValidationQueuePage() {
  const { isAuthenticated, ready } = useAuth();
  const [filtros, setFiltros] = useState<Filtros>({ detector: '', confidence: '', status: 'pendente', page: 1 });
  const [findings, setFindings] = useState<ValidationFinding[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [nota, setNota] = useState('');

  const carregar = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const r = await listValidationFindings({
        detector: filtros.detector || undefined,
        confidence: filtros.confidence || undefined,
        status: filtros.status || undefined,
        page: filtros.page,
        limit: 100,
      }, signal);
      setFindings(r.data);
      setPagination(r.pagination);
      setSelecionados(new Set());
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : 'Falha ao carregar a fila');
    } finally {
      setLoading(false);
    }
  }, [filtros]);

  useEffect(() => {
    if (!ready || !isAuthenticated) return;
    const ac = new AbortController();
    void carregar(ac.signal);
    return () => ac.abort();
  }, [ready, isAuthenticated, carregar]);

  const grupos = useMemo(() => agruparPorAlvo(findings), [findings]);

  const decisao = (status: FindingDecision['status']): FindingDecision =>
    nota.trim() ? { status, decision_note: nota.trim() } : { status };

  async function executar(acao: () => Promise<unknown>) {
    setError(null);
    try {
      await acao();
      await carregar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao gravar a decisão');
    }
  }

  function decidir(f: ValidationFinding, status: FindingDecision['status']) {
    return executar(() => decideValidationFinding(f.id, decisao(status)));
  }

  function aprovarERejeitarIrmaos(f: ValidationFinding, irmaos: ValidationFinding[]) {
    const outros = irmaos.filter((o) => o.id !== f.id && decidivel(o)).map((o) => o.id);
    return executar(async () => {
      await decideValidationFinding(f.id, decisao('aprovado'));
      if (outros.length) {
        await bulkDecideValidationFindings({ ids: outros, status: 'rejeitado', decision_note: `concorrente do aprovado ${f.id}` });
      }
    });
  }

  function decidirLote(status: FindingDecision['status']) {
    const ids = [...selecionados];
    return executar(() => bulkDecideValidationFindings({ ids, ...decisao(status) }));
  }

  function alternar(set: Set<string>, id: string): Set<string> {
    const novo = new Set(set);
    if (novo.has(id)) novo.delete(id);
    else novo.add(id);
    return novo;
  }

  if (!ready) {
    return <div className="page-container"><div className="loading-state" role="status">Carregando sessão…</div></div>;
  }
  if (!isAuthenticated) {
    return (
      <div className="page-container">
        <div className="error-state" role="alert">
          <div className="error-state-title">Fila de revisão</div>
          <div className="error-state-desc">Entre para revisar os achados do acervo.</div>
          <AuthControl />
        </div>
      </div>
    );
  }

  return (
    <div className="page-container vf-page">
      <div className="vf-head">
        <Link to="/" className="back-link">← Início</Link>
        <h1 className="vf-title">Fila de revisão</h1>
        <AuthControl />
      </div>

      <div className="vf-filters">
        <label>Detector
          <input value={filtros.detector} placeholder="ex.: youtube_merge"
            onChange={(e) => setFiltros({ ...filtros, detector: e.target.value, page: 1 })} />
        </label>
        <label>Faixa
          <select value={filtros.confidence}
            onChange={(e) => setFiltros({ ...filtros, confidence: e.target.value as Filtros['confidence'], page: 1 })}>
            <option value="">todas</option>
            {FAIXAS.map((f) => <option key={f} value={f}>{ROTULO_FAIXA[f]}</option>)}
          </select>
        </label>
        <label>Status
          <select value={filtros.status}
            onChange={(e) => setFiltros({ ...filtros, status: e.target.value as Filtros['status'], page: 1 })}>
            <option value="">todos</option>
            {STATUS.map((s) => <option key={s} value={s}>{ROTULO_STATUS[s]}</option>)}
          </select>
        </label>
        <label className="vf-nota">Nota da decisão
          <input value={nota} placeholder="vai junto com a próxima decisão — é o dado de treino"
            onChange={(e) => setNota(e.target.value)} aria-label="Nota da decisão" />
        </label>
        {pagination && <span className="vf-total">{pagination.total} achado(s)</span>}
      </div>

      {error && <div className="error-state" role="alert"><div className="error-state-desc">{error}</div></div>}

      {selecionados.size > 0 && (
        <div className="vf-bulk">
          <span>{selecionados.size} selecionado(s)</span>
          <button type="button" className="vf-btn vf-btn--rejeitar" onClick={() => void decidirLote('rejeitado')}>Rejeitar {selecionados.size}</button>
          <button type="button" className="vf-btn vf-btn--aprovar" onClick={() => void decidirLote('aprovado')}>Aprovar {selecionados.size}</button>
          <button type="button" className="vf-btn" onClick={() => void decidirLote('discussao')}>Discussão {selecionados.size}</button>
          <button type="button" className="vf-btn" onClick={() => setSelecionados(new Set())}>Limpar</button>
        </div>
      )}

      {loading && findings.length === 0 ? (
        <div className="loading-state" role="status">Carregando a fila…</div>
      ) : grupos.length === 0 ? (
        <div className="no-results">Nada na fila com esses filtros.</div>
      ) : (
        <div className="vf-tablewrap">
          <table className="vf-table">
            <thead>
              <tr>
                <th></th><th>detector</th><th>proposta</th><th>faixa</th><th>status</th><th>decisão</th><th>ações</th>
              </tr>
            </thead>
            {grupos.map((g) => (
              <tbody key={g.chave}>
                <tr className="vf-group-row">
                  <td colSpan={7}>
                    <strong>{g.titulo}</strong>
                    <span className="vf-count">{g.itens.length === 1 ? '1 candidato' : `${g.itens.length} candidatos`}</span>
                    {g.itens[0].target_type === 'praise' && (
                      <Link to={`/praise/${g.chave}`} className="vf-link">abrir louvor ↗</Link>
                    )}
                  </td>
                </tr>
                {g.itens.map((f) => {
                  const irmaosPendentes = g.itens.filter((o) => o.id !== f.id && decidivel(o)).length;
                  const aberto = abertos.has(f.id);
                  return [
                    <tr key={f.id} className={`vf-row vf-row--${f.status}`}>
                      <td>
                        <input type="checkbox" aria-label={`Selecionar ${f.id}`} checked={selecionados.has(f.id)}
                          disabled={f.status === 'aplicado'}
                          onChange={() => setSelecionados((s) => alternar(s, f.id))} />
                      </td>
                      <td><code>{f.detector}</code></td>
                      <td>
                        <div>{f.proposed_name ?? f.proposed_value ?? '—'}</div>
                        {f.field && <code className="vf-field">{f.field}</code>}
                      </td>
                      <td><span className={`vf-pill vf-pill--${f.confidence}`}>{ROTULO_FAIXA[f.confidence]}</span></td>
                      <td><span className={`vf-status vf-status--${f.status}`}>{ROTULO_STATUS[f.status]}</span></td>
                      <td className="vf-decisao">
                        {f.decided_by && <div>{f.decided_by} · {f.decided_at}</div>}
                        {f.decision_note && <div className="vf-note">{f.decision_note}</div>}
                      </td>
                      <td className="vf-actions">
                        {decidivel(f) && (
                          <>
                            <button type="button" className="vf-btn vf-btn--aprovar"
                              onClick={() => void (irmaosPendentes ? aprovarERejeitarIrmaos(f, g.itens) : decidir(f, 'aprovado'))}>
                              {irmaosPendentes ? `Aprovar e rejeitar os outros ${irmaosPendentes}` : 'Aprovar'}
                            </button>
                            <button type="button" className="vf-btn vf-btn--rejeitar" onClick={() => void decidir(f, 'rejeitado')}>Rejeitar</button>
                            {f.status !== 'discussao' && (
                              <button type="button" className="vf-btn" onClick={() => void decidir(f, 'discussao')}>Discussão</button>
                            )}
                          </>
                        )}
                        {(f.status === 'aprovado' || f.status === 'rejeitado') && (
                          <button type="button" className="vf-btn" onClick={() => void decidir(f, 'pendente')}>Reabrir</button>
                        )}
                        <button type="button" className="vf-btn vf-btn--ghost" aria-expanded={aberto}
                          onClick={() => setAbertos((a) => alternar(a, f.id))}>
                          {aberto ? 'Fechar' : 'Evidência'}
                        </button>
                      </td>
                    </tr>,
                    aberto ? (
                      <tr key={`${f.id}-ev`} className="vf-evidence-row">
                        <td colSpan={7}><FindingEvidence finding={f} /></td>
                      </tr>
                    ) : null,
                  ];
                })}
              </tbody>
            ))}
          </table>
        </div>
      )}

      {pagination && <Pagination pagination={pagination} onPageChange={(page) => setFiltros({ ...filtros, page })} />}
    </div>
  );
}
