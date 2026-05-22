import { useState, useEffect, useRef } from 'react';
import { getFilterOptions, getMaterialKinds } from '../services/api';
import type { FilterOptions, MaterialKind, TagWithCount } from '../types';
import { SortSelector } from './SortSelector';
import { useFilters } from '../hooks/useFilters';

type MultiSelectKey = 'category' | 'materialKinds';

export function FilterBar() {
  const { filters, setFilters, toggleTag, clearAllFilters, activeFilterCount } = useFilters();
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [materialKinds, setMaterialKinds] = useState<MaterialKind[]>([]);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([getFilterOptions(), getMaterialKinds()])
      .then(([opts, kinds]) => {
        setFilterOptions(opts);
        setMaterialKinds(kinds);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
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

  const renderStringDropdown = (key: 'category', label: string, options: string[]) => {
    const isOpen = openDropdown === key;
    const selectedCount = filters[key].length;

    return (
      <div className="filter-dropdown" key={key}>
        <button
          type="button"
          className={`filter-dropdown-trigger ${selectedCount > 0 ? 'active' : ''}`}
          onClick={() => setOpenDropdown(isOpen ? null : key)}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
        >
          {label}
          {selectedCount > 0 && <span className="filter-dropdown-badge">{selectedCount}</span>}
          <span className="arrow">▼</span>
        </button>
        {isOpen && (
          <div className="filter-dropdown-menu" role="listbox">
            {options.map((opt) => (
              <label
                key={opt}
                className="filter-dropdown-item"
                role="option"
                aria-selected={filters[key].includes(opt)}
              >
                <input
                  type="checkbox"
                  checked={filters[key].includes(opt)}
                  onChange={() => handleMultiSelect(key, opt)}
                  tabIndex={-1}
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

    return (
      <div className="filter-dropdown" key={key}>
        <button
          type="button"
          className={`filter-dropdown-trigger ${selectedCount > 0 ? 'active' : ''}`}
          onClick={() => setOpenDropdown(isOpen ? null : key)}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
        >
          Materiais
          {selectedCount > 0 && <span className="filter-dropdown-badge">{selectedCount}</span>}
          <span className="arrow">▼</span>
        </button>
        {isOpen && (
          <div className="filter-dropdown-menu" role="listbox">
            {materialKinds.map((kind) => (
              <label
                key={kind.id}
                className="filter-dropdown-item"
                role="option"
                aria-selected={filters.materialKinds.includes(kind.id)}
              >
                <input
                  type="checkbox"
                  checked={filters.materialKinds.includes(kind.id)}
                  onChange={() => handleMultiSelect(key, kind.id)}
                  tabIndex={-1}
                />
                {kind.name}
              </label>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (!filterOptions) {
    return (
      <div className="filter-bar">
        <div className="loading-state" style={{ padding: 'var(--space-8)' }}>
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
          {filterOptions.tags.map((tag: TagWithCount) => (
            <button
              key={tag.id}
              type="button"
              className={`tag-chip ${filters.tags.includes(tag.id) ? 'active' : ''}`}
              onClick={() => toggleTag(tag.id)}
              aria-pressed={filters.tags.includes(tag.id)}
            >
              {tag.name}
              <span className="tag-chip-count">{tag.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="filter-controls-row">
        {renderMaterialKindsDropdown()}
        {renderStringDropdown('category', 'Categoria', filterOptions.categories)}

        <SortSelector
          sort={filters.sort}
          order={filters.order}
          onChange={handleSortChange}
        />

        {activeFilterCount > 0 && (
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
    </div>
  );
}
