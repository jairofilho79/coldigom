import { SignJWT } from 'jose';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { app } from '../index';
import { d1DeSqlite, sqliteComSchema } from './sqliteD1';

/**
 * `metadata.category` deixa de ser obrigatório no merge (spec 2026-09-24 seções
 * da Coletânea, §3.3). Sem a chave: a categoria do keeper fica como está. Com a
 * chave, o comportamento de antes: string grava, `null` apaga.
 */
const SEGREDO = '0123456789abcdef0123456789abcdef';
const ORIGEM = 'https://web.example';

async function escrita(body: object): Promise<RequestInit> {
  const jwt = await new SignJWT({ email: 'admin@test.com', jti: 'j-merge-categoria' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('sub-admin')
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(new TextEncoder().encode(SEGREDO));
  return {
    method: 'POST',
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
  const louvor = (id: string, categoria: string | null) =>
    sqlite
      .prepare('INSERT INTO praises (id, name, number, author, category) VALUES (?, ?, ?, ?, ?)')
      .run(id, `Louvor ${id}`, '001', 'Autor antigo', categoria);
  louvor('keeper', 'Clamor');
  louvor('fonte', 'Avulsos');
  const env = {
    DB: d1DeSqlite(sqlite),
    ASSETS: { head: vi.fn(async () => null), put: vi.fn(), delete: vi.fn() },
    AUTH_JWT_SECRET: SEGREDO,
    AUTH_ALLOWED_EMAILS: '*',
    WEB_ORIGIN: ORIGEM,
  };
  return { sqlite, env };
}

type Linha = { name: string; number: string | null; author: string | null; category: string | null; lyrics: string | null };

function keeper(sqlite: DatabaseSync): Linha {
  return sqlite
    .prepare('SELECT name, number, author, category, lyrics FROM praises WHERE id = ?')
    .get('keeper') as Linha;
}

/** Os seis campos que continuam obrigatórios, sem `category`. */
const SEM_CATEGORIA = {
  name: 'Nome novo',
  number: '002',
  author: null,
  rhythm: null,
  tonality: null,
  lyrics: 'Letra nova',
};

async function mesclar(env: object, metadata: Record<string, unknown>) {
  return app.request(
    '/api/praises/keeper/merge',
    await escrita({ source_praise_id: 'fonte', metadata, tag_ids: [], material_ids_to_import: [] }),
    env as never,
  );
}

describe('merge — metadata.category opcional', () => {
  it('sem a chave: aceita e não mexe na categoria do keeper', async () => {
    const { sqlite, env } = ambiente();
    const res = await mesclar(env, SEM_CATEGORIA);

    expect(res.status).toBe(200);
    expect(keeper(sqlite)).toEqual({
      name: 'Nome novo',
      number: '002',
      author: null,
      category: 'Clamor',
      lyrics: 'Letra nova',
    });
    expect(sqlite.prepare('SELECT id FROM praises WHERE id = ?').get('fonte')).toBeUndefined();
  });

  it('com string: grava a categoria, como antes', async () => {
    const { sqlite, env } = ambiente();
    const res = await mesclar(env, { ...SEM_CATEGORIA, category: 'Louvor' });

    expect(res.status).toBe(200);
    expect(keeper(sqlite).category).toBe('Louvor');
    expect(keeper(sqlite).lyrics).toBe('Letra nova');
  });

  it('com null: apaga a categoria, como antes — null não é «ausente»', async () => {
    const { sqlite, env } = ambiente();
    const res = await mesclar(env, { ...SEM_CATEGORIA, category: null });

    expect(res.status).toBe(200);
    expect(keeper(sqlite).category).toBeNull();
  });

  it('com tipo errado: continua 400 e não escreve nada', async () => {
    const { sqlite, env } = ambiente();
    const res = await mesclar(env, { ...SEM_CATEGORIA, category: 7 });

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("Field 'metadata.category' must be a string");
    expect(keeper(sqlite).category).toBe('Clamor');
    expect(keeper(sqlite).name).toBe('Louvor keeper');
  });

  it('os outros campos continuam obrigatórios', async () => {
    const { sqlite, env } = ambiente();
    const semLetra: Record<string, unknown> = { ...SEM_CATEGORIA };
    delete semLetra.lyrics;
    const res = await mesclar(env, semLetra);

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("Field 'metadata.lyrics' is required");
    expect(sqlite.prepare('SELECT id FROM praises WHERE id = ?').get('fonte')).toBeTruthy();
  });
});
