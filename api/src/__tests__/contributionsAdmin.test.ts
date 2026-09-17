import { describe, expect, it, vi } from 'vitest';
import { app } from '../index';

const TEST_JWT_SECRET = '0123456789abcdef0123456789abcdef';
const TEST_WEB_ORIGIN = 'https://web.example';
async function sessaoValida() {
  const { SignJWT } = await import('jose');
  return new SignJWT({ email: 'admin@test.com', jti: 'j-c' }).setProtectedHeader({ alg: 'HS256' }).setSubject('sub-admin').setIssuedAt().setExpirationTime('2h').sign(new TextEncoder().encode(TEST_JWT_SECRET));
}
const envAuth = { AUTH_JWT_SECRET: TEST_JWT_SECRET, AUTH_ALLOWED_EMAILS: '*', WEB_ORIGIN: TEST_WEB_ORIGIN };
type Linha = Record<string, unknown>;

function db(opts: { linhas?: Linha[]; primeira?: Linha | null; arquivos?: Linha[]; total?: number } = {}) {
  const chamadas: { sql: string; bindings: unknown[] }[] = [];
  const stmt = (sql: string) => ({
    all: vi.fn(async () => ({ results: /contribution_files/.test(sql) ? (opts.arquivos ?? []) : (opts.linhas ?? []) })),
    first: vi.fn(async () => {
      if (/COUNT\(\*\)/.test(sql)) return { total: opts.total ?? (opts.linhas?.length ?? 0) };
      if (/contribution_files/.test(sql)) return opts.arquivos?.[0] ?? null;
      return opts.primeira === undefined ? (opts.linhas?.[0] ?? null) : opts.primeira;
    }),
    run: vi.fn(async () => ({ meta: { changes: 1 } })),
  });
  return { chamadas, db: { prepare: vi.fn((sql: string) => ({ bind: vi.fn((...bindings: unknown[]) => { chamadas.push({ sql, bindings }); return stmt(sql); }), ...stmt(sql) })), batch: vi.fn(async () => []) } };
}

function r2(objs: Record<string, Uint8Array> = {}) {
  return { get: vi.fn(async (k: string) => (objs[k] ? { body: new Blob([objs[k]]).stream(), size: objs[k].length } : null)) };
}

async function pedir(url: string, init: RequestInit, d: unknown, assets: unknown = r2(), comSessao = true) {
  const headers: Record<string, string> = { 'content-type': 'application/json', origin: TEST_WEB_ORIGIN };
  if (comSessao) headers.cookie = `coldigom_access=${encodeURIComponent(await sessaoValida())}`;
  return app.request(url, { ...init, headers }, { ...envAuth, DB: d, ASSETS: assets } as never);
}

const ROW = { id: 'c1', user_id: 'u1', user_email: 'a@b.c', user_name: 'Ana', kind: 'wrong_info', subkind: 'metadata', target_source: 'coldigom', target_praise_id: 'p1', target_material_id: null, title: 'Tom errado', body: 'É Em', fields: '{"field":"tonality","current":"Dm","proposed":"Em"}', links: '[]', device: null, app_route: '/', app_version: '1.0', status: 'pendente', scan_status: 'sem_arquivo', scan_report: null, decided_at: null, decided_by: null, decision_note: null, created_at: '2026-09-17 10:00:00', updated_at: '2026-09-17 10:00:00' };
const FILE = { id: 'f1', contribution_id: 'c1', original_name: 'grade.pdf', declared_type: 'pdf', detected_type: 'pdf', size: 12, sha256: 'h', r2_key: 'contributions/c1/f1.pdf', scan_status: 'limpa', scan_detail: null, created_at: '2026-09-17 10:00:00' };

describe('GET /api/admin/contributions', () => {
  it('exige sessão admin', async () => {
    expect((await pedir('/api/admin/contributions', {}, db().db, r2(), false)).status).toBe(401);
  });
  it('filtra por status/kind/praise e devolve fields como objeto', async () => {
    const { db: d, chamadas } = db({ linhas: [ROW], arquivos: [FILE] });
    const res = await pedir('/api/admin/contributions?status=pendente&kind=wrong_info&praise=p1', {}, d);
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as { data: Linha[] };
    expect(corpo.data[0].fields).toEqual({ field: 'tonality', current: 'Dm', proposed: 'Em' });
    expect(corpo.data[0].files).toHaveLength(1);
    const lista = chamadas.find((c) => c.sql.includes('ORDER BY') && !c.sql.includes('contribution_files'))!;
    expect(lista.sql).toContain('status = ?');
    expect(lista.sql).toContain('kind = ?');
    expect(lista.sql).toContain('target_praise_id = ?');
    expect(lista.bindings.slice(0, 3)).toEqual(['pendente', 'wrong_info', 'p1']);
    // N+1: os arquivos das linhas da página saem de UM SELECT com `IN (...)`,
    // nunca de um `listFiles` por linha.
    const arquivosQuery = chamadas.find((c) => c.sql.includes('contribution_files') && c.sql.includes('IN ('))!;
    expect(arquivosQuery.bindings).toEqual(['c1']);
  });
  it('status desconhecido → 400', async () => {
    expect((await pedir('/api/admin/contributions?status=feito', {}, db().db)).status).toBe(400);
  });
});

