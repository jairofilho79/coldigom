import { parseListNumbers } from './queryParams';
import { labelFor, loadMaterialKindLabels } from './materialKindLabels';
import { buildLyricsExcerpt } from './lyricsExcerpt';
import { extractYouTubeVideoId, parseNumericSearch } from './praiseQuery';

export type PlpcgListQuery = {
  search: string;
  page: number;
  limit: number;
  offset: number;
  tags?: string[];
  rhythm?: string[];
  tonality?: string[];
  materialKinds?: string[];
  numberMin?: number;
  numberMax?: number;
  sortParam?: string;
  order: 'ASC' | 'DESC';
};

type WhereParams = {
  search?: string;
  useFts?: boolean;
  tagGroups?: string[][];
  rhythm?: string[];
  tonality?: string[];
  materialKinds?: string[];
  numberMin?: number;
  numberMax?: number;
};

export type PlpcgListDeps = {
  buildWhereClause: (params: WhereParams) => { clause: string; bindings: (string | number)[] };
  buildOrderClause: (
    sort: string,
    order: 'ASC' | 'DESC',
    search?: string
  ) => { clause: string; bindings: (string | number)[] };
  validSortFields: readonly string[];
  resolveTagFilterGroups: (db: D1Database, tagIds: string[]) => Promise<string[][]>;
  tagLabelSql: string;
};

type SlimMaterial = {
  id: string | null;
  praise_id: string;
  material_kind: string | null;
  type: string;
  r2_key: string | null;
  url: string | null;
  material_kind_name: string;
};

type ListRow = {
  id: string;
  name: string;
  number: string | null;
  author: string | null;
  rhythm: string | null;
  tonality: string | null;
  group_id: string | null;
  short_id: string | null;
  tag_ids: string | null;
  tag_names: string | null;
  has_lyrics: number;
};

/**
 * Devolve a consulta pronta ou a mensagem do parâmetro inválido. Antes usava
 * parseInt direto e herdava os mesmos NaN silenciosos de /api/praises.
 */
export function parsePlpcgListQuery(c: {
  req: { query: (key: string) => string | undefined };
}): { ok: true; query: PlpcgListQuery } | { ok: false; error: string } {
  const search = c.req.query('q') || '';
  const numeros = parseListNumbers({
    page: c.req.query('page'),
    limit: c.req.query('limit'),
    numberMin: c.req.query('numberMin'),
    numberMax: c.req.query('numberMax'),
  });
  if (!numeros.ok) return { ok: false, error: numeros.error };
  const { page, limit, offset, numberMin, numberMax } = numeros;

  const tags = c.req.query('tags') ? c.req.query('tags')!.split(',').filter(Boolean) : undefined;
  const rhythm = c.req.query('rhythm') ? c.req.query('rhythm')!.split(',').filter(Boolean) : undefined;
  const tonality = c.req.query('tonality')
    ? c.req.query('tonality')!.split(',').filter(Boolean)
    : undefined;
  const materialKinds = c.req.query('materialKinds')
    ? c.req.query('materialKinds')!.split(',').filter(Boolean)
    : undefined;
  const sortParam = c.req.query('sort') || undefined;
  const order = c.req.query('order')?.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

  return {
    ok: true,
    query: {
      search,
      page,
      limit,
      offset,
      tags,
      rhythm,
      tonality,
      materialKinds,
      numberMin,
      numberMax,
      sortParam,
      order,
    },
  };
}

