import { describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';

import { app } from '../index';

const SEGREDO = '0123456789abcdef0123456789abcdef';
const ORIGEM = 'https://web.example';

async function cabecalhos() {
  const jwt = await new SignJWT({ email: 'admin@test.com', jti: 'j-gm' })
    .setProtectedHeader({ alg: 'HS256' }).setSubject('sub-admin').setIssuedAt().setExpirationTime('2h')
    .sign(new TextEncoder().encode(SEGREDO));
  return { origin: ORIGEM, cookie: `coldigom_access=${encodeURIComponent(jwt)}`, 'content-type': 'application/json' };
}

/** Banco mínimo para criar, listar e apagar material num louvor só. */
function ambiente(opts: { fonte?: { id: string; praise_id: string } | null } = {}) {
  const escritas: { sql: string; args: unknown[] }[] = [];
  const materiais: Record<string, unknown>[] = [
    { id: 'g1', praise_id: 'praise-1', material_kind: 'k1', type: 'gestures', r2_key: 'assets/praises/praise-1/g1.gestures', file_path_legacy: '', source_material_id: null, url: null },
    { id: 'c1', praise_id: 'praise-1', material_kind: 'k1', type: 'chord', r2_key: 'assets/praises/praise-1/c1.chord', file_path_legacy: '', source_material_id: null, url: null },
  ];
  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...args: unknown[]) => ({
        first: vi.fn(async () => {
          if (/FROM praises\b/i.test(sql) && /SELECT id/i.test(sql)) return { id: args[0] };
          if (/FROM praises p/i.test(sql)) return { id: args[0], name: 'Louvor', tag_ids: null };
          if (/SELECT praise_id, r2_key FROM praise_materials WHERE id/i.test(sql)) {
            return { praise_id: 'praise-1', r2_key: 'assets/praises/praise-1/g1.gestures' };
          }
          if (/FROM praise_materials WHERE id/i.test(sql)) {
            if (opts.fonte === null) return null;
            return opts.fonte ?? { id: args[0], praise_id: 'praise-1' };
          }
          return null;
        }),
        all: vi.fn(async () => {
          if (/FROM material_kinds/i.test(sql)) return { results: [{ id: 'k1' }] };
          if (/FROM praise_materials/i.test(sql)) return { results: materiais };
          return { results: [] };
        }),
        run: vi.fn(async () => { escritas.push({ sql, args }); return { meta: { changes: 1 } }; }),
      })),
    })),
    batch: vi.fn(async () => []),
  };
  const assets = {
    head: vi.fn(async (key: string) => (key.endsWith('g1.gestures') ? { size: 10 } : null)),
    put: vi.fn(), delete: vi.fn(async () => undefined), get: vi.fn(async () => null),
  };
  return { db, assets, escritas, env: { DB: db, ASSETS: assets, AUTH_JWT_SECRET: SEGREDO, AUTH_ALLOWED_EMAILS: '*', WEB_ORIGIN: ORIGEM } as never };
}

describe('POST /api/praises/:id/materials — type gestures', () => {
  it('cria a linha com r2_key padrão e source_material_id, sem objeto no R2', async () => {
    const ctx = ambiente();
    const res = await app.request('/api/praises/praise-1/materials', {
      method: 'POST', headers: await cabecalhos(),
      body: JSON.stringify({ material_kind: 'k1', type: 'gestures', source_material_id: 'pdf-1' }),
    }, ctx.env);
    expect(res.status).toBe(200);
    const insert = ctx.escritas.find((e) => e.sql.includes('INSERT INTO praise_materials'));
    expect(insert).toBeDefined();
    const [id, praiseId, , type, r2Key, , source] = insert!.args as string[];
    expect(type).toBe('gestures');
    expect(r2Key).toBe(`assets/praises/${praiseId}/${id}.gestures`);
    expect(source).toBe('pdf-1');
    expect(ctx.assets.put).not.toHaveBeenCalled();
  });

  it('recusa source_material_id de outro louvor e inexistente', async () => {
    const outro = ambiente({ fonte: { id: 'pdf-x', praise_id: 'praise-2' } });
    const r1 = await app.request('/api/praises/praise-1/materials', {
      method: 'POST', headers: await cabecalhos(),
      body: JSON.stringify({ material_kind: 'k1', type: 'gestures', source_material_id: 'pdf-x' }),
    }, outro.env);
    expect(r1.status).toBe(400);
    expect(outro.escritas.find((e) => e.sql.includes('INSERT'))).toBeUndefined();

    const some = ambiente({ fonte: null });
    const r2 = await app.request('/api/praises/praise-1/materials', {
      method: 'POST', headers: await cabecalhos(),
      body: JSON.stringify({ material_kind: 'k1', type: 'gestures', source_material_id: 'nao-existe' }),
    }, some.env);
    expect(r2.status).toBe(404);
  });

  it('os outros tipos continuam sem r2_key na criação', async () => {
    const ctx = ambiente();
    await app.request('/api/praises/praise-1/materials', {
      method: 'POST', headers: await cabecalhos(),
      body: JSON.stringify({ material_kind: 'k1', type: 'youtube', url: 'https://youtu.be/abc' }),
    }, ctx.env);
    const insert = ctx.escritas.find((e) => e.sql.includes('INSERT INTO praise_materials'));
    expect(insert!.args[4]).toBeNull();
  });
});

describe('GET /api/praises/:id — has_content nos gestos', () => {
  it('materiais gestures trazem has_content como os chord', async () => {
    const ctx = ambiente();
    const res = await app.request('/api/praises/praise-1', {}, ctx.env);
    const { data } = (await res.json()) as { data: { materials: { id: string; has_content?: boolean }[] } };
    expect(data.materials.find((m) => m.id === 'g1')?.has_content).toBe(true);
    expect(data.materials.find((m) => m.id === 'c1')?.has_content).toBe(false);
  });
});

describe('DELETE /api/materials/:materialId — limpa gesture_usage', () => {
  it('apaga o uso antes da linha, explicitamente', async () => {
    const ctx = ambiente();
    const res = await app.request('/api/materials/g1', { method: 'DELETE', headers: await cabecalhos() }, ctx.env);
    expect(res.status).toBe(200);
    const sqls = ctx.escritas.map((e) => e.sql);
    const iUso = sqls.findIndex((s) => /DELETE FROM gesture_usage WHERE material_id = \?/.test(s));
    const iLinha = sqls.findIndex((s) => /DELETE FROM praise_materials WHERE id = \?/.test(s));
    expect(iUso).toBeGreaterThanOrEqual(0);
    expect(iUso).toBeLessThan(iLinha);
  });
});
