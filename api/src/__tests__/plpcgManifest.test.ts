import { describe, expect, it, vi } from 'vitest';
import { etagMatches, sha256Hex } from '../etag';
import {
  MANIFEST_SQL,
  MANIFEST_TAGS_SQL,
  buildPlpcgManifest,
  categoriaPlpcg,
  classificacaoPlpcg,
  pdfUrl,
} from '../plpcgManifest';

/** Linha do JOIN de MANIFEST_SQL, como o D1 devolve. */
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

/** D1 falso: despacha pelo texto da query. praise_tags antes de plpcg_crosswalk — a query de tags cita as duas. */
function fakeDb(opts: { crosswalk?: unknown[]; tags?: unknown[]; falha?: Error } = {}) {
  const results = (sql: string) => {
    if (opts.falha) throw opts.falha;
    if (sql.includes('FROM praise_tags')) return opts.tags ?? [];
    if (sql.includes('FROM plpcg_crosswalk')) return opts.crosswalk ?? [];
    return [];
  };
  return {
    prepare: vi.fn((sql: string) => ({
      all: vi.fn(async () => ({ results: results(sql) })),
      bind: vi.fn(() => ({
        all: vi.fn(async () => ({ results: results(sql) })),
        first: vi.fn(async () => null),
      })),
    })),
  } as unknown as D1Database;
}

