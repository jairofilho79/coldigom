import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { SearchBar } from '../components/SearchBar';
import { ResultsTable } from '../components/ResultsTable';
import { Pagination } from '../components/Pagination';
import { FilterBar } from '../components/FilterBar';
import { useAuth } from '../context/useAuth';
import { searchPraises } from '../services/api';
import { useFilters } from '../hooks/useFilters';
import { AuthControl } from '../components/AuthControl';
import type { Praise, PaginationInfo } from '../types';

export function HomePage() {
  const { user, authError } = useAuth();
  const { filters, setFilters, clearAllFilters } = useFilters();

  const [praises, setPraises] = useState<Praise[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Duas buscas em voo resolvem em ordem arbitrária e a última a chegar
    // vence, mesmo sendo a mais antiga: clicar dois filtros em sequência
    // rápida deixava a tela mostrando o resultado do primeiro clique.
    //
    // A flag protege o estado; o AbortController corta a requisição de fato,
    // em vez de deixá-la trafegar até o fim para ser descartada.
    let cancelado = false;
    const controle = new AbortController();

    const fetchPraises = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await searchPraises(
          {
            query: filters.query,
            page: filters.page,
            tags: filters.tags,
            rhythm: filters.rhythm,
            tonality: filters.tonality,
            category: filters.category,
            materialKinds: filters.materialKinds,
            numberMin: filters.numberMin,
            numberMax: filters.numberMax,
            sort: filters.sort,
            order: filters.order,
          },
          controle.signal
        );
        if (cancelado) return;
        setPraises(result.data);
        setPagination(result.pagination);
      } catch (err) {
        if (cancelado) return;
        setError(err instanceof Error ? err.message : 'Failed to load praises');
      } finally {
        if (!cancelado) setLoading(false);
      }
    };

    fetchPraises();

    return () => {
      cancelado = true;
      controle.abort();
    };
  }, [filters.query, filters.page, filters.tags, filters.rhythm, filters.tonality, filters.category, filters.materialKinds, filters.numberMin, filters.numberMax, filters.sort, filters.order]);

  // Rótulos do que está aplicado, para o estado vazio explicar o porquê em vez
  // de repetir "tente ajustar seus filtros" sem dizer quais. Coleções e tipos
  // de material aparecem como contagem: aqui só temos os ids, e os nomes vivem
  // na barra de filtros.
  const filtrosAplicados = [
    ...filters.rhythm.map((v) => `Ritmo: ${v}`),
    ...filters.tonality.map((v) => `Tom: ${v}`),
    ...filters.category.map((v) => `Categoria: ${v}`),
    filters.tags.length > 0 ? `${filters.tags.length} coleção(ões)` : null,
    filters.materialKinds.length > 0 ? `${filters.materialKinds.length} tipo(s) de material` : null,
    filters.numberMin !== undefined ? `número a partir de ${filters.numberMin}` : null,
    filters.numberMax !== undefined ? `número até ${filters.numberMax}` : null,
  ].filter((v): v is string => v !== null);

  const handleSearch = (newQuery: string) => {
    setFilters({ query: newQuery, page: 1 });
  };

  const handlePageChange = (newPage: number) => {
    setFilters({ page: newPage });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="page-container">
      <header className="brand-header animate-fade-in-up">
        <div className="brand-header-top">
          <div>
            <h1 className="brand-title">Coldigom</h1>
            <p className="brand-subtitle">Coletânea Digital de Objetos Musicais</p>
          </div>
          <div className="brand-header-auth">
            <AuthControl>
              <Link to="/praise/new" className="auth-btn">Novo louvor</Link>
            </AuthControl>
          </div>
        </div>
      </header>

      {authError && !user ? (
        <div className="error-state" role="alert">
          <div className="error-state-desc">{authError}</div>
        </div>
      ) : null}

      <SearchBar onSearch={handleSearch} initialValue={filters.query} />
      <FilterBar />

      {loading && (
        <div className="loading-state">
          <div className="loading-spinner" />
          <div className="loading-text">Buscando louvores...</div>
        </div>
      )}

      {error && (
        <div className="error-state">
          <div className="error-state-icon">⚠</div>
          <div className="error-state-title">Erro ao carregar</div>
          <div className="error-state-desc">{error}</div>
        </div>
      )}

      {!loading && !error && (
        <>
          {pagination && (
            <div className="results-info">
              <div className="results-count">
                <strong>{pagination.total}</strong> resultados encontrados
              </div>
            </div>
          )}
          <ResultsTable
            praises={praises}
            termoBuscado={filters.query || undefined}
            filtrosAplicados={filtrosAplicados}
            aoLimparFiltros={clearAllFilters}
          />
          {pagination && (
            <Pagination pagination={pagination} onPageChange={handlePageChange} />
          )}
        </>
      )}
    </div>
  );
}
