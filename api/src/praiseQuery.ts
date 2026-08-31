/**
 * Construção das consultas de louvor: filtro, ordenação e busca.
 *
 * Sai do index.ts para que o S2 (leitura, busca e filtros) trabalhe aqui sem
 * disputar arquivo com os setores de escrita e de arquivos.
 */

export interface PraiseResult {
  id: string;
  name: string;
  number: string;
  author: string;
  rhythm: string;
  tonality: string;
  category: string;
  lyrics: string;
  group_id: string | null;
  /** Token de versão da tela: volta no PATCH como `if_updated_at`. */
  updated_at?: string | null;
  tag_ids: string | null;
}

export type TagRow = {
  id: string;
  name: string;
  parent_id: string | null;
  parent_name?: string | null;
};

export const TAG_LABEL_SQL = `CASE WHEN tp.name IS NOT NULL THEN tp.name || ' · ' || t.name ELSE t.name END`;

/**
 * Para cada tag pedida, o grupo de tags que o filtro deve considerar: as
 * subtags dela, ou ela mesma quando não tem subtag.
 *
 * Uma consulta só. Era uma por tag, em série — filtrar por cinco tags custava
 * cinco viagens ao D1 antes da consulta principal.
 */
export async function resolveTagFilterGroups(
  db: D1Database,
  tagIds: string[]
): Promise<string[][]> {
  if (tagIds.length === 0) return [];

  const placeholders = tagIds.map(() => '?').join(',');
  const children = await db
    .prepare(`SELECT id, parent_id FROM tags WHERE parent_id IN (${placeholders})`)
    .bind(...tagIds)
    .all();

  const byParent = new Map<string, string[]>();
  for (const row of ((children.results as { id: string; parent_id: string }[]) ?? [])) {
    const lista = byParent.get(row.parent_id) ?? [];
    lista.push(row.id);
    byParent.set(row.parent_id, lista);
  }

  // A ordem dos grupos acompanha a ordem das tags pedidas: cada grupo vira uma
  // condição AND separada, e trocar a ordem trocaria o significado do filtro.
  return tagIds.map((id) => byParent.get(id) ?? [id]);
}

/**
 * A falha é do índice de texto, ou é um erro de SQL de verdade?
 *
 * O laço de duas tentativas tratava QUALQUER exceção como "o FTS falhou, tenta
 * sem ele". Um alias errado numa cláusula de filtro virava um warning
 * api.praises.fts_fallback e depois um 500 genérico — a mensagem mentia sobre a
 * causa e o diagnóstico ficava impossível.
 */
export function isFtsError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /praises_fts|fts5|\bMATCH\b/i.test(msg);
}

export async function tagHasChildren(db: D1Database, tagId: string): Promise<boolean> {
  const row = await db.prepare('SELECT id FROM tags WHERE parent_id = ? LIMIT 1').bind(tagId).first();
  return Boolean(row);
}

export const VALID_SORT_FIELDS = ['number', 'name', 'rhythm', 'tonality', 'category', 'author', 'created_at'] as const;
export type SortField = typeof VALID_SORT_FIELDS[number];

export const NOCASE_FIELDS: SortField[] = ['name', 'author', 'rhythm', 'tonality', 'category'];

/** Secondary sort: NULL/empty values always last, regardless of ASC/DESC. */
export function buildSecondaryOrder(sort: SortField, order: 'ASC' | 'DESC'): string {
  if (sort === 'created_at') {
    return `p.created_at ${order}`;
  }

  const emptyLast = `CASE WHEN p.${sort} IS NULL OR p.${sort} = '' THEN 1 ELSE 0 END ASC`;

  if (sort === 'number') {
    return `${emptyLast}, CAST(p.number AS INTEGER) ${order}`;
  }

  const collate = NOCASE_FIELDS.includes(sort) ? ' COLLATE NOCASE' : '';
  return `${emptyLast}, p.${sort}${collate} ${order}`;
}

/**
 * Pure digit query: `5`/`25` = contains (natural order); `005`/`025` = exact only.
 * Leading zero = exact; no FTS/bm25.
 */
export function parseNumericSearch(
  search: string
): { exact: boolean; digits: string; value: number } | null {
  const q = search.trim();
  if (!/^\d+$/.test(q)) return null;
  return {
    exact: q.length > 1 && q.startsWith('0'),
    digits: q,
    value: Number.parseInt(q, 10),
  };
}

