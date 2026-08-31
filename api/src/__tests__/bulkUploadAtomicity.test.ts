import { describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';

import { app } from '../index';

const SEGREDO = '0123456789abcdef0123456789abcdef';
const ORIGEM = 'https://web.example';

async function sessao() {
  return new SignJWT({ email: 'admin@test.com', jti: 'j-bulk' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('sub-admin')
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(new TextEncoder().encode(SEGREDO));
}

/**
 * Banco que responde às leituras da rota e registra o que foi escrito,
 * distinguindo escrita solta (`.run()`) de escrita em lote (`batch`).
 */
function bancoDeLote(opts: { louvorExiste?: boolean; loteFalha?: boolean } = {}) {
  const louvorExiste = opts.louvorExiste !== false;
  const lotes: string[][] = [];
  const soltas: string[] = [];

  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...args: unknown[]) => ({
        first: vi.fn(async () => {
          if (sql.includes('FROM praises WHERE id')) {
            return louvorExiste ? { id: args[0] } : null;
          }
          if (sql.includes('FROM praises p')) {
            return louvorExiste ? { id: args[0], name: 'Louvor', tag_ids: null } : null;
          }
          return null;
        }),
        all: vi.fn(async () => {
          // catálogo de material_kind: tudo que o lote pedir existe
          if (sql.includes('FROM material_kinds')) {
            return { results: args.map((id) => ({ id })) };
          }
          return { results: [] };
        }),
        run: vi.fn(async () => {
          soltas.push(sql);
          return {};
        }),
        __sql: sql,
      })),
      first: vi.fn(async () => null),
      all: vi.fn(async () => ({ results: [] })),
      run: vi.fn(async () => {
        soltas.push(sql);
        return {};
      }),
      __sql: sql,
    })),
    batch: vi.fn(async (stmts: { __sql: string }[]) => {
      lotes.push(stmts.map((s) => s.__sql));
      if (opts.loteFalha) throw new Error('D1_ERROR: constraint failed');
      return [];
    }),
  };

  return { db, lotes, soltas };
}

function r2Espiao() {
  const escritos: string[] = [];
  const apagados: string[] = [];
  return {
    escritos,
    apagados,
    r2: {
      put: vi.fn(async (key: string) => {
        escritos.push(key);
        return {};
      }),
      delete: vi.fn(async (key: string) => {
        apagados.push(key);
      }),
      head: vi.fn(async () => null),
      get: vi.fn(async () => null),
    },
  };
}

async function enviarLote(
  quantidade: number,
  opts: { louvorExiste?: boolean; loteFalha?: boolean } = {}
) {
  const { db, lotes, soltas } = bancoDeLote(opts);
  const { r2, escritos, apagados } = r2Espiao();
  const jwt = await sessao();

  const itens = Array.from({ length: quantidade }, (_, i) => ({
    key: `f${i}`,
    material_kind: 'kind1',
    type: 'pdf',
  }));
  const form = new FormData();
  form.set('items', JSON.stringify(itens));
  for (const it of itens) form.set(it.key, new File(['x'], `${it.key}.pdf`));

  const res = await app.request(
    '/api/praises/praise-1/materials/bulk-upload',
    {
      method: 'POST',
      headers: { origin: ORIGEM, cookie: `coldigom_access=${encodeURIComponent(jwt)}` },
      body: form,
    },
    {
      DB: db,
      ASSETS: r2,
      AUTH_JWT_SECRET: SEGREDO,
      AUTH_ALLOWED_EMAILS: '*',
      WEB_ORIGIN: ORIGEM,
    } as never
  );

  return { res, lotes, soltas, escritos, apagados };
}

describe('bulk-upload — atomicidade da gravação', () => {
  it('manda os INSERT num lote só', async () => {
    // Eram um `put` e um `INSERT` por arquivo, soltos: cair no arquivo 40 de 60
    // devolvia 500 com 39 materiais já gravados, e o reenvio dava 39 duplicatas.
    const { lotes, soltas } = await enviarLote(3);

    expect(lotes).toHaveLength(1);
    expect(lotes[0].every((sql) => sql.includes('INSERT INTO praise_materials'))).toBe(true);
    expect(lotes[0]).toHaveLength(3);
    expect(soltas.join(' | ')).not.toContain('INSERT INTO praise_materials');
  });

  it('apaga do R2 os objetos que acabou de subir quando o lote do banco falha', async () => {
    // O R2 não participa da transação do D1: se o banco recusa, os objetos
    // ficariam órfãos, ocupando espaço sem nenhuma linha apontando para eles.
    const { res, escritos, apagados } = await enviarLote(3, { loteFalha: true });

    expect(res.status).toBe(500);
    expect(escritos).toHaveLength(3);
    expect(apagados.sort()).toEqual(escritos.sort());
  });

  it('recusa louvor inexistente antes de escrever no R2', async () => {
    // O INSERT falhava por FK só DEPOIS do upload, deixando arquivo órfão.
    const { res, escritos } = await enviarLote(2, { louvorExiste: false });

    expect(res.status).toBe(404);
    expect(escritos).toHaveLength(0);
  });
});
