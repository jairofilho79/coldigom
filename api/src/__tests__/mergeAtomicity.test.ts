import { describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';

import { app } from '../index';

const TEST_JWT_SECRET = '0123456789abcdef0123456789abcdef';
const TEST_WEB_ORIGIN = 'https://web.example';

async function pedidoDeMerge(body: object): Promise<RequestInit> {
  const jwt = await new SignJWT({ email: 'admin@test.com', jti: 'j-merge' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('sub-admin')
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(new TextEncoder().encode(TEST_JWT_SECRET));
  return {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: TEST_WEB_ORIGIN,
      cookie: `coldigom_access=${encodeURIComponent(jwt)}`,
    },
    body: JSON.stringify(body),
  };
}

const CORPO = {
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
  tag_ids: ['tag-1'],
  material_ids_to_import: ['mat-importado'],
};

/**
 * Banco que responde às leituras de validação e registra o que foi escrito,
 * distinguindo escrita solta (`.run()`) de escrita em lote (`batch`).
 */
function bancoDeMerge(opts: { batchFalha?: boolean } = {}) {
  const solтas: string[] = [];
  const lotes: string[][] = [];
  const preparadas: string[] = [];

  const db = {
    prepare: vi.fn((sql: string) => {
      preparadas.push(sql);
      return {
        bind: vi.fn((...args: unknown[]) => ({
          first: vi.fn(async () => {
            if (sql.includes('FROM praises WHERE id')) return { id: args[0] };
            if (sql.includes('FROM tags WHERE id')) return { id: args[0] };
            if (sql.includes('FROM tags WHERE parent_id')) return null;
            if (sql.includes('FROM praise_materials WHERE id')) {
              return { id: args[0], praise_id: 'source-1' };
            }
            return null;
          }),
          all: vi.fn(async () => {
            // materiais que sobram no source e serão apagados por cascata
            if (sql.includes('r2_key')) {
              return { results: [{ id: 'mat-orfao', r2_key: 'assets/praises/source-1/mat-orfao.pdf' }] };
            }
            return { results: [] };
          }),
          run: vi.fn(async () => {
            solтas.push(sql);
            return {};
          }),
          __sql: sql,
        })),
        run: vi.fn(async () => {
          solтas.push(sql);
          return {};
        }),
        all: vi.fn(async () => ({ results: [] })),
        first: vi.fn(async () => null),
        __sql: sql,
      };
    }),
    batch: vi.fn(async (stmts: { __sql: string }[]) => {
      lotes.push(stmts.map((s) => s.__sql));
      if (opts.batchFalha) throw new Error('D1_ERROR: constraint failed');
      return [];
    }),
  };

  return { db, solтas, lotes, preparadas };
}

function r2Espiao() {
  const apagados: string[] = [];
  return {
    r2: {
      delete: vi.fn(async (key: string) => {
        apagados.push(key);
      }),
      head: vi.fn(async () => null),
      get: vi.fn(async () => null),
      put: vi.fn(async () => ({})),
    },
    apagados,
  };
}

const env = (db: unknown, r2: unknown) => ({
  DB: db,
  ASSETS: r2,
  AUTH_JWT_SECRET: TEST_JWT_SECRET,
  AUTH_ALLOWED_EMAILS: '*',
  WEB_ORIGIN: TEST_WEB_ORIGIN,
});

describe('merge de louvores — atomicidade', () => {
  it('manda as escritas do banco num lote só', async () => {
    // Eram cinco escritas soltas em sequência. Falhar no meio deixava o keeper
    // sem nenhuma tag (o DELETE rodava, os INSERT não) e materiais pela metade.
    const { db, lotes, solтas } = bancoDeMerge();
    const { r2 } = r2Espiao();

    await app.request('/api/praises/keeper-1/merge', await pedidoDeMerge(CORPO), env(db, r2) as never);

    expect(lotes).toHaveLength(1);
    const lote = lotes[0].join(' | ');
    expect(lote).toContain('UPDATE praises');
    expect(lote).toContain('DELETE FROM praise_tags');
    expect(lote).toContain('INSERT OR IGNORE INTO praise_tags');
    expect(lote).toContain('UPDATE praise_materials');
    expect(lote).toContain('DELETE FROM praises');

    // nenhuma das escritas destrutivas pode ter ido solta
    const soltasJuntas = solтas.join(' | ');
    expect(soltasJuntas).not.toContain('DELETE FROM praise_tags');
    expect(soltasJuntas).not.toContain('DELETE FROM praises');
  });

  it('não apaga nada do R2 se o banco falhar', async () => {
    // A ordem era invertida: o R2 era apagado ANTES do banco, então uma falha
    // depois disso destruía o arquivo e deixava a linha apontando para o vazio.
    const { db } = bancoDeMerge({ batchFalha: true });
    const { r2, apagados } = r2Espiao();

    const res = await app.request(
      '/api/praises/keeper-1/merge',
      await pedidoDeMerge(CORPO),
      env(db, r2) as never
    );

    expect(res.status).toBe(500);
    expect(apagados).toHaveLength(0);
  });

  it('apaga do R2 só os arquivos que ficaram órfãos, depois do banco confirmar', async () => {
    const { db } = bancoDeMerge();
    const { r2, apagados } = r2Espiao();

    await app.request('/api/praises/keeper-1/merge', await pedidoDeMerge(CORPO), env(db, r2) as never);

    expect(apagados).toEqual(['storage/assets/praises/source-1/mat-orfao.pdf']);
  });

  it('falha na limpeza do R2 não derruba o merge já commitado', async () => {
    const { db } = bancoDeMerge();
    const { r2 } = r2Espiao();
    r2.delete = vi.fn(async () => {
      throw new Error('R2 indisponível');
    });

    const res = await app.request(
      '/api/praises/keeper-1/merge',
      await pedidoDeMerge(CORPO),
      env(db, r2) as never
    );

    expect(res.status).not.toBe(500);
  });
});