/**
 * Neutraliza os curingas do LIKE. No SQLite, '%' e '_' são curingas: buscar "%"
 * virava LIKE '%%%' e casava com tudo. Toda cláusula que usa isto precisa
 * declarar ESCAPE '\\'.
 */
export function escapeLikePattern(raw: string): string {
  return raw.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** `%termo%` já escapado, pronto para `LIKE ? ESCAPE '\\'`. */
export function likeContains(raw: string): string {
  return `%${escapeLikePattern(raw)}%`;
}

export const YT_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Extract YouTube video ID from a URL (watch, youtu.be, embed, shorts). Not bare IDs. */
export function extractYouTubeVideoId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  let candidate = raw;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
    const hostish = candidate.replace(/^\/+/, '').toLowerCase();
    if (
      !hostish.startsWith('youtube.com/') &&
      !hostish.startsWith('www.youtube.com/') &&
      !hostish.startsWith('m.youtube.com/') &&
      !hostish.startsWith('music.youtube.com/') &&
      !hostish.startsWith('youtu.be/')
    ) {
      return null;
    }
    candidate = `https://${candidate.replace(/^\/+/, '')}`;
  }

  try {
    const u = new URL(candidate);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    let id: string | null = null;
    if (host === 'youtu.be') {
      id = u.pathname.split('/').filter(Boolean)[0] || null;
    } else if (
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'music.youtube.com'
    ) {
      const v = u.searchParams.get('v');
      if (v) {
        id = v;
      } else {
        const parts = u.pathname.split('/').filter(Boolean);
        const idxEmbed = parts.indexOf('embed');
        if (idxEmbed >= 0 && parts[idxEmbed + 1]) id = parts[idxEmbed + 1];
        const idxShorts = parts.indexOf('shorts');
        if (!id && idxShorts >= 0 && parts[idxShorts + 1]) id = parts[idxShorts + 1];
      }
    }
    if (!id) return null;
    id = id.split('?')[0] || null;
    return id && YT_VIDEO_ID_RE.test(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * With `q`: rank by match similarity (number → title → lyrics), not by collection number.
 * Digit-only `q`: natural number order (exact first, then CAST ASC).
 * YouTube URL `q`: name only.
 * Without `q`: keep the user's sort field.
 */
export function buildOrderClause(
  sort: SortField,
  order: 'ASC' | 'DESC',
  search?: string
): { clause: string; bindings: (string | number)[] } {
  const q = search?.trim();
  if (!q) {
    return { clause: `ORDER BY ${buildSecondaryOrder(sort, order)}`, bindings: [] };
  }

  if (extractYouTubeVideoId(q)) {
    return { clause: `ORDER BY p.name COLLATE NOCASE ASC`, bindings: [] };
  }

  const numeric = parseNumericSearch(q);
  if (numeric) {
    return {
      clause: `ORDER BY CASE WHEN CAST(p.number AS INTEGER) = ? THEN 0 ELSE 1 END ASC, CAST(p.number AS INTEGER) ASC, p.name COLLATE NOCASE ASC`,
      bindings: [numeric.value],
    };
  }

  const terms = q
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const titleTermsPred =
    terms.length > 0
      ? terms.map(() => `p.name LIKE ? ESCAPE '\\' COLLATE NOCASE`).join(' AND ')
      : `p.name LIKE ? ESCAPE '\\' COLLATE NOCASE`;
  const titleTermBindings =
    terms.length > 0 ? terms.map((t) => likeContains(t)) : [likeContains(q)];

  // 0 exact number, 1 number contains, 2 exact title, 3 title starts with,
  // 4 all query terms in title, 5 lyrics/other — then name (not collection #).
  return {
    clause: `ORDER BY CASE WHEN TRIM(p.number) = ? THEN 0 WHEN p.number LIKE ? ESCAPE '\\' THEN 1 WHEN LOWER(TRIM(p.name)) = LOWER(?) THEN 2 WHEN p.name LIKE ? ESCAPE '\\' COLLATE NOCASE THEN 3 WHEN (${titleTermsPred}) THEN 4 ELSE 5 END ASC, p.name COLLATE NOCASE ASC`,
    bindings: [q, likeContains(q), q, `${escapeLikePattern(q)}%`, ...titleTermBindings],
  };
}

/** Build FTS5 MATCH string (prefix terms, ANDed). */
export function buildFtsMatchQuery(search: string): string {
  const terms = search
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(t => `"${t.replace(/"/g, '""')}"*`);
  return terms.length > 0 ? terms.join(' AND ') : '';
}

/** Campos varridos pela busca textual sem FTS. */
const LIKE_TEXT_FIELDS = [
  'name',
  'lyrics',
  'author',
  'rhythm',
  'tonality',
  'category',
  'id',
  'number',
] as const;

export function buildWhereClause(params: {
  search?: string;
  useFts?: boolean;
  tagGroups?: string[][];
  rhythm?: string[];
  tonality?: string[];
  category?: string[];
  materialKinds?: string[];
  numberMin?: number;
  numberMax?: number;
}): { clause: string; bindings: (string | number)[] } {
  const conditions: string[] = [];
  const bindings: (string | number)[] = [];

  if (params.search) {
    const youtubeId = extractYouTubeVideoId(params.search);
    if (youtubeId) {
      conditions.push(
        `p.id IN (SELECT praise_id FROM praise_materials WHERE type = 'youtube' AND url LIKE ? ESCAPE '\\')`
      );
      bindings.push(likeContains(youtubeId));
    } else {
      const numeric = parseNumericSearch(params.search);
      if (numeric) {
        if (numeric.exact) {
          conditions.push(
            `p.number IS NOT NULL AND TRIM(p.number) != '' AND CAST(p.number AS INTEGER) = ?`
          );
          bindings.push(numeric.value);
        } else {
          // Match on integer digit string so "5" hits "005" and "15", not lyrics noise.
          conditions.push(
            `p.number IS NOT NULL AND TRIM(p.number) != '' AND INSTR(CAST(CAST(p.number AS INTEGER) AS TEXT), ?) > 0`
          );
          bindings.push(numeric.digits);
        }
      } else {
        const pattern = likeContains(params.search);
        const ftsQuery = params.useFts ? buildFtsMatchQuery(params.search) : '';
        if (ftsQuery) {
          conditions.push(
            `(p.rowid IN (SELECT rowid FROM praises_fts WHERE praises_fts MATCH ?) OR p.id LIKE ? ESCAPE '\\' OR p.number LIKE ? ESCAPE '\\')`
          );
          bindings.push(ftsQuery, pattern, pattern);
        } else {
          // Também é o caminho de quando o FTS não aproveita nada da busca —
          // "!!!" produz MATCH vazio. Antes caía para id/número só, abandonando
          // nome e letra em silêncio.
          conditions.push(
            `(${LIKE_TEXT_FIELDS.map((f) => `p.${f} LIKE ? ESCAPE '\\'`).join(' OR ')})`
          );
          bindings.push(...LIKE_TEXT_FIELDS.map(() => pattern));
        }
      }
    }
  }

  if (params.tagGroups && params.tagGroups.length > 0) {
    for (const group of params.tagGroups) {
      conditions.push(
        `p.id IN (SELECT praise_id FROM praise_tags WHERE tag_id IN (${group.map(() => '?').join(',')}))`
      );
      bindings.push(...group);
    }
  }

  if (params.rhythm && params.rhythm.length > 0) {
    conditions.push(`p.rhythm IN (${params.rhythm.map(() => '?').join(',')})`);
    bindings.push(...params.rhythm);
  }

  if (params.tonality && params.tonality.length > 0) {
    conditions.push(`p.tonality IN (${params.tonality.map(() => '?').join(',')})`);
    bindings.push(...params.tonality);
  }

  if (params.category && params.category.length > 0) {
    conditions.push(`p.category IN (${params.category.map(() => '?').join(',')})`);
    bindings.push(...params.category);
  }

  if (params.materialKinds && params.materialKinds.length > 0) {
    conditions.push(
      `p.id IN (
        SELECT pm.praise_id FROM praise_materials pm
        WHERE pm.material_kind IN (${params.materialKinds.map(() => '?').join(',')})
        GROUP BY pm.praise_id
        HAVING COUNT(DISTINCT pm.material_kind) = ?
      )`
    );
    bindings.push(...params.materialKinds, params.materialKinds.length);
  }

  if (params.numberMin !== undefined) {
    conditions.push(`CAST(p.number AS INTEGER) >= ?`);
    bindings.push(params.numberMin);
  }

  if (params.numberMax !== undefined) {
    conditions.push(`CAST(p.number AS INTEGER) <= ?`);
    bindings.push(params.numberMax);
  }

  const clause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { clause, bindings };
}

// GET /api/praises - List all praises with optional search
