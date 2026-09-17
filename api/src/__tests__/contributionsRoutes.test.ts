import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetAppUserCacheForTests } from '../appUser';
import { app } from '../index';

type Linha = Record<string, unknown>;

function fakeDb(opts: { quota?: { count: number; bytes: number }; linhas?: Linha[]; primeira?: Linha | null; arquivos?: Linha[] } = {}) {
  const chamadas: { sql: string; bindings: unknown[] }[] = [];
  const stmt = (sql: string) => ({
    all: vi.fn(async () => ({ results: /contribution_files/.test(sql) ? (opts.arquivos ?? []) : (opts.linhas ?? []) })),
    first: vi.fn(async () => {
      if (/contribution_quota/i.test(sql)) return opts.quota ?? null;
      return opts.primeira === undefined ? (opts.linhas?.[0] ?? null) : opts.primeira;
    }),
    run: vi.fn(async () => ({ meta: { changes: 1 } })),
  });
  const db = {
    prepare: vi.fn((sql: string) => ({ bind: vi.fn((...bindings: unknown[]) => { chamadas.push({ sql, bindings }); return stmt(sql); }), ...stmt(sql) })),
    batch: vi.fn(async (stmts: unknown[]) => stmts.map(() => ({ meta: { changes: 1 } }))),
  };
  return { db, chamadas };
}

function fakeR2() {
  const objetos = new Map<string, Uint8Array>();
  return {
    objetos,
    // A rota agora sobe o File/Blob direto (sem reconstruir Uint8Array antes) —
    // Response aceita qualquer BodyInit (ArrayBuffer, Uint8Array, ReadableStream,
    // Blob, File), então ler daqui cobre todo mundo sem o fake precisar saber qual é.
    put: vi.fn(async (key: string, body: unknown) => {
      const bytes = new Uint8Array(await new Response(body as BodyInit).arrayBuffer());
      objetos.set(key, bytes);
    }),
    delete: vi.fn(async (key: string) => { objetos.delete(key); }),
    get: vi.fn(async (key: string) => (objetos.has(key) ? { body: new Blob([objetos.get(key)!]).stream(), arrayBuffer: async () => objetos.get(key)!.buffer } : null)),
  };
}

const enviados: unknown[] = [];
const fila = { send: vi.fn(async (m: unknown) => { enviados.push(m); }) };

function env(db: unknown, r2: unknown) {
  return { DB: db, ASSETS: r2, CONTRIB_SCAN: fila, PLPCG_AUTH_URL: 'https://auth.test', AUTH_JWT_SECRET: '0123456789abcdef0123456789abcdef', AUTH_ALLOWED_EMAILS: '*', WEB_ORIGIN: 'https://web.example' } as never;
}

function multipart(payload: unknown, files: { name: string; bytes: Uint8Array }[] = []) {
  const form = new FormData();
  form.append('payload', JSON.stringify(payload));
  for (const f of files) form.append('file', new Blob([f.bytes]), f.name);
  return form;
}

const BASE = { kind: 'improvement', subkind: 'feature', title: 'Modo escuro', body: 'Seria bom.' };
const PDF = new TextEncoder().encode('%PDF-1.4\n%%EOF');

beforeEach(() => {
  resetAppUserCacheForTests();
  enviados.length = 0;
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ userId: 'u1', email: 'a@b.c', name: 'Ana' }), { status: 200 })));
});
afterEach(() => vi.unstubAllGlobals());

