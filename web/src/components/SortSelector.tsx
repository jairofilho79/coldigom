import type { SortField } from '../types';
import { SORT_OPTIONS } from '../types';

interface SortSelectorProps {
  sort: SortField;
  order: 'asc' | 'desc';
  onChange: (sort: SortField, order: 'asc' | 'desc') => void;
}

export function SortSelector({ sort, order, onChange }: SortSelectorProps) {
  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSort = e.target.value as SortField;
    const newOrder = newSort === sort ? (order === 'asc' ? 'desc' : 'asc') : 'asc';
    onChange(newSort, newOrder);
  };

  const toggleOrder = () => {
    onChange(sort, order === 'asc' ? 'desc' : 'asc');
  };

  return (
    <div className="sort-selector">
      <select value={sort} onChange={handleSortChange} className="sort-select" aria-label="Ordenar por">
        {SORT_OPTIONS.map(opt => (
          <option key={opt.field} value={opt.field}>
            {opt.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="sort-order-btn"
        onClick={toggleOrder}
        title={order === 'asc' ? 'Crescente' : 'Decrescente'}
        aria-label={order === 'asc' ? 'Ordenar decrescente' : 'Ordenar crescente'}
      >
        {order === 'asc' ? '↑' : '↓'}
      </button>
    </div>
  );
}