describe('GET /api/admin/contributions/:id/files/:fileId', () => {
  it('arquivo limpo: stream com Content-Type detectado, nosniff, sandbox, inline', async () => {
    const { db: d } = db({ primeira: ROW, arquivos: [FILE] });
    const res = await pedir('/api/admin/contributions/c1/files/f1', {}, d, r2({ 'contributions/c1/f1.pdf': new TextEncoder().encode('%PDF-1.4 x') }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toBe('sandbox');
    expect(res.headers.get('content-disposition')).toBe(`inline; filename="grade.pdf"; filename*=UTF-8''grade.pdf`);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
  it('arquivo não limpo → 409 file_not_clean', async () => {
    const { db: d } = db({ primeira: ROW, arquivos: [{ ...FILE, scan_status: 'suspeita', r2_key: 'quarantine/c1/f1.pdf' }] });
    const res = await pedir('/api/admin/contributions/c1/files/f1', {}, d);
    expect(res.status).toBe(409);
  });
  it('nome com acento: fallback ASCII em filename= e UTF-8 percent-encoded em filename*', async () => {
    const arquivo = { ...FILE, original_name: 'Louvação nº 12.pdf' };
    const { db: d } = db({ primeira: ROW, arquivos: [arquivo] });
    const res = await pedir('/api/admin/contributions/c1/files/f1', {}, d, r2({ 'contributions/c1/f1.pdf': new TextEncoder().encode('%PDF-1.4 x') }));
    expect(res.status).toBe(200);
    const disposition = res.headers.get('content-disposition');
    expect(disposition).toContain(`filename="Louva__o n_ 12.pdf"`);
    expect(disposition).toContain(`filename*=UTF-8''Louva%C3%A7%C3%A3o%20n%C2%BA%2012.pdf`);
  });
});

describe('PATCH /api/admin/contributions/:id', () => {
  it('grava status, nota, quem e quando', async () => {
    const { db: d, chamadas } = db({ primeira: { ...ROW, status: 'aceita', decision_note: 'ok', decided_by: 'admin@test.com' } });
    const res = await pedir('/api/admin/contributions/c1', { method: 'PATCH', body: JSON.stringify({ status: 'aceita', decision_note: 'ok' }) }, d);
    expect(res.status).toBe(200);
    const up = chamadas.find((c) => c.sql.startsWith('UPDATE contributions'))!;
    expect(up.sql).toContain("decided_at = datetime('now')");
    expect(up.sql).toContain("status IN ('pendente', 'em_analise', 'aceita', 'recusada', 'aplicada')");
    expect(up.bindings).toEqual(['aceita', 'ok', 'admin@test.com', 'c1']);
  });
  it('decision_note omitido não mexe na nota existente', async () => {
    const { db: d, chamadas } = db({ primeira: { ...ROW, status: 'aceita' } });
    const res = await pedir('/api/admin/contributions/c1', { method: 'PATCH', body: JSON.stringify({ status: 'aceita' }) }, d);
    expect(res.status).toBe(200);
    const up = chamadas.find((c) => c.sql.startsWith('UPDATE contributions'))!;
    expect(up.sql).not.toContain('decision_note = ?');
    expect(up.bindings).toEqual(['aceita', 'admin@test.com', 'c1']);
  });
  it('decision_note vazia explícita zera a nota', async () => {
    const { db: d, chamadas } = db({ primeira: { ...ROW, status: 'aceita', decision_note: null } });
    const res = await pedir('/api/admin/contributions/c1', { method: 'PATCH', body: JSON.stringify({ status: 'aceita', decision_note: '' }) }, d);
    expect(res.status).toBe(200);
    const up = chamadas.find((c) => c.sql.startsWith('UPDATE contributions'))!;
    expect(up.sql).toContain('decision_note = ?');
    expect(up.bindings).toEqual(['aceita', null, 'admin@test.com', 'c1']);
  });
  it('status fora da lista ou recebida/bloqueada → 400', async () => {
    expect((await pedir('/api/admin/contributions/c1', { method: 'PATCH', body: JSON.stringify({ status: 'bloqueada' }) }, db().db)).status).toBe(400);
    expect((await pedir('/api/admin/contributions/c1', { method: 'PATCH', body: JSON.stringify({ status: 'x' }) }, db().db)).status).toBe(400);
  });
  it('sem Origin confiável → 403', async () => {
    const headers: Record<string, string> = { 'content-type': 'application/json', origin: 'https://outro.example', cookie: `coldigom_access=${encodeURIComponent(await sessaoValida())}` };
    const res = await app.request('/api/admin/contributions/c1', { method: 'PATCH', headers, body: JSON.stringify({ status: 'aceita' }) }, { ...envAuth, DB: db().db, ASSETS: r2() } as never);
    expect(res.status).toBe(403);
  });
});
