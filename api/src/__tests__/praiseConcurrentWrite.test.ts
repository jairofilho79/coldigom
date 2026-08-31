import { describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';

import { app } from '../index';

const SEGREDO = '0123456789abcdef0123456789abcdef';
const ORIGEM = 'https://web.example';

const ABERTURA = '2026-08-31 12:00:00';
const DEPOIS_DO_SAVE = '2026-08-31 12:00:05';

async function sessao() {
  return new SignJWT({ email: 'admin@test.com', jti: 'j-conc' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('sub-admin')
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(new TextEncoder().encode(SEGREDO));
}

/**
 * Banco que projeta só as colunas pedidas (para o teste enxergar se o SELECT
 * traz `updated_at`) e conta as linhas atingidas pelo UPDATE, como o D1 faz.
 */
function bancoDeLouvor(opts: { existe?: boolean; updatedAt?: string } = {}) {
  const existe = opts.existe !== false;
  let updatedAt = opts.updatedAt ?? ABERTURA;
  const updates: { sql: string; args: unknown[] }[] = [];
  const lidas: string[] = [];

  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...args: unknown[]) => ({
        first: vi.fn(async () => {
          lidas.push(sql);
          if (!existe) return null;
          if (sql.includes('FROM praises p')) {
            const linha: Record<string, unknown> = { id: args[0], name: 'Louvor', tag_ids: null };
            if (sql.includes('p.updated_at')) linha.updated_at = updatedAt;
            return linha;
          }
          if (sql.includes('FROM praises WHERE id')) return { id: args[0] };
          return null;
        }),
        all: vi.fn(async () => ({ results: [] })),
        run: vi.fn(async () => {
          if (!sql.includes('UPDATE praises SET')) return { meta: { changes: 0 } };
          updates.push({ sql, args });
          const token = sql.includes('AND updated_at = ?') ? args[args.length - 1] : null;
          const atingiu = existe && (token === null || token === updatedAt);
          if (atingiu) updatedAt = DEPOIS_DO_SAVE;
          return { meta: { changes: atingiu ? 1 : 0 } };
        }),
      })),
    })),
    batch: vi.fn(async () => []),
  };

  return { db, updates, lidas };
}

function ambiente(db: unknown) {
  return {
    DB: db,
    ASSETS: { head: vi.fn(async () => null), put: vi.fn(), delete: vi.fn() },
    AUTH_JWT_SECRET: SEGREDO,
    AUTH_ALLOWED_EMAILS: '*',
    WEB_ORIGIN: ORIGEM,
  } as never;
}

async function patch(corpo: object, opts: { existe?: boolean } = {}) {
  const { db, updates, lidas } = bancoDeLouvor(opts);
  const jwt = await sessao();
  const res = await app.request(
    '/api/praises/praise-1',
    {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        origin: ORIGEM,
        cookie: `coldigom_access=${encodeURIComponent(jwt)}`,
      },
      body: JSON.stringify(corpo),
    },
    ambiente(db)
  );
  return { res, updates, lidas };
}

describe('GET /api/praises/:id — token de versão', () => {
  it('devolve o updated_at do louvor', async () => {
    // Sem isto a tela não tem o que devolver no save, e a detecção de escrita
    // concorrente não existe. Mudança aditiva: nada some da resposta.
    const { db } = bancoDeLouvor();
    const res = await app.request('/api/praises/praise-1', {}, ambiente(db));

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { updated_at?: string } };
    expect(json.data.updated_at).toBe(ABERTURA);
  });
});

describe('PATCH /api/praises/:id — escrita concorrente', () => {
  it('grava quando o token confere e devolve o updated_at novo', async () => {
    // Sem o updated_at novo na resposta, o cliente não consegue salvar duas
    // vezes seguidas: o segundo save mandaria um token já vencido.
    const { res } = await patch({ name: 'Novo Nome', if_updated_at: ABERTURA });

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { updated_at?: string } };
    expect(json.data.updated_at).toBe(DEPOIS_DO_SAVE);
  });

  it('recusa com 409 quando outra pessoa gravou antes', async () => {
    const { res } = await patch({ name: 'Novo Nome', if_updated_at: '2026-08-30 09:00:00' });

    expect(res.status).toBe(409);
    const json = (await res.json()) as { error?: string; code?: string };
    expect(json.code).toBe('stale_write');
    expect(json.error).toBe('O louvor foi alterado por outra pessoa. Recarregue a página.');
  });

  it('distingue louvor inexistente de conflito', async () => {
    const { res } = await patch({ name: 'Novo Nome', if_updated_at: ABERTURA }, { existe: false });

    expect(res.status).toBe(404);
  });

  it('confere e grava na mesma instrução', async () => {
    // Um SELECT seguido de UPDATE só mudaria a corrida de lugar.
    const { updates, lidas } = await patch({ name: 'Novo Nome', if_updated_at: ABERTURA });

    expect(updates).toHaveLength(1);
    expect(updates[0].sql).toContain('WHERE id = ? AND updated_at = ?');
    expect(updates[0].args[updates[0].args.length - 1]).toBe(ABERTURA);
    // nada de ler a versão antes de escrever
    expect(lidas.some((sql) => sql.includes('SELECT updated_at'))).toBe(false);
  });

  it('sem o campo, grava como sempre gravou', async () => {
    // O PLPCG também consome esta API e não manda o campo.
    const { res, updates } = await patch({ name: 'Novo Nome' });

    expect(res.status).toBe(200);
    expect(updates[0].sql).not.toContain('AND updated_at = ?');
  });

  it('recusa if_updated_at que não é string', async () => {
    const { res, updates } = await patch({ name: 'Novo Nome', if_updated_at: 42 });

    expect(res.status).toBe(400);
    expect(updates).toHaveLength(0);
  });
});
