import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthControl } from '../components/AuthControl';
import { Pagination } from '../components/Pagination';
import { useAuth } from '../context/useAuth';
import {
  approveAdminContributionPlan,
  fetchAdminContributionFile,
  generateAdminContributionPlan,
  listAdminContributions,
  patchAdminContribution,
} from '../services/api';
import type {
  AdminContribution,
  ContributionFile,
  PaginationInfo,
} from '../types';

const STATUS_TABS = [
  { id: 'pendente', label: 'Pendentes' },
  { id: 'em_analise', label: 'Em Análise' },
  { id: 'aplicada', label: 'Aplicadas' },
  { id: 'recusada', label: 'Recusadas' },
  { id: '', label: 'Todas' },
] as const;

const KIND_LABELS: Record<string, string> = {
  wrong_info: 'Informação Incorreta',
  content: 'Novo Conteúdo',
  bug: 'Problema / Bug',
  improvement: 'Sugestão',
  other: 'Outro',
};

const SUBKIND_LABELS: Record<string, string> = {
  metadata: 'Metadados (Tom, Ritmo, Autor)',
  lyrics: 'Letra',
  wrong_material: 'Material Errado',
  wrong_kind: 'Tipo Trocado',
  duplicate: 'Duplicata',
  add_material: 'Adicionar Material',
  add_praise: 'Adicionar Louvor',
  replace_material: 'Substituir Arquivo',
  remove: 'Remover',
};

