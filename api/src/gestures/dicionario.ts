/**
 * Acesso ao dicionário de gestos no D1.
 *
 * A regra da casa mora aqui: TODA escrita em gesture_dictionary passa por
 * escreverNoDicionario(), que anexa o bump de versão ao mesmo batch. É a versão
 * que vira o ETag "v{version}" — se uma rota escrevesse por fora, o cliente
 * continuaria recebendo 304 sobre um dicionário que mudou.
 */

import type { GestureEntry, LinhaDoDicionario, Uso } from './dictionaryTypes';

export { DICTIONARY_SCHEMA } from './dictionaryTypes';
export type { GestureDictionary, GestureEntry, LinhaDoDicionario, Uso } from './dictionaryTypes';

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

export function linhaParaEntrada(l: LinhaDoDicionario): GestureEntry {
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
