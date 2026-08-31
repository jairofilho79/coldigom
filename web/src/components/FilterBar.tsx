import { useState, useEffect, useRef } from 'react';
import { getFilterOptions, getMaterialKinds } from '../services/api';
import type { FilterOptions, MaterialKind } from '../types';
import { SortSelector } from './SortSelector';
import { useFilters } from '../hooks/useFilters';

type MultiSelectKey = 'category' | 'rhythm' | 'tonality' | 'materialKinds';

export function FilterBar() {
  const { filters, setFilters, toggleTag, clearAllFilters, activeFilterCount } = useFilters();
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [materialKinds, setMaterialKinds] = useState<MaterialKind[]>([]);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [erroOpcoes, setErroOpcoes] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const gatilhosRef = useRef<Record<string, HTMLButtonElement | null>>({});

  /** Fecha e devolve o foco a quem abriu — senão o teclado fica órfão na página. */
  const fecharDropdown = (key: string) => {
    setOpenDropdown(null);
    gatilhosRef.current[key]?.focus();
  };

  // O .catch(console.error) engolia a falha e filterOptions ficava null para
  // sempre: a barra inteira virava um spinner sem fim, sem mensagem e sem
  // saída, enquanto a tabela de resultados carregava normalmente ao lado.
  // Refaz a consulta quando os filtros mudam: as opções agora refletem o que
  // ainda produz resultado. `filterOptions` NÃO é limpo antes — limpar faria a
  // barra inteira sumir e voltar a cada clique de filtro.
  const chaveDosFiltros = JSON.stringify([
    filters.query,
    filters.tags,
    filters.rhythm,
    filters.tonality,
    filters.category,
    filters.materialKinds,
    filters.numberMin,
    filters.numberMax,
  ]);

  useEffect(() => {
    let cancelado = false;
    const correntes = JSON.parse(chaveDosFiltros) as [
      string, string[], string[], string[], string[], string[], number | undefined, number | undefined
    ];
    const [query, tags, rhythm, tonality, category, materialKinds, numberMin, numberMax] = correntes;

    Promise.all([
      getFilterOptions({ query, tags, rhythm, tonality, category, materialKinds, numberMin, numberMax }),
      getMaterialKinds(),
    ])
      .then(([opts, kinds]) => {
        if (cancelado) return;
        setFilterOptions(opts);
        setMaterialKinds(kinds);
      })
      .catch(() => {
        if (!cancelado) setErroOpcoes(true);
      });

    return () => {
      cancelado = true;
    };
  }, [tentativa, chaveDosFiltros]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const alvo = e.target as Element | null;
      // Antes comparava com a barra inteira: clicar em outro controle DENTRO
      // dela — o seletor de ordenação, por exemplo — deixava o menu aberto e os
      // dois se sobrepunham.
      if (!alvo?.closest('.filter-dropdown')) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSortChange = (sort: string, order: 'asc' | 'desc') => {
    setFilters({ sort: sort as 'number', order, page: 1 });
  };

  const handleMultiSelect = (key: MultiSelectKey, value: string) => {
    const current = filters[key];
    const newValues = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    setFilters({ [key]: newValues, page: 1 });
  };

  /** Faixa de número: vazio limpa o filtro; só inteiro válido vai para a URL. */
  const alterarFaixa = (campo: 'numberMin' | 'numberMax', bruto: string) => {
    const texto = bruto.trim();
    if (texto === '') {
      setFilters({ [campo]: undefined, page: 1 });
      return;
    }
    if (!/^\d+$/.test(texto)) return;
    setFilters({ [campo]: Number(texto), page: 1 });
  };

  const renderStringDropdown = (
    key: 'category' | 'rhythm' | 'tonality',
    label: string,
    options: string[]
  ) => {
    const isOpen = openDropdown === key;
    const selectedCount = filters[key].length;
    const rotuloGrupo = label;

    return (
      <div className="filter-dropdown" key={key}>
        <button
          type="button"
          ref={(el) => { gatilhosRef.current[key] = el; }}
          className={`filter-dropdown-trigger ${selectedCount > 0 ? 'active' : ''}`}
          onClick={() => setOpenDropdown(isOpen ? null : key)}
          onKeyDown={(e) => { if (e.key === 'Escape' && isOpen) fecharDropdown(key); }}
          aria-expanded={isOpen}
        >
          {label}
          {selectedCount > 0 && <span className="filter-dropdown-badge">{selectedCount}</span>}
          <span className="arrow">▼</span>
        </button>
        {isOpen && (
          <div
            className="filter-dropdown-menu"
            role="group"
            aria-label={rotuloGrupo}
            onKeyDown={(e) => { if (e.key === 'Escape') fecharDropdown(key); }}
          >
            {options.map((opt) => (
              <label
                key={opt}
                className="filter-dropdown-item"
              >
                <input
                  type="checkbox"
                  checked={filters[key].includes(opt)}
                  onChange={() => handleMultiSelect(key, opt)}
                />
                {opt}
              </label>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderMaterialKindsDropdown = () => {
    const key = 'materialKinds';
    const isOpen = openDropdown === key;
    const selectedCount = filters.materialKinds.length;
    const rotuloGrupo = 'Materiais';

    return (
      <div className="filter-dropdown" key={key}>
        <button
          type="button"
          ref={(el) => { gatilhosRef.current[key] = el; }}
          className={`filter-dropdown-trigger ${selectedCount > 0 ? 'active' : ''}`}
          onClick={() => setOpenDropdown(isOpen ? null : key)}
          onKeyDown={(e) => { if (e.key === 'Escape' && isOpen) fecharDropdown(key); }}
          aria-expanded={isOpen}
        >
          Materiais
          {selectedCount > 0 && <span className="filter-dropdown-badge">{selectedCount}</span>}
          <span className="arrow">▼</span>
        </button>
        {isOpen && (
          <div
            className="filter-dropdown-menu"
            role="group"
            aria-label={rotuloGrupo}
            onKeyDown={(e) => { if (e.key === 'Escape') fecharDropdown(key); }}
          >
            {materialKinds.map((kind) => (
              <label
                key={kind.id}
                className="filter-dropdown-item"
              >
                <input
                  type="checkbox"
                  checked={filters.materialKinds.includes(kind.id)}
                  onChange={() => handleMultiSelect(key, kind.id)}
                />
                {kind.name}
              </label>
            ))}
          </div>
        )}
      </div>
    );
  };

  /**
   * Cada filtro aplicado, com rótulo legível e como removê-lo sozinho.
   *
   * Antes só existia um contador numérico no gatilho de cada dropdown: não dava
   * para ver o que estava aplicado, nem tirar um filtro sem reabrir o menu
   * certo e caçar a opção marcada. Com Ritmo e Tom entrando, isso ficaria pior.
   */
  const filtrosAtivos: { chave: string; rotulo: string; remover: () => void }[] = [];

  if (filterOptions) {
    const semValor = <T,>(lista: T[], valor: T) => lista.filter((v) => v !== valor);

    if (filters.query) {
      filtrosAtivos.push({
        chave: 'q',
        rotulo: `Busca: ${filters.query}`,
        remover: () => setFilters({ query: '', page: 1 }),
      });
    }
    for (const id of filters.tags) {
      const tag = filterOptions.tags.find((t) => t.id === id);
      filtrosAtivos.push({
        chave: `tag:${id}`,
        rotulo: `Coleção: ${tag?.name ?? id}`,
        remover: () => toggleTag(id),
      });
    }
    for (const [campo, titulo] of [
      ['rhythm', 'Ritmo'],
      ['tonality', 'Tom'],
      ['category', 'Categoria'],
    ] as const) {
      for (const valor of filters[campo]) {
        filtrosAtivos.push({
          chave: `${campo}:${valor}`,
          rotulo: `${titulo}: ${valor}`,
          remover: () => setFilters({ [campo]: semValor(filters[campo], valor), page: 1 }),
        });
      }
    }
    for (const id of filters.materialKinds) {
      const kind = materialKinds.find((k) => k.id === id);
      filtrosAtivos.push({
        chave: `material:${id}`,
        rotulo: `Material: ${kind?.name ?? id}`,
        remover: () => setFilters({ materialKinds: semValor(filters.materialKinds, id), page: 1 }),
      });
    }
    if (filters.numberMin !== undefined) {
      filtrosAtivos.push({
        chave: 'numberMin',
        rotulo: `Número a partir de ${filters.numberMin}`,
        remover: () => setFilters({ numberMin: undefined, page: 1 }),
      });
    }
    if (filters.numberMax !== undefined) {
      filtrosAtivos.push({
        chave: 'numberMax',
        rotulo: `Número até ${filters.numberMax}`,
        remover: () => setFilters({ numberMax: undefined, page: 1 }),
      });
    }
  }

  if (erroOpcoes) {
    return (
      <div className="filter-bar">
        <div className="error-state" role="alert">
          <div className="error-state-title">Não foi possível carregar os filtros</div>
          <p className="error-state-desc">Verifique a conexão e tente novamente.</p>
          <button
            type="button"
            className="clear-filters-btn"
            onClick={() => {
              // Reset aqui, no evento, e não dentro do efeito: chamar setState
              // direto no efeito dispara re-render em cascata.
              setErroOpcoes(false);
              setTentativa((n) => n + 1);
            }}
          >
            Tentar de novo
          </button>
        </div>
      </div>
    );
  }

  if (!filterOptions) {
    return (
      <div className="filter-bar">
        <div className="loading-state" style={{ padding: 'var(--space-8)' }} role="status">
          <span className="sr-only">Carregando opções de filtro…</span>
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="filter-bar" ref={dropdownRef}>
      <div className="filter-section">
        <div className="filter-section-label">Coleções</div>
        <div className="filter-tags-row">
          {(() => {
            const roots = filterOptions.tags.filter((t) => !t.parent_id);
            const childrenOf = (parentId: string) =>
              filterOptions.tags.filter((t) => t.parent_id === parentId);
            return roots.flatMap((root) => {
              const children = childrenOf(root.id);
              const chips = [
                <button
                  key={root.id}
                  type="button"
                  className={`tag-chip ${filters.tags.includes(root.id) ? 'active' : ''}`}
                  onClick={() => toggleTag(root.id)}
                  aria-pressed={filters.tags.includes(root.id)}
                >
                  {root.name}
                  <span className="tag-chip-count">{root.count}</span>
                </button>,
              ];
              for (const child of children) {
                chips.push(
                  <button
                    key={child.id}
                    type="button"
                    className={`tag-chip tag-chip--child ${filters.tags.includes(child.id) ? 'active' : ''}`}
                    onClick={() => toggleTag(child.id)}
                    aria-pressed={filters.tags.includes(child.id)}
                  >
                    {root.name} · {child.name}
                    <span className="tag-chip-count">{child.count}</span>
                  </button>
                );
              }
              return chips;
            });
          })()}
        </div>
      </div>

      <div className="filter-controls-row">
        {renderMaterialKindsDropdown()}
        {renderStringDropdown('category', 'Categoria', filterOptions.categories)}
        {/* Ritmo e Tom existiam no FilterState, no useFilters, no services/api e
            a API já devolvia as opções — faltava só a barra renderizar. */}
        {renderStringDropdown('rhythm', 'Ritmo', filterOptions.rhythms)}
        {renderStringDropdown('tonality', 'Tom', filterOptions.tonalities)}

        <div className="filter-number-range">
          <label className="filter-number-label" htmlFor="filtro-numero-min">
            Nº de
            <input
              id="filtro-numero-min"
              type="number"
              inputMode="numeric"
              min={0}
              className="filter-number-input"
              aria-label="Número mínimo"
              value={filters.numberMin ?? ''}
              onChange={(e) => alterarFaixa('numberMin', e.target.value)}
            />
          </label>
          <label className="filter-number-label" htmlFor="filtro-numero-max">
            até
            <input
              id="filtro-numero-max"
              type="number"
              inputMode="numeric"
              min={0}
              className="filter-number-input"
              aria-label="Número máximo"
              value={filters.numberMax ?? ''}
              onChange={(e) => alterarFaixa('numberMax', e.target.value)}
            />
          </label>
        </div>

        <SortSelector
          sort={filters.sort}
          order={filters.order}
          onChange={handleSortChange}
        />

        {filtrosAtivos.length > 0 && (
          <button
            type="button"
            className="clear-filters-btn"
            onClick={clearAllFilters}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
            Limpar ({activeFilterCount})
          </button>
        )}
      </div>

      {filtrosAtivos.length > 0 && (
        <div className="filter-active-row" role="group" aria-label="Filtros aplicados">
          {filtrosAtivos.map((f) => (
            <button
              key={f.chave}
              type="button"
              className="filter-active-chip"
              aria-label={`Remover filtro ${f.rotulo}`}
              onClick={f.remover}
            >
              {f.rotulo}
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