describe('POST /api/contributions', () => {
  it('sem Bearer sess_ → 401', async () => {
    const { db } = fakeDb();
    const res = await app.request('/api/contributions', { method: 'POST', body: multipart(BASE) }, env(db, fakeR2()));
    expect(res.status).toBe(401);
  });

  it('sem arquivo nem link: grava pendente/sem_arquivo e não enfileira', async () => {
    const { db, chamadas } = fakeDb();
    const res = await app.request('/api/contributions', { method: 'POST', headers: { authorization: 'Bearer sess_a' }, body: multipart(BASE) }, env(db, fakeR2()));
    expect(res.status).toBe(201);
    const corpo = (await res.json()) as { id: string; status: string };
    expect(corpo.status).toBe('pendente');
    const insert = chamadas.find((c) => c.sql.startsWith('INSERT INTO contributions'))!;
    expect(insert.bindings).toContain('sem_arquivo');
    expect(insert.bindings).toContain('u1');
    expect(enviados).toEqual([]);
    expect(db.batch).toHaveBeenCalledTimes(1);
  });

  it('com pdf válido: grava em quarantine/, recebida/pendente e enfileira submit', async () => {
    const { db, chamadas } = fakeDb();
    const r2 = fakeR2();
    const res = await app.request('/api/contributions', { method: 'POST', headers: { authorization: 'Bearer sess_a' }, body: multipart({ ...BASE, kind: 'content', subkind: 'add_material' }, [{ name: 'grade.pdf', bytes: PDF }]) }, env(db, r2));
    expect(res.status).toBe(201);
    const { id, status } = (await res.json()) as { id: string; status: string };
    expect(status).toBe('recebida');
    const chaves = Array.from(r2.objetos.keys());
    expect(chaves).toHaveLength(1);
    expect(chaves[0]).toMatch(new RegExp(`^quarantine/${id}/[0-9a-f-]+\\.pdf$`));
    const file = chamadas.find((c) => c.sql.startsWith('INSERT INTO contribution_files'))!;
    expect(file.bindings).toContain('grade.pdf');
    expect(file.bindings).toContain(PDF.length);
    expect(enviados).toEqual([{ contributionId: id, phase: 'submit', attempt: 0 }]);
  });

  it('extensão fora da lista → 400 file_type_not_allowed; assinatura errada → 400 file_type_mismatch', async () => {
    const { db } = fakeDb();
    const h = { authorization: 'Bearer sess_a' };
    let res = await app.request('/api/contributions', { method: 'POST', headers: h, body: multipart(BASE, [{ name: 'x.exe', bytes: PDF }]) }, env(db, fakeR2()));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'file_type_not_allowed' });
    res = await app.request('/api/contributions', { method: 'POST', headers: h, body: multipart(BASE, [{ name: 'x.pdf', bytes: new TextEncoder().encode('<html>') }]) }, env(db, fakeR2()));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'file_type_mismatch', file: 'x.pdf' });
  });

  it('bug só aceita imagens', async () => {
    const { db } = fakeDb();
    const bug = { ...BASE, kind: 'bug', subkind: 'reader', device: { platform: 'web', same_device: true } };
    const res = await app.request('/api/contributions', { method: 'POST', headers: { authorization: 'Bearer sess_a' }, body: multipart(bug, [{ name: 'x.pdf', bytes: PDF }]) }, env(db, fakeR2()));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'file_type_not_allowed' });
  });

  it('mais de 5 arquivos → 400; arquivo > 32 MiB → 413', async () => {
    const { db } = fakeDb();
    const h = { authorization: 'Bearer sess_a' };
    const seis = Array.from({ length: 6 }, (_, i) => ({ name: `a${i}.pdf`, bytes: PDF }));
    expect((await app.request('/api/contributions', { method: 'POST', headers: h, body: multipart(BASE, seis) }, env(db, fakeR2()))).status).toBe(400);
    const grande = new Uint8Array(32 * 1024 * 1024 + 1);
    grande.set(PDF, 0);
    const res = await app.request('/api/contributions', { method: 'POST', headers: h, body: multipart(BASE, [{ name: 'g.pdf', bytes: grande }]) }, env(db, fakeR2()));
    expect(res.status).toBe(413);
  });

  it('cota estourada → 429 com resetAt', async () => {
    const { db } = fakeDb({ quota: { count: 20, bytes: 0 } });
    const res = await app.request('/api/contributions', { method: 'POST', headers: { authorization: 'Bearer sess_a' }, body: multipart(BASE) }, env(db, fakeR2()));
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: 'quota_exceeded', resetAt: expect.stringMatching(/T00:00:00/) });
  });

  it('payload inválido → 400 com o erro do schema', async () => {
    const { db } = fakeDb();
    const res = await app.request('/api/contributions', { method: 'POST', headers: { authorization: 'Bearer sess_a' }, body: multipart({ ...BASE, kind: 'nope' }) }, env(db, fakeR2()));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'invalid_kind' });
  });

  it('falha no R2 apaga o que já subiu e responde 500', async () => {
    const { db } = fakeDb();
    const r2 = fakeR2();
    r2.put
      .mockImplementationOnce(async (key: string, body: unknown) => { r2.objetos.set(key, new Uint8Array(await new Response(body as BodyInit).arrayBuffer())); })
      .mockImplementationOnce(async () => { throw new Error('r2 down'); });
    const res = await app.request('/api/contributions', { method: 'POST', headers: { authorization: 'Bearer sess_a' }, body: multipart(BASE, [{ name: 'a.pdf', bytes: PDF }, { name: 'b.pdf', bytes: PDF }]) }, env(db, r2));
    expect(res.status).toBe(500);
    expect(r2.objetos.size).toBe(0);
    expect(db.batch).not.toHaveBeenCalled();
  });

  it('falha no D1 batch apaga o que já subiu e responde 500', async () => {
    const { db } = fakeDb();
    const r2 = fakeR2();
    db.batch.mockImplementationOnce(async () => { throw new Error('d1 down'); });
    const res = await app.request('/api/contributions', { method: 'POST', headers: { authorization: 'Bearer sess_a' }, body: multipart(BASE, [{ name: 'a.pdf', bytes: PDF }]) }, env(db, r2));
    expect(res.status).toBe(500);
    expect(r2.objetos.size).toBe(0);
  });

  it('chordpro com acento perto da borda de 16 bytes é aceito (janela de sniff maior p/ texto)', async () => {
    const { db } = fakeDb();
    const r2 = fakeR2();
    const conteudo = new TextEncoder().encode('{title: Louvação}\n[C]Deus é fiel');
    const res = await app.request('/api/contributions', { method: 'POST', headers: { authorization: 'Bearer sess_a' }, body: multipart(BASE, [{ name: 'cifra.chordpro', bytes: conteudo }]) }, env(db, r2));
    expect(res.status).toBe(201);
  });

  it('content-length acima do teto → 413 request_too_large, sem nem tentar parsear', async () => {
    const { db } = fakeDb();
    const res = await app.request(
      '/api/contributions',
      { method: 'POST', headers: { authorization: 'Bearer sess_a', 'content-length': String(97 * 1024 * 1024) }, body: multipart(BASE) },
      env(db, fakeR2())
    );
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ error: 'request_too_large' });
  });

  it('soma real dos arquivos acima do teto → 413 request_too_large (sem Content-Length mentiroso)', async () => {
    const { db } = fakeDb();
    const tamanho = 25 * 1024 * 1024;
    const arquivoGrande = () => { const b = new Uint8Array(tamanho); b.set(PDF, 0); return b; };
    const arquivos = Array.from({ length: 4 }, (_, i) => ({ name: `f${i}.pdf`, bytes: arquivoGrande() }));
    const res = await app.request('/api/contributions', { method: 'POST', headers: { authorization: 'Bearer sess_a' }, body: multipart(BASE, arquivos) }, env(db, fakeR2()));
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ error: 'request_too_large' });
  });

  it('parte payload maior que 64 KiB → 413 payload_too_large, sem tentar JSON.parse', async () => {
    const { db } = fakeDb();
    const enorme = { ...BASE, body: 'x'.repeat(70 * 1024) };
    const res = await app.request('/api/contributions', { method: 'POST', headers: { authorization: 'Bearer sess_a' }, body: multipart(enorme) }, env(db, fakeR2()));
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ error: 'payload_too_large' });
  });
});

