import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SearchBar } from '../components/SearchBar';
import { ResultsTable } from '../components/ResultsTable';
import { Pagination } from '../components/Pagination';
import { searchPraises } from '../services/api';
import type { Praise, PaginationInfo } from '../types';

export function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const page = parseInt(searchParams.get('page') || '1', 10);
  
  const [praises, setPraises] = useState<Praise[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPraises = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await searchPraises(query, page);
        setPraises(result.data);
        setPagination(result.pagination);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load praises');
      } finally {
        setLoading(false);
      }
    };
    
    fetchPraises();
  }, [query, page]);

  const handleSearch = (newQuery: string) => {
    setSearchParams({ q: newQuery, page: '1' });
  };

  const handlePageChange = (newPage: number) => {
    setSearchParams({ q: query, page: newPage.toString() });
  };

  return (
    <div className="home-page">
      <header className="header">
        <h1>Coldigom</h1>
        <p className="subtitle">Coletânea Digital de Objetos Musicais</p>
      </header>
      
      <SearchBar onSearch={handleSearch} initialValue={query} />
      
      {loading && <div className="loading">Carregando...</div>}
      
      {error && <div className="error">{error}</div>}
      
      {!loading && !error && (
        <>
          <ResultsTable praises={praises} />
          {pagination && (
            <Pagination pagination={pagination} onPageChange={handlePageChange} />
          )}
        </>
      )}
    </div>
  );
}
