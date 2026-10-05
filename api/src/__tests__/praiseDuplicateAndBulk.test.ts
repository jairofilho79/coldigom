import { describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';
import { app } from '../index';
import type { Env } from '../env';

const TEST_JWT_SECRET = '0123456789abcdef0123456789abcdef';
const TEST_WEB_ORIGIN = 'https://web.example';

async function autenticado(method: string, body?: object): Promise<RequestInit> {
  const jwt = await new SignJWT({ email: 'admin@test.com', jti: 'j-bulk' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('sub-admin')
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(new TextEncoder().encode(TEST_JWT_SECRET));
  return {
    method,
    headers: {
      'content-type': 'application/json',
      origin: TEST_WEB_ORIGIN,
      cookie: `coldigom_access=${encodeURIComponent(jwt)}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
}

describe('POST /api/praises/:id/duplicate — Duplicar louvor', () => {
  it('duplica metadados, tags, materiais e copia R2', async () => {
    const praiseOrig = {
      id: 'praise-orig',
      name: 'Castelo Forte',
      number: '033',
      author: 'Martinho Lutero',
      rhythm: 'Hino',
      tonality: 'C',
      lyrics: 'Castelo forte é nosso Deus...',
      group_id: 'grp-1',
    };

    const tagsOrig = [{ tag_id: 'tag-1' }, { tag_id: 'tag-2' }];

    const matsOrig = [
      {
        id: 'mat-pdf',
        praise_id: 'praise-orig',
        material_kind: 'kind-pdf',
        type: 'pdf',
        r2_key: 'assets/praises/praise-orig/mat-pdf.pdf',
        file_path_legacy: 'praise-orig/mat-pdf.pdf',
        source_material_id: null,
        url: null,
      },
      {
        id: 'mat-chord',
        praise_id: 'praise-orig',
        material_kind: 'kind-chord',
        type: 'chord',
        r2_key: 'assets/praises/praise-orig/mat-chord.chord',
        file_path_legacy: '',
        source_material_id: 'mat-pdf',
        url: null,
      },
      {
        id: 'mat-yt',
        praise_id: 'praise-orig',
        material_kind: 'kind-yt',
        type: 'youtube',
        r2_key: null,
        file_path_legacy: '',
        source_material_id: null,
        url: 'https://youtube.com/watch?v=123',
      },
    ];

    const r2Puts: { key: string; body: unknown }[] = [];

    const env: Partial<Env> = {
      AUTH_JWT_SECRET: TEST_JWT_SECRET,
      AUTH_ALLOWED_EMAILS: '*',
      WEB_ORIGIN: TEST_WEB_ORIGIN,
      DB: {
        prepare: vi.fn((sql: string) => ({
          bind: vi.fn((...args: unknown[]) => ({
            first: vi.fn(async () => {
              if (sql.includes('FROM praises WHERE id')) {
                const id = String(args[0]);
                if (id === 'praise-orig') return praiseOrig;
                return { id, name: 'Novo Louvor (cópia)' };
              }
              if (sql.includes('FROM praises p')) {
                return { id: args[0], name: 'Novo Louvor (cópia)', tag_ids: 'tag-1,tag-2' };
              }
              return null;
            }),
            all: vi.fn(async () => {
              if (sql.includes('FROM praise_tags WHERE praise_id')) {
                return { results: tagsOrig };
              }
              if (sql.includes('FROM praise_materials WHERE praise_id')) {
                return { results: matsOrig };
              }
              if (sql.includes('FROM gesture_usage')) {
                return { results: [] };
              }
              if (sql.includes('FROM gesture_video_occurrences')) {
                return { results: [] };
              }
              if (sql.includes('FROM praise_materials pm')) {
                return { results: [] };
              }
              return { results: [] };
            }),
            run: vi.fn(async () => ({ meta: { changes: 1 } })),
          })),
        })),
        batch: vi.fn(async (stmts: unknown[]) => {
          return stmts.map(() => ({ meta: { changes: 1 } }));
        }),
      } as unknown as Env['DB'],
      ASSETS: {
        get: vi.fn(async (key: string) => ({
          body: `conteudo-de-${key}`,
          httpMetadata: { contentType: 'application/pdf' },
          customMetadata: {},
        })),
        put: vi.fn(async (key: string, body: unknown) => {
          r2Puts.push({ key, body });
          return null;
        }),
        head: vi.fn(async () => null),
        delete: vi.fn(async () => null),
      } as unknown as Env['ASSETS'],
    };

    const res = await app.request(
      '/api/praises/praise-orig/duplicate',
      await autenticado('POST', { name: 'Castelo Forte (Personalizado)' }),
      env as Env
    );

    expect(res.status).toBe(201);
    expect(env.ASSETS!.put).toHaveBeenCalledTimes(2); // mat-pdf e mat-chord
    expect(env.DB!.batch).toHaveBeenCalled();
  });

  it('404 se o louvor original não existe', async () => {
    const env: Partial<Env> = {
      AUTH_JWT_SECRET: TEST_JWT_SECRET,
      AUTH_ALLOWED_EMAILS: '*',
      WEB_ORIGIN: TEST_WEB_ORIGIN,
      DB: {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            first: vi.fn(async () => null),
          })),
        })),
      } as unknown as Env['DB'],
    };

    const res = await app.request(
      '/api/praises/nao-existe/duplicate',
      await autenticado('POST'),
      env as Env
    );

    expect(res.status).toBe(404);
  });
});

describe('POST /api/praises/:id/materials/bulk-move — Mover materiais em lote', () => {
  it('move múltiplos materiais para o louvor de destino', async () => {
    const env: Partial<Env> = {
      AUTH_JWT_SECRET: TEST_JWT_SECRET,
      AUTH_ALLOWED_EMAILS: '*',
      WEB_ORIGIN: TEST_WEB_ORIGIN,
      DB: {
        prepare: vi.fn((sql: string) => ({
          bind: vi.fn((...args: unknown[]) => ({
            first: vi.fn(async () => {
              if (sql.includes('FROM praises WHERE id')) return { id: args[0] };
              if (sql.includes('FROM praises p')) return { id: args[0], name: 'Destino', tag_ids: null };
              if (sql.includes('FROM praise_materials WHERE id')) {
                return { id: args[0], praise_id: 'praise-1' };
              }
              return null;
            }),
            all: vi.fn(async () => ({ results: [] })),
          })),
        })),
        batch: vi.fn(async () => []),
      } as unknown as Env['DB'],
      ASSETS: { head: vi.fn(async () => null) } as unknown as Env['ASSETS'],
    };

    const res = await app.request(
      '/api/praises/praise-1/materials/bulk-move',
      await autenticado('POST', {
        destination_praise_id: 'praise-2',
        material_ids: ['mat-1', 'mat-2'],
      }),
      env as Env
    );

    expect(res.status).toBe(200);
    expect(env.DB!.batch).toHaveBeenCalledTimes(1);
  });

  it('recusa mover para o mesmo louvor', async () => {
    const env: Partial<Env> = {
      AUTH_JWT_SECRET: TEST_JWT_SECRET,
      AUTH_ALLOWED_EMAILS: '*',
      WEB_ORIGIN: TEST_WEB_ORIGIN,
    };

    const res = await app.request(
      '/api/praises/praise-1/materials/bulk-move',
      await autenticado('POST', {
        destination_praise_id: 'praise-1',
        material_ids: ['mat-1'],
      }),
      env as Env
    );

    expect(res.status).toBe(400);
  });
});

describe('POST /api/praises/:id/materials/bulk-delete — Excluir materiais em lote', () => {
  it('apaga múltiplos materiais do banco e R2', async () => {
    const r2Deletes: string[] = [];

    const env: Partial<Env> = {
      AUTH_JWT_SECRET: TEST_JWT_SECRET,
      AUTH_ALLOWED_EMAILS: '*',
      WEB_ORIGIN: TEST_WEB_ORIGIN,
      DB: {
        prepare: vi.fn((sql: string) => ({
          bind: vi.fn((...args: unknown[]) => ({
            first: vi.fn(async () => {
              if (sql.includes('FROM praises WHERE id')) return { id: args[0] };
              if (sql.includes('FROM praises p')) return { id: args[0], name: 'Praise', tag_ids: null };
              if (sql.includes('FROM praise_materials WHERE id')) {
                return { id: args[0], praise_id: 'praise-1', r2_key: `assets/${args[0]}.pdf` };
              }
              if (sql.includes('COUNT(*) AS n FROM gesture_video_occurrences')) {
                return { n: 0 };
              }
              return null;
            }),
            all: vi.fn(async () => ({ results: [] })),
          })),
        })),
        batch: vi.fn(async () => []),
      } as unknown as Env['DB'],
      ASSETS: {
        head: vi.fn(async () => null),
        delete: vi.fn(async (key: string) => {
          r2Deletes.push(key);
        }),
      } as unknown as Env['ASSETS'],
    };

    const res = await app.request(
      '/api/praises/praise-1/materials/bulk-delete',
      await autenticado('POST', {
        material_ids: ['mat-1', 'mat-2'],
      }),
      env as Env
    );

    expect(res.status).toBe(200);
    expect(env.DB!.batch).toHaveBeenCalledTimes(1);
    expect(r2Deletes).toEqual(['storage/assets/mat-1.pdf', 'storage/assets/mat-2.pdf']);
  });
});
