import { describe, expect, it } from 'vitest';
import { app } from '../index';
import { buildOrderClause, buildWhereClause, TAG_LABEL_SQL, type SortField } from '../praiseQuery';
import { d1DeSqlite, sqliteComSchema } from './sqliteD1';

function acervo() {
  const sqlite = sqliteComSchema();
  sqlite.exec(`
    INSERT INTO tags (id, name) VALUES ('raiz', 'Raiz');
    INSERT INTO tags (id, name, parent_id) VALUES ('filha', 'Filha', 'raiz');
    INSERT INTO tags (id, name) VALUES ('outra', 'Outra');
    INSERT INTO praises (id, name, number, rhythm, lyrics) VALUES
      ('z', 'Louvor igual', '1', 'Valsa', 'Letra comum'),
      ('a', 'Louvor igual', '1', 'Valsa', 'Letra comum'),
      ('m', 'Louvor igual', '1', 'Valsa', 'Letra comum'),
      ('b', 'Louvor diferente', '2', 'Marcha', 'Letra comum'),
      ('c', 'Outro', '15', 'Valsa', 'Louvor na letra'),
      ('d', 'Sem número', NULL, NULL, NULL);
    INSERT INTO praise_tags (praise_id, tag_id) VALUES
      ('z', 'raiz'), ('z', 'filha'), ('a', 'filha'), ('m', 'outra'),
      ('b', 'raiz'), ('c', 'filha');
    INSERT INTO praise_materials (id, praise_id, material_kind, type, url) VALUES
      ('material-a', 'a', 'cifra', 'youtube', 'https://youtu.be/abcdefghijk'),
      ('material-z', 'z', 'cifra', 'pdf', NULL);
  `);
  return { sqlite, env: { DB: d1DeSqlite(sqlite) } };
}

type Lista = {
  data: { id: string; tag_ids: string | null; tag_names: string | null }[];
  pagination: { total: number; totalPages: number };
};

async function listar(env: object, query: string): Promise<Lista> {
  const res = await app.request(`/api/praises?${query}`, {}, env as never);
  expect(res.status).toBe(200);
  return await res.json() as Lista;
}

describe('GET /api/praises — paginação SQLite', () => {
  it('desempata registros iguais por id, antes e depois da seleção da página', async () => {
    const { env } = acervo();
    const paginas = await Promise.all([1, 2, 3].map((page) => listar(env, `limit=1&page=${page}`)));
    expect(paginas.map((pagina) => pagina.data[0].id)).toEqual(['a', 'm', 'z']);
  });

  it('preserva a paginação quando o índice FTS está indisponível', async () => {
    const { sqlite, env } = acervo();
    sqlite.exec('DROP TABLE praises_fts');
    const pagina = await listar(env, 'q=Louvor&limit=2&page=2');
    expect(pagina.data.map((p) => p.id)).toEqual(['m', 'z']);
    expect(pagina.pagination.total).toBe(5);
  });

  it.each([
    { query: '', sort: 'number' as SortField, order: 'ASC' as const },
    { query: 'sort=name&order=desc', sort: 'name' as SortField, order: 'DESC' as const },
    { query: 'q=1', sort: 'number' as SortField, order: 'ASC' as const, search: '1' },
    { query: 'q=Louvor', sort: 'number' as SortField, order: 'ASC' as const, search: 'Louvor' },
    { query: 'q=%25', sort: 'number' as SortField, order: 'ASC' as const, search: '%' },
    { query: 'q=https%3A%2F%2Fyoutu.be%2Fabcdefghijk', sort: 'number' as SortField, order: 'ASC' as const, search: 'https://youtu.be/abcdefghijk' },
    { query: 'rhythm=Valsa', sort: 'number' as SortField, order: 'ASC' as const, rhythm: ['Valsa'] },
    { query: 'tags=raiz', sort: 'number' as SortField, order: 'ASC' as const, tagGroups: [['raiz', 'filha']] },
    { query: 'materialKinds=cifra', sort: 'number' as SortField, order: 'ASC' as const, materialKinds: ['cifra'] },
    { query: 'numberMin=1&numberMax=2', sort: 'number' as SortField, order: 'ASC' as const, numberMin: 1, numberMax: 2 },
  ])('mantém dados e contagem da consulta anterior: $query', async (cenario) => {
    const { sqlite, env } = acervo();
    const where = buildWhereClause({
      search: cenario.search,
      useFts: Boolean(cenario.search),
      rhythm: cenario.rhythm,
      tagGroups: cenario.tagGroups,
      materialKinds: cenario.materialKinds,
      numberMin: cenario.numberMin,
      numberMax: cenario.numberMax,
    });
    const order = buildOrderClause(cenario.sort, cenario.order, cenario.search);
    const original = sqlite.prepare(`
      SELECT p.id, p.name, p.number, p.author, p.rhythm, p.tonality, p.lyrics, p.group_id,
        GROUP_CONCAT(DISTINCT pt.tag_id) as tag_ids,
        GROUP_CONCAT(DISTINCT ${TAG_LABEL_SQL}) as tag_names
      FROM praises p
      LEFT JOIN praise_tags pt ON p.id = pt.praise_id
      LEFT JOIN tags t ON pt.tag_id = t.id
      LEFT JOIN tags tp ON t.parent_id = tp.id
      ${where.clause}
      GROUP BY p.id
      ${order.clause}, p.id ASC
      LIMIT ? OFFSET ?
    `);
    for (let page = 1; page <= 4; page++) {
      const resultado = await listar(env, `${cenario.query}&limit=2&page=${page}`);
      const esperado = original.all(...where.bindings, ...order.bindings, 2, (page - 1) * 2)
        .map((row) => ({ ...row }));
      expect(resultado.data).toEqual(esperado);
      const total = sqlite.prepare(`SELECT COUNT(*) AS total FROM praises p ${where.clause}`)
        .get(...where.bindings)?.total;
      expect(resultado.pagination.total).toBe(total);
      expect(resultado.pagination.totalPages).toBe(Math.ceil(Number(total) / 2));
    }
  });
});
