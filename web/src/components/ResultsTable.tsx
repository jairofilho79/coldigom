import { Link } from 'react-router-dom';
import type { Praise } from '../types';

interface ResultsTableProps {
  praises: Praise[];
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
            <th scope="col">Autor</th>
            <th scope="col">Ritmo</th>
            <th scope="col">Tom</th>
            <th scope="col">Categoria</th>
          </tr>
        </thead>
        <tbody>
          {praises.map((praise) => (
            <tr key={praise.id}>
              <td className="col-number">{praise.number || '—'}</td>
              <td className="col-name">
                <Link to={`/praise/${praise.id}`}>{praise.name}</Link>
              </td>
              <td className="col-author">{praise.author || '—'}</td>
              <td className="col-rhythm">{praise.rhythm || '—'}</td>
              <td className="col-tonality">{praise.tonality || '—'}</td>
              <td className="col-category">{praise.category || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
