/**
 * Acesso ao dicionário de gestos no D1.
 *
 * A regra da casa mora aqui: TODA escrita em gesture_dictionary passa por
 * escreverNoDicionario(), que anexa o bump de versão ao mesmo batch. É a versão
 * que vira o ETag "v{version}" — se uma rota escrevesse por fora, o cliente
 * continuaria recebendo 304 sobre um dicionário que mudou.
 */

import type { GestureEntry, GestureVideo, LinhaDeOcorrencia, LinhaDoDicionario, Uso } from './dictionaryTypes';

export { DICTIONARY_SCHEMA } from './dictionaryTypes';
export type { GestureDictionary, GestureEntry, GestureVideo, LinhaDeOcorrencia, LinhaDoDicionario, Uso } from './dictionaryTypes';

export const COLUNAS = `id, name, description, example_triggers, image_key, gif_key, status, replaced_by, created_at, updated_at`;

export function chaveDaFigura(id: string): string {
  return `assets/cia/gestures/${id}.png`;
}

/** 12 hex aleatórios — mesma forma dos ids que vêm do pdf_extractor. */
export function gerarIdDeGesto(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function linhaParaEntrada(l: LinhaDoDicionario, videos: GestureVideo[] = []): GestureEntry {
  let exampleTriggers: string[] = [];
  try {
    const lido = JSON.parse(l.example_triggers || '[]');
    if (Array.isArray(lido)) exampleTriggers = lido.filter((x): x is string => typeof x === 'string');
  } catch {
    // coluna corrompida à mão: melhor entrada sem exemplos que dicionário fora do ar
  }
  return {
    id: l.id,
    name: l.name,
    description: l.description ?? '',
    exampleTriggers,
    // image_key nulo só acontece entre o INSERT e o upload da figura; o
    // contrato promete string, e a chave canônica é derivável do id.
    image: l.image_key ?? chaveDaFigura(l.id),
    gif: l.gif_key,
    status: l.status,
    replacedBy: l.replaced_by,
    updatedAt: l.updated_at,
    videos,
  };
}

export async function lerVersao(db: D1Database): Promise<number> {
  const meta = await db
    .prepare(`SELECT version FROM gesture_dictionary_meta WHERE id = 1`)
    .first<{ version: number }>();
  return meta?.version ?? 0;
}

export async function lerLinha(db: D1Database, id: string): Promise<LinhaDoDicionario | null> {
  return db.prepare(`SELECT ${COLUNAS} FROM gesture_dictionary WHERE id = ?`).bind(id).first<LinhaDoDicionario>();
}

/** A única porta de escrita: statements + bump de versão, num batch só. */
export async function escreverNoDicionario(db: D1Database, statements: D1PreparedStatement[]): Promise<void> {
  await db.batch([
    ...statements,
    db.prepare(`UPDATE gesture_dictionary_meta SET version = version + 1 WHERE id = 1`),
  ]);
}

/** If-None-Match pode vir fraco (W/) e em lista; qualquer item que case basta. */
export function casaEtag(ifNoneMatch: string | undefined, etag: string): boolean {
  if (!ifNoneMatch) return false;
  return ifNoneMatch
    .split(',')
    .map((s) => s.trim().replace(/^W\//i, ''))
    .some((s) => s === etag || s === '*');
}

export async function usosDoGesto(db: D1Database, gestureId: string): Promise<Uso[]> {
  const r = await db
    .prepare(
      `SELECT gu.material_id, pm.praise_id, p.name AS praise_name, p.number AS praise_number, gu.count
         FROM gesture_usage gu
         JOIN praise_materials pm ON pm.id = gu.material_id
         JOIN praises p ON p.id = pm.praise_id
        WHERE gu.gesture_id = ?
        ORDER BY p.number, p.name`
    )
    .bind(gestureId)
    .all<Uso>();
  return r.results ?? [];
}

// pm.type = 'youtube' é reforço, não a fonte de verdade: um material que muda
// de tipo (PATCH) já apaga suas ocorrências; isso cobre o que passar por fora.
const SQL_OCORRENCIAS = `SELECT o.gesture_id, o.material_id, pm.praise_id, p.number AS praise_number, p.name AS praise_name, pm.url, o.seconds
     FROM gesture_video_occurrences o
     JOIN praise_materials pm ON pm.id = o.material_id
     JOIN praises p ON p.id = pm.praise_id
    WHERE pm.type = 'youtube'`;

/** "9" antes de "10"; o que não é número vai para o fim, em ordem de texto. */
function compararNumero(a: string | null, b: string | null): number {
  const na = a !== null && /^\d+$/.test(a) ? Number(a) : Number.POSITIVE_INFINITY;
  const nb = b !== null && /^\d+$/.test(b) ? Number(b) : Number.POSITIVE_INFINITY;
  if (na !== nb) return na - nb;
  return (a ?? '').localeCompare(b ?? '', 'pt-BR');
}

/** Ocorrências → vídeos por gesto: um item por (gesto, vídeo), segundos ordenados, nulo descartado. */
export function agruparVideos(linhas: LinhaDeOcorrencia[]): Map<string, GestureVideo[]> {
  const porGesto = new Map<string, Map<string, GestureVideo>>();
  for (const l of linhas) {
    let videos = porGesto.get(l.gesture_id);
    if (!videos) porGesto.set(l.gesture_id, (videos = new Map()));
    let v = videos.get(l.material_id);
    if (!v) {
      v = { materialId: l.material_id, praiseId: l.praise_id, praiseNumber: l.praise_number, praiseName: l.praise_name, url: l.url, seconds: [] };
      videos.set(l.material_id, v);
    }
    if (l.seconds !== null) v.seconds.push(l.seconds);
  }
  const resultado = new Map<string, GestureVideo[]>();
  for (const [gestureId, videos] of porGesto) {
    const lista = [...videos.values()];
    for (const v of lista) v.seconds.sort((a, b) => a - b);
    lista.sort((a, b) => compararNumero(a.praiseNumber, b.praiseNumber) || a.praiseName.localeCompare(b.praiseName, 'pt-BR'));
    resultado.set(gestureId, lista);
  }
  return resultado;
}

export async function videosDoDicionario(db: D1Database): Promise<Map<string, GestureVideo[]>> {
  const r = await db.prepare(SQL_OCORRENCIAS).all<LinhaDeOcorrencia>();
  return agruparVideos(r.results ?? []);
}

export async function videosDoGesto(db: D1Database, gestureId: string): Promise<GestureVideo[]> {
  const r = await db.prepare(`${SQL_OCORRENCIAS} AND o.gesture_id = ?`).bind(gestureId).all<LinhaDeOcorrencia>();
  return agruparVideos(r.results ?? []).get(gestureId) ?? [];
}