export function ContributionsQueuePage() {
  const { isAuthenticated, ready } = useAuth();
  const [selectedStatus, setSelectedStatus] = useState<string>('pendente');
  const [selectedKind, setSelectedKind] = useState<string>('');
  const [page, setPage] = useState<number>(1);

  const [contributions, setContributions] = useState<AdminContribution[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [planningId, setPlanningId] = useState<string | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});

  const [viewingFile, setViewingFile] = useState<{
    url: string;
    name: string;
    type: string;
  } | null>(null);

  const carregar = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const res = await listAdminContributions({
          status: selectedStatus || undefined,
          kind: selectedKind || undefined,
          page,
        });
        if (signal?.aborted) return;
        setContributions(res.data);
        setPagination(res.pagination);

        // Expande os primeiros itens por padrão se houver poucos
        if (res.data.length > 0 && res.data.length <= 5) {
          setExpandedIds(new Set(res.data.map((c) => c.id)));
        }
      } catch (err) {
        if (signal?.aborted) return;
        setError(err instanceof Error ? err.message : 'Falha ao carregar colaborações');
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [selectedStatus, selectedKind, page]
  );

  useEffect(() => {
    if (!ready || !isAuthenticated) return;
    const ac = new AbortController();
    void carregar(ac.signal);
    return () => ac.abort();
  }, [ready, isAuthenticated, carregar]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleGeneratePlan = async (contribId: string) => {
    setPlanningId(contribId);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await generateAdminContributionPlan(contribId);
      setContributions((prev) =>
        prev.map((c) =>
          c.id === contribId
            ? { ...c, plan: res.plan, status: 'pendente' }
            : c
        )
      );
      setSuccessMsg('Plano de tarefas gerado com sucesso pelo modelo Workers AI (@cf/zai-org/glm-5.3-flash)');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar plano com IA');
    } finally {
      setPlanningId(null);
    }
  };

  const handleApprovePlan = async (contrib: AdminContribution) => {
    if (!contrib.plan) return;
    setExecutingId(contrib.id);
    setError(null);
    setSuccessMsg(null);
    try {
      const note = decisionNotes[contrib.id];
      const res = await approveAdminContributionPlan(contrib.id, {
        planId: contrib.plan.id,
        planHash: contrib.plan.plan_hash,
        decisionNote: note,
      });

      setContributions((prev) =>
        prev.map((c) =>
          c.id === contrib.id
            ? {
                ...c,
                status: 'aplicada',
                plan: c.plan ? { ...c.plan, status: 'applied' } : null,
                decision_note: note || c.decision_note,
              }
            : c
        )
      );
      setSuccessMsg(
        `Plano aprovado e executado com sucesso! ${res.executed_tasks} tarefa(s) aplicada(s) no Cloudflare.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao aprovar e executar plano');
    } finally {
      setExecutingId(null);
    }
  };

  const handleReject = async (contrib: AdminContribution) => {
    setError(null);
    setSuccessMsg(null);
    try {
      const note = decisionNotes[contrib.id];
      await patchAdminContribution(contrib.id, 'recusada', note);
      setContributions((prev) =>
        prev.map((c) =>
          c.id === contrib.id
            ? { ...c, status: 'recusada', decision_note: note || c.decision_note }
            : c
        )
      );
      setSuccessMsg('Contribuição marcada como recusada.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao rejeitar contribuição');
    }
  };

  const handleViewAttachment = async (contribId: string, file: ContributionFile) => {
    try {
      const { blob, contentType } = await fetchAdminContributionFile(contribId, file.id);
      const url = URL.createObjectURL(blob);
      setViewingFile({ url, name: file.original_name, type: contentType });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao abrir anexo');
    }
  };

  const closeViewer = () => {
    if (viewingFile?.url) {
      URL.revokeObjectURL(viewingFile.url);
    }
    setViewingFile(null);
  };

  if (!ready) {
    return (
      <div className="page-container">
        <div className="loading-state" role="status">
          <div className="loading-spinner" aria-hidden="true" />
          <div className="loading-text">Carregando sessão…</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="page-container">
        <div className="error-state" role="alert">
          <div className="error-state-title">Fila de Colaborações</div>
          <div className="error-state-desc">
            Entre como administrador para revisar as colaborações e interagir com o Assistente IA.
          </div>
          <AuthControl />
        </div>
      </div>
    );
  }

  return (
    <main className="page-container cq-page">
      <header className="cq-head">
        <div className="cq-head-left">
          <Link to="/" className="back-link">
            ← Início
          </Link>
          <h1 className="cq-title">Fila de Colaborações & Assistente IA</h1>
          <p className="cq-subtitle">
            Curadoria assistida por IA (Cloudflare Workers AI · <code>@cf/zai-org/glm-5.3-flash</code>)
          </p>
        </div>
        <div className="cq-head-auth">
          <AuthControl />
        </div>
      </header>

      {/* Mensagens de Sucesso e Erro */}
      {successMsg && (
        <div className="cq-alert cq-alert--success" role="status">
          <span>✓ {successMsg}</span>
          <button type="button" className="cq-alert-close" onClick={() => setSuccessMsg(null)}>
            ×
          </button>
        </div>
      )}
      {error && (
        <div className="error-state" role="alert">
          <div className="error-state-desc">{error}</div>
        </div>
      )}

      {/* Barra de Filtros e Status */}
      <section className="cq-controls" aria-label="Filtros da fila">
        <div className="cq-tabs" role="tablist">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selectedStatus === tab.id}
              className={`cq-tab ${selectedStatus === tab.id ? 'is-active' : ''}`}
              onClick={() => {
                setSelectedStatus(tab.id);
                setPage(1);
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="cq-filters">
          <label htmlFor="filter-kind" className="cq-filter-label">
            Tipo:
            <select
              id="filter-kind"
              value={selectedKind}
              onChange={(e) => {
                setSelectedKind(e.target.value);
                setPage(1);
              }}
              className="cq-select"
            >
              <option value="">Todos os tipos</option>
              {Object.entries(KIND_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          {pagination && (
            <span className="cq-total-count">
              <strong>{pagination.total}</strong> colaboração(ões) encontrada(s)
            </span>
          )}
        </div>
      </section>

      {/* Lista de Colaborações */}
      {loading && contributions.length === 0 ? (
        <div className="loading-state" role="status">
          <div className="loading-spinner" aria-hidden="true" />
          <div className="loading-text">Carregando colaborações…</div>
        </div>
      ) : contributions.length === 0 ? (
        <div className="no-results">
          Nenhuma colaboração encontrada com os filtros selecionados.
        </div>
      ) : (
        <div className="cq-list">
          {contributions.map((c) => {
            const isExpanded = expandedIds.has(c.id);
            const isPlanning = planningId === c.id;
            const isExecuting = executingId === c.id;

            const targetMatId =
              c.target_material_id ||
              (c.fields?.materialId as string) ||
              (c.fields?.material_id as string) ||
              '';
            const praiseTargetUrl = c.target_praise_id
              ? `/praise/${c.target_praise_id}${targetMatId ? `?materialId=${encodeURIComponent(targetMatId)}&` : '?'}contributionId=${encodeURIComponent(c.id)}`
              : null;

            return (
              <article key={c.id} className={`cq-card cq-card--${c.status}`}>
                {/* Cabeçalho do Card */}
                <header
                  className="cq-card-head"
                  onClick={() => toggleExpand(c.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleExpand(c.id);
                    }
                  }}
                  aria-expanded={isExpanded}
                >
                  <div className="cq-card-meta">
                    <span className={`cq-badge cq-badge--${c.status}`}>
                      {c.status.toUpperCase()}
                    </span>
                    <span className="cq-kind-badge">
                      {KIND_LABELS[c.kind] || c.kind}
                      {c.subkind && ` · ${SUBKIND_LABELS[c.subkind] || c.subkind}`}
                    </span>
                    <time className="cq-date" dateTime={c.created_at}>
                      {new Date(c.created_at).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                  </div>

                  <h2 className="cq-card-title">{c.title}</h2>

                  <div className="cq-card-subinfo">
                    <span className="cq-author">
                      De: <strong>{c.user_name || c.user_email}</strong>
                    </span>
                    {praiseTargetUrl && (
                      <span className="cq-target-praise">
                        Louvor alvo:
                        <Link
                          to={praiseTargetUrl}
                          state={{ contribution: c }}
                          onClick={(e) => e.stopPropagation()}
                          className="cq-link cq-link--goto"
                          title="Abrir este louvor com foco no material indicado"
                        >
                          {targetMatId ? `${c.target_praise_id!.slice(0, 8)} (Material) 🎯 ↗` : `${c.target_praise_id!.slice(0, 8)} ↗`}
                        </Link>
                      </span>
                    )}
                    <button
                      type="button"
                      className="cq-expand-btn"
                      aria-label={isExpanded ? 'Recolher detalhes' : 'Expandir detalhes'}
                    >
                      {isExpanded ? '▲ Recolher' : '▼ Detalhes & IA'}
                    </button>
                  </div>
                </header>

                {/* Conteúdo expandido */}
                {isExpanded && (
                  <div className="cq-card-body">
                    {praiseTargetUrl && (
                      <div className="cq-direct-action-banner">
                        <div className="cq-direct-action-info">
                          <span className="cq-direct-action-badge">🎯 Localizar no Acervo</span>
                          <span className="cq-direct-action-desc">
                            {targetMatId
                              ? 'Abrir a página do louvor com rolagem direta e destaque no material indicado para conferir e remover.'
                              : 'Abrir a página do louvor para conferência e edição dos dados.'}
                          </span>
                        </div>
                        <Link
                          to={praiseTargetUrl}
                          state={{ contribution: c }}
                          className="cq-btn cq-btn--primary"
                        >
                          {targetMatId ? 'Ir para o material no louvor ↗' : 'Ir para o louvor ↗'}
                        </Link>
                      </div>
                    )}

                    {/* Relato do Colaborador */}
                    <div className="cq-section">
                      <h3 className="cq-section-title">Descrição do Colaborador:</h3>
                      <p className="cq-description">{c.body}</p>
                    </div>

                    {/* Metadados Propostos */}
                    {c.fields && Object.keys(c.fields).length > 0 && (
                      <div className="cq-section">
                        <h3 className="cq-section-title">Campos e Alterações Propostas:</h3>
                        <div className="cq-fields-grid">
                          {Object.entries(c.fields).map(([k, v]) => (
                            <div key={k} className="cq-field-item">
                              <span className="cq-field-key">{k}:</span>
                              <code className="cq-field-val">
                                {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                              </code>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Links Externos */}
                    {c.links && c.links.length > 0 && (
                      <div className="cq-section">
                        <h3 className="cq-section-title">Links Informados:</h3>
                        <ul className="cq-links-list">
                          {c.links.map((link, idx) => {
                            const url = typeof link === 'string' ? link : link.url;
                            const safe = typeof link === 'object' ? link.safe_browsing : undefined;
                            return (
                              <li key={idx} className="cq-link-row">
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="cq-link"
                                >
                                  🔗 {url}
                                </a>
                                {safe && (
                                  <span
                                    className={`cq-safe-tag cq-safe-tag--${safe === 'clean' ? 'ok' : 'pending'}`}
                                  >
                                    Safe Browsing: {safe}
                                  </span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}

                    {/* Arquivos Anexos */}
                    {c.files && c.files.length > 0 && (
                      <div className="cq-section">
                        <h3 className="cq-section-title">Arquivos Anexados ({c.files.length}):</h3>
                        <ul className="cq-files-list">
                          {c.files.map((file) => (
                            <li key={file.id} className="cq-file-item">
                              <div className="cq-file-info">
                                <span className="cq-file-name">{file.original_name}</span>
                                <span className="cq-file-meta">
                                  {file.detected_type || file.declared_type} ·{' '}
                                  {(file.size / 1024).toFixed(1)} KB
                                </span>
                                <span
                                  className={`cq-scan-badge cq-scan-badge--${file.scan_status}`}
                                >
                                  Antivírus: {file.scan_status}
                                </span>
                              </div>
                              {file.scan_status === 'limpa' && (
                                <button
                                  type="button"
                                  className="cq-btn cq-btn--ghost"
                                  onClick={() => handleViewAttachment(c.id, file)}
                                >
                                  Visualizar
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* ============================================================== */}
                    {/* ASSISTENTE DE ACERVO IA (Workers AI + MCP Domain Tasks)       */}
                    {/* ============================================================== */}
                    <section className="cq-ai-box" aria-label="Assistente IA de Curadoria">
                      <div className="cq-ai-header">
                        <div className="cq-ai-title-wrap">
                          <span className="cq-ai-icon" aria-hidden="true">
                            ✦
                          </span>
                          <div>
                            <h3 className="cq-ai-heading">Assistente de Acervo Cloudflare AI</h3>
                            <span className="cq-ai-model">
                              Modelo: <code>@cf/zai-org/glm-5.3-flash</code> · MCP Tools Read-Only
                            </span>
                          </div>
                        </div>

                        {c.plan ? (
                          <span className={`cq-plan-status cq-plan-status--${c.plan.status}`}>
                            {c.plan.status === 'applied'
                              ? '✓ Plano Aplicado'
                              : c.plan.status === 'pending_approval'
                              ? 'Aguardando Aprovação'
                              : c.plan.status}
                          </span>
                        ) : (
                          <span className="cq-plan-status cq-plan-status--none">
                            Sem plano gerado
                          </span>
                        )}
                      </div>

                      {/* Conteúdo do Plano quando existente */}
                      {c.plan ? (
                        <div className="cq-plan-content">
                          <div className="cq-plan-summary-box">
                            <strong>Resumo da Análise:</strong>
                            <p>{c.plan.summary}</p>
                          </div>

                          {/* Checklist de TODOs */}
                          <div className="cq-plan-todos">
                            <h4>Checklist Proposto pelo Modelo:</h4>
                            <ul className="cq-todos-list">
                              {(c.plan.todos || []).map((todo, idx) => (
                                <li key={idx} className="cq-todo-item">
                                  <input
                                    type="checkbox"
                                    checked={c.plan?.status === 'applied'}
                                    readOnly
                                    aria-label={todo}
                                  />
                                  <span>{todo}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* Tarefas Canônicas / Operações de Domínio */}
                          {c.plan.plan_json?.tasks && c.plan.plan_json.tasks.length > 0 && (
                            <details className="cq-tasks-details">
                              <summary className="cq-tasks-summary">
                                Ver {c.plan.plan_json.tasks.length} operação(ões) de domínio estruturada(s)
                              </summary>
                              <pre className="cq-tasks-json">
                                {JSON.stringify(c.plan.plan_json.tasks, null, 2)}
                              </pre>
                            </details>
                          )}

                          <div className="cq-plan-hash">
                            Hash Canônico de Integridade:{' '}
                            <code>{c.plan.plan_hash ? c.plan.plan_hash.slice(0, 16) : '—'}...</code>
                          </div>
                        </div>
                      ) : (
                        <p className="cq-no-plan-msg">
                          Nenhum plano gerado ainda para esta contribuição. Clique abaixo para acionar o
                          modelo <code>@cf/zai-org/glm-5.3-flash</code> para analisar o contexto do louvor,
                          metadados e gerar as operações determinísticas de curadoria.
                        </p>
                      )}

                      {/* Nota de Decisão e Ações do Curador */}
                      <div className="cq-ai-actions-wrap">
                        {c.status !== 'aplicada' && c.status !== 'recusada' && (
                          <label className="cq-note-label">
                            Nota do Curador (opcional, gravada com a decisão):
                            <input
                              type="text"
                              className="cq-note-input"
                              placeholder="ex.: Aprovado conforme indicação do colaborador"
                              value={decisionNotes[c.id] || ''}
                              onChange={(e) =>
                                setDecisionNotes({ ...decisionNotes, [c.id]: e.target.value })
                              }
                            />
                          </label>
                        )}

                        <div className="cq-ai-actions">
                          {/* Botão Gerar / Recalcular */}
                          {c.status !== 'aplicada' && (
                            <button
                              type="button"
                              className="cq-btn cq-btn--ai"
                              disabled={isPlanning || isExecuting}
                              onClick={() => handleGeneratePlan(c.id)}
                            >
                              {isPlanning ? (
                                <>
                                  <span className="loading-spinner-mini" aria-hidden="true" />
                                  Planejando com IA…
                                </>
                              ) : c.plan ? (
                                '✦ Recalcular Plano IA'
                              ) : (
                                '✦ Gerar Plano com IA'
                              )}
                            </button>
                          )}

                          {/* Botão Aprovar e Executar */}
                          {c.plan && c.status !== 'aplicada' && c.status !== 'recusada' && (
                            <button
                              type="button"
                              className="cq-btn cq-btn--approve"
                              disabled={isExecuting || isPlanning}
                              onClick={() => handleApprovePlan(c)}
                            >
                              {isExecuting ? (
                                <>
                                  <span className="loading-spinner-mini" aria-hidden="true" />
                                  Executando no Cloudflare…
                                </>
                              ) : (
                                '✓ Aprovar e Executar no Cloudflare'
                              )}
                            </button>
                          )}

                          {/* Botão Rejeitar */}
                          {c.status !== 'aplicada' && c.status !== 'recusada' && (
                            <button
                              type="button"
                              className="cq-btn cq-btn--reject"
                              disabled={isExecuting || isPlanning}
                              onClick={() => handleReject(c)}
                            >
                              ✕ Rejeitar
                            </button>
                          )}

                          {c.status === 'aplicada' && (
                            <span className="cq-applied-tag">
                              ✓ Executado no acervo {c.decided_at ? `em ${c.decided_at}` : ''}
                            </span>
                          )}

                          {c.status === 'recusada' && (
                            <span className="cq-rejected-tag">✕ Contribuição recusada</span>
                          )}
                        </div>
                      </div>
                    </section>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Paginação */}
      {pagination && (
        <Pagination
          pagination={pagination}
          onPageChange={(newPage) => {
            setPage(newPage);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      )}

      {/* Modal Seguro de Visualização de Anexo */}
      {viewingFile && (
        <div className="cq-modal-backdrop" onClick={closeViewer} role="dialog" aria-modal="true">
          <div className="cq-modal-content" onClick={(e) => e.stopPropagation()}>
            <header className="cq-modal-head">
              <h3>{viewingFile.name}</h3>
              <button
                type="button"
                className="cq-modal-close"
                onClick={closeViewer}
                aria-label="Fechar"
              >
                ×
              </button>
            </header>
            <div className="cq-modal-body">
              {viewingFile.type.startsWith('image/') ? (
                <img
                  src={viewingFile.url}
                  alt={viewingFile.name}
                  className="cq-modal-img"
                />
              ) : (
                <iframe
                  src={viewingFile.url}
                  title={viewingFile.name}
                  sandbox="allow-scripts"
                  className="cq-modal-iframe"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
