import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';

import { app } from '../index';

const SEGREDO = '0123456789abcdef0123456789abcdef';
const ORIGEM = 'https://web.example';
const EXEMPLO = readFileSync(resolve(__dirname, '..', 'gestures', '__fixtures__', 'valido-exemplo.json'), 'utf8');

async function sessao() {
  const jwt = await new SignJWT({ email: 'admin@test.com', jti: 'j-rw' })
    .setProtectedHeader({ alg: 'HS256' }).setSubject('sub-admin').setIssuedAt().setExpirationTime('2h')
    .sign(new TextEncoder().encode(SEGREDO));
  return { origin: ORIGEM, cookie: `coldigom_access=${encodeURIComponent(jwt)}`, 'content-type': 'application/json' };
}

const linha = (id: string, status = 'active') => ({
  id, name: id, description: '', example_triggers: '[]', image_key: null, gif_key: null,
  status, replaced_by: null, created_at: 't', updated_at: 't',
});

function cenario(opts: { alvo?: Record<string, unknown> | null; usos?: { material_id: string; r2_key: string | null }[]; objetos?: Record<string, string> } = {}) {
  const linhas = [linha('deadbeef0004'), opts.alvo === undefined ? linha('ffffffffffff') : opts.alvo].filter(Boolean) as Record<string, unknown>[];
  const usos = opts.usos ?? [];
  const objetos = { ...(opts.objetos ?? {}) };
  const lotes: { sql: string; args: unknown[] }[][] = [];
  const db = {
    prepare: vi.fn((sql: string) => {
      const stmt = (args: unknown[]) => ({
        first: vi.fn(async () => {
          if (sql.includes('FROM gesture_dictionary WHERE id')) return linhas.find((l) => l.id === args[0]) ?? null;
          if (sql.includes('FROM praise_materials WHERE id')) return usos.find((u) => u.material_id === args[0]) ?? null;
          return null;
        }),
        all: vi.fn(async () => (sql.includes('FROM gesture_usage') ? { results: usos.map((u) => ({ material_id: u.material_id, praise_id: 'p', praise_name: 'x', praise_number: '1', count: 1 })) } : { results: [] })),
        run: vi.fn(async () => ({})),
        __sql: sql, __args: args,
      });
      return { bind: vi.fn((...args: unknown[]) => stmt(args)), ...stmt([]) };
    }),
    batch: vi.fn(async (stmts: { __sql: string; __args: unknown[] }[]) => { lotes.push(stmts.map((s) => ({ sql: s.__sql, args: s.__args }))); return []; }),
  };
  const assets = {
    get: vi.fn(async (key: string) => (key in objetos ? { text: async () => objetos[key] } : null)),
    put: vi.fn(async (key: string, body: string) => { objetos[key] = body; return { httpEtag: '"n"' }; }),
    head: vi.fn(async () => null), delete: vi.fn(async () => undefined),
  };
  return { db, assets, lotes, objetos };
}

async function substituir(cen: ReturnType<typeof cenario>, corpo: unknown, id = 'deadbeef0004') {
  const res = await app.request(
    `/api/gestures/dictionary/${id}/replace-with`,
    { method: 'POST', headers: await sessao(), body: JSON.stringify(corpo) },
    { DB: cen.db, ASSETS: cen.assets, AUTH_JWT_SECRET: SEGREDO, AUTH_ALLOWED_EMAILS: '*', WEB_ORIGIN: ORIGEM } as never
  );
  return res;
}

describe('POST /api/gestures/dictionary/:id/replace-with', () => {
  it('deprecia com replacedBy num batch com bump, sem tocar documentos por padrão', async () => {
    const cen = cenario({ usos: [{ material_id: 'm1', r2_key: 'assets/praises/p/m1.gestures' }], objetos: { 'storage/assets/praises/p/m1.gestures': EXEMPLO } });
    const res = await substituir(cen, { targetId: 'ffffffffffff' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, deprecated: 'deadbeef0004', replacedBy: 'ffffffffffff', reescritos: 0, falhas: [] });
    expect(cen.lotes).toHaveLength(1);
    expect(cen.lotes[0][0].sql).toMatch(/SET status = 'deprecated', replaced_by = \?/);
    expect(cen.lotes[0][0].args).toEqual(['ffffffffffff', 'deadbeef0004']);
    expect(cen.lotes[0][cen.lotes[0].length - 1].sql).toMatch(/version = version \+ 1/);
    expect(cen.assets.put).not.toHaveBeenCalled();
  });

  it('com rewriteDocuments reescreve cada documento que usa o gesto e recomputa o uso', async () => {
    const cen = cenario({
      usos: [{ material_id: 'm1', r2_key: 'assets/praises/p/m1.gestures' }, { material_id: 'm2', r2_key: 'assets/praises/p/m2.gestures' }],
      objetos: { 'storage/assets/praises/p/m1.gestures': EXEMPLO, 'storage/assets/praises/p/m2.gestures': EXEMPLO },
    });
    const res = await substituir(cen, { targetId: 'ffffffffffff', rewriteDocuments: true });
    const json = (await res.json()) as { reescritos: number; falhas: unknown[] };
    expect(json.reescritos).toBe(2);
    expect(json.falhas).toEqual([]);
    const gravado = JSON.parse(cen.objetos['storage/assets/praises/p/m1.gestures']);
    expect(JSON.stringify(gravado)).not.toContain('deadbeef0004');
    expect(JSON.stringify(gravado)).toContain('ffffffffffff');
    // um batch para depreciar + um por material (DELETE + INSERTs de uso), sem bump nos últimos
    expect(cen.lotes).toHaveLength(3);
    expect(cen.lotes[1][0].sql).toMatch(/DELETE FROM gesture_usage WHERE material_id = \?/);
    expect(cen.lotes[1].some((s) => s.sql.includes('version = version + 1'))).toBe(false);
  });

  it('uma falha num documento não derruba os outros: vira item em falhas', async () => {
    const cen = cenario({
      usos: [{ material_id: 'm1', r2_key: 'assets/praises/p/m1.gestures' }, { material_id: 'm2', r2_key: 'assets/praises/p/m2.gestures' }],
      objetos: { 'storage/assets/praises/p/m1.gestures': '{ quebrado', 'storage/assets/praises/p/m2.gestures': EXEMPLO },
    });
    const res = await substituir(cen, { targetId: 'ffffffffffff', rewriteDocuments: true });
    const json = (await res.json()) as { reescritos: number; falhas: { materialId: string; motivo: string }[] };
    expect(json.reescritos).toBe(1);
    expect(json.falhas).toEqual([{ materialId: 'm1', motivo: expect.stringMatching(/JSON|inválido/i) }]);
  });

  it('recusa alvo igual, alvo inexistente, alvo depreciado e corpo sem targetId', async () => {
    expect((await substituir(cenario(), { targetId: 'deadbeef0004' })).status).toBe(400);
    expect((await substituir(cenario({ alvo: null }), { targetId: 'ffffffffffff' })).status).toBe(404);
    expect((await substituir(cenario({ alvo: linha('ffffffffffff', 'deprecated') }), { targetId: 'ffffffffffff' })).status).toBe(400);
    expect((await substituir(cenario(), {})).status).toBe(400);
  });

  it('404 quando o gesto de origem não existe', async () => {
    expect((await substituir(cenario(), { targetId: 'ffffffffffff' }, '000000000000')).status).toBe(404);
  });
});
