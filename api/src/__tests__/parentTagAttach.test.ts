import { SignJWT } from 'jose';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { app } from '../index';
import { d1DeSqlite, sqliteComSchema } from './sqliteD1';

/**
 * Ligar um louvor a uma tag raiz é permitido mesmo que ela tenha subtags
 * (spec 2026-09-24 seções da Coletânea, §3.2). A raiz ligada direto quer dizer
 * «sem subtag específica». Sem isso, `Avulsos` deixaria de poder ser marcada
 * depois de ganhar a subtag `Avulsos · GLTM`.
 */
const SEGREDO = '0123456789abcdef0123456789abcdef';
const ORIGEM = 'https://web.example';

async function escrita(method: string, body: object): Promise<RequestInit> {
  const jwt = await new SignJWT({ email: 'admin@test.com', jti: 'j-tag-pai' })
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

/** Coletânea (raiz) ─ Clamor (subtag); Avulsos (raiz) ─ GLTM (subtag). */
function ambiente() {
  const sqlite = sqliteComSchema();
  const tag = (id: string, nome: string, pai: string | null = null) =>
    sqlite.prepare('INSERT INTO tags (id, name, parent_id) VALUES (?, ?, ?)').run(id, nome, pai);
  tag('coletanea', 'Coletânea');
  tag('clamor', 'Clamor', 'coletanea');
  tag('avulsos', 'Avulsos');
  tag('avulsos-gltm', 'GLTM', 'avulsos');
  const env = {
    DB: d1DeSqlite(sqlite),
    ASSETS: { head: vi.fn(async () => null), put: vi.fn(), delete: vi.fn() },
    AUTH_JWT_SECRET: SEGREDO,
    AUTH_ALLOWED_EMAILS: '*',
    WEB_ORIGIN: ORIGEM,
  };
  return { sqlite, env };
}

function louvor(sqlite: DatabaseSync, id: string, tags: string[] = []) {
  sqlite.prepare('INSERT INTO praises (id, name, number) VALUES (?, ?, ?)').run(id, `Louvor ${id}`, '001');
  for (const t of tags) {
    sqlite.prepare('INSERT INTO praise_tags (praise_id, tag_id) VALUES (?, ?)').run(id, t);
  }
}

function tagsDe(sqlite: DatabaseSync, id: string): string[] {
  return (
    sqlite.prepare('SELECT tag_id FROM praise_tags WHERE praise_id = ? ORDER BY tag_id').all(id) as {
      tag_id: string;
    }[]
  ).map((l) => l.tag_id);
}

describe('tag pai — ligação aceita', () => {
  it('POST /api/praises aceita tag raiz que tem subtag', async () => {
    const { sqlite, env } = ambiente();
    const res = await app.request(
      '/api/praises',
      await escrita('POST', { name: 'Novo', tag_ids: ['coletanea', 'avulsos-gltm'] }),
      env as never,
    );
    expect(res.status).toBe(201);
    const { data } = (await res.json()) as { data: { id: string } };
    expect(tagsDe(sqlite, data.id)).toEqual(['avulsos-gltm', 'coletanea']);
  });

  it('POST /api/praises/:id/tags aceita tag raiz que tem subtag', async () => {
    const { sqlite, env } = ambiente();
    louvor(sqlite, 'p1', ['avulsos-gltm']);
    const res = await app.request('/api/praises/p1/tags', await escrita('POST', { tag_id: 'avulsos' }), env as never);
    expect(res.status).toBe(200);
    expect(tagsDe(sqlite, 'p1')).toEqual(['avulsos', 'avulsos-gltm']);
  });

  it('POST /api/praises/:id/tags com raiz e subtag da mesma raiz: as duas ficam', async () => {
    const { sqlite, env } = ambiente();
    louvor(sqlite, 'p1', ['clamor']);
    const res = await app.request('/api/praises/p1/tags', await escrita('POST', { tag_id: 'coletanea' }), env as never);
    expect(res.status).toBe(200);
    expect(tagsDe(sqlite, 'p1')).toEqual(['clamor', 'coletanea']);
  });

  it('merge aceita tag raiz com subtag vinda só do louvor fonte', async () => {
    const { sqlite, env } = ambiente();
    louvor(sqlite, 'keeper', ['clamor']);
    louvor(sqlite, 'fonte', ['avulsos']);
    const res = await app.request(
      '/api/praises/keeper/merge',
      await escrita('POST', {
        source_praise_id: 'fonte',
        metadata: { name: 'Keeper', number: '001', author: null, rhythm: null, tonality: null, category: null, lyrics: null },
        tag_ids: ['clamor', 'avulsos'],
        material_ids_to_import: [],
      }),
      env as never,
    );
    expect(res.status).toBe(200);
    expect(tagsDe(sqlite, 'keeper')).toEqual(['avulsos', 'clamor']);
    expect(sqlite.prepare('SELECT id FROM praises WHERE id = ?').get('fonte')).toBeUndefined();
  });

  it('tag inexistente continua recusada nas três rotas', async () => {
    const { sqlite, env } = ambiente();
    louvor(sqlite, 'p1');
    louvor(sqlite, 'fonte');

    const criar = await app.request('/api/praises', await escrita('POST', { name: 'X', tag_ids: ['nao-existe'] }), env as never);
    expect(criar.status).toBe(400);

    const ligar = await app.request('/api/praises/p1/tags', await escrita('POST', { tag_id: 'nao-existe' }), env as never);
    expect(ligar.status).toBe(404);

    const mesclar = await app.request(
      '/api/praises/p1/merge',
      await escrita('POST', {
        source_praise_id: 'fonte',
        metadata: { name: 'P1', number: '001', author: null, rhythm: null, tonality: null, category: null, lyrics: null },
        tag_ids: ['nao-existe'],
        material_ids_to_import: [],
      }),
      env as never,
    );
    expect(mesclar.status).toBe(400);
    expect(sqlite.prepare('SELECT id FROM praises WHERE id = ?').get('fonte')).toBeTruthy();
  });
});
