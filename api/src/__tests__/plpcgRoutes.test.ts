import { describe, expect, it, vi } from 'vitest';
import { app } from '../index';
import { sha256Hex } from '../etag';
import { RESOLVE_SQL, normalizarShortId } from '../plpcgResolve';

const LINHA = {
  pdf_id: 'TG91dm9yZXMgQ29sZXTDom5lYSBDSUFzLzAwMSAtIE1ldSBEZXVzLCBtZXUgcGFpL0NpZnJhIEkucGRm',
  short_id: '0453',
  group_id: '001:meu-deus-meu-pai',
  praise_id: 'p1',
  material_id: 'm1',
  nome: 'Meu Deus, meu pai',
  numero: '001',
  kind: 'Chord Chart I',
  r2_key: 'assets/praises/p1/m1.pdf',
};

const WEB_ORIGIN = 'https://coldigom-web.pages.dev,https://*plpcg.com,https://plpcjf.org';

/**
 * D1 falso das três rotas: `.all()` despacha pelo texto da query (praise_tags
 * antes de plpcg_crosswalk, porque a query de tags cita as duas);
 * `.bind(x).first()` é o resolve — devolve `resolve` e registra o `x` em `binds`.
 */
function fakeDb(opts: { crosswalk?: unknown[]; tags?: unknown[]; resolve?: unknown; falha?: Error } = {}) {
  const binds: unknown[][] = [];
  const results = (sql: string) => {
    if (opts.falha) throw opts.falha;
    if (sql.includes('FROM praise_tags')) return opts.tags ?? [];
    if (sql.includes('FROM plpcg_crosswalk')) return opts.crosswalk ?? [];
    return [];
  };
  const db = {
    prepare: vi.fn((sql: string) => ({
      all: vi.fn(async () => ({ results: results(sql) })),
      bind: vi.fn((...args: unknown[]) => {
        binds.push(args);
        return {
          all: vi.fn(async () => ({ results: results(sql) })),
          first: vi.fn(async () => {
            if (opts.falha) throw opts.falha;
            return opts.resolve ?? null;
          }),
        };
      }),
    })),
  } as unknown as D1Database;
  return { db, binds };
}

describe('GET /api/plpcg/manifest', () => {
  it('array no formato do louvores-manifest.json, com ETag e cache de 5 min', async () => {
    const { db } = fakeDb({ crosswalk: [LINHA], tags: [{ praise_id: 'p1', label: 'Coletânea' }] });
    const res = await app.request('/api/plpcg/manifest', {}, { DB: db });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    expect(res.headers.get('etag')).toMatch(/^"[0-9a-f]{64}"$/);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]).toMatchObject({
      nome: 'Meu Deus, meu pai',
      classificacao: 'Coletânea',
      numero: '001',
      categoria: 'Cifra nível I',
      pdf: 'http://localhost/assets/praises/p1/m1.pdf',
      pdfId: LINHA.pdf_id,
      groupId: '001:meu-deus-meu-pai',
      shortId: '0453',
      praiseId: 'p1',
      materialId: 'm1',
    });
  });

  it('If-None-Match igual ao ETag → 304 sem corpo', async () => {
    const { db } = fakeDb({ crosswalk: [LINHA] });
    const primeiro = await app.request('/api/plpcg/manifest', {}, { DB: db });
    const etag = primeiro.headers.get('etag')!;
    const segundo = await app.request('/api/plpcg/manifest', { headers: { 'If-None-Match': etag } }, { DB: db });
    expect(segundo.status).toBe(304);
    expect(segundo.headers.get('etag')).toBe(etag);
    expect(await segundo.text()).toBe('');
  });

  it('CORS: o plpcjf e o plpcg.com leem, e o ETag é exposto ao JavaScript deles', async () => {
    const { db } = fakeDb({ crosswalk: [LINHA] });
    for (const origin of ['https://plpcjf.org', 'https://v2.plpcg.com']) {
      const res = await app.request('/api/plpcg/manifest', { headers: { origin } }, { DB: db, WEB_ORIGIN });
      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBe(origin);
      expect(res.headers.get('access-control-expose-headers')).toContain('ETag');
    }
  });

  it('D1 fora do ar → 500 com erro genérico', async () => {
    const { db } = fakeDb({ falha: new Error('D1_ERROR: no such table: plpcg_crosswalk') });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await app.request('/api/plpcg/manifest', {}, { DB: db });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to build manifest' });
    spy.mockRestore();
  });
});

