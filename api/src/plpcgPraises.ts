import { labelFor, loadMaterialKindLabels } from './materialKindLabels';

export type PlpcgListQuery = {
  search: string;
  page: number;
  limit: number;
  offset: number;
  tags?: string[];
  rhythm?: string[];
  tonality?: string[];
  category?: string[];
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
  category?: string[];
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
  category: string | null;
  group_id: string | null;
  tag_ids: string | null;
  tag_names: string | null;
  has_lyrics: number;
};

export function parsePlpcgListQuery(c: {
  req: { query: (key: string) => string | undefined };
}): PlpcgListQuery {
  const search = c.req.query('q') || '';
  const page = parseInt(c.req.query('page') || '1', 10);
  const limit = parseInt(c.req.query('limit') || '20', 10);
  const offset = (page - 1) * limit;

  const tags = c.req.query('tags') ? c.req.query('tags')!.split(',').filter(Boolean) : undefined;
  const rhythm = c.req.query('rhythm') ? c.req.query('rhythm')!.split(',').filter(Boolean) : undefined;
  const tonality = c.req.query('tonality')
    ? c.req.query('tonality')!.split(',').filter(Boolean)
    : undefined;
  const category = c.req.query('category')
    ? c.req.query('category')!.split(',').filter(Boolean)
    : undefined;
  const materialKinds = c.req.query('materialKinds')
    ? c.req.query('materialKinds')!.split(',').filter(Boolean)
    : undefined;
  const numberMin = c.req.query('numberMin') ? parseInt(c.req.query('numberMin')!, 10) : undefined;
  const numberMax = c.req.query('numberMax') ? parseInt(c.req.query('numberMax')!, 10) : undefined;
  const sortParam = c.req.query('sort') || undefined;
  const order = c.req.query('order')?.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

  return {
    search,
    page,
    limit,
    offset,
    tags,
    rhythm,
    tonality,
    category,
    materialKinds,
    numberMin,
    numberMax,
    sortParam,
    order,
  };
}

export async function listPlpcgPraises(
  db: D1Database,
  query: PlpcgListQuery,
  deps: PlpcgListDeps
): Promise<{
  data: Array<Omit<ListRow, 'has_lyrics'> & { materials: SlimMaterial[] }>;
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
        category: query.category,
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
        p.id, p.name, p.number, p.author, p.rhythm, p.tonality, p.category, p.group_id,
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
        return { ...row, materials };
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
