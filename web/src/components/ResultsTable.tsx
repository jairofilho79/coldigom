import { Link } from 'react-router-dom';
import type { Praise } from '../types';

interface ResultsTableProps {
  praises: Praise[];
}

export function ResultsTable({ praises }: ResultsTableProps) {
  if (praises.length === 0) {
    return (
      <div className="no-results">
        <p>Nenhum louvor encontrado.</p>
      </div>
    );
  }

  return (
    <div className="results-container">
      <table className="results-table">
        <thead>
          <tr>
            <th>Nº</th>
            <th>Nome</th>
            <th>Autor</th>
            <th>Ritmo</th>
            <th>Tom</th>
            <th>Categoria</th>
          </tr>
        </thead>
        <tbody>
          {praises.map((praise) => (
            <tr key={praise.id}>
              <td className="col-number">{praise.number || '-'}</td>
              <td className="col-name">
                <Link to={`/praise/${praise.id}`}>{praise.name}</Link>
              </td>
              <td className="col-author">{praise.author || '-'}</td>
              <td className="col-rhythm">{praise.rhythm || '-'}</td>
              <td className="col-tonality">{praise.tonality || '-'}</td>
              <td className="col-category">{praise.category || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