describe('GET /api/plpcg/manifest/checksum', () => {
  it('texto com o sha256 do manifest — o mesmo hex do ETag do manifest', async () => {
    const { db } = fakeDb({ crosswalk: [LINHA] });
    const manifest = await app.request('/api/plpcg/manifest', {}, { DB: db });
    const corpo = await manifest.text();
    const res = await app.request('/api/plpcg/manifest/checksum', {}, { DB: db });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    const hex = await res.text();
    expect(hex).toBe(await sha256Hex(corpo));
    expect(res.headers.get('etag')).toBe(`"${hex}"`);
    expect(manifest.headers.get('etag')).toBe(`"${hex}"`);
  });

  it('If-None-Match igual → 204 sem corpo, com ETag (contrato do /api/catalog/checksum do plpcg-catalog)', async () => {
    const { db } = fakeDb({ crosswalk: [LINHA] });
    const primeiro = await app.request('/api/plpcg/manifest/checksum', {}, { DB: db });
    const etag = primeiro.headers.get('etag')!;
    const res = await app.request('/api/plpcg/manifest/checksum', { headers: { 'If-None-Match': etag } }, { DB: db });
    expect(res.status).toBe(204);
    expect(res.headers.get('etag')).toBe(etag);
    expect(await res.text()).toBe('');
  });

  it('D1 fora do ar → 500', async () => {
    const { db } = fakeDb({ falha: new Error('boom') });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await app.request('/api/plpcg/manifest/checksum', {}, { DB: db });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to build manifest' });
    spy.mockRestore();
  });
});

describe('GET /api/plpcg/resolve/:shortId', () => {
  const RESOLVIDO = { pdf_id: LINHA.pdf_id, praise_id: 'p1', material_id: 'm1', r2_key: 'assets/praises/p1/m1.pdf' };

  it('200 com praise, material e a URL absoluta do PDF; consulta em minúsculas', async () => {
    const { db, binds } = fakeDb({ resolve: RESOLVIDO });
    const res = await app.request('/api/plpcg/resolve/04A3', {}, { DB: db });

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    expect(await res.json()).toEqual({
      pdf_id: LINHA.pdf_id,
      praise_id: 'p1',
      material_id: 'm1',
      url: 'http://localhost/assets/praises/p1/m1.pdf',
    });
    expect(binds).toEqual([['04a3']]);
  });

  it('?redirect=1 → 302 para o PDF', async () => {
    const { db } = fakeDb({ resolve: RESOLVIDO });
    const res = await app.request('/api/plpcg/resolve/0453?redirect=1', {}, { DB: db });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('http://localhost/assets/praises/p1/m1.pdf');
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
  });

  it('short_id que não é hex → 400 sem tocar no D1', async () => {
    const { db, binds } = fakeDb({ resolve: RESOLVIDO });
    for (const ruim of ['zz', '04-53', '0123456789abcdef0', '%20']) {
      const res = await app.request(`/api/plpcg/resolve/${ruim}`, {}, { DB: db });
      expect(res.status, ruim).toBe(400);
      expect(await res.json()).toEqual({ error: 'short_id inválido: hex minúsculo, ex. 0453' });
    }
    expect(binds).toEqual([]);
  });

  it('sem linha no crosswalk → 404', async () => {
    const { db } = fakeDb({ resolve: null });
    const res = await app.request('/api/plpcg/resolve/ffff', {}, { DB: db });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'short_id sem material no coldigom' });
    expect(res.headers.get('cache-control')).toBeNull();
  });

  it('CORS para o plpcg.com', async () => {
    const { db } = fakeDb({ resolve: RESOLVIDO });
    const res = await app.request('/api/plpcg/resolve/0453', { headers: { origin: 'https://plpcg.com' } }, { DB: db, WEB_ORIGIN });
    expect(res.headers.get('access-control-allow-origin')).toBe('https://plpcg.com');
  });

  it('D1 fora do ar → 500', async () => {
    const { db } = fakeDb({ falha: new Error('boom') });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await app.request('/api/plpcg/resolve/0453', {}, { DB: db });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to resolve' });
    spy.mockRestore();
  });
});

describe('plpcgResolve — unidades', () => {
  it('normalizarShortId: trim, minúsculas, só hex até 16', () => {
    expect(normalizarShortId(' 04A3 ')).toBe('04a3');
    expect(normalizarShortId('0000')).toBe('0000');
    expect(normalizarShortId('10000')).toBe('10000');
    expect(normalizarShortId('')).toBeNull();
    expect(normalizarShortId('g1')).toBeNull();
    expect(normalizarShortId('0123456789abcdef0')).toBeNull();
    // JOIN interno: material apagado no app = 404, não uma URL para um 404.
    expect(RESOLVE_SQL).toMatch(/JOIN praise_materials pm ON pm\.id = cw\.praise_material_id/);
    expect(RESOLVE_SQL).toMatch(/WHERE cw\.short_id = \?/);
    expect(RESOLVE_SQL).toMatch(/LIMIT 1/);
  });
});