export async function listPlpcgPraises(
  db: D1Database,
  query: PlpcgListQuery,
  deps: PlpcgListDeps
): Promise<{
  data: Array<
    Omit<ListRow, 'has_lyrics'> & { materials: SlimMaterial[]; lyrics_excerpt: string | null }
  >;
  pagination: { page: number; limit: number; total: number; totalPages: number };
}> {
  const sort = deps.validSortFields.includes(query.sortParam!)
    ? query.sortParam!
    : 'number';

  let useFtsAttempt = Boolean(query.search);
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const tagGroups =
        query.tags && query.tags.length > 0
          ? await deps.resolveTagFilterGroups(db, query.tags)
          : undefined;

      const { clause: whereClause, bindings: whereBindings } = deps.buildWhereClause({
        search: query.search || undefined,
        useFts: useFtsAttempt,
        tagGroups,
        rhythm: query.rhythm,
        tonality: query.tonality,
        materialKinds: query.materialKinds,
        numberMin: query.numberMin,
        numberMax: query.numberMax,
      });

      const { clause: orderClause, bindings: orderBindings } = deps.buildOrderClause(
        sort,
        query.order,
        query.search || undefined
      );
      const bindings: (string | number)[] = [...whereBindings, ...orderBindings];

      const listSql = `
      SELECT
        p.id, p.name, p.number, p.author, p.rhythm, p.tonality, p.group_id, p.short_id,
        CASE WHEN p.lyrics IS NOT NULL AND TRIM(p.lyrics) != '' THEN 1 ELSE 0 END AS has_lyrics,
        GROUP_CONCAT(DISTINCT pt.tag_id) as tag_ids,
        GROUP_CONCAT(DISTINCT ${deps.tagLabelSql}) as tag_names
      FROM praises p
      LEFT JOIN praise_tags pt ON p.id = pt.praise_id
      LEFT JOIN tags t ON pt.tag_id = t.id
      LEFT JOIN tags tp ON t.parent_id = tp.id
      ${whereClause}
      GROUP BY p.id
      ${orderClause}
      LIMIT ? OFFSET ?
    `;
      bindings.push(query.limit, query.offset);

      const result = await db.prepare(listSql).bind(...bindings).all();
      const rows = (result.results ?? []) as ListRow[];

      const isTextSearch =
        Boolean(query.search) &&
        !parseNumericSearch(query.search) &&
        !extractYouTubeVideoId(query.search);
      const excerptByPraiseId = new Map<string, string>();
      if (isTextSearch) {
        try {
          const lyricsCandidateIds = rows.filter((r) => r.has_lyrics === 1).map((r) => r.id);
          if (lyricsCandidateIds.length > 0) {
            const placeholders = lyricsCandidateIds.map(() => '?').join(',');
            const lyricsResult = await db
              .prepare(`SELECT id, lyrics FROM praises WHERE id IN (${placeholders})`)
              .bind(...lyricsCandidateIds)
              .all();
            for (const lyricsRow of (lyricsResult.results ?? []) as {
              id: string;
              lyrics: string | null;
            }[]) {
              const excerpt = buildLyricsExcerpt(lyricsRow.lyrics ?? '', query.search);
              if (excerpt) excerptByPraiseId.set(lyricsRow.id, excerpt);
            }
          }
        } catch (excerptError) {
          console.warn(
            JSON.stringify({
              msg: 'api.plpcg.praises.lyrics_excerpt_failed',
              error: excerptError instanceof Error ? excerptError.message : String(excerptError),
            })
          );
        }
      }

      let countQuery: string;
      let countBindings: (string | number)[] = [...whereBindings];
      if (whereClause) {
        countQuery = `SELECT COUNT(*) as total FROM praises p ${whereClause}`;
      } else {
        countQuery = `SELECT COUNT(*) as total FROM praises`;
        countBindings = [];
      }
      const countResult = await db.prepare(countQuery).bind(...countBindings).first();
      const total = (countResult?.total as number) || 0;

      const praiseIds = rows.map((r) => r.id);
      const materialsByPraise = new Map<string, SlimMaterial[]>();
      for (const id of praiseIds) materialsByPraise.set(id, []);

      if (praiseIds.length > 0) {
        const placeholders = praiseIds.map(() => '?').join(',');
        const materialsResult = await db
          .prepare(
            `SELECT pm.id, pm.praise_id, pm.material_kind, pm.type, pm.r2_key, pm.url
             FROM praise_materials pm WHERE pm.praise_id IN (${placeholders})`
          )
          .bind(...praiseIds)
          .all();

        const materialKindLabels = await loadMaterialKindLabels(db);
        for (const m of (materialsResult.results ?? []) as Array<{
          id: string;
          praise_id: string;
          material_kind: string;
          type: string;
          r2_key: string | null;
          url: string | null;
        }>) {
          const list = materialsByPraise.get(m.praise_id);
          if (!list) continue;
          list.push({
            id: m.id,
            praise_id: m.praise_id,
            material_kind: m.material_kind,
            type: m.type,
            r2_key: m.r2_key,
            url: m.url,
            material_kind_name: labelFor(materialKindLabels, m.material_kind),
          });
        }
      }

      const data = rows.map(({ has_lyrics, ...row }) => {
        const materials = materialsByPraise.get(row.id) ?? [];
        if (has_lyrics) {
          materials.push({
            id: null,
            praise_id: row.id,
            material_kind: null,
            type: 'lyrics',
            r2_key: null,
            url: null,
            material_kind_name: 'Letra',
          });
        }
        return { ...row, materials, lyrics_excerpt: excerptByPraiseId.get(row.id) ?? null };
      });

      return {
        data,
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit),
        },
      };
    } catch (error) {
      lastError = error;
      if (useFtsAttempt && query.search) {
        useFtsAttempt = false;
        console.warn(
          JSON.stringify({
            msg: 'api.plpcg.praises.fts_fallback',
            error: error instanceof Error ? error.message : String(error),
          })
        );
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to fetch praises');
}

// ---------------------------------------------------------------------------
// GET /api/plpcg/catalog — dump compacto do catálogo inteiro para o app PLPCG.
//
// O app guarda tudo em Isar e revalida por ETag: `If-None-Match` igual → 304
// sem corpo. O ETag é o hash de `{kinds, kindClasses, praises}` (sem
// `generatedAt`, que mudaria a cada chamada). Materiais vão só como
// `{id, kind, type}` — o `r2_key` segue `assets/praises/<praiseId>/<materialId>.<type>` (mesmo
// padrão gravado por driveImport.ts e pelo bulk-upload em routes/praises.ts:
// a extensão É o `type`, sem mapa de alias) e o app o reconstrói; quando o
// `r2_key` gravado foge do padrão — inclusive `youtube`, que nunca tem objeto
// no R2 — vai em `r2` explícito para o app não apontar para um objeto
// inexistente. Sem `size`: a tabela não guarda o tamanho e um HEAD por objeto
// no R2 é caro demais para um dump do catálogo inteiro.
// ---------------------------------------------------------------------------

export type PlpcgCatalogMaterial = {
  id: string;
  kind: string | null;
  type: string;
  url?: string;
  r2?: string;
};

type CatalogPraiseRow = {
  id: string;
  short_id?: string | null;
  group_id?: string | null;
  name: string;
  number: string | null;
  author: string | null;
  rhythm: string | null;
  tonality: string | null;
  lyrics: string | null;
};

type CatalogMaterialRow = {
  id: string;
  praise_id: string;
  type: string;
  material_kind: string | null;
  url: string | null;
  r2_key: string | null;
};

type CatalogTagRow = { praise_id: string; label: string };

type CatalogKindTaxonomyRow = {
  id: string;
  class_id: string | null;
  parent_id: string | null;
  sort_order: number | null;
};

type CatalogKindClassRow = { id: string; label: string };

/** Item de `kinds` no dump: chaves de taxonomia só quando preenchidas (spec filtro-materiais §3.2). */
export type PlpcgCatalogKind = {
  id: string;
  name: string;
  class?: string;
  parent?: string;
  order?: number;
};

/**
 * Tipos cujo r2_key segue o padrão de upload — extensão = o próprio `type`
 * (driveImport.ts:104 e o bulk-upload em routes/praises.ts gravam
 * `assets/praises/<praiseId>/<materialId>.<type>` direto, sem mapa de
 * alias como `audio` → `mp3`). `youtube` fica de fora de propósito: não tem
 * objeto no R2, o material vive só por `url`.
 */
const CATALOG_R2_TYPES = new Set(['pdf', 'mp3', 'audio', 'chord', 'gestures']);

/** r2_key que o app reconstrói para este material; `null` quando o tipo não vive no R2. */
export function derivedCatalogR2Key(praiseId: string, materialId: string, type: string): string | null {
  const normalized = (type ?? '').toLowerCase();
  return CATALOG_R2_TYPES.has(normalized)
    ? `assets/praises/${praiseId}/${materialId}.${normalized}`
    : null;
}

/** Remove o prefixo `W/` de um ETag fraco — compressão de borda pode enfraquecer o ETag no caminho. */
function stripWeakEtag(value: string): string {
  return value.startsWith('W/') ? value.slice(2) : value;
}

async function sha256Hex32(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

export type PlpcgCatalogDeps = {
  /** SQL de rótulo de tag com pai (`TAG_LABEL_SQL` de praiseQuery.ts) — mesmo rótulo de /api/plpcg/praises. */
  tagLabelSql: string;
};

export type PlpcgCatalogResult = {
  status: 200 | 304;
  headers: Record<string, string>;
  body: string;
};

export async function buildPlpcgCatalog(
  db: D1Database,
  deps: PlpcgCatalogDeps,
  ifNoneMatch: string | undefined
): Promise<PlpcgCatalogResult> {
  const praisesResult = await db
    .prepare(
      `SELECT p.id, p.short_id, p.group_id, p.name, p.number, p.author, p.rhythm, p.tonality, p.lyrics
       FROM praises p
       ORDER BY p.number, p.name, p.id`
    )
    .all();
  const materialsResult = await db
    .prepare(
      `SELECT pm.id, pm.praise_id, pm.type, pm.material_kind, pm.url, pm.r2_key
       FROM praise_materials pm
       ORDER BY pm.praise_id, pm.id`
    )
    .all();
  const tagsResult = await db
    .prepare(
      `SELECT DISTINCT pt.praise_id, ${deps.tagLabelSql} AS label
       FROM praise_tags pt
       JOIN tags t ON t.id = pt.tag_id
       LEFT JOIN tags tp ON t.parent_id = tp.id
       ORDER BY label`
    )
    .all();
  const kindLabels = await loadMaterialKindLabels(db);

  // Classe, família e ordem (migração 024). O Worker exige a migração aplicada
  // antes do deploy: sem as colunas esta consulta falha e o dump vira 500.
  const taxonomyResult = await db
    .prepare(`SELECT id, class_id, parent_id, sort_order FROM material_kinds`)
    .all();
  const classesResult = await db
    .prepare(`SELECT id, label FROM material_kind_classes ORDER BY sort_order`)
    .all();
  const taxonomy = new Map<string, CatalogKindTaxonomyRow>();
  for (const row of (taxonomyResult.results ?? []) as CatalogKindTaxonomyRow[]) {
    taxonomy.set(row.id, row);
  }

  const materialsByPraise = new Map<string, PlpcgCatalogMaterial[]>();
  const kindIds = new Set<string>();
  for (const row of (materialsResult.results ?? []) as CatalogMaterialRow[]) {
    const material: PlpcgCatalogMaterial = {
      id: row.id,
      kind: row.material_kind ?? null,
      type: row.type,
    };
    if (row.material_kind) kindIds.add(row.material_kind);
    if (row.url) material.url = row.url;
    const derived = derivedCatalogR2Key(row.praise_id, row.id, row.type);
    if (row.r2_key && row.r2_key !== derived) {
      material.r2 = row.r2_key;
    }
    const list = materialsByPraise.get(row.praise_id) ?? [];
    list.push(material);
    materialsByPraise.set(row.praise_id, list);
  }

  const tagsByPraise = new Map<string, string[]>();
  for (const row of (tagsResult.results ?? []) as CatalogTagRow[]) {
    const list = tagsByPraise.get(row.praise_id) ?? [];
    list.push(row.label);
    tagsByPraise.set(row.praise_id, list);
  }

  // Um pai sem material entra quando um filho tem: sem ele o app não monta a família.
  for (const id of [...kindIds]) {
    const parent = taxonomy.get(id)?.parent_id;
    if (parent) kindIds.add(parent);
  }

  const kinds: PlpcgCatalogKind[] = [...kindIds]
    .map((id) => {
      const kind: PlpcgCatalogKind = { id, name: labelFor(kindLabels, id) };
      const row = taxonomy.get(id);
      if (row?.class_id) kind.class = row.class_id;
      if (row?.parent_id) kind.parent = row.parent_id;
      if (row?.sort_order != null) kind.order = row.sort_order;
      return kind;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const usedClasses = new Set(kinds.map((k) => k.class).filter((c): c is string => !!c));
  const kindClasses = ((classesResult.results ?? []) as CatalogKindClassRow[])
    .filter((c) => usedClasses.has(c.id))
    .map(({ id, label }) => ({ id, label }));

  const praises = ((praisesResult.results ?? []) as CatalogPraiseRow[]).map((row) => {
    const praise: Record<string, unknown> = {
      id: row.id,
      // short_id nulo (praise fora do gatilho) a chave some, em vez de ir `null`;
      // a coluna em si é obrigatória (migração 023 antes do deploy).
      ...(row.short_id ? { shortId: row.short_id } : {}),
      // group_id é chave opaca (id do praise âncora); sem grupo a chave some,
      // no molde do shortId — o app junta os membros (spec coldigui §3.1).
      ...(row.group_id && row.group_id.trim() ? { groupId: row.group_id } : {}),
      number: row.number ?? '',
      name: row.name,
      author: row.author ?? '',
      rhythm: row.rhythm ?? '',
      tonality: row.tonality ?? '',
      tags: tagsByPraise.get(row.id) ?? [],
    };
    if (typeof row.lyrics === 'string' && row.lyrics.trim().length > 0) {
      praise.lyrics = row.lyrics;
    }
    praise.materials = materialsByPraise.get(row.id) ?? [];
    return praise;
  });

  const etag = `"${await sha256Hex32(JSON.stringify({ kinds, kindClasses, praises }))}"`;
  const headers: Record<string, string> = {
    ETag: etag,
    'Cache-Control': 'public, max-age=300',
    // ETag não é um header CORS-safelisted; sem isto o client web sempre lê `null` e refaz o dump inteiro a cada sync.
    'Access-Control-Expose-Headers': 'ETag',
  };

  if (ifNoneMatch && stripWeakEtag(ifNoneMatch) === stripWeakEtag(etag)) {
    return { status: 304, headers, body: '' };
  }

  const body = JSON.stringify({ generatedAt: new Date().toISOString(), kindClasses, kinds, praises });
  return { status: 200, headers, body };
}
