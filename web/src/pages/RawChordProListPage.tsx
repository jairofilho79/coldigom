import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listRawChordpros, getLoginUrl } from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { RawChordproSummary } from '../types/rawChordpro';
import type { PaginationInfo } from '../types';

type ValidatedFilter = 'all' | 'true' | 'false';

export function RawChordProListPage() {
  const { user, ready: authReady, logout } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const validated = (searchParams.get('validated') as ValidatedFilter) || 'all';
  const q = searchParams.get('q') || '';
  const debugBatch = searchParams.get('debug_batch') || '';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const limit = 50;

  const [items, setItems] = useState<RawChordproSummary[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [queryInput, setQueryInput] = useState(q);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listRawChordpros({
        validated,
        q: q || undefined,
        debug_batch: debugBatch || undefined,
        limit,
        offset: (page - 1) * limit,
      });
      setItems(result.data);
      setPagination(result.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar');
    } finally {
      setLoading(false);
    }
  }, [validated, q, debugBatch, page]);

  useEffect(() => { void fetchList(); }, [fetchList]);

  const setFilter = (next: ValidatedFilter) => {
    const p = new URLSearchParams(searchParams);
    if (next === 'all') p.delete('validated'); else p.set('validated', next);
    p.set('page', '1');
    setSearchParams(p);
  };

  const setDebugFilter = (next: '' | 'fase2') => {
    const p = new URLSearchParams(searchParams);
    if (next) p.set('debug_batch', next); else p.delete('debug_batch');
    p.set('page', '1');
    setSearchParams(p);
  };

  return (
    <div className="page-container raw-chordpro-page">
      <header className="brand-header">
        <div className="brand-header-top">
          <div>
            <Link to="/" className="raw-chordpro-back">← Coldigom</Link>
            <h1 className="brand-title">Raw ChordPro</h1>
            <p className="brand-subtitle">
              {debugBatch === 'fase2'
                ? 'Revisão humana — amostra Fase 2 (descartável)'
                : 'Revisão de cifras extraídas dos PDFs'}
            </p>
          </div>
          <div className="brand-header-auth">
            {!authReady ? <span className="auth-user muted">Sessão…</span> : user ? (
              <>
                <span className="auth-user">{user.name || user.email}</span>
                <button type="button" className="auth-btn" onClick={() => void logout()}>Sair</button>
              </>
            ) : (
              <a className="auth-btn" href={getLoginUrl()}>Entrar</a>
            )}
          </div>
        </div>
      </header>

      <div className="raw-chordpro-toolbar">
        <div className="raw-chordpro-filters">
          {(['all', 'false', 'true'] as const).map((f) => (
            <button key={f} type="button" className={`raw-chordpro-filter-btn${validated === f ? ' is-active' : ''}`} onClick={() => setFilter(f)}>
              {f === 'all' ? 'Todos' : f === 'true' ? 'Validados' : 'Não validados'}
            </button>
          ))}
          <button
            type="button"
            className={`raw-chordpro-filter-btn${debugBatch === 'fase2' ? ' is-active' : ''}`}
            onClick={() => setDebugFilter(debugBatch === 'fase2' ? '' : 'fase2')}
          >
            Fase 2
          </button>
        </div>
        <form className="raw-chordpro-search" onSubmit={(e) => {
          e.preventDefault();
          const p = new URLSearchParams(searchParams);
          if (queryInput.trim()) p.set('q', queryInput.trim()); else p.delete('q');
          p.set('page', '1');
          setSearchParams(p);
        }}>
          <input type="search" value={queryInput} onChange={(e) => setQueryInput(e.target.value)} placeholder="Buscar título ou louvor…" />
          <button type="submit" className="auth-btn">Buscar</button>
        </form>
      </div>

      {pagination ? <p className="results-info">{pagination.total} cifras · página {pagination.page} de {pagination.totalPages}</p> : null}
      {loading ? <div className="loading-state"><div className="loading-spinner" /></div> : null}
      {error ? <div className="error-state"><div className="error-state-desc">{error}</div></div> : null}

      {!loading && !error ? (
        <ul className="raw-chordpro-list">
          {items.map((item) => {
            const qa = item.debug_batch === 'fase2' && item.kind_label
              ? (item.kind_label.startsWith('auto_ok') ? 'auto_ok' as const
                : item.kind_label.startsWith('auto_fail') ? 'auto_fail' as const
                : null)
              : null;
            return (
            <li key={item.id}>
              <Link to={`/raw-chordPro/${item.id}`} className="raw-chordpro-list-item">
                <div className="raw-chordpro-list-main">
                  <span className="raw-chordpro-list-title">{item.title || item.source_filename}{item.subtitle ? ` (${item.subtitle})` : ''}</span>
                  <span className="raw-chordpro-list-sub muted">{item.praise_name}{item.kind_label ? ` · ${item.kind_label}` : ''}</span>
                </div>
                {qa ? (
                  <span className={`raw-chordpro-badge ${qa === 'auto_ok' ? 'auto-ok' : 'auto-fail'}`}>
                    {qa === 'auto_ok' ? 'auto_ok' : 'auto_fail'}
                  </span>
                ) : (
                  <span className={`raw-chordpro-badge ${item.validated ? 'validated' : 'pending'}`}>{item.validated ? 'Validado' : 'Pendente'}</span>
                )}
              </Link>
            </li>
            );
          })}
        </ul>
      ) : null}

      {pagination && pagination.totalPages > 1 ? (
        <div className="pagination-bar">
          <button type="button" className="auth-btn" disabled={page <= 1} onClick={() => { const p = new URLSearchParams(searchParams); p.set('page', String(page - 1)); setSearchParams(p); }}>Anterior</button>
          <button type="button" className="auth-btn" disabled={page >= pagination.totalPages} onClick={() => { const p = new URLSearchParams(searchParams); p.set('page', String(page + 1)); setSearchParams(p); }}>Próxima</button>
        </div>
      ) : null}
    </div>
  );
}
