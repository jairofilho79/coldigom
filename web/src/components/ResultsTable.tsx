import { useMemo, useState, Fragment } from 'react';
import { Link } from 'react-router-dom';
import type { Praise } from '../types';

interface ResultsTableProps {
  praises: Praise[];
}

function parseTagNames(tagNames: string | null | undefined): string[] {
  if (!tagNames) return [];
  return tagNames.split(',').map((t) => t.trim()).filter(Boolean);
}

type PraiseGroup = {
  key: string;
  members: Praise[];
};

function groupPraises(praises: Praise[]): PraiseGroup[] {
  const order: string[] = [];
  const map = new Map<string, Praise[]>();

  for (const praise of praises) {
    const key = praise.group_id || praise.id;
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(praise);
  }

  return order.map((key) => ({ key, members: map.get(key)! }));
}

export function ResultsTable({ praises }: ResultsTableProps) {
  const groups = useMemo(() => groupPraises(praises), [praises]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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
          {groups.map((group) => {
            const primary = group.members[0];
            const isMulti = group.members.length > 1;
            const isOpen = !!expanded[group.key];
            const tags = parseTagNames(primary.tag_names);

            return (
              <Fragment key={group.key}>
                <tr
                  className={isMulti ? 'results-group-row' : undefined}
                  onClick={
                    isMulti
                      ? () => setExpanded((s) => ({ ...s, [group.key]: !s[group.key] }))
                      : undefined
                  }
                >
                  <td className="col-number">{primary.number || '—'}</td>
                  <td className="col-name">
                    {isMulti ? (
                      // Botão de verdade, e não um <tr onClick> com aria-expanded:
                      // a linha não era focável nem respondia a teclado, então o
                      // grupo só abria com mouse. O clique na linha continua
                      // valendo para quem usa mouse; o stopPropagation evita que
                      // o clique no botão alterne duas vezes.
                      <button
                        type="button"
                        className="results-group-name"
                        aria-expanded={isOpen}
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpanded((s) => ({ ...s, [group.key]: !s[group.key] }));
                        }}
                      >
                        {isOpen ? '▾' : '▸'} {primary.name}
                      </button>
                    ) : (
                      <Link to={`/praise/${primary.id}`}>{primary.name}</Link>
                    )}
                  </td>
                  <td className="col-tags">
                    {isMulti ? (
                      '—'
                    ) : tags.length > 0 ? (
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
                  <td className="col-tonality">{primary.tonality || '—'}</td>
                </tr>
                {isMulti && isOpen
                  ? group.members.map((member) => {
                      const memberTags = parseTagNames(member.tag_names);
                      return (
                        <tr key={member.id} className="results-group-child">
                          <td className="col-number" />
                          <td className="col-name" colSpan={3}>
                            <Link to={`/praise/${member.id}`} className="results-group-member-link">
                              {memberTags.length > 0 ? (
                                <span className="col-tags-list">
                                  {memberTags.map((name) => (
                                    <span key={name} className="detail-tag">
                                      {name}
                                    </span>
                                  ))}
                                </span>
                              ) : (
                                <span className="muted">{member.id.slice(0, 8)}…</span>
                              )}
                            </Link>
                          </td>
                        </tr>
                      );
                    })
                  : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
