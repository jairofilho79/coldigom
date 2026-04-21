import { useState, useEffect } from 'react';
import { SearchBar } from '../components/SearchBar';
import { ResultsTable } from '../components/ResultsTable';
import { Pagination } from '../components/Pagination';
import { FilterBar } from '../components/FilterBar';
import { searchPraises } from '../services/api';
import { useFilters } from '../hooks/useFilters';
import type { Praise, PaginationInfo } from '../types';

export function HomePage() {
  const { filters, setFilters } = useFilters();

  const [praises, setPraises] = useState<Praise[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPraises = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await searchPraises({
          query: filters.query,
          page: filters.page,
          tags: filters.tags,
          rhythm: filters.rhythm,
          tonality: filters.tonality,
          category: filters.category,
          numberMin: filters.numberMin,
          numberMax: filters.numberMax,
          sort: filters.sort,
          order: filters.order,
        });
        setPraises(result.data);
        setPagination(result.pagination);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load praises');
      } finally {
        setLoading(false);
      }
    };

    fetchPraises();
  }, [filters.query, filters.page, filters.tags, filters.rhythm, filters.tonality, filters.category, filters.numberMin, filters.numberMax, filters.sort, filters.order]);

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
        <h1 className="brand-title">Coldigom</h1>
        <p className="brand-subtitle">Coletânea Digital de Objetos Musicais</p>
      </header>

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
          <ResultsTable praises={praises} />
          {pagination && (
            <Pagination pagination={pagination} onPageChange={handlePageChange} />
          )}
        </>
      )}
    </div>
  );
}
