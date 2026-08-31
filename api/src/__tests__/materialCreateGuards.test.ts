import { describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';
import { app } from '../index';

const SEGREDO = '0123456789abcdef0123456789abcdef';
const ORIGEM = 'https://web.example';

async function sessao() {
  return new SignJWT({ email: 'admin@test.com', jti: 'j-cria' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('sub-admin')
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(new TextEncoder().encode(SEGREDO));
}

function ambiente({ louvorExiste = true, categoriaNoCatalogo = true } = {}) {
  const gravados: { sql: string; args: unknown[] }[] = [];
  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...args: unknown[]) => ({
        first: vi.fn(async () => {
          if (/FROM praises\b/i.test(sql) && /SELECT id/i.test(sql)) {
            return louvorExiste ? { id: args[0] } : null;
          }
          if (/FROM praises p/i.test(sql)) return { id: args[0], name: 'Louvor', tag_ids: null };
          if (/FROM praise_materials WHERE id/i.test(sql)) {
            return { id: 'mat-1', praise_id: 'praise-1', type: 'pdf', r2_key: null };
          }
          return null;
        }),
        all: vi.fn(async () => ({
          results: /FROM material_kinds/i.test(sql)
            ? categoriaNoCatalogo
              ? [{ id: 'k1' }]
              : []
            : [],
        })),
        run: vi.fn(async () => {
          gravados.push({ sql, args });
          return { meta: { changes: 1 } };
        }),
      })),
    })),
    batch: vi.fn(async () => []),
  };
  return {
    gravados,
    env: {
      DB: db,
      ASSETS: { head: vi.fn(async () => null), put: vi.fn(), delete: vi.fn() },
      AUTH_JWT_SECRET: SEGREDO,
      AUTH_ALLOWED_EMAILS: '*',
      WEB_ORIGIN: ORIGEM,
    },
  };
}

async function pedir(caminho: string, metodo: string, corpo: object, ctx: ReturnType<typeof ambiente>) {
  const jwt = await sessao();
  return app.request(
    caminho,
    {
      method: metodo,
      headers: {
        'content-type': 'application/json',
        origin: ORIGEM,
        cookie: `coldigom_access=${encodeURIComponent(jwt)}`,
      },
      body: JSON.stringify(corpo),
    },
    ctx.env as never
  );
}

describe('POST /api/praises/:id/materials — louvor precisa existir', () => {
  it('louvor inexistente devolve 404 em vez de 500, e nada é gravado', async () => {
    // As rotas irmãs (bulk-upload e drive-import) conferem e devolvem 404. Esta
    // inseria direto: o INSERT falhava por chave estrangeira e virava 500 — "o
    // servidor quebrou", em vez de "esse louvor não existe".
    const ctx = ambiente({ louvorExiste: false });
    const res = await pedir('/api/praises/sumido/materials', 'POST', {
      material_kind: 'k1',
      type: 'pdf',
    }, ctx);

    expect(res.status).toBe(404);
    expect(ctx.gravados.some((g) => /INSERT INTO praise_materials/i.test(g.sql))).toBe(false);
  });

  it('louvor existente segue gravando', async () => {
    const ctx = ambiente();
    const res = await pedir('/api/praises/praise-1/materials', 'POST', {
      material_kind: 'k1',
      type: 'pdf',
    }, ctx);

    expect(res.status).toBeLessThan(400);
    expect(ctx.gravados.some((g) => /INSERT INTO praise_materials/i.test(g.sql))).toBe(true);
  });
});

describe('PATCH /api/materials/:id — categoria é validada como na criação', () => {
  it('recusa categoria fora do catálogo', async () => {
    // As três rotas de criação já validavam; a edição ficou de fora, e um material
    // com categoria inexistente some dos filtros por categoria.
    const ctx = ambiente({ categoriaNoCatalogo: false });
    const res = await pedir('/api/materials/mat-1', 'PATCH', { material_kind: 'inventada' }, ctx);

    expect(res.status).toBe(400);
    expect(ctx.gravados.some((g) => /UPDATE praise_materials/i.test(g.sql))).toBe(false);
  });

  it('aceita categoria que existe', async () => {
    const ctx = ambiente();
    const res = await pedir('/api/materials/mat-1', 'PATCH', { material_kind: 'k1' }, ctx);
    expect(res.status).toBeLessThan(400);
  });
});
