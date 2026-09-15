import { describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';

import { app } from '../index';
import { agruparVideos } from '../gestures/dicionario';

const SEGREDO = '0123456789abcdef0123456789abcdef';
const ORIGEM = 'https://web.example';

async function sessao() {
  const jwt = await new SignJWT({ email: 'admin@test.com', jti: 'j-videos' })
    .setProtectedHeader({ alg: 'HS256' }).setSubject('sub-admin').setIssuedAt().setExpirationTime('2h')
    .sign(new TextEncoder().encode(SEGREDO));
  return { origin: ORIGEM, cookie: `coldigom_access=${encodeURIComponent(jwt)}`, 'content-type': 'application/json' };
}

const LINHA = {
  id: 'c687580e7682', name: 'Quero', description: '', example_triggers: '[]',
  image_key: 'assets/cia/gestures/c687580e7682.png', gif_key: null,
  status: 'active', replaced_by: null, created_at: 't0', updated_at: 't0',
};

/** Linhas da consulta de ocorrências, já com o JOIN feito. */
const OCORRENCIAS = [
  { gesture_id: 'c687580e7682', material_id: 'y2', praise_id: 'p2', praise_number: '10', praise_name: 'Dez', url: 'https://youtu.be/bbb', seconds: 141 },
  { gesture_id: 'c687580e7682', material_id: 'y2', praise_id: 'p2', praise_number: '10', praise_name: 'Dez', url: 'https://youtu.be/bbb', seconds: 83 },
  { gesture_id: 'c687580e7682', material_id: 'y1', praise_id: 'p1', praise_number: '9', praise_name: 'Nove', url: 'https://youtu.be/aaa', seconds: null },
];

/**
 * Banco falso: responde às leituras pelos trechos de SQL e guarda os lotes.
 * `materiais` alimenta a checagem de material da rota PUT; `ocorrencias` a
 * leitura de vídeos; `par` diz se o par (gesto, vídeo) já existe (DELETE 404).
 */
function banco(opts: {
  linhas?: Record<string, unknown>[];
  materiais?: Record<string, unknown>[];
  ocorrencias?: Record<string, unknown>[];
  par?: boolean;
} = {}) {
  const linhas = opts.linhas ?? [LINHA];
  const materiais = opts.materiais ?? [{ id: 'y1', type: 'youtube', url: 'https://youtu.be/aaa' }];
  const ocorrencias = opts.ocorrencias ?? [];
  const lotes: { sql: string; args: unknown[] }[][] = [];
  const db = {
    prepare: vi.fn((sql: string) => {
      const stmt = (args: unknown[]) => ({
        first: vi.fn(async () => {
          if (sql.includes('FROM gesture_dictionary_meta')) return { version: 1 };
          if (sql.includes('FROM gesture_dictionary WHERE id')) return linhas.find((l) => l.id === args[0]) ?? null;
          if (sql.includes('FROM praise_materials WHERE id')) return materiais.find((m) => m.id === args[0]) ?? null;
          if (sql.includes('FROM gesture_video_occurrences WHERE gesture_id = ? AND material_id = ?')) return opts.par ? { um: 1 } : null;
          return null;
        }),
        all: vi.fn(async () => {
          if (sql.includes('FROM gesture_video_occurrences')) {
            return { results: args.length ? ocorrencias.filter((o) => o.gesture_id === args[0]) : ocorrencias };
          }
          if (sql.includes('FROM gesture_dictionary')) return { results: linhas };
          return { results: [] };
        }),
        run: vi.fn(async () => ({})),
        __sql: sql,
        __args: args,
      });
      return { bind: vi.fn((...args: unknown[]) => stmt(args)), ...stmt([]) };
    }),
    batch: vi.fn(async (stmts: { __sql: string; __args: unknown[] }[]) => {
      lotes.push(stmts.map((s) => ({ sql: s.__sql, args: s.__args })));
      return [];
    }),
  };
  return { db, lotes };
}

function env(db: unknown) {
  return { DB: db, ASSETS: { put: vi.fn(), get: vi.fn(), head: vi.fn(), delete: vi.fn() }, AUTH_JWT_SECRET: SEGREDO, AUTH_ALLOWED_EMAILS: '*', WEB_ORIGIN: ORIGEM } as never;
}

const bumpNoFim = (lote: { sql: string }[]) =>
  expect(lote[lote.length - 1].sql).toMatch(/UPDATE gesture_dictionary_meta SET version = version \+ 1/);

const VIDEOS_ESPERADOS = [
  { materialId: 'y1', praiseId: 'p1', praiseNumber: '9', praiseName: 'Nove', url: 'https://youtu.be/aaa', seconds: [] },
  { materialId: 'y2', praiseId: 'p2', praiseNumber: '10', praiseName: 'Dez', url: 'https://youtu.be/bbb', seconds: [83, 141] },
];

describe('agruparVideos', () => {
  it('junta as ocorrências por gesto e vídeo, ordena por número do louvor (numérico) e os segundos', () => {
    const mapa = agruparVideos(OCORRENCIAS as never);
    expect(mapa.get('c687580e7682')).toEqual(VIDEOS_ESPERADOS);
  });

  it('número não numérico vai para o fim, em ordem de texto; gesto sem ocorrência não aparece', () => {
    const mapa = agruparVideos([
      { gesture_id: 'g', material_id: 'a', praise_id: 'pa', praise_number: 'X', praise_name: 'Xis', url: 'u', seconds: null },
      { gesture_id: 'g', material_id: 'b', praise_id: 'pb', praise_number: '2', praise_name: 'Dois', url: 'u', seconds: null },
      { gesture_id: 'g', material_id: 'c', praise_id: 'pc', praise_number: null, praise_name: 'Sem', url: 'u', seconds: null },
    ]);
    expect(mapa.get('g')!.map((v) => v.materialId)).toEqual(['b', 'c', 'a']);
    expect(mapa.has('outro')).toBe(false);
  });
});

describe('GET com videos', () => {
  it('o dicionário inteiro traz videos em cada entrada (vazio quando não há)', async () => {
    const { db } = banco({ ocorrencias: OCORRENCIAS });
    const res = await app.request('/api/gestures/dictionary', {}, env(db));
    const json = (await res.json()) as { gestures: { id: string; videos: unknown }[] };
    expect(json.gestures[0].videos).toEqual(VIDEOS_ESPERADOS);
    const semNada = await app.request('/api/gestures/dictionary', {}, env(banco().db));
    expect(((await semNada.json()) as { gestures: { videos: unknown }[] }).gestures[0].videos).toEqual([]);
  });

  it('a entrada traz videos junto dos usos', async () => {
    const { db } = banco({ ocorrencias: OCORRENCIAS });
    const res = await app.request('/api/gestures/dictionary/c687580e7682', {}, env(db));
    const { data } = (await res.json()) as { data: { videos: unknown; usages: unknown } };
    expect(data.videos).toEqual(VIDEOS_ESPERADOS);
    expect(data.usages).toEqual([]);
  });
});
