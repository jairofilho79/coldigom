import { Link } from 'react-router-dom';
import type { Praise } from '../types';

interface ResultsTableProps {
  praises: Praise[];
}

function parseTagNames(tagNames: string | null | undefined): string[] {
  if (!tagNames) return [];
  return tagNames.split(',').map((t) => t.trim()).filter(Boolean);
}

export function ResultsTable({ praises }: ResultsTableProps) {
  if (praises.length === 0) {
    return (
      <div className="no-results">
        <div className="no-results-icon">📖</div>
        <div className="no-results-title">Nenhum louvor encontrado</div>
        <div className="no-results-desc">
          Tente ajustar seus filtros ou buscar com termos diferentes.
        </div>
      </div>
    );
  }

  return (
    <div className="results-container">
      <table className="results-table">
        <thead>
          <tr>
            <th scope="col">Nº</th>
            <th scope="col">Nome</th>
            <th scope="col">Coleções</th>
            <th scope="col">Tom</th>
          </tr>
        </thead>
        <tbody>
          {praises.map((praise) => {
            const tags = parseTagNames(praise.tag_names);
            return (
              <tr key={praise.id}>
                <td className="col-number">{praise.number || '—'}</td>
                <td className="col-name">
                  <Link to={`/praise/${praise.id}`}>{praise.name}</Link>
                </td>
                <td className="col-tags">
                  {tags.length > 0 ? (
                    <div className="col-tags-list">
                      {tags.map((name) => (
                        <span key={name} className="detail-tag">
                          {name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="col-tonality">{praise.tonality || '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
