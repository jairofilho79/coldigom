import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { app } from '../index';
import { buildPlpcgCatalog } from '../plpcgPraises';
import { TAG_LABEL_SQL } from '../praiseQuery';
import { d1DeSqlite, sqliteComSchema } from './sqliteD1';

/**
 * groupId no dump do catálogo (spec coldigui louvores-agrupados §3.1): sai
 * só quando `praises.group_id` tem valor, no molde do `shortId`, e o ETag
 * muda junto — é isso que faz os aparelhos baixarem o dump de novo.
 */
const linhaBase = {
  id: 'p1',
  short_id: '000',
  group_id: null as string | null,
  name: 'A',
  number: '1',
  author: null,
  rhythm: null,
  tonality: null,
  lyrics: null,
};

function d1Falso(linha: object, sqls: string[] = []) {
  return {
    prepare: (sql: string) => {
      sqls.push(sql);
      return {
        all: async () => ({ results: sql.includes('FROM praises p') ? [linha] : [] }),
        bind: () => ({ all: async () => ({ results: [] }) }),
      };
    },
  } as unknown as D1Database;
}

async function praiseDoDump(linha: object) {
  const resultado = await buildPlpcgCatalog(d1Falso(linha), { tagLabelSql: TAG_LABEL_SQL }, undefined);
  return { praise: JSON.parse(resultado.body).praises[0], etag: resultado.headers.ETag };
}

describe('groupId no dump do catálogo', () => {
  it('manda groupId quando o praise está num grupo', async () => {
    const { praise } = await praiseDoDump({ ...linhaBase, group_id: 'ancora-1' });
    expect(praise.groupId).toBe('ancora-1');
  });

  it('group_id nulo, vazio ou só espaços: a chave some', async () => {
    for (const group_id of [null, '', '   ']) {
      const { praise } = await praiseDoDump({ ...linhaBase, group_id });
      expect(praise, String(group_id)).not.toHaveProperty('groupId');
    }
  });

  it('o ETag muda quando o group_id muda', async () => {
    const sem = await praiseDoDump(linhaBase);
    const com = await praiseDoDump({ ...linhaBase, group_id: 'ancora-1' });
    const outro = await praiseDoDump({ ...linhaBase, group_id: 'ancora-2' });
    expect(com.etag).not.toBe(sem.etag);
    expect(outro.etag).not.toBe(com.etag);
  });

  it('a consulta dos praises lê p.group_id', async () => {
    const sqls: string[] = [];
    await buildPlpcgCatalog(d1Falso(linhaBase, sqls), { tagLabelSql: TAG_LABEL_SQL }, undefined);
    expect(sqls.find((s) => s.includes('FROM praises p'))).toContain('p.group_id');
  });

  it('GET /api/plpcg/catalog com SQLite de verdade: groupId só nos agrupados', async () => {
    const sqlite: DatabaseSync = sqliteComSchema();
    const env = {
      DB: d1DeSqlite(sqlite),
      ASSETS: { head: vi.fn(async () => null), put: vi.fn(), delete: vi.fn() },
      AUTH_JWT_SECRET: '0123456789abcdef0123456789abcdef',
      AUTH_ALLOWED_EMAILS: '*',
      WEB_ORIGIN: 'https://web.example',
    };
    sqlite.prepare('INSERT INTO praises (id, name, number, group_id) VALUES (?, ?, ?, ?)').run('a', 'Clamo a ti', '003', 'a');
    sqlite.prepare('INSERT INTO praises (id, name, number, group_id) VALUES (?, ?, ?, ?)').run('b', 'Clamo a ti', '003', 'a');
    sqlite.prepare('INSERT INTO praises (id, name, number) VALUES (?, ?, ?)').run('c', 'Outro', '004');

    const res = await app.request('/api/plpcg/catalog', {}, env as never);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { praises: { id: string; groupId?: string }[] };
    const porId = Object.fromEntries(json.praises.map((p) => [p.id, p.groupId]));
    expect(porId).toEqual({ a: 'a', b: 'a', c: undefined });
  });
});
