import { describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';

import { app } from '../index';

const SEGREDO = '0123456789abcdef0123456789abcdef';
const ORIGEM = 'https://web.example';

async function sessao() {
  return new SignJWT({ email: 'admin@test.com', jti: 'j-praise' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('sub-admin')
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(new TextEncoder().encode(SEGREDO));
}

function ambiente() {
  const gravados: { sql: string; args: unknown[] }[] = [];
  const linha = {
    id: 'praise-1', name: 'Louvor', number: '086', author: null, rhythm: null, tonality: null,
    category: null, lyrics: null, group_id: null, updated_at: '2026-09-18 20:00:00',
    is_reviewed: 0, reviewed_at: null, reviewed_by: null, tag_ids: null, tag_names: null,
  };
  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...args: unknown[]) => ({
        first: vi.fn(async () => {
          if (sql.includes('FROM praises p') && sql.includes('WHERE p.id = ?')) return linha;
          if (sql.includes('COUNT(*) as total')) return { total: 1 };
          return null;
        }),
        all: vi.fn(async () => {
          if (sql.includes('FROM praises p') && sql.includes('LIMIT ? OFFSET ?')) return { results: [linha] };
          return { results: [] };
        }),
        run: vi.fn(async () => {
          gravados.push({ sql, args });
          return { meta: { changes: 1 } };
        }),
      })),
      first: vi.fn(async () => null),
      all: vi.fn(async () => ({ results: [] })),
    })),
    batch: vi.fn(async () => []),
  };
  const env = {
    DB: db, ASSETS: { head: vi.fn(async () => null) },
    AUTH_JWT_SECRET: SEGREDO, AUTH_ALLOWED_EMAILS: 'admin@test.com', WEB_ORIGIN: ORIGEM,
  } as never;
  return { env, gravados };
}

describe('praises.is_reviewed', () => {
  it('GET /api/praises devolve is_reviewed, reviewed_at e reviewed_by por praise', async () => {
    const { env } = ambiente();
    const res = await app.request('/api/praises?limit=10', { method: 'GET' }, env);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Record<string, unknown>[] };
    expect(json.data[0]).toMatchObject({ is_reviewed: 0, reviewed_at: null, reviewed_by: null });
  });

  it('GET /api/praises/:id devolve as três colunas', async () => {
    const { env } = ambiente();
    const res = await app.request('/api/praises/praise-1', { method: 'GET' }, env);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Record<string, unknown> };
    expect(json.data).toMatchObject({ is_reviewed: 0, reviewed_at: null, reviewed_by: null });
  });

  it('PATCH is_reviewed=true grava 1, reviewed_at e o e-mail de quem marcou', async () => {
    const { env, gravados } = ambiente();
    const res = await app.request('/api/praises/praise-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', origin: ORIGEM, authorization: `Bearer ${await sessao()}` },
      body: JSON.stringify({ is_reviewed: true }),
    }, env);
    expect(res.status).toBe(200);
    const update = gravados.find((g) => g.sql.includes('UPDATE praises SET'));
    expect(update, 'UPDATE praises não rodou').toBeTruthy();
    expect(update!.sql).toContain('is_reviewed = ?');
    expect(update!.sql).toContain('reviewed_at = ?');
    expect(update!.sql).toContain('reviewed_by = ?');
    const i = update!.sql.split(',').findIndex((s) => s.includes('is_reviewed = ?'));
    expect(update!.args[i]).toBe(1);
    expect(update!.args).toContain('admin@test.com');
    expect(update!.args.some((a) => typeof a === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(a))).toBe(true);
  });

  it('PATCH is_reviewed=false zera os três', async () => {
    const { env, gravados } = ambiente();
    const res = await app.request('/api/praises/praise-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', origin: ORIGEM, authorization: `Bearer ${await sessao()}` },
      body: JSON.stringify({ is_reviewed: false }),
    }, env);
    expect(res.status).toBe(200);
    const update = gravados.find((g) => g.sql.includes('UPDATE praises SET'))!;
    const partes = update.sql.slice(update.sql.indexOf('SET') + 3, update.sql.indexOf('WHERE')).split(',').map((s) => s.trim());
    const args = update.args as unknown[];
    expect(args[partes.indexOf('is_reviewed = ?')]).toBe(0);
    expect(args[partes.indexOf('reviewed_at = ?')]).toBeNull();
    expect(args[partes.indexOf('reviewed_by = ?')]).toBeNull();
  });

  it('PATCH is_reviewed que não é boolean dá 400', async () => {
    const { env, gravados } = ambiente();
    const res = await app.request('/api/praises/praise-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', origin: ORIGEM, authorization: `Bearer ${await sessao()}` },
      body: JSON.stringify({ is_reviewed: 'sim' }),
    }, env);
    expect(res.status).toBe(400);
    expect(gravados.find((g) => g.sql.includes('UPDATE praises'))).toBeUndefined();
  });

  it('PATCH só com is_reviewed não cai em "No fields to update"', async () => {
    const { env } = ambiente();
    const res = await app.request('/api/praises/praise-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', origin: ORIGEM, authorization: `Bearer ${await sessao()}` },
      body: JSON.stringify({ is_reviewed: true }),
    }, env);
    expect(res.status).toBe(200);
  });
});
