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

describe('PATCH e image devolvem videos', () => {
  it('PATCH devolve a entrada com os videos do gesto', async () => {
    const { db } = banco({ ocorrencias: OCORRENCIAS });
    const res = await app.request(
      '/api/gestures/dictionary/c687580e7682',
      { method: 'PATCH', headers: await sessao(), body: JSON.stringify({ name: 'Quero!' }) },
      env(db)
    );
    const { data } = (await res.json()) as { data: { videos: unknown } };
    expect(data.videos).toEqual(VIDEOS_ESPERADOS);
  });

  it('POST …/image devolve a entrada com os videos do gesto', async () => {
    const { db } = banco({ ocorrencias: OCORRENCIAS });
    // headers de sessao() trazem content-type: application/json, que atrapalha
    // o boundary do multipart — aqui o corpo é FormData, então ele é descartado.
    const { 'content-type': _ct, ...h } = await sessao();
    const form = new FormData();
    form.set('file', new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'g.png', { type: 'image/png' }));
    const res = await app.request(
      '/api/gestures/dictionary/c687580e7682/image',
      { method: 'POST', headers: h, body: form },
      env(db)
    );
    const { data } = (await res.json()) as { data: { videos: unknown } };
    expect(data.videos).toEqual(VIDEOS_ESPERADOS);
  });
});

describe('PUT /api/gestures/dictionary/:id/videos/:materialId', () => {
  async function ligar(corpo: unknown, opts: Parameters<typeof banco>[0] = {}, materialId = 'y1') {
    const { db, lotes } = banco(opts);
    const res = await app.request(
      `/api/gestures/dictionary/c687580e7682/videos/${materialId}`,
      { method: 'PUT', headers: await sessao(), body: JSON.stringify(corpo) },
      env(db)
    );
    return { res, lotes };
  }

  it('exige sessão', async () => {
    const res = await app.request('/api/gestures/dictionary/c687580e7682/videos/y1', { method: 'PUT', headers: { origin: ORIGEM, 'content-type': 'application/json' }, body: '{"seconds":[]}' }, env(banco().db));
    expect(res.status).toBe(401);
  });

  it('seconds vazio liga o par com uma linha nula, num batch com o bump', async () => {
    const { res, lotes } = await ligar({ seconds: [] });
    expect(res.status).toBe(200);
    expect(lotes).toHaveLength(1);
    const [apaga, insere] = lotes[0];
    expect(apaga.sql).toMatch(/DELETE FROM gesture_video_occurrences WHERE gesture_id = \? AND material_id = \?/);
    expect(apaga.args).toEqual(['c687580e7682', 'y1']);
    expect(insere.sql).toMatch(/INSERT INTO gesture_video_occurrences \(gesture_id, material_id, seconds\) VALUES \(\?, \?, \?\)/);
    expect(insere.args).toEqual(['c687580e7682', 'y1', null]);
    bumpNoFim(lotes[0]);
  });

  it('tempos são deduplicados, ordenados e gravados um por linha; a resposta traz a entrada com videos', async () => {
    const { res, lotes } = await ligar({ seconds: [141, 83, 83] }, { ocorrencias: OCORRENCIAS });
    expect(res.status).toBe(200);
    const inserts = lotes[0].filter((s) => s.sql.startsWith('INSERT'));
    expect(inserts.map((s) => s.args[2])).toEqual([83, 141]);
    const { data } = (await res.json()) as { data: { id: string; videos: unknown } };
    expect(data.id).toBe('c687580e7682');
    expect(data.videos).toEqual(VIDEOS_ESPERADOS);
  });

  it('404 para gesto e material inexistentes; 400 para material que não é youtube', async () => {
    expect((await ligar({ seconds: [] }, { linhas: [] })).res.status).toBe(404);
    expect((await ligar({ seconds: [] }, {}, 'nao-existe')).res.status).toBe(404);
    const pdf = await ligar({ seconds: [] }, { materiais: [{ id: 'y1', type: 'pdf', url: null }] });
    expect(pdf.res.status).toBe(400);
    expect(((await pdf.res.json()) as { error: string }).error).toBe('Material is not a youtube video');
    expect(pdf.lotes).toHaveLength(0);
  });

  it('400 para seconds ausente, não lista, negativo ou não inteiro', async () => {
    for (const corpo of [{}, { seconds: 'x' }, { seconds: [-1] }, { seconds: [1.5] }, { seconds: ['1'] }]) {
      const { res, lotes } = await ligar(corpo);
      expect(res.status).toBe(400);
      expect(lotes).toHaveLength(0);
    }
    expect((await ligar('nao é json')).res.status).toBe(400);
  });
});
