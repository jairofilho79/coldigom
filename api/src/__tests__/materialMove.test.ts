import { describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';

import { app } from '../index';

const SEGREDO = '0123456789abcdef0123456789abcdef';
const ORIGEM = 'https://web.example';

async function sessao() {
  return new SignJWT({ email: 'admin@test.com', jti: 'j-move' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('sub-admin')
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(new TextEncoder().encode(SEGREDO));
}

/** Banco com o material `mat-1` em `praise-1` e os louvores listados existindo. */
function ambiente(louvoresExistentes: string[]) {
  const gravados: { sql: string; args: unknown[] }[] = [];

  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...args: unknown[]) => ({
        first: vi.fn(async () => {
          if (sql.includes('FROM praise_materials WHERE id')) {
            return { id: 'mat-1', praise_id: 'praise-1', type: 'pdf', r2_key: 'assets/x.pdf' };
          }
          if (sql.includes('FROM praises p')) {
            return louvoresExistentes.includes(String(args[0]))
              ? { id: args[0], name: 'Louvor', tag_ids: null }
              : null;
          }
          if (sql.includes('FROM praises WHERE id')) {
            return louvoresExistentes.includes(String(args[0])) ? { id: args[0] } : null;
          }
          return null;
        }),
        all: vi.fn(async () => ({ results: [] })),
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

async function patch(corpo: object, louvoresExistentes = ['praise-1', 'praise-2']) {
  const ctx = ambiente(louvoresExistentes);
  const jwt = await sessao();
  const res = await app.request(
    '/api/materials/mat-1',
    {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        origin: ORIGEM,
        cookie: `coldigom_access=${encodeURIComponent(jwt)}`,
      },
      body: JSON.stringify(corpo),
    },
    ctx.env as never
  );
  return { res, ...ctx };
}

describe('PATCH /api/materials/:id — praise_id move o material para outro louvor', () => {
  it('grava o novo praise_id e devolve o louvor de origem', async () => {
    const { res, gravados } = await patch({ praise_id: 'praise-2' });

    expect(res.status).toBe(200);
    const update = gravados.find((g) => g.sql.startsWith('UPDATE praise_materials'));
    expect(update?.sql).toContain('praise_id = ?');
    expect(update?.args).toEqual(['praise-2', 'mat-1']);
    // A resposta é o louvor de onde o material SAIU: a tela que pediu o
    // movimento continua nele e vê o material sumir.
    expect(await res.json()).toMatchObject({ data: { id: 'praise-1' } });
  });

  it('não mexe em merged_from_praise_id — a origem continua existindo', async () => {
    const { gravados } = await patch({ praise_id: 'praise-2' });

    const update = gravados.find((g) => g.sql.startsWith('UPDATE praise_materials'));
    expect(update?.sql).not.toContain('merged_from_praise_id');
  });

  it('recusa destino que não existe', async () => {
    const { res, gravados } = await patch({ praise_id: 'praise-fantasma' });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Louvor de destino não encontrado' });
    expect(gravados).toHaveLength(0);
  });

  it('recusa mover para o próprio louvor', async () => {
    const { res, gravados } = await patch({ praise_id: 'praise-1' });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'O material já está neste louvor' });
    expect(gravados).toHaveLength(0);
  });

  it('recusa praise_id que não é string ou é vazio', async () => {
    for (const valor of [null, 42, '', '   ']) {
      const { res, gravados } = await patch({ praise_id: valor });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Field 'praise_id' must be a non-empty string" });
      expect(gravados).toHaveLength(0);
    }
  });
});
