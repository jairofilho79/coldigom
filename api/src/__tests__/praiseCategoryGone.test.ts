import { SignJWT } from 'jose';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { app } from '../index';
import { d1DeSqlite, lerSqlDaApi, sqliteComSchema } from './sqliteD1';

/**
 * praises.category sai do contrato (migração 025). SQLite de verdade com o
 * schema.sql de hoje, já sem a coluna — o cenário pós-migração: qualquer SQL
 * que ainda cite `category` dá `no such column` e a rota responde 500.
 * O contrato é tolerante: `category` no corpo e `?category=` são ignorados,
 * `sort=category` cai no padrão (`number`), e nenhuma resposta traz a chave.
 */
const SEGREDO = '0123456789abcdef0123456789abcdef';
const ORIGEM = 'https://web.example';

async function escrita(method: string, body: object): Promise<RequestInit> {
  const jwt = await new SignJWT({ email: 'admin@test.com', jti: 'j-sem-categoria' })
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

function ambiente(sqlite: DatabaseSync = sqliteComSchema()) {
  const louvor = (id: string, nome: string, numero: string) =>
    sqlite
      .prepare('INSERT INTO praises (id, name, number, author, rhythm, tonality, lyrics) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, nome, numero, 'Autor', 'Marcha', 'Sol Maior', 'letra');
  // Nome em ordem inversa ao número: ordenar por nome e por número dão listas diferentes.
  louvor('p1', 'Zion', '001');
  louvor('p2', 'Maranata', '002');
  louvor('p3', 'Aleluia', '003');
  const env = {
    DB: d1DeSqlite(sqlite),
    ASSETS: { head: vi.fn(async () => null), put: vi.fn(), delete: vi.fn() },
    AUTH_JWT_SECRET: SEGREDO,
    AUTH_ALLOWED_EMAILS: '*',
    WEB_ORIGIN: ORIGEM,
  };
  return { sqlite, env };
}

type Lista = { data: Record<string, unknown>[]; pagination: { total: number } };

const get = (env: object, url: string) => app.request(url, {}, env as never);

function colunas(sqlite: DatabaseSync): string[] {
  return (sqlite.prepare('PRAGMA table_info(praises)').all() as { name: string }[]).map((c) => c.name);
}

describe('praises.category fora das leituras', () => {
  it('o banco do teste já não tem a coluna', () => {
    expect(colunas(ambiente().sqlite)).not.toContain('category');
  });

  it('GET /api/praises: 200 e nenhum item com category', async () => {
    const { env } = ambiente();
    const res = await get(env, '/api/praises');
    expect(res.status).toBe(200);
    const json = (await res.json()) as Lista;
    expect(json.data).toHaveLength(3);
    for (const p of json.data) expect(p).not.toHaveProperty('category');
  });

  it('GET /api/praises/:id: 200 e sem category', async () => {
    const { env } = ambiente();
    const res = await get(env, '/api/praises/p2');
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Record<string, unknown> };
    expect(json.data.id).toBe('p2');
    expect(json.data).not.toHaveProperty('category');
  });

  it('GET /api/plpcg/praises: 200 e nenhum item com category', async () => {
    const { env } = ambiente();
    const res = await get(env, '/api/plpcg/praises');
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Record<string, unknown>[] };
    expect(json.data).toHaveLength(3);
    for (const p of json.data) expect(p).not.toHaveProperty('category');
  });

  it('GET /api/plpcg/praises?category= e sort=category: ignorados', async () => {
    const { env } = ambiente();
    const res = await get(env, '/api/plpcg/praises?category=Clamor&sort=category');
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { id: string }[] };
    expect(json.data.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('GET /api/plpcg/catalog: 200 e nenhum praise com category', async () => {
    const { env } = ambiente();
    const res = await get(env, '/api/plpcg/catalog');
    expect(res.status).toBe(200);
    const json = (await res.json()) as { praises: Record<string, unknown>[] };
    expect(json.praises).toHaveLength(3);
    for (const p of json.praises) expect(p).not.toHaveProperty('category');
  });

  it('GET /api/praises/filters: 200 sem a chave categories', async () => {
    const { env } = ambiente();
    const res = await get(env, '/api/praises/filters');
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json).not.toHaveProperty('categories');
    expect(json.rhythms).toEqual(['Marcha']);
    expect(json.tonalities).toEqual(['Sol Maior']);
  });

  it('GET /api/praises/filters?category=: ignorado', async () => {
    const { env } = ambiente();
    const res = await get(env, '/api/praises/filters?category=Clamor');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { rhythms: string[] }).rhythms).toEqual(['Marcha']);
  });

  it('GET /api/praises?category=Clamor: 200 com o mesmo total que sem o param', async () => {
    const { env } = ambiente();
    const sem = (await (await get(env, '/api/praises')).json()) as Lista;
    const res = await get(env, '/api/praises?category=Clamor');
    expect(res.status).toBe(200);
    expect(((await res.json()) as Lista).pagination.total).toBe(sem.pagination.total);
    expect(sem.pagination.total).toBe(3);
  });

  it('GET /api/praises?sort=category: 200, ordenado por number', async () => {
    const { env } = ambiente();
    const res = await get(env, '/api/praises?sort=category');
    expect(res.status).toBe(200);
    expect(((await res.json()) as Lista).data.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });
});