const ROW = { id: 'c1', user_id: 'u1', user_email: 'a@b.c', user_name: 'Ana', kind: 'improvement', subkind: 'feature', target_source: null, target_praise_id: null, target_material_id: null, title: 'T', body: 'B', fields: '{}', links: '[{"url":"https://youtu.be/a","host":"youtu.be","safe_browsing":"clean"}]', device: '{"platform":"web"}', app_route: '/', app_version: '1.0', status: 'pendente', scan_status: 'limpa', scan_report: null, decided_at: null, decided_by: null, decision_note: null, created_at: '2026-09-17 10:00:00', updated_at: '2026-09-17 10:00:00' };

describe('GET /api/contributions/mine e /:id', () => {
  it('mine lista só do usuário, com files e sem campos internos', async () => {
    const { db, chamadas } = fakeDb({ linhas: [ROW] });
    const res = await app.request('/api/contributions/mine', { headers: { authorization: 'Bearer sess_a' } }, env(db, fakeR2()));
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as { data: Linha[]; nextCursor: string | null };
    expect(corpo.data[0]).toMatchObject({ id: 'c1', status: 'pendente', links: ['https://youtu.be/a'] });
    expect(corpo.data[0]).not.toHaveProperty('device');
    expect(corpo.data[0]).not.toHaveProperty('scan_report');
    const lista = chamadas.find((c) => c.sql.includes('FROM contributions') && c.sql.includes('ORDER BY'))!;
    expect(lista.sql).toContain('user_id = ?');
    expect(lista.bindings[0]).toBe('u1');
  });

  it('mine busca os arquivos de todas as linhas da página numa consulta só (sem N+1)', async () => {
    const ROW2 = { ...ROW, id: 'c2' };
    const { db, chamadas } = fakeDb({ linhas: [ROW, ROW2], arquivos: [{ id: 'f1', contribution_id: 'c1', original_name: 'a.pdf', size: 1, scan_status: 'limpa' }] });
    const res = await app.request('/api/contributions/mine', { headers: { authorization: 'Bearer sess_a' } }, env(db, fakeR2()));
    expect(res.status).toBe(200);
    const arquivosQueries = chamadas.filter((c) => c.sql.includes('contribution_files') && c.sql.includes('IN ('));
    expect(arquivosQueries).toHaveLength(1);
    expect(arquivosQueries[0].bindings).toEqual(['c1', 'c2']);
  });

  it(':id de outro usuário → 404', async () => {
    const { db } = fakeDb({ primeira: null });
    const res = await app.request('/api/contributions/c1', { headers: { authorization: 'Bearer sess_a' } }, env(db, fakeR2()));
    expect(res.status).toBe(404);
  });
});
