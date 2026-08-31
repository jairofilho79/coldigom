import { useState, type FormEvent } from 'react';

interface SearchBarProps {
  onSearch: (query: string) => void;
  initialValue?: string;
}

export function SearchBar({ onSearch, initialValue = '' }: SearchBarProps) {
  const [query, setQuery] = useState(initialValue);
  // O campo é rascunho do usuário, mas precisa acompanhar quando o termo
  // aplicado muda por fora — "Limpar filtros", botão Voltar, link com outro q.
  // Antes o estado era iniciado uma vez e nunca mais olhava para initialValue,
  // então a lista desfiltrava e o campo continuava exibindo o termo antigo.
  // Ajuste durante o render, e não em efeito: só dispara quando o termo
  // aplicado de fato muda, então não atropela quem está digitando.
  const [termoAplicado, setTermoAplicado] = useState(initialValue);
  if (initialValue !== termoAplicado) {
    setTermoAplicado(initialValue);
    setQuery(initialValue);
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSearch(query);
  };

  const handleClear = () => {
    setQuery('');
    onSearch('');
  };

  return (
    <form onSubmit={handleSubmit} className="search-bar" role="search">
      <div className="search-input-wrapper">
        <svg
          className="search-icon"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nome, letra, autor, ID..."
          aria-label="Buscar por nome, letra, autor ou ID"
          className="search-input"
        />
        {query && (
          <button
            type="button"
            className="search-clear-btn"
            onClick={handleClear}
            aria-label="Limpar busca"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        )}
      </div>
    </form>
  );
}
