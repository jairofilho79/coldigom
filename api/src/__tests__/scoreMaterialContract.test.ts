import { describe, expect, it } from 'vitest';
import { CURATOR_SYSTEM_PROMPT } from '../agent/curatorPrompt';
import { app } from '../index';
import { derivedCatalogR2Key } from '../plpcgPraises';
import { d1DeSqlite, sqliteComSchema } from './sqliteD1';

const SCORE_TYPES = ['mscz', 'mxl', 'musicxml'];
const LEGACY_TYPES = ['pdf', 'mp3', 'audio', 'chord', 'gestures'];

describe('contrato R2 dos materiais de partitura', () => {
  it.each([...SCORE_TYPES, ...LEGACY_TYPES])('deriva a chave de %s sem alias de extensão', (type) => {
    const key = `assets/praises/p1/m1.${type}`;
    expect(derivedCatalogR2Key('p1', 'm1', type)).toBe(key);
    expect(derivedCatalogR2Key('p1', 'm1', type.toUpperCase())).toBe(key);
  });

  it.each(['youtube', 'sf2', 'sf3', 'xml', 'desconhecido', ''])(
    'não deriva chave de material de louvor para %s',
    (type) => {
      expect(derivedCatalogR2Key('p1', 'm1', type)).toBeNull();
    }
  );

  it('entrega partituras e materiais legados compactos, preservando chaves fora do padrão e cache', async () => {
    const sqlite = sqliteComSchema();
    try {
      sqlite.prepare('INSERT INTO praises (id, name, number) VALUES (?, ?, ?)').run('p1', 'Louvor', '001');
      sqlite.prepare('INSERT INTO material_kinds (id, name) VALUES (?, ?)').run('partitura', 'Partitura');
      const insert = sqlite.prepare(
        'INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key, url, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );
      const expected = [...SCORE_TYPES, ...LEGACY_TYPES].flatMap((type) => {
        const standard = { id: `m-${type}`, kind: 'partitura', type };
        const custom = {
          id: `custom-${type}`,
          kind: 'partitura',
          type,
          r2: `assets/legado/arranjo.${type}`,
          notes: 'Arranjo I',
        };
        insert.run(standard.id, 'p1', 'partitura', type, `assets/praises/p1/${standard.id}.${type}`, null, null);
        insert.run(custom.id, 'p1', 'partitura', type, custom.r2, null, custom.notes);
        return [standard, custom];
      });
      insert.run('link', 'p1', 'partitura', 'youtube', null, 'https://youtu.be/example', null);
      const env = { DB: d1DeSqlite(sqlite) };

      const res = await app.request('/api/plpcg/catalog', {}, env);
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('public, max-age=300');
      const body = await res.json() as { praises: { materials: unknown[] }[] };
      expect(body.praises[0].materials).toHaveLength(expected.length + 1);
      expect(body.praises[0].materials).toEqual(expect.arrayContaining([
        ...expected,
        { id: 'link', kind: 'partitura', type: 'youtube', url: 'https://youtu.be/example' },
      ]));

      const cached = await app.request('/api/plpcg/catalog', {
        headers: { 'If-None-Match': res.headers.get('etag')! },
      }, env);
      expect(cached.status).toBe(304);
      expect(cached.headers.get('etag')).toBe(res.headers.get('etag'));
      expect(await cached.text()).toBe('');
    } finally {
      sqlite.close();
    }
  });
});

describe('contrato add_material do curator', () => {
  it('oferece as três partituras sem remover PDF, áudio, cifra ou gestos nem oferecer SoundFonts', () => {
    const contract = CURATOR_SYSTEM_PROMPT.split('\n').find((line) => line.includes('"add_material"'))!;
    const types = [...contract.matchAll(/"type":\s*((?:"[^"]+"(?:\|)?)+)/g)]
      .flatMap((match) => [...match[1].matchAll(/"([^"]+)"/g)].map((type) => type[1]));
    expect(types).toEqual(expect.arrayContaining(['pdf', 'mp3', 'chord', 'gestures', ...SCORE_TYPES]));
    expect(types).not.toContain('sf2');
    expect(types).not.toContain('sf3');
  });
});
