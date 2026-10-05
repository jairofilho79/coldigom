import { describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';
import { app } from '../index';
import type { Env } from '../env';

const TEST_JWT_SECRET = '0123456789abcdef0123456789abcdef';
const TEST_WEB_ORIGIN = 'https://web.example';

async function autenticado(method: string, body?: object): Promise<RequestInit> {
  const jwt = await new SignJWT({ email: 'admin@test.com', jti: 'j-del' })
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

describe('DELETE /api/praises/:id — Excluir louvor', () => {
  it('exige autenticação', async () => {
    const env: Partial<Env> = {
      AUTH_JWT_SECRET: TEST_JWT_SECRET,
      AUTH_ALLOWED_EMAILS: '*',
      WEB_ORIGIN: TEST_WEB_ORIGIN,
    };
    const res = await app.request(
      '/api/praises/p1',
      {
        method: 'DELETE',
        headers: { origin: TEST_WEB_ORIGIN },
      },
      env as Env
    );
    expect(res.status).toBe(401);
  });

  it('retorna 404 se o louvor não existir', async () => {
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

    const req = await autenticado('DELETE');
    const res = await app.request('/api/praises/p-inexistente', req, env as Env);
    expect(res.status).toBe(404);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('Praise not found');
  });

  it('exclui louvor, materiais, tags, gestos, limpa R2 e atualiza versão do dicionário quando há ocorrências de vídeo', async () => {
    const r2Deletes: string[] = [];
    const batchExecuted: string[] = [];

    const env: Partial<Env> = {
      AUTH_JWT_SECRET: TEST_JWT_SECRET,
      AUTH_ALLOWED_EMAILS: '*',
      WEB_ORIGIN: TEST_WEB_ORIGIN,
      ASSETS: {
        delete: vi.fn(async (key: string) => {
          r2Deletes.push(key);
        }),
      } as unknown as Env['ASSETS'],
      DB: {
        prepare: vi.fn((sql: string) => ({
          bind: vi.fn((...args: unknown[]) => ({
            first: vi.fn(async () => {
              if (sql.includes('FROM praises WHERE id')) {
                return { id: args[0], name: 'Louvor a Apagar' };
              }
              if (sql.includes('FROM gesture_video_occurrences WHERE material_id')) {
                // mat-1 tem ocorrência de vídeo, mat-2 não
                return { n: args[0] === 'mat-1' ? 2 : 0 };
              }
              return null;
            }),
            all: vi.fn(async () => {
              if (sql.includes('FROM praise_materials WHERE praise_id')) {
                return {
                  results: [
                    { id: 'mat-1', r2_key: 'assets/praises/p1/partitura.pdf' },
                    { id: 'mat-2', r2_key: 'assets/praises/p1/audio.mp3' },
                    { id: 'mat-3', r2_key: null }, // material sem R2 (e.g. link youtube)
                  ],
                };
              }
              return { results: [] };
            }),
            run: vi.fn(async () => ({ success: true })),
            sql,
          })),
          sql,
        })),
        batch: vi.fn(async (stmts: Array<{ sql?: string }>) => {
          for (const s of stmts) {
            batchExecuted.push(s.sql || '');
          }
          return [];
        }),
      } as unknown as Env['DB'],
    };

    const req = await autenticado('DELETE');
    const res = await app.request('/api/praises/p1', req, env as Env);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);

    // Verificações do batch no banco
    expect(batchExecuted).toContain('DELETE FROM gesture_usage WHERE material_id = ?');
    expect(batchExecuted).toContain('DELETE FROM gesture_video_occurrences WHERE material_id = ?');
    expect(batchExecuted).toContain('DELETE FROM praise_materials WHERE praise_id = ?');
    expect(batchExecuted).toContain('DELETE FROM praise_tags WHERE praise_id = ?');
    expect(batchExecuted).toContain('DELETE FROM praises WHERE id = ?');
    expect(batchExecuted).toContain('UPDATE gesture_dictionary_meta SET version = version + 1 WHERE id = 1');

    // Verificação de limpeza no R2
    expect(r2Deletes).toEqual([
      'storage/assets/praises/p1/partitura.pdf',
      'storage/assets/praises/p1/audio.mp3',
    ]);
  });

  it('exclui louvor sem materiais sem incrementar versão de gestos', async () => {
    const batchExecuted: string[] = [];

    const env: Partial<Env> = {
      AUTH_JWT_SECRET: TEST_JWT_SECRET,
      AUTH_ALLOWED_EMAILS: '*',
      WEB_ORIGIN: TEST_WEB_ORIGIN,
      ASSETS: {
        delete: vi.fn(),
      } as unknown as Env['ASSETS'],
      DB: {
        prepare: vi.fn((sql: string) => ({
          bind: vi.fn((...args: unknown[]) => ({
            first: vi.fn(async () => {
              if (sql.includes('FROM praises WHERE id')) {
                return { id: args[0], name: 'Louvor Vazio' };
              }
              return null;
            }),
            all: vi.fn(async () => {
              if (sql.includes('FROM praise_materials WHERE praise_id')) {
                return { results: [] };
              }
              return { results: [] };
            }),
            run: vi.fn(async () => ({ success: true })),
            sql,
          })),
          sql,
        })),
        batch: vi.fn(async (stmts: Array<{ sql?: string }>) => {
          for (const s of stmts) {
            batchExecuted.push(s.sql || '');
          }
          return [];
        }),
      } as unknown as Env['DB'],
    };

    const req = await autenticado('DELETE');
    const res = await app.request('/api/praises/p-vazio', req, env as Env);
    expect(res.status).toBe(200);
    expect(batchExecuted).toContain('DELETE FROM praises WHERE id = ?');
    expect(batchExecuted).not.toContain('UPDATE gesture_dictionary_meta SET version = version + 1 WHERE id = 1');
  });
});
