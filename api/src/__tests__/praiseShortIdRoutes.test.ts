import { SignJWT } from 'jose';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { app } from '../index';
import { buildPlpcgCatalog } from '../plpcgPraises';
import { TAG_LABEL_SQL } from '../praiseQuery';
import { d1DeSqlite, sqliteComSchema } from './sqliteD1';

/**
 * O short_id nas rotas (contrato C1 do spec coldigui 2026-09-23 §7.1): sai no
 * detalhe, na lista do PLPCG e no dump; nenhuma escrita da API o muda.
 * SQLite de verdade: é o gatilho da 023 que atribui.
 */
const SEGREDO = '0123456789abcdef0123456789abcdef';
const ORIGEM = 'https://web.example';

async function escrita(method: string, body: object): Promise<RequestInit> {
  const jwt = await new SignJWT({ email: 'admin@test.com', jti: 'j-short-id' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('sub-admin')
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(new TextEncoder().encode(SEGREDO));
  return {
    method,
    headers: {
      'content-type': 'application/json',
      origin: ORIGEM,
      cookie: `coldigom_access=${encodeURIComponent(jwt)}`,
    },
    body: JSON.stringify(body),
  };
}

function ambiente() {
  const sqlite = sqliteComSchema();
  const env = {
    DB: d1DeSqlite(sqlite),
    ASSETS: { head: vi.fn(async () => null), put: vi.fn(), delete: vi.fn() },
    AUTH_JWT_SECRET: SEGREDO,
    AUTH_ALLOWED_EMAILS: '*',
    WEB_ORIGIN: ORIGEM,
  };
  return { sqlite, env };
}

function louvor(sqlite: DatabaseSync, id: string, nome = `Louvor ${id}`) {
  sqlite.prepare('INSERT INTO praises (id, name, number) VALUES (?, ?, ?)').run(id, nome, '001');
}

function shortIdDe(sqlite: DatabaseSync, id: string): string | null {
  const linha = sqlite.prepare('SELECT short_id FROM praises WHERE id = ?').get(id) as { short_id: string | null } | undefined;
  return linha?.short_id ?? null;
}

type Detalhe = { data: { id: string; short_id: string | null } };

describe('short_id nas leituras', () => {
  it('GET /api/praises/:id traz short_id', async () => {
    const { sqlite, env } = ambiente();
    louvor(sqlite, 'p1');
    louvor(sqlite, 'p2');
    const res = await app.request('/api/praises/p2', {}, env as never);
    expect(res.status).toBe(200);
    expect(((await res.json()) as Detalhe).data.short_id).toBe('001');
  });

  it('GET /api/plpcg/praises traz short_id em cada item', async () => {
    const { sqlite, env } = ambiente();
    louvor(sqlite, 'p1');
    const res = await app.request('/api/plpcg/praises', {}, env as never);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { id: string; short_id: string }[] };
    expect(json.data.map((p) => [p.id, p.short_id])).toEqual([['p1', '000']]);
  });

  it('GET /api/plpcg/catalog traz shortId em cada praise', async () => {
    const { sqlite, env } = ambiente();
    louvor(sqlite, 'p1');
    const res = await app.request('/api/plpcg/catalog', {}, env as never);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { praises: Record<string, unknown>[] };
    expect(json.praises[0]).toMatchObject({ id: 'p1', shortId: '000' });
  });

  it('catálogo: sem short_id a chave some, e o ETag muda quando ele chega', async () => {
    const semShortId = { id: 'p1', short_id: null, name: 'A', number: '1', author: null, rhythm: null, tonality: null, category: null, lyrics: null };
    const fake = (linha: object) =>
      ({
        prepare: (sql: string) => ({
          all: async () => ({ results: sql.includes('FROM praises p') ? [linha] : [] }),
          bind: () => ({ all: async () => ({ results: [] }) }),
        }),
      }) as unknown as D1Database;

    const antes = await buildPlpcgCatalog(fake(semShortId), { tagLabelSql: TAG_LABEL_SQL }, undefined);
    const depois = await buildPlpcgCatalog(fake({ ...semShortId, short_id: '000' }), { tagLabelSql: TAG_LABEL_SQL }, undefined);

    expect(JSON.parse(antes.body).praises[0]).not.toHaveProperty('shortId');
    expect(JSON.parse(depois.body).praises[0].shortId).toBe('000');
    expect(depois.headers.ETag).not.toBe(antes.headers.ETag);
  });
});

describe('short_id nas escritas da API', () => {
  it('POST /api/praises: o banco atribui, e a resposta já traz o id', async () => {
    const { env } = ambiente();
    const r1 = await app.request('/api/praises', await escrita('POST', { name: 'Primeiro' }), env as never);
    const r2 = await app.request('/api/praises', await escrita('POST', { name: 'Segundo', short_id: '0ff' }), env as never);
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(((await r1.json()) as Detalhe).data.short_id).toBe('000');
    expect(((await r2.json()) as Detalhe).data.short_id).toBe('001');
  });

  it('PATCH /api/praises/:id ignora short_id no corpo e não o muda', async () => {
    const { sqlite, env } = ambiente();
    louvor(sqlite, 'p1');
    const res = await app.request('/api/praises/p1', await escrita('PATCH', { name: 'Novo nome', short_id: 'fff' }), env as never);
    expect(res.status).toBe(200);
    expect(((await res.json()) as Detalhe).data.short_id).toBe('000');
    expect(shortIdDe(sqlite, 'p1')).toBe('000');
  });

  it('merge: o keeper fica com o dele, o da fonte é queimado', async () => {
    const { sqlite, env } = ambiente();
    louvor(sqlite, 'keeper');
    louvor(sqlite, 'fonte');
    const res = await app.request(
      '/api/praises/keeper/merge',
      await escrita('POST', {
        source_praise_id: 'fonte',
        metadata: { name: 'Keeper', number: '001', author: null, rhythm: null, tonality: null, category: null, lyrics: null },
        tag_ids: [],
        material_ids_to_import: [],
      }),
      env as never,
    );
    expect(res.status).toBe(200);
    expect(shortIdDe(sqlite, 'keeper')).toBe('000');
    expect(shortIdDe(sqlite, 'fonte')).toBeNull();

    const novo = await app.request('/api/praises', await escrita('POST', { name: 'Depois do merge' }), env as never);
    expect(((await novo.json()) as Detalhe).data.short_id).toBe('002');
  });

  it('mover material entre louvores não mexe no short_id de nenhum dos dois', async () => {
    const { sqlite, env } = ambiente();
    louvor(sqlite, 'origem');
    louvor(sqlite, 'destino');
    sqlite
      .prepare("INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('m1', 'origem', 'k1', 'pdf', 'assets/praises/origem/m1.pdf')")
      .run();
    const res = await app.request('/api/materials/m1', await escrita('PATCH', { praise_id: 'destino' }), env as never);
    expect(res.status).toBe(200);
    expect(sqlite.prepare("SELECT praise_id FROM praise_materials WHERE id = 'm1'").get()).toEqual({ praise_id: 'destino' });
    expect([shortIdDe(sqlite, 'origem'), shortIdDe(sqlite, 'destino')]).toEqual(['000', '001']);
  });
});
