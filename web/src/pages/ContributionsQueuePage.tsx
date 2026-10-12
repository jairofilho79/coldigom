import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthControl } from '../components/AuthControl';
import { Pagination } from '../components/Pagination';
import { useAuth } from '../context/useAuth';
import {
  approveAdminContributionPlan,
  fetchAdminContributionFile,
  generateAdminContributionPlan,
  getAdminContribution,
  listAdminContributions,
  patchAdminContribution,
} from '../services/api';
import type {
  AdminContribution,
  ContributionFile,
  PaginationInfo,
  PlanTaskItem,
} from '../types';

const STATUS_TABS = [
  { id: 'pendente', label: 'Pendentes' },
  { id: 'recebida', label: 'Recebidas' },
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
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});

  const [viewingFile, setViewingFile] = useState<{
    url: string;
    name: string;
    type: string;
  } | null>(null);
  const [editingContrib, setEditingContrib] = useState<AdminContribution | null>(null);

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

  const handleComplete = async (contrib: AdminContribution) => {
    setCompletingId(contrib.id);
    setError(null);
    setSuccessMsg(null);
    try {
      const note = decisionNotes[contrib.id];
      await patchAdminContribution(contrib.id, 'aplicada', note);
      setContributions((prev) =>
        prev.map((c) =>
          c.id === contrib.id
            ? { ...c, status: 'aplicada', decision_note: note || c.decision_note }
            : c
        )
      );
      setSuccessMsg('Contribuição marcada como concluída.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao concluir contribuição');
    } finally {
      setCompletingId(null);
    }
  };

  const handleReject = async (contrib: AdminContribution) => {
    setRejectingId(contrib.id);
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
    } finally {
      setRejectingId(null);
    }
  };

  const handleOpenEditModal = async (contrib: AdminContribution) => {
    setEditingContrib(contrib);
    try {
      const full = await getAdminContribution(contrib.id);
      setEditingContrib((prev) => (prev?.id === contrib.id ? full : prev));
    } catch {
      // continua com os dados da lista caso getAdminContribution falhe
    }
  };

  const handleSaveEditAndApply = async (
    contrib: AdminContribution,
    editData: {
      tasks: PlanTaskItem[];
      summary: string;
      decisionNote?: string;
    }
  ) => {
    setError(null);
    setSuccessMsg(null);
    if (editData.tasks.length > 0) {
      await approveAdminContributionPlan(contrib.id, {
        tasks: editData.tasks,
        summary: editData.summary,
        todos: editData.tasks.map((t) => `Executar ${t.operation}`),
        decisionNote: editData.decisionNote,
      });
    } else {
      await patchAdminContribution(contrib.id, 'aplicada', editData.decisionNote);
    }

    setContributions((prev) =>
      prev.map((c) =>
        c.id === contrib.id
          ? {
              ...c,
              status: 'aplicada',
              decision_note: editData.decisionNote || c.decision_note,
            }
          : c
      )
    );
    setSuccessMsg(
      `Contribuição editada e aplicada com sucesso! Crédito preservado para ${contrib.user_name || contrib.user_email}.`
    );
    setEditingContrib(null);
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
            const isCompleting = completingId === c.id;
            const isRejecting = rejectingId === c.id;
            const isBusy = isPlanning || isExecuting || isCompleting || isRejecting;

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
                              disabled={isBusy}
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
                              disabled={isBusy}
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

                          {/* Botão Editar e Aplicar */}
                          {c.status !== 'aplicada' && c.status !== 'recusada' && (
                            <button
                              type="button"
                              className="cq-btn cq-btn--edit"
                              disabled={isBusy}
                              onClick={() => handleOpenEditModal(c)}
                              title="Editar texto, cifras ou metadados e aplicar mantendo o crédito do colaborador"
                            >
                              ✎ Editar e Aplicar
                            </button>
                          )}

                          {/* Botão Concluir */}
                          {c.status !== 'aplicada' && c.status !== 'recusada' && (
                            <button
                              type="button"
                              className="cq-btn cq-btn--complete"
                              disabled={isBusy}
                              onClick={() => handleComplete(c)}
                              title="Marcar como concluída (ação realizada manualmente)"
                            >
                              {isCompleting ? (
                                <>
                                  <span className="loading-spinner-mini" aria-hidden="true" />
                                  Concluindo…
                                </>
                              ) : c.plan ? (
                                '✓ Concluir (Manual)'
                              ) : (
                                '✓ Concluir'
                              )}
                            </button>
                          )}

                          {/* Botão Rejeitar */}
                          {c.status !== 'aplicada' && c.status !== 'recusada' && (
                            <button
                              type="button"
                              className="cq-btn cq-btn--reject"
                              disabled={isBusy}
                              onClick={() => handleReject(c)}
                            >
                              {isRejecting ? (
                                <>
                                  <span className="loading-spinner-mini" aria-hidden="true" />
                                  Rejeitando…
                                </>
                              ) : (
                                '✕ Rejeitar'
                              )}
                            </button>
                          )}

                          {c.status === 'aplicada' && (
                            <span className="cq-applied-tag">
                              {c.plan?.status === 'applied' ? '✓ Executado no acervo' : '✓ Concluída no acervo'}{' '}
                              {c.decided_at ? `em ${c.decided_at}` : ''}
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

      {/* Modal de Edição e Aplicação do Curador */}
      {editingContrib && (
        <EditAndApplyModal
          contrib={editingContrib}
          onClose={() => setEditingContrib(null)}
          onApply={handleSaveEditAndApply}
        />
      )}
    </main>
  );
}

interface EditAndApplyModalProps {
  contrib: AdminContribution;
  onClose: () => void;
  onApply: (
    contrib: AdminContribution,
    data: {
      tasks: PlanTaskItem[];
      summary: string;
      decisionNote?: string;
    }
  ) => Promise<void>;
}

function EditAndApplyModal({ contrib, onClose, onApply }: EditAndApplyModalProps) {
  const targetPraise = (contrib.target_praise_data || {}) as Record<string, unknown>;
  const fields = (contrib.fields || {}) as Record<string, unknown>;

  const [activeTab, setActiveTab] = useState<'meta' | 'lyrics' | 'chord'>('meta');

  // Praise ID
  const [targetPraiseId, setTargetPraiseId] = useState(
    contrib.target_praise_id || (fields.praiseId as string) || (fields.praise_id as string) || ''
  );

  // Metadados
  const [tonality, setTonality] = useState(
    String(fields.tonality ?? fields.proposed ?? targetPraise.tonality ?? '')
  );
  const [rhythm, setRhythm] = useState(
    String(fields.rhythm ?? targetPraise.rhythm ?? '')
  );
  const [author, setAuthor] = useState(
    String(fields.author ?? targetPraise.author ?? '')
  );
  const [praiseTitle, setPraiseTitle] = useState(
    String(fields.title ?? targetPraise.title ?? '')
  );

  // Letra
  const initialLyrics = String(
    fields.lyrics ?? targetPraise.lyrics ?? (contrib.kind === 'lyrics' || contrib.subkind === 'lyrics' ? contrib.body : '')
  );
  const [lyrics, setLyrics] = useState(initialLyrics);

  // Cifra
  const initialChord = String(contrib.target_chord_content ?? fields.chord_content ?? '');
  const [chordContent, setChordContent] = useState(initialChord);

  // Nota do Curador
  const [decisionNote, setDecisionNote] = useState(contrib.decision_note || '');

  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setModalError(null);

    try {
      const tasks: PlanTaskItem[] = [];
      const praiseId = targetPraiseId.trim() || undefined;

      // 1. Metadados
      const metaToUpdate: Record<string, unknown> = {};
      if (tonality.trim() && tonality.trim() !== String(targetPraise.tonality ?? '')) {
        metaToUpdate.tonality = tonality.trim();
      }
      if (rhythm.trim() && rhythm.trim() !== String(targetPraise.rhythm ?? '')) {
        metaToUpdate.rhythm = rhythm.trim();
      }
      if (author.trim() && author.trim() !== String(targetPraise.author ?? '')) {
        metaToUpdate.author = author.trim();
      }
      if (praiseTitle.trim() && praiseTitle.trim() !== String(targetPraise.title ?? '')) {
        metaToUpdate.title = praiseTitle.trim();
      }

      if (Object.keys(metaToUpdate).length > 0 && praiseId) {
        tasks.push({
          id: 'task_edit_metadata',
          operation: 'edit_praise_metadata',
          params: {
            praise_id: praiseId,
            fields: metaToUpdate,
          },
        });
      }

      // 2. Letra
      if (lyrics.trim() && lyrics.trim() !== String(targetPraise.lyrics ?? '').trim() && praiseId) {
        tasks.push({
          id: 'task_update_lyrics',
          operation: 'update_praise_lyrics',
          params: {
            praise_id: praiseId,
            lyrics: lyrics.trim(),
          },
        });
      }

      // 3. Cifra
      if (chordContent.trim() && chordContent.trim() !== initialChord.trim() && (praiseId || contrib.target_material_id)) {
        tasks.push({
          id: 'task_update_chord',
          operation: 'update_chord_content',
          params: {
            praise_id: praiseId,
            material_id: contrib.target_material_id || undefined,
            content: chordContent,
          },
        });
      }

      const summaryParts: string[] = [];
      if (Object.keys(metaToUpdate).length > 0) summaryParts.push('Metadados atualizados');
      if (tasks.some((t) => t.operation === 'update_praise_lyrics')) summaryParts.push('Letra atualizada');
      if (tasks.some((t) => t.operation === 'update_chord_content')) summaryParts.push('Cifra atualizada');
      const summary = summaryParts.length > 0 ? summaryParts.join(' · ') : 'Edição e aplicação manual da curadoria';

      await onApply(contrib, {
        tasks,
        summary,
        decisionNote: decisionNote.trim() || undefined,
      });
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Falha ao aplicar alterações');
      setSaving(false);
    }
  };

  return (
    <div
      className="cq-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cq-edit-modal-title"
    >
      <div className="cq-edit-modal-content" onClick={(e) => e.stopPropagation()}>
        <header className="cq-modal-head">
          <h3 id="cq-edit-modal-title">✎ Editar e Aplicar Contribuição</h3>
          <button
            type="button"
            className="cq-modal-close"
            onClick={onClose}
            aria-label="Fechar"
            disabled={saving}
          >
            ×
          </button>
        </header>

        <form onSubmit={handleSubmit} className="cq-edit-body">
          {/* Banner de Crédito Preservado do Colaborador Original */}
          <div className="cq-credit-banner" role="note">
            <span aria-hidden="true" style={{ fontSize: '1.25rem' }}>👤</span>
            <div>
              <strong>Crédito mantido para: </strong>
              <span>{contrib.user_name || contrib.user_email}</span>{' '}
              <span style={{ opacity: 0.8 }}>({contrib.user_email})</span>
              <div style={{ marginTop: '2px', fontSize: '0.8em', color: 'var(--text-tertiary)' }}>
                Mesmo após a edição da curadoria, a autoria desta contribuição permanece registrada para o colaborador original.
              </div>
            </div>
          </div>

          {/* Lembrete do texto original do colaborador */}
          <div
            className="cq-section"
            style={{
              background: 'var(--bg-surface)',
              padding: 'var(--space-2) var(--space-3)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-tertiary)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                fontWeight: 600,
              }}
            >
              Descrição original do colaborador:
            </div>
            <div
              style={{
                fontSize: '0.85rem',
                color: 'var(--text-secondary)',
                marginTop: '4px',
                whiteSpace: 'pre-wrap',
              }}
            >
              {contrib.body}
            </div>
          </div>

          {modalError && (
            <div
              className="error-state"
              role="alert"
              style={{ margin: 0, padding: 'var(--space-2) var(--space-3)' }}
            >
              <div className="error-state-desc">{modalError}</div>
            </div>
          )}

          {/* Abas de Navegação */}
          <div className="cq-edit-tabs">
            <button
              type="button"
              className={`cq-edit-tab ${activeTab === 'meta' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('meta')}
            >
              Metadados
            </button>
            <button
              type="button"
              className={`cq-edit-tab ${activeTab === 'lyrics' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('lyrics')}
            >
              Letra
            </button>
            <button
              type="button"
              className={`cq-edit-tab ${activeTab === 'chord' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('chord')}
            >
              Cifra / ChordPro
            </button>
          </div>

          {/* Tab Metadados */}
          {activeTab === 'meta' && (
            <div className="cq-edit-grid">
              <div className="cq-edit-field">
                <label htmlFor="cq-edit-praise-id">ID do Louvor Alvo</label>
                <input
                  id="cq-edit-praise-id"
                  type="text"
                  className="cq-edit-input"
                  value={targetPraiseId}
                  onChange={(e) => setTargetPraiseId(e.target.value)}
                  placeholder="ID do louvor no acervo"
                />
              </div>
              <div className="cq-edit-field">
                <label htmlFor="cq-edit-title">Título do Louvor</label>
                <input
                  id="cq-edit-title"
                  type="text"
                  className="cq-edit-input"
                  value={praiseTitle}
                  onChange={(e) => setPraiseTitle(e.target.value)}
                  placeholder="ex.: Ao Único"
                />
              </div>
              <div className="cq-edit-field">
                <label htmlFor="cq-edit-tonality">Tom</label>
                <input
                  id="cq-edit-tonality"
                  type="text"
                  className="cq-edit-input"
                  value={tonality}
                  onChange={(e) => setTonality(e.target.value)}
                  placeholder="ex.: Em, C, G"
                />
              </div>
              <div className="cq-edit-field">
                <label htmlFor="cq-edit-rhythm">Ritmo</label>
                <input
                  id="cq-edit-rhythm"
                  type="text"
                  className="cq-edit-input"
                  value={rhythm}
                  onChange={(e) => setRhythm(e.target.value)}
                  placeholder="ex.: Balada, Canção"
                />
              </div>
              <div className="cq-edit-field">
                <label htmlFor="cq-edit-author">Autor</label>
                <input
                  id="cq-edit-author"
                  type="text"
                  className="cq-edit-input"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="ex.: Benedito Carlos"
                />
              </div>
            </div>
          )}

          {/* Tab Letra */}
          {activeTab === 'lyrics' && (
            <div className="cq-edit-field">
              <label htmlFor="cq-edit-lyrics">Texto da Letra:</label>
              <textarea
                id="cq-edit-lyrics"
                className="cq-edit-textarea"
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                placeholder="Cole ou edite a letra do louvor aqui..."
                rows={10}
              />
            </div>
          )}

          {/* Tab Cifra */}
          {activeTab === 'chord' && (
            <div className="cq-edit-field">
              <label htmlFor="cq-edit-chord">Texto da Cifra (ChordPro / texto):</label>
              <textarea
                id="cq-edit-chord"
                className="cq-edit-textarea"
                value={chordContent}
                onChange={(e) => setChordContent(e.target.value)}
                placeholder="[Em]Ao único que é digno..."
                rows={10}
              />
            </div>
          )}

          {/* Nota do Curador */}
          <div className="cq-edit-field" style={{ marginTop: 'var(--space-2)' }}>
            <label htmlFor="cq-edit-decision-note">
              Nota do Curador (gravada com a decisão):
            </label>
            <input
              id="cq-edit-decision-note"
              type="text"
              className="cq-edit-input"
              value={decisionNote}
              onChange={(e) => setDecisionNote(e.target.value)}
              placeholder="ex.: Tom e estrofe 2 revisados conforme sugestão do colaborador"
            />
          </div>

          <footer className="cq-edit-footer">
            <button
              type="button"
              className="cq-btn cq-btn--ghost"
              onClick={onClose}
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="cq-btn cq-btn--edit"
              disabled={saving}
            >
              {saving ? (
                <>
                  <span className="loading-spinner-mini" aria-hidden="true" />
                  Aplicando alterações…
                </>
              ) : (
                '✓ Salvar e Aplicar (com crédito)'
              )}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
