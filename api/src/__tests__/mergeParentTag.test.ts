import { describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';

import { app } from '../index';

const SEGREDO = '0123456789abcdef0123456789abcdef';
const ORIGEM = 'https://web.example';

/** "Coral" ganhou a subtag "Coral · 2026" e virou tag pai. */
const TAGS = [
  { id: 'coral', name: 'Coral', parent_id: null },
  { id: 'coral-2026', name: 'Coral · 2026', parent_id: 'coral' },
  { id: 'avulsos', name: 'Avulsos', parent_id: null },
];

async function sessao() {
  return new SignJWT({ email: 'admin@test.com', jti: 'j-merge-pai' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('sub-admin')
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(new TextEncoder().encode(SEGREDO));
}

function bancoDeMerge(tagsDoKeeper: string[]) {
  const lotes: string[][] = [];

  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...args: unknown[]) => ({
        first: vi.fn(async () => {
          if (sql.includes('FROM praises WHERE id')) return { id: args[0] };
          if (sql.includes('FROM tags WHERE parent_id')) {
            return TAGS.find((t) => t.parent_id === args[0]) ?? null;
          }
          if (sql.includes('FROM tags WHERE id')) {
            return TAGS.find((t) => t.id === args[0]) ?? null;
          }
          if (sql.includes('FROM praises p')) return { id: args[0], name: 'Louvor', tag_ids: null };
          return null;
        }),
        all: vi.fn(async () => {
          if (sql.includes('FROM praise_tags WHERE praise_id')) {
            return { results: tagsDoKeeper.map((tag_id) => ({ tag_id })) };
          }
          return { results: [] };
        }),
        run: vi.fn(async () => ({})),
        __sql: sql,
      })),
    })),
    batch: vi.fn(async (stmts: { __sql: string }[]) => {
      lotes.push(stmts.map((s) => s.__sql));
      return [];
    }),
  };

  return { db, lotes };
}

async function mesclar(tagIds: string[], tagsDoKeeper: string[]) {
  const { db, lotes } = bancoDeMerge(tagsDoKeeper);
  const jwt = await sessao();
  const res = await app.request(
    '/api/praises/keeper-1/merge',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: ORIGEM,
        cookie: `coldigom_access=${encodeURIComponent(jwt)}`,
      },
      body: JSON.stringify({
        source_praise_id: 'source-1',
        metadata: {
          name: 'Grande é o Senhor',
          number: '001',
          author: null,
          rhythm: null,
          tonality: null,
          category: null,
          lyrics: null,
        },
        tag_ids: tagIds,
        material_ids_to_import: [],
      }),
    },
    {
      DB: db,
      ASSETS: { delete: vi.fn(), head: vi.fn(async () => null), put: vi.fn() },
      AUTH_JWT_SECRET: SEGREDO,
      AUTH_ALLOWED_EMAILS: '*',
      WEB_ORIGIN: ORIGEM,
    } as never
  );
  return { res, lotes };
}

describe('merge — tag pai preexistente', () => {
  it('não aborta por causa de tag pai que o keeper já tinha', async () => {
    // O cliente manda a união das tags dos dois louvores, inclusive as que o
    // keeper já tinha. Criar uma subtag transformava uma tag preexistente em
    // motivo de recusa, e toda mesclagem daquele louvor morria no último clique.
    const { res, lotes } = await mesclar(['coral'], ['coral']);

    expect(res.status).toBe(200);
    expect(lotes).toHaveLength(1);
  });

  it('continua recusando tag pai que ainda não estava no keeper', async () => {
    // Vinda só do louvor fonte, é associação NOVA de tag pai: o merge não pode
    // ser a porta dos fundos para espalhar tag pai em louvor que não tinha.
    const { res, lotes } = await mesclar(['coral'], ['avulsos']);

    expect(res.status).toBe(400);
    expect(lotes).toHaveLength(0);
  });

  it('diz qual tag é a culpada', async () => {
    // 'Cannot attach a parent tag' sem nome nenhum não dava para agir.
    const { res } = await mesclar(['avulsos', 'coral'], ['avulsos']);
    const corpo = (await res.json()) as { error?: string };

    expect(corpo.error).toContain('Coral');
  });

  it('deixa passar subtag como sempre', async () => {
    const { res, lotes } = await mesclar(['coral-2026'], []);

    expect(res.status).toBe(200);
    expect(lotes).toHaveLength(1);
  });
});
