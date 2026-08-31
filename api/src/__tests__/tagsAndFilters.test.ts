import { describe, expect, it, vi } from 'vitest';

import { app } from '../index';

const TEST_JWT_SECRET = '0123456789abcdef0123456789abcdef';
const TEST_WEB_ORIGIN = 'https://web.example';

async function sessaoValida() {
  const { SignJWT } = await import('jose');
  return new SignJWT({ email: 'admin@test.com', jti: 'j-tags' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('sub-admin')
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(new TextEncoder().encode(TEST_JWT_SECRET));
}

const envAuth = {
  AUTH_JWT_SECRET: TEST_JWT_SECRET,
  AUTH_ALLOWED_EMAILS: '*',
  WEB_ORIGIN: TEST_WEB_ORIGIN,
};

function dbSimples() {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        run: vi.fn(async () => ({})),
        first: vi.fn(async () => null),
        all: vi.fn(async () => ({ results: [] })),
      })),
      all: vi.fn(async () => ({ results: [] })),
      first: vi.fn(async () => null),
    })),
  };
}

describe('POST /api/tags — nome da tag', () => {
  async function criar(nome: string) {
    const jwt = await sessaoValida();
    return app.request(
      '/api/tags',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: TEST_WEB_ORIGIN,
          cookie: `coldigom_access=${encodeURIComponent(jwt)}`,
        },
        body: JSON.stringify({ name: nome }),
      },
      { ...envAuth, DB: dbSimples(), ASSETS: {} } as never
    );
  }

  it('recusa vírgula no nome', async () => {
    // As tags viajam num GROUP_CONCAT separado por vírgula e o front faz
    // split(','). "Natal, Advento" aparecia como duas tags separadas na tabela.
    const res = await criar('Natal, Advento');
    expect(res.status).toBe(400);
    const corpo = (await res.json()) as { error?: string };
    expect(corpo.error).toMatch(/vírgula/i);
  });

  it('aceita nome comum', async () => {
    const res = await criar('Natal');
    expect(res.status).not.toBe(400);
  });

  it('aceita acentos e espaços', async () => {
    const res = await criar('Ações de Graça');
    expect(res.status).not.toBe(400);
  });
});

describe('GET /api/praises/filters — contagem de tags', () => {
  /**
   * A contagem correta é responsabilidade do SQL. Antes era derivada em JS
   * somando as contagens dos filhos, o que contava duas vezes um louvor com
   * duas subtags do mesmo pai e descartava os louvores ligados direto ao pai.
   */
  function dbComTags(linhas: unknown[]) {
    const sqls: string[] = [];
    return {
      sqls,
      db: {
        prepare: vi.fn((sql: string) => {
          sqls.push(sql);
          return {
            all: vi.fn(async () => ({ results: sql.includes('FROM tags') ? linhas : [] })),
            first: vi.fn(async () => null),
            bind: vi.fn(() => ({ all: vi.fn(async () => ({ results: [] })), first: vi.fn(async () => null) })),
          };
        }),
      },
    };
  }

  it('pede ao banco a contagem de louvores distintos, incluindo as subtags', async () => {
    const { db, sqls } = dbComTags([]);
    await app.request('/api/praises/filters', {}, { DB: db, ASSETS: {} } as never);
    const consultaTags = sqls.find((q) => q.includes('FROM tags'));
    expect(consultaTags).toMatch(/COUNT\(DISTINCT/);
    expect(consultaTags).toMatch(/parent_id/);
  });

  it('devolve a contagem do banco sem recalcular em JS', async () => {
    // Pai com 3 louvores distintos (já contando os das subtags) e um filho com 2.
    // A soma dos filhos daria 2; a lógica antiga sobrescreveria o 3 do pai.
    const { db } = dbComTags([
      { id: 'pai', name: 'Coletânea', parent_id: null, count: 3 },
      { id: 'filho', name: 'A', parent_id: 'pai', count: 2 },
    ]);
    const res = await app.request('/api/praises/filters', {}, { DB: db, ASSETS: {} } as never);
    const corpo = (await res.json()) as { tags: { id: string; count: number }[] };
    expect(corpo.tags.find((t) => t.id === 'pai')?.count).toBe(3);
    expect(corpo.tags.find((t) => t.id === 'filho')?.count).toBe(2);
  });
});