describe('etag', () => {
  it('sha256Hex: 64 hex do texto em UTF-8', async () => {
    expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(await sha256Hex('ção')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('etagMatches: forte, fraco, lista e curinga', () => {
    expect(etagMatches('"abc"', '"abc"')).toBe(true);
    expect(etagMatches('W/"abc"', '"abc"')).toBe(true);
    expect(etagMatches('"x", "abc"', '"abc"')).toBe(true);
    expect(etagMatches('*', '"abc"')).toBe(true);
    expect(etagMatches('"abd"', '"abc"')).toBe(false);
    expect(etagMatches(undefined, '"abc"')).toBe(false);
    expect(etagMatches('', '"abc"')).toBe(false);
  });
});

describe('categoriaPlpcg — as cinco categorias do PLPCG a partir do kind do coldigom', () => {
  it.each([
    ['Chord Chart', 'Cifra'],
    ['Chord Chart I', 'Cifra nível I'],
    ['Chord Chart II', 'Cifra nível II'],
    ['CIAs Gestures', 'Gestos em Gravura'],
    ['Choir', 'Partitura'],
    ['Sheet Music', 'Partitura'],
    ['Choir and Piano', 'Partitura'],
    ['Unknown', 'Partitura'],
    [null, 'Partitura'],
  ])('%s → %s', (kind, categoria) => {
    expect(categoriaPlpcg(kind)).toBe(categoria);
  });
});

describe('classificacaoPlpcg e pdfUrl', () => {
  it('classificacao junta os rótulos das tags na ordem recebida; sem tag fica em branco', () => {
    expect(classificacaoPlpcg(['CIAs', 'Coletânea'])).toBe('CIAs, Coletânea');
    expect(classificacaoPlpcg([])).toBe('');
  });

  it('pdfUrl: origem + r2_key; sem r2_key deriva o caminho padrão', () => {
    expect(pdfUrl('https://api.exemplo', 'p1', 'm1', 'assets/praises/p1/m1.pdf')).toBe(
      'https://api.exemplo/assets/praises/p1/m1.pdf',
    );
    expect(pdfUrl('https://api.exemplo', 'p1', 'm1', null)).toBe('https://api.exemplo/assets/praises/p1/m1.pdf');
    expect(pdfUrl('https://api.exemplo/', 'p1', 'm1', '/assets/praises/p1/m1.pdf')).toBe(
      'https://api.exemplo/assets/praises/p1/m1.pdf',
    );
  });
});

describe('buildPlpcgManifest', () => {
  it('uma entrada por linha do crosswalk, no formato do louvores-manifest.json', async () => {
    const r = await buildPlpcgManifest(
      fakeDb({
        crosswalk: [LINHA],
        tags: [
          { praise_id: 'p1', label: 'CIAs' },
          { praise_id: 'p1', label: 'Coletânea' },
          { praise_id: 'outro', label: 'PES' },
        ],
      }),
      { origin: 'http://localhost' },
      undefined,
    );
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body)).toEqual([
      {
        nome: 'Meu Deus, meu pai',
        classificacao: 'CIAs, Coletânea',
        numero: '001',
        categoria: 'Cifra nível I',
        pdf: 'http://localhost/assets/praises/p1/m1.pdf',
        pdfId: LINHA.pdf_id,
        groupId: '001:meu-deus-meu-pai',
        shortId: '0453',
        praiseId: 'p1',
        materialId: 'm1',
      },
    ]);
  });

  it('numero nulo vira "", praise sem tag tem classificacao "", kind nulo é Partitura', async () => {
    const r = await buildPlpcgManifest(
      fakeDb({ crosswalk: [{ ...LINHA, numero: null, kind: null, r2_key: null }] }),
      { origin: 'http://localhost' },
      undefined,
    );
    const [e] = JSON.parse(r.body);
    expect(e.numero).toBe('');
    expect(e.classificacao).toBe('');
    expect(e.categoria).toBe('Partitura');
    expect(e.pdf).toBe('http://localhost/assets/praises/p1/m1.pdf');
  });

  it('preserva a ordem que o SQL devolveu (a ordenação é do ORDER BY, não do JS)', async () => {
    const r = await buildPlpcgManifest(
      fakeDb({ crosswalk: [{ ...LINHA, pdf_id: 'B', short_id: '0002' }, { ...LINHA, pdf_id: 'A', short_id: '0001' }] }),
      { origin: 'http://localhost' },
      undefined,
    );
    expect(JSON.parse(r.body).map((e: { pdfId: string }) => e.pdfId)).toEqual(['B', 'A']);
  });

  it('ETag e checksum são o sha256 do corpo; If-None-Match igual dá 304 sem corpo', async () => {
    const db = fakeDb({ crosswalk: [LINHA] });
    const cheio = await buildPlpcgManifest(db, { origin: 'http://localhost' }, undefined);
    expect(cheio.checksum).toBe(await sha256Hex(cheio.body));
    expect(cheio.headers).toEqual({ ETag: `"${cheio.checksum}"`, 'Cache-Control': 'public, max-age=300' });

    const igual = await buildPlpcgManifest(db, { origin: 'http://localhost' }, `W/"${cheio.checksum}"`);
    expect(igual.status).toBe(304);
    expect(igual.body).toBe('');
    expect(igual.checksum).toBe(cheio.checksum);
    expect(igual.headers.ETag).toBe(cheio.headers.ETag);

    const outro = await buildPlpcgManifest(db, { origin: 'http://localhost' }, '"nada"');
    expect(outro.status).toBe(200);
  });

  it('crosswalk vazio: "[]" com ETag, nunca erro', async () => {
    const r = await buildPlpcgManifest(fakeDb(), { origin: 'http://localhost' }, undefined);
    expect(r.status).toBe(200);
    expect(r.body).toBe('[]');
    expect(r.headers.ETag).toMatch(/^"[0-9a-f]{64}"$/);
  });

  it('o SQL faz JOIN interno com praise_materials e praises e restringe as tags ao crosswalk', () => {
    // Linha cujo material ou praise sumiu do app não entra: melhor faltar no manifest que apontar 404.
    expect(MANIFEST_SQL).toMatch(/JOIN praise_materials pm ON pm\.id = cw\.praise_material_id/);
    expect(MANIFEST_SQL).toMatch(/JOIN praises p ON p\.id = cw\.praise_id/);
    expect(MANIFEST_SQL).not.toMatch(/LEFT JOIN praise/);
    expect(MANIFEST_SQL).toMatch(/ORDER BY p\.number, p\.name, cw\.pdf_id/);
    expect(MANIFEST_TAGS_SQL).toMatch(/WHERE pt\.praise_id IN \(SELECT praise_id FROM plpcg_crosswalk\)/);
  });
});
