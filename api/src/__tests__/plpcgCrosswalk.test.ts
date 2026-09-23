import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { app } from '../index';
import { CROSSWALK_MAX_IDS, CROSSWALK_SQL, parseCrosswalkBody } from '../plpcgResolve';
import { d1DeSqlite, sqliteComSchema } from './sqliteD1';

/**
 * POST /api/plpcg/crosswalk (contrato C2 do spec coldigui 2026-09-23 §7.2):
 * o normalizador do app troca, uma vez, cada pdf_id legado pelo material do
 * coldigom. SQLite de verdade: o `json_each` e o JOIN são o que importa aqui.
 */
const PDF_CONHECIDO = 'TG91dm9yZXMgQ29sZXTDom5lYSBDSUFzLzAwMSAtIE1ldSBEZXVzLCBtZXUgcGFpL0NpZnJhIEkucGRm';
const PDF_MOVIDO = 'QXZ1bHNvcy8wMTcucGRm';
const PDF_APAGADO = 'QXZ1bHNvcy8wOTkucGRm';
const WEB_ORIGIN = 'https://coldigom-web.pages.dev,https://*plpcg.com,https://plpcjf.org';

function crosswalk(sqlite: DatabaseSync, pdfId: string, praiseId: string, materialId: string) {
  sqlite
    .prepare(
      `INSERT INTO plpcg_crosswalk (pdf_id, short_id, group_id, praise_id, praise_material_id, evidencia, confianca, decidido_por, run_id)
       VALUES (?, '0453', '001:x', ?, ?, 'teste', 'alta', 'detector', 'run-1')`,
    )
    .run(pdfId, praiseId, materialId);
}

/**
 * p1 com m1 (caso comum); m2 nasceu em `fonte`, que foi fundida em `keeper`:
 * o material está no keeper, o r2_key continua na pasta da fonte e o
 * crosswalk ainda aponta a fonte; m3 foi apagado no app.
 */
function ambiente() {
  const sqlite = sqliteComSchema();
  for (const id of ['p1', 'keeper']) sqlite.prepare('INSERT INTO praises (id, name) VALUES (?, ?)').run(id, id);
  const material = sqlite.prepare(
    'INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key, merged_from_praise_id) VALUES (?, ?, ?, ?, ?, ?)',
  );
  material.run('m1', 'p1', 'k1', 'pdf', 'assets/praises/p1/m1.pdf', null);
  material.run('m2', 'keeper', 'k1', 'pdf', 'assets/praises/fonte/m2.pdf', 'fonte');
  crosswalk(sqlite, PDF_CONHECIDO, 'p1', 'm1');
  crosswalk(sqlite, PDF_MOVIDO, 'fonte', 'm2');
  crosswalk(sqlite, PDF_APAGADO, 'p1', 'm3');
  return { DB: d1DeSqlite(sqlite) };
}

function post(body: unknown, headers: Record<string, string> = {}): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

describe('POST /api/plpcg/crosswalk', () => {
  it('lote misto: só os conhecidos voltam, com praise, material e URL absoluta; no-store', async () => {
    const res = await app.request(
      '/api/plpcg/crosswalk',
      post({ pdfIds: [PDF_CONHECIDO, 'desconhecido', PDF_APAGADO, PDF_CONHECIDO] }),
      ambiente(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({
      items: {
        [PDF_CONHECIDO]: { praiseId: 'p1', materialId: 'm1', url: 'http://localhost/assets/praises/p1/m1.pdf' },
      },
    });
  });

  it('material movido: o praise é o dono atual e a URL é o r2_key real', async () => {
    const res = await app.request('/api/plpcg/crosswalk', post({ pdfIds: [PDF_MOVIDO] }), ambiente());
    expect(await res.json()).toEqual({
      items: {
        [PDF_MOVIDO]: { praiseId: 'keeper', materialId: 'm2', url: 'http://localhost/assets/praises/fonte/m2.pdf' },
      },
    });
  });

  it('aceita 500 de uma vez (um parâmetro só: o D1 recusa mais de 100 por consulta)', async () => {
    const pdfIds = [PDF_CONHECIDO, ...Array.from({ length: CROSSWALK_MAX_IDS - 1 }, (_, i) => `x${i}`)];
    const res = await app.request('/api/plpcg/crosswalk', post({ pdfIds }), ambiente());
    expect(res.status).toBe(200);
    expect(Object.keys(((await res.json()) as { items: object }).items)).toEqual([PDF_CONHECIDO]);
    expect(CROSSWALK_SQL).toMatch(/json_each\(\?\)/);
    expect(CROSSWALK_SQL.match(/\?/g)).toHaveLength(1);
  });

  it('corpo fora do contrato → 400 sem tocar no D1', async () => {
    const db = { prepare: vi.fn() } as unknown as D1Database;
    const ruins: unknown[] = [
      '{não é json',
      {},
      { pdfIds: 'abc' },
      { pdfIds: [] },
      { pdfIds: ['a', 1] },
      { pdfIds: Array.from({ length: CROSSWALK_MAX_IDS + 1 }, (_, i) => `x${i}`) },
    ];
    for (const corpo of ruins) {
      const res = await app.request('/api/plpcg/crosswalk', post(corpo), { DB: db });
      expect(res.status, JSON.stringify(corpo).slice(0, 40)).toBe(400);
      expect(((await res.json()) as { error: string }).error).toMatch(/^pdfIds: /);
    }
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it('CORS igual ao /resolve: v2.plpcg.com lê, e o preflight do POST passa', async () => {
    const env = { ...ambiente(), WEB_ORIGIN };
    const res = await app.request(
      '/api/plpcg/crosswalk',
      post({ pdfIds: [PDF_CONHECIDO] }, { origin: 'https://v2.plpcg.com' }),
      env,
    );
    expect(res.headers.get('access-control-allow-origin')).toBe('https://v2.plpcg.com');

    const preflight = await app.request(
      '/api/plpcg/crosswalk',
      {
        method: 'OPTIONS',
        headers: {
          origin: 'https://v2.plpcg.com',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type',
        },
      },
      env,
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('https://v2.plpcg.com');
    expect(preflight.headers.get('access-control-allow-methods')).toContain('POST');
  });

  it('D1 fora do ar → 500 genérico', async () => {
    const db = {
      prepare: () => ({
        bind: () => ({
          all: async () => {
            throw new Error('D1_ERROR: no such table: plpcg_crosswalk');
          },
        }),
      }),
    } as unknown as D1Database;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await app.request('/api/plpcg/crosswalk', post({ pdfIds: [PDF_CONHECIDO] }), { DB: db });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to resolve crosswalk' });
    spy.mockRestore();
  });
});

describe('parseCrosswalkBody', () => {
  it('tira repetidos e mantém a ordem', () => {
    expect(parseCrosswalkBody({ pdfIds: ['b', 'a', 'b'] })).toEqual({ ok: true, pdfIds: ['b', 'a'] });
  });

  it('null e array na raiz são recusados', () => {
    expect(parseCrosswalkBody(null).ok).toBe(false);
    expect(parseCrosswalkBody([['a']]).ok).toBe(false);
  });
});
