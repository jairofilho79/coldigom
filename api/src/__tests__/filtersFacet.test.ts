import { describe, expect, it, vi } from 'vitest';

import { app } from '../index';

/** D1 falso que guarda cada SQL preparado, com os bindings. */
function dbEspiao(linhas: Record<string, unknown[]> = {}) {
  const chamadas: { sql: string; bindings: unknown[] }[] = [];
  const resultado = (sql: string) => {
    if (sql.includes('FROM tags')) return linhas.tags ?? [];
    if (sql.includes('rhythm')) return linhas.rhythms ?? [];
    if (sql.includes('tonality')) return linhas.tonalities ?? [];
    if (sql.includes('category')) return linhas.categories ?? [];
    return [];
  };
  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...bindings: unknown[]) => {
        chamadas.push({ sql, bindings });
        return { all: vi.fn(async () => ({ results: resultado(sql) })), first: vi.fn(async () => null) };
      }),
      all: vi.fn(async () => {
        chamadas.push({ sql, bindings: [] });
        return { results: resultado(sql) };
      }),
      first: vi.fn(async () => null),
    })),
  };
  return { db, chamadas };
}

async function pedirFiltros(url: string, linhas?: Record<string, unknown[]>) {
  const { db, chamadas } = dbEspiao(linhas);
  const res = await app.request(url, {}, { DB: db, ASSETS: {} } as never);
  return { res, chamadas };
}

function sqlDe(chamadas: { sql: string }[], coluna: string) {
  return chamadas.find((c) => c.sql.includes(`DISTINCT ${coluna}`))?.sql ?? '';
}

describe('GET /api/praises/filters — opções conscientes do filtro', () => {
  it('sem filtro, continua devolvendo o formato de sempre', async () => {
    const { res } = await pedirFiltros('/api/praises/filters', {
      rhythms: [{ rhythm: 'Valsa' }],
      tonalities: [{ tonality: 'C' }],
      categories: [{ category: 'Louvor' }],
      tags: [{ id: 't1', name: 'Coletânea', parent_id: null, count: 3 }],
    });
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as {
      rhythms: string[];
      tonalities: string[];
      categories: string[];
      tags: { id: string; count: number }[];
    };
    expect(corpo.rhythms).toEqual(['Valsa']);
    expect(corpo.tonalities).toEqual(['C']);
    expect(corpo.categories).toEqual(['Louvor']);
    expect(corpo.tags[0].count).toBe(3);
  });

  it('restringe as opções pelos filtros aplicados', async () => {
    // As opções eram globais: a tela oferecia um ritmo que, combinado com a
    // categoria já escolhida, dava zero resultados.
    const { chamadas } = await pedirFiltros('/api/praises/filters?category=Louvor');
    expect(sqlDe(chamadas, 'rhythm')).toContain('p.category IN');
    expect(sqlDe(chamadas, 'tonality')).toContain('p.category IN');
  });

  it('cada dimensão ignora o próprio filtro ao contar', async () => {
    // Senão escolher "Valsa" apagaria os outros ritmos da lista e não haveria
    // como trocar para "Marcha" sem limpar o filtro antes.
    const { chamadas } = await pedirFiltros('/api/praises/filters?rhythm=Valsa&category=Louvor');
    const sqlRitmo = sqlDe(chamadas, 'rhythm');
    expect(sqlRitmo).not.toContain('p.rhythm IN');
    expect(sqlRitmo).toContain('p.category IN');
    // e a dimensão de categoria ignora a própria, mas respeita o ritmo
    const sqlCategoria = sqlDe(chamadas, 'category');
    expect(sqlCategoria).toContain('p.rhythm IN');
    expect(sqlCategoria).not.toContain('p.category IN');
  });

  it('a contagem das tags respeita os demais filtros', async () => {
    const { chamadas } = await pedirFiltros('/api/praises/filters?category=Louvor');
    const sqlTags = chamadas.find((c) => c.sql.includes('FROM tags'))?.sql ?? '';
    expect(sqlTags).toContain('p.category IN');
  });

  it('recusa parâmetro numérico inválido, como a listagem', async () => {
    const { res } = await pedirFiltros('/api/praises/filters?numberMin=abc');
    expect(res.status).toBe(400);
  });
});
