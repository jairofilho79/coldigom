import { useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { SearchBar } from '../components/SearchBar';
import { getPraise, searchPraises } from '../services/api';
import type { Praise } from '../types';

export function PraiseMergeSelectPage() {
  const { id: keeperId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [keeperName, setKeeperName] = useState<string>('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Praise[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!keeperId) return;
    getPraise(keeperId)
      .then((p) => setKeeperName(p.name))
      .catch((err) => setError(err instanceof Error ? err.message : 'Falha ao carregar louvor'));
  }, [keeperId]);

  useEffect(() => {
    if (!keeperId) return;
    // Mesmo padrão da HomePage: duas buscas em voo resolvem em ordem
    // arbitrária, e a resposta antiga chegando por último repintava a lista
    // embaixo do termo novo — aqui um clique na linha errada abre direto a
    // tela de mesclagem, que é destrutiva. A flag protege o estado (inclusive
    // o "Buscando…", que o `finally` da busca velha apagava); o
    // AbortController corta a requisição de fato.
    let cancelado = false;
    const controle = new AbortController();

    const t = setTimeout(() => {
      setLoading(true);
      setError(null);
      searchPraises({ query: query || undefined, limit: 20 }, controle.signal)
        .then((res) => {
          if (cancelado) return;
          setResults(res.data.filter((p) => p.id !== keeperId));
        })
        .catch((err) => {
          if (cancelado) return;
          setError(err instanceof Error ? err.message : 'Falha na busca');
        })
        .finally(() => {
          if (!cancelado) setLoading(false);
        });
    }, 300);

    return () => {
      cancelado = true;
      controle.abort();
      clearTimeout(t);
    };
  }, [query, keeperId]);

  if (!keeperId) {
    return (
      <div className="page-container detail-page">
        <p className="error-state-desc">ID do louvor inválido.</p>
      </div>
    );
  }

  return (
    <div className="page-container detail-page">
      <Link to={`/praise/${keeperId}`} className="back-link">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
        Voltar para o louvor
      </Link>

      <header className="merge-step-header animate-fade-in-scale">
        <h1 className="detail-title">Mesclar louvor</h1>
        <p className="materials-panel-help">
          Louvor que permanece: <strong>{keeperName || '…'}</strong>. Pesquise o duplicado para mesclar nele.
        </p>
      </header>

      {error ? (
        <div className="error-state" style={{ marginBottom: '1rem' }}>
          <div className="error-state-desc">{error}</div>
        </div>
      ) : null}

      <SearchBar onSearch={setQuery} initialValue={query} />

      {loading ? <p className="muted" style={{ marginTop: '1rem' }}>Buscando…</p> : null}

      <ul className="merge-results-list">
        {results.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className="merge-result-btn"
              onClick={() => navigate(`/praise/${keeperId}/merge/${p.id}`)}
            >
              <span className="merge-result-name">{p.name}</span>
              {p.number ? <span className="merge-result-meta">Nº {p.number}</span> : null}
              {p.author ? <span className="merge-result-meta">{p.author}</span> : null}
            </button>
          </li>
        ))}
      </ul>

      {!loading && results.length === 0 ? (
        <p className="lyrics-empty" style={{ marginTop: '1rem' }}>
          {query ? 'Nenhum louvor encontrado.' : 'Digite na busca para encontrar o duplicado.'}
        </p>
      ) : null}
    </div>
  );
}
