import type { PaginationInfo } from '../types';

interface PaginationProps {
  pagination: PaginationInfo;
  onPageChange: (page: number) => void;
}

export function Pagination({ pagination, onPageChange }: PaginationProps) {
  const { page, totalPages } = pagination;

  if (totalPages <= 1) return null;

  const items: (number | '...')[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) {
      items.push(i);
    } else if (items[items.length - 1] !== '...') {
      items.push('...');
    }
  }

  return (
    <nav className="pagination" aria-label="Paginação">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        className="pagination-btn"
        aria-label="Página anterior"
      >
        ←
      </button>

      {items.map((item, idx) =>
        item === '...' ? (
          <span key={`ellipsis-${idx}`} className="pagination-ellipsis" aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={item}
            onClick={() => onPageChange(item)}
            className={`pagination-btn ${item === page ? 'active' : ''}`}
            aria-label={`Página ${item}`}
            aria-current={item === page ? 'page' : undefined}
          >
            {item}
          </button>
        )
      )}

      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
        className="pagination-btn"
        aria-label="Próxima página"
      >
        →
      </button>
    </nav>
  );
}
