import { describe, expect, it, vi } from 'vitest';

import { app } from '../index';

/**
 * Banco falso com estado: versão e linhas do dicionário. Responde às leituras
 * pelos trechos de SQL, como os outros testes de rota fazem.
 */
function banco(opts: { versao?: number; linhas?: Record<string, unknown>[]; usos?: Record<string, unknown>[] } = {}) {
  const versao = opts.versao ?? 0;
  const linhas = opts.linhas ?? [];
  const usos = opts.usos ?? [];
  const db = {
    prepare: vi.fn((sql: string) => {
      const stmt = (args: unknown[]) => ({
        first: vi.fn(async () => {
          if (sql.includes('FROM gesture_dictionary_meta')) return { version: versao };
          if (sql.includes('FROM gesture_dictionary WHERE id')) {
            return linhas.find((l) => l.id === args[0]) ?? null;
          }
          return null;
        }),
        all: vi.fn(async () => {
          if (sql.includes('FROM gesture_usage')) return { results: usos };
          if (sql.includes('FROM gesture_dictionary')) return { results: linhas };
          return { results: [] };
        }),
        run: vi.fn(async () => ({})),
        __sql: sql,
      });
      return { bind: vi.fn((...args: unknown[]) => stmt(args)), ...stmt([]) };
    }),
    batch: vi.fn(async () => []),
  };
  return db;
}

const LINHA = {
  id: 'c687580e7682',
  name: 'Quero',
  description: 'Mãos ao peito',
  example_triggers: '["Quero","Desejo"]',
  image_key: 'assets/cia/gestures/c687580e7682.png',
  gif_key: null,
  status: 'active',
  replaced_by: null,
  created_at: '2026-09-01 00:00:00',
  updated_at: '2026-09-01 00:00:00',
};

describe('GET /api/gestures/dictionary', () => {
  it('responde o dicionário com ETag "v{version}" e cache de 5 minutos', async () => {
    const res = await app.request('/api/gestures/dictionary', {}, { DB: banco({ versao: 7, linhas: [LINHA] }) } as never);
    expect(res.status).toBe(200);
    expect(res.headers.get('etag')).toBe('"v7"');
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    const json = (await res.json()) as { schema: string; version: number; generatedAt: string; gestures: unknown[] };
    expect(json.schema).toBe('coldigom.gesture-dictionary/1');
    expect(json.version).toBe(7);
    expect(new Date(json.generatedAt).toString()).not.toBe('Invalid Date');
    expect(json.gestures).toEqual([
      {
        id: 'c687580e7682',
        name: 'Quero',
        description: 'Mãos ao peito',
        exampleTriggers: ['Quero', 'Desejo'],
        image: 'assets/cia/gestures/c687580e7682.png',
        gif: null,
        status: 'active',
        replacedBy: null,
        updatedAt: '2026-09-01 00:00:00',
        videos: [],
      },
    ]);
  });

  it('304 quando o If-None-Match casa, inclusive fraco e em lista', async () => {
    for (const header of ['"v7"', 'W/"v7"', '"v2", "v7"']) {
      const res = await app.request(
        '/api/gestures/dictionary',
        { headers: { 'if-none-match': header } },
        { DB: banco({ versao: 7 }) } as never
      );
      expect(res.status, header).toBe(304);
      expect(res.headers.get('etag')).toBe('"v7"');
    }
  });

  it('200 quando o If-None-Match é de outra versão', async () => {
    const res = await app.request(
      '/api/gestures/dictionary',
      { headers: { 'if-none-match': '"v6"' } },
      { DB: banco({ versao: 7 }) } as never
    );
    expect(res.status).toBe(200);
  });

  it('meta ausente (banco recém-migrado sem seed) conta como versão 0', async () => {
    const db = banco();
    (db.prepare as ReturnType<typeof vi.fn>).mockImplementation((sql: string) => ({
      bind: () => ({ first: async () => null, all: async () => ({ results: [] }) }),
      first: async () => null,
      all: async () => ({ results: [] }),
      __sql: sql,
    }));
    const res = await app.request('/api/gestures/dictionary', {}, { DB: db } as never);
    expect(res.headers.get('etag')).toBe('"v0"');
  });
});

describe('GET /api/gestures/dictionary/:id', () => {
  it('devolve a entrada com os usos juntados aos louvores', async () => {
    const usos = [{ material_id: 'm1', praise_id: 'p1', praise_name: 'Quero Viver', praise_number: '182', count: 2 }];
    const res = await app.request('/api/gestures/dictionary/c687580e7682', {}, { DB: banco({ linhas: [LINHA], usos }) } as never);
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: { id: string; usages: unknown[] } };
    expect(data.id).toBe('c687580e7682');
    expect(data.usages).toEqual(usos);
  });

  it('404 para id desconhecido', async () => {
    const res = await app.request('/api/gestures/dictionary/000000000000', {}, { DB: banco() } as never);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/gestures/usage', () => {
  it('sem gestureId devolve a contagem de materiais por gesto', async () => {
    const db = banco();
    (db.prepare as ReturnType<typeof vi.fn>).mockImplementation((sql: string) => ({
      bind: () => ({ all: async () => ({ results: [] }), first: async () => null }),
      all: async () => (sql.includes('GROUP BY gesture_id') ? { results: [{ gesture_id: 'c687580e7682', materials: 3 }] } : { results: [] }),
      first: async () => null,
      __sql: sql,
    }));
    const res = await app.request('/api/gestures/usage', {}, { DB: db } as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [{ gesture_id: 'c687580e7682', materials: 3 }] });
  });

  it('lista os usos', async () => {
    const usos = [{ material_id: 'm1', praise_id: 'p1', praise_name: 'X', praise_number: '1', count: 1 }];
    const res = await app.request('/api/gestures/usage?gestureId=c687580e7682', {}, { DB: banco({ usos }) } as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: usos });
  });
});