describe('praises.category fora das escritas', () => {
  it('POST /api/praises com category: cria e ignora o campo', async () => {
    const { sqlite, env } = ambiente();
    const res = await app.request('/api/praises', await escrita('POST', { name: 'X', category: 'Clamor' }), env as never);
    expect(res.status).toBe(201);
    const json = (await res.json()) as { data: Record<string, unknown> };
    expect(json.data.name).toBe('X');
    expect(json.data).not.toHaveProperty('category');
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM praises WHERE name = 'X'").get()).toEqual({ n: 1 });
  });

  it('PATCH /api/praises/:id com só category: não dá 500 — é um corpo sem campos (400)', async () => {
    const { env } = ambiente();
    const res = await app.request('/api/praises/p1', await escrita('PATCH', { category: 'Clamor' }), env as never);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('No fields to update');
  });

  it('PATCH /api/praises/:id com category e name: grava o name e ignora category', async () => {
    const { sqlite, env } = ambiente();
    const res = await app.request('/api/praises/p1', await escrita('PATCH', { name: 'Novo', category: 'Clamor' }), env as never);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Record<string, unknown> };
    expect(json.data).not.toHaveProperty('category');
    expect(sqlite.prepare("SELECT name FROM praises WHERE id = 'p1'").get()).toEqual({ name: 'Novo' });
  });
});

describe('merge ignora metadata.category', () => {
  const META = { name: 'Nome novo', number: '002', author: null, rhythm: null, tonality: null, lyrics: 'Letra nova' };

  async function mesclar(env: object, metadata: Record<string, unknown>) {
    return app.request(
      '/api/praises/p1/merge',
      await escrita('POST', { source_praise_id: 'p2', metadata, tag_ids: [], material_ids_to_import: [] }),
      env as never,
    );
  }

  it('com category string: 200, grava o resto e apaga a fonte', async () => {
    const { sqlite, env } = ambiente();
    const res = await mesclar(env, { ...META, category: 'Clamor' });
    expect(res.status).toBe(200);
    expect(sqlite.prepare("SELECT name, number, lyrics FROM praises WHERE id = 'p1'").get()).toEqual({
      name: 'Nome novo',
      number: '002',
      lyrics: 'Letra nova',
    });
    expect(sqlite.prepare("SELECT id FROM praises WHERE id = 'p2'").get()).toBeUndefined();
  });

  it('com category de tipo errado: ignorada, 200', async () => {
    const { env } = ambiente();
    const res = await mesclar(env, { ...META, category: 7 });
    expect(res.status).toBe(200);
  });

  it('sem category: 200', async () => {
    const { env } = ambiente();
    expect((await mesclar(env, META)).status).toBe(200);
  });

  it('os outros campos continuam obrigatórios', async () => {
    const { sqlite, env } = ambiente();
    const semLetra: Record<string, unknown> = { ...META, category: 'Clamor' };
    delete semLetra.lyrics;
    const res = await mesclar(env, semLetra);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("Field 'metadata.lyrics' is required");
    expect(sqlite.prepare("SELECT id FROM praises WHERE id = 'p2'").get()).toBeTruthy();
  });
});

describe('antes da 025: o mesmo código com a coluna ainda no banco', () => {
  // Deploy da API primeiro, migração depois: nesse intervalo a coluna existe.
  function comColuna() {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec(lerSqlDaApi('src/__tests__/fixtures/schema.pre-025.sql'));
    return ambiente(sqlite);
  }

  it('leituras, filtros, POST e merge seguem 200 e sem category', async () => {
    const { sqlite, env } = comColuna();
    expect(colunas(sqlite)).toContain('category');

    const lista = (await (await get(env, '/api/praises?category=Clamor&sort=category')).json()) as Lista;
    expect(lista.data.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    for (const p of lista.data) expect(p).not.toHaveProperty('category');

    const catalogo = await get(env, '/api/plpcg/catalog');
    expect(catalogo.status).toBe(200);
    for (const p of ((await catalogo.json()) as { praises: object[] }).praises) expect(p).not.toHaveProperty('category');

    const filtros = await get(env, '/api/praises/filters');
    expect(filtros.status).toBe(200);
    expect(await filtros.json()).not.toHaveProperty('categories');

    const criado = await app.request('/api/praises', await escrita('POST', { name: 'X', category: 'Clamor' }), env as never);
    expect(criado.status).toBe(201);
    expect(sqlite.prepare("SELECT category FROM praises WHERE name = 'X'").get()).toEqual({ category: null });

    const merge = await app.request(
      '/api/praises/p1/merge',
      await escrita('POST', {
        source_praise_id: 'p2',
        metadata: { name: 'N', number: '001', author: null, rhythm: null, tonality: null, lyrics: null, category: 'Clamor' },
        tag_ids: [],
        material_ids_to_import: [],
      }),
      env as never,
    );
    expect(merge.status).toBe(200);
    expect(sqlite.prepare("SELECT category FROM praises WHERE id = 'p1'").get()).toEqual({ category: null });
  });
});
