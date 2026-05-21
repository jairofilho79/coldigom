import type { SortField } from '../types';
import { SORT_OPTIONS } from '../types';
import { Select } from './Select';

interface SortSelectorProps {
  sort: SortField;
  order: 'asc' | 'desc';
  onChange: (sort: SortField, order: 'asc' | 'desc') => void;
}

const sortSelectOptions = SORT_OPTIONS.map((opt) => ({
  value: opt.field,
  label: opt.label,
}));

export function SortSelector({ sort, order, onChange }: SortSelectorProps) {
  const handleSortChange = (newSort: string) => {
    const field = newSort as SortField;
    const newOrder = field === sort ? (order === 'asc' ? 'desc' : 'asc') : 'asc';
    onChange(field, newOrder);
  };

  const toggleOrder = () => {
    onChange(sort, order === 'asc' ? 'desc' : 'asc');
  };

  return (
    <div className="sort-selector">
      <Select
        value={sort}
        onChange={handleSortChange}
        options={sortSelectOptions}
        aria-label="Ordenar por"
      />
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
