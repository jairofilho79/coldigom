import { describe, expect, it, vi } from 'vitest';

import { app } from '../index';

const TEST_JWT_SECRET = '0123456789abcdef0123456789abcdef';
const TEST_WEB_ORIGIN = 'https://web.example';

async function sessaoValida() {
  const { SignJWT } = await import('jose');
  return new SignJWT({ email: 'admin@test.com', jti: 'j-fila' })
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

type Linha = Record<string, unknown>;

/** D1 falso que guarda cada SQL com os bindings e responde por trecho do SQL. */
function dbFila(opts: { linhas?: Linha[]; total?: number; changes?: number; depois?: Linha | null } = {}) {
  const chamadas: { sql: string; bindings: unknown[] }[] = [];
  const stmt = (sql: string, bindings: unknown[]) => ({
    all: vi.fn(async () => ({ results: opts.linhas ?? [] })),
    first: vi.fn(async () => {
      if (sql.includes('COUNT(*)')) return { total: opts.total ?? (opts.linhas?.length ?? 0) };
      return opts.depois === undefined ? (opts.linhas?.[0] ?? null) : opts.depois;
    }),
    run: vi.fn(async () => ({ meta: { changes: opts.changes ?? 1 } })),
  });
  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...bindings: unknown[]) => {
        chamadas.push({ sql, bindings });
        return stmt(sql, bindings);
      }),
      ...stmt(sql, []),
    })),
    batch: vi.fn(async (stmts: unknown[]) => stmts.map(() => ({ meta: { changes: opts.changes ?? 1 } }))),
  };
  return { db, chamadas };
}

async function pedir(url: string, init: RequestInit, db: unknown, comSessao = true) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    origin: TEST_WEB_ORIGIN,
  };
  if (comSessao) headers.cookie = `coldigom_access=${encodeURIComponent(await sessaoValida())}`;
  return app.request(url, { ...init, headers }, { ...envAuth, DB: db, ASSETS: {} } as never);
}

const FINDING = {
  id: 'f1', run_id: 'r1', detector: 'youtube_merge', target_type: 'praise', target_id: 'p-fonte',
  praise_id: 'p-fonte', action: 'merge_praise', field: 'keeper:p-keeper', current_value: null,
  proposed_value: 'p-keeper', confidence: 'media', evidence: '{"letra":true,"nome":false}',
  status: 'pendente', decided_at: null, decided_by: null, decision_note: null,
  created_at: '2026-09-03 20:00:00', target_name: 'Medo tens', proposed_name: 'Medo tens que o tentador',
};

describe('GET /api/validation/findings', () => {
  it('exige sessão', async () => {
    const { db } = dbFila();
    const res = await pedir('/api/validation/findings', {}, db, false);
    expect(res.status).toBe(401);
  });

  it('lista com paginação e devolve a evidência como objeto', async () => {
    const { db, chamadas } = dbFila({ linhas: [FINDING], total: 1 });
    const res = await pedir('/api/validation/findings?status=pendente&detector=youtube_merge&page=1&limit=50', {}, db);
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as { data: Linha[]; pagination: Linha };
    expect(corpo.pagination).toEqual({ page: 1, limit: 50, total: 1, totalPages: 1 });
    expect(corpo.data[0].evidence).toEqual({ letra: true, nome: false });
    expect(corpo.data[0].target_name).toBe('Medo tens');
    const lista = chamadas.find((c) => c.sql.includes('ORDER BY'))!;
    expect(lista.sql).toContain('vf.status = ?');
    expect(lista.sql).toContain('vf.detector = ?');
    expect(lista.sql).toContain('ORDER BY vf.praise_id, vf.id');
    expect(lista.bindings).toEqual(['youtube_merge', 'pendente', 50, 0]);
  });

  it('recusa faixa e status desconhecidos', async () => {
    const { db } = dbFila();
    expect((await pedir('/api/validation/findings?confidence=altissima', {}, db)).status).toBe(400);
    expect((await pedir('/api/validation/findings?status=feito', {}, db)).status).toBe(400);
  });

  it('evidência com JSON quebrado volta como a string crua, não como 500', async () => {
    const { db } = dbFila({ linhas: [{ ...FINDING, evidence: '{nao é json' }], total: 1 });
    const res = await pedir('/api/validation/findings', {}, db);
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as { data: Linha[] };
    expect(corpo.data[0].evidence).toBe('{nao é json');
  });
});
