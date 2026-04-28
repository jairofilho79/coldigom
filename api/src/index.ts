import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Env = {
  DB: D1Database;
  ASSETS: R2Bucket;
};

interface PraiseResult {
  id: string;
  name: string;
  number: string;
  author: string;
  rhythm: string;
  tonality: string;
  category: string;
  lyrics: string;
  tag_ids: string | null;
}

const app = new Hono<{ Bindings: Env }>();

// Enable CORS for all routes
app.use('/*', cors());

const VALID_SORT_FIELDS = ['number', 'name', 'rhythm', 'tonality', 'category', 'author', 'created_at'] as const;
type SortField = typeof VALID_SORT_FIELDS[number];

const NOCASE_FIELDS: SortField[] = ['name', 'author', 'rhythm', 'tonality', 'category'];

function buildWhereClause(params: {
  search?: string;
  tags?: string[];
  rhythm?: string[];
  tonality?: string[];
  category?: string[];
  numberMin?: number;
  numberMax?: number;
}): { clause: string; bindings: (string | number)[] } {
  const conditions: string[] = [];
  const bindings: (string | number)[] = [];

  if (params.search) {
    conditions.push(`(p.name LIKE ? OR p.lyrics LIKE ? OR p.author LIKE ? OR p.rhythm LIKE ? OR p.tonality LIKE ? OR p.category LIKE ?)`);
    const pattern = `%${params.search}%`;
    bindings.push(pattern, pattern, pattern, pattern, pattern, pattern);
  }

  if (params.tags && params.tags.length > 0) {
    conditions.push(`pt.tag_id IN (${params.tags.map(() => '?').join(',')})`);
    bindings.push(...params.tags);
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
app.get('/api/praises', async (c) => {
  const search = c.req.query('q') || '';
  const page = parseInt(c.req.query('page') || '1', 10);
  const limit = parseInt(c.req.query('limit') || '20', 10);
  const offset = (page - 1) * limit;

  const tags = c.req.query('tags') ? c.req.query('tags')!.split(',').filter(Boolean) : undefined;
  const rhythm = c.req.query('rhythm') ? c.req.query('rhythm')!.split(',').filter(Boolean) : undefined;
  const tonality = c.req.query('tonality') ? c.req.query('tonality')!.split(',').filter(Boolean) : undefined;
  const category = c.req.query('category') ? c.req.query('category')!.split(',').filter(Boolean) : undefined;
  const numberMin = c.req.query('numberMin') ? parseInt(c.req.query('numberMin')!, 10) : undefined;
  const numberMax = c.req.query('numberMax') ? parseInt(c.req.query('numberMax')!, 10) : undefined;

  const sortParam = c.req.query('sort') as SortField | undefined;
  const sort = VALID_SORT_FIELDS.includes(sortParam!) ? sortParam! : 'number';
  const order = c.req.query('order')?.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

  try {
    const { clause: whereClause, bindings: whereBindings } = buildWhereClause({
      search: search || undefined,
      tags,
      rhythm,
      tonality,
      category,
      numberMin,
      numberMax,
    });

    const hasTagFilter = tags && tags.length > 0;
    const joinClause = hasTagFilter ? 'INNER JOIN praise_tags pt ON p.id = pt.praise_id' : 'LEFT JOIN praise_tags pt ON p.id = pt.praise_id';
    const groupClause = hasTagFilter ? 'GROUP BY p.id HAVING COUNT(DISTINCT pt.tag_id) = ?' : 'GROUP BY p.id';

    let query: string;
    const bindings: (string | number)[] = [...whereBindings];

    if (hasTagFilter) {
      bindings.push(tags!.length);
    }

    const collate = NOCASE_FIELDS.includes(sort) ? ' COLLATE NOCASE' : '';
    const orderClause = sort === 'created_at'
      ? `ORDER BY p.created_at ${order}`
      : `ORDER BY p.${sort} ${order}${collate}`;

    if (whereClause || hasTagFilter) {
      query = `
        SELECT 
          p.id, p.name, p.number, p.author, p.rhythm, p.tonality, p.category, p.lyrics,
          GROUP_CONCAT(DISTINCT pt.tag_id) as tag_ids
        FROM praises p
        ${joinClause}
        ${whereClause}
        ${groupClause}
        ${orderClause}
        LIMIT ? OFFSET ?
      `;
      bindings.push(limit, offset);
    } else {
      query = `
        SELECT 
          p.id, p.name, p.number, p.author, p.rhythm, p.tonality, p.category, p.lyrics,
          GROUP_CONCAT(DISTINCT pt.tag_id) as tag_ids
        FROM praises p
        LEFT JOIN praise_tags pt ON p.id = pt.praise_id
        GROUP BY p.id
        ${orderClause}
        LIMIT ? OFFSET ?
      `;
      bindings.push(limit, offset);
    }

    const result = await c.env.DB.prepare(query).bind(...bindings).all();

    let countQuery: string;
    let countBindings: (string | number)[] = [...whereBindings];

    if (hasTagFilter) {
      countQuery = `
        SELECT COUNT(*) as total FROM (
          SELECT p.id FROM praises p
          ${joinClause}
          ${whereClause}
          ${groupClause}
        )
      `;
      countBindings.push(tags!.length);
    } else if (whereClause) {
      countQuery = `SELECT COUNT(*) as total FROM praises p ${whereClause}`;
    } else {
      countQuery = `SELECT COUNT(*) as total FROM praises`;
      countBindings = [];
    }

    const countResult = await c.env.DB.prepare(countQuery).bind(...countBindings).first();
    const total = (countResult?.total as number) || 0;

    return c.json({
      data: result.results,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching praises:', error);
    return c.json({ error: 'Failed to fetch praises' }, 500);
  }
});

// GET /api/praises/filters - Get filter options
app.get('/api/praises/filters', async (c) => {
  try {
    const [rhythmsResult, tonalitiesResult, categoriesResult, tagsResult] = await Promise.all([
      c.env.DB.prepare(`SELECT DISTINCT rhythm FROM praises WHERE rhythm IS NOT NULL AND rhythm != '' ORDER BY rhythm`).all(),
      c.env.DB.prepare(`SELECT DISTINCT tonality FROM praises WHERE tonality IS NOT NULL AND tonality != '' ORDER BY tonality`).all(),
      c.env.DB.prepare(`SELECT DISTINCT category FROM praises WHERE category IS NOT NULL AND category != '' ORDER BY category`).all(),
      c.env.DB.prepare(`
        SELECT t.id, t.name, COUNT(pt.praise_id) as count 
        FROM tags t 
        LEFT JOIN praise_tags pt ON t.id = pt.tag_id 
        GROUP BY t.id 
        ORDER BY t.name
      `).all(),
    ]);

    return c.json({
      rhythms: (rhythmsResult.results as { rhythm: string }[]).map(r => r.rhythm),
      tonalities: (tonalitiesResult.results as { tonality: string }[]).map(r => r.tonality),
      categories: (categoriesResult.results as { category: string }[]).map(r => r.category),
      tags: (tagsResult.results as { id: string; name: string; count: number }[]).map(r => ({
        id: r.id,
        name: r.name,
        count: r.count,
      })),
    });
  } catch (error) {
    console.error('Error fetching filters:', error);
    return c.json({ error: 'Failed to fetch filters' }, 500);
  }
});

// GET /api/praises/:id - Get single praise with materials
app.get('/api/praises/:id', async (c) => {
  const id = c.req.param('id');

  try {
    // Fetch praise with tags
    const praiseQuery = `
      SELECT 
        p.id, p.name, p.number, p.author, p.rhythm, p.tonality, p.category, p.lyrics,
        GROUP_CONCAT(pt.tag_id) as tag_ids
      FROM praises p
      LEFT JOIN praise_tags pt ON p.id = pt.praise_id
      WHERE p.id = ?
      GROUP BY p.id
    `;
    const praiseResult = await c.env.DB.prepare(praiseQuery).bind(id).first() as PraiseResult | null;

    if (!praiseResult) {
      return c.json({ error: 'Praise not found' }, 404);
    }

    // Fetch materials for this praise
    const materialsQuery = `
      SELECT 
        id, praise_id, material_kind, type, r2_key, file_path_legacy, source_material_id, url
      FROM praise_materials
      WHERE praise_id = ?
    `;
    const materialsResult = await c.env.DB.prepare(materialsQuery).bind(id).all();

    // Fetch tag names
    const tagIds = praiseResult.tag_ids ? praiseResult.tag_ids.split(',') : [];
    let tags: { id: string; name: string }[] = [];
    
    if (tagIds.length > 0) {
      const placeholders = tagIds.map(() => '?').join(',');
      const tagsQuery = `SELECT id, name FROM tags WHERE id IN (${placeholders})`;
      const tagsResult = await c.env.DB.prepare(tagsQuery).bind(...tagIds).all();
      tags = tagsResult.results as { id: string; name: string }[];
    }

    // Fetch material kind names
    const materialKindsQuery = `SELECT id, name FROM material_kinds`;
    const materialKindsResult = await c.env.DB.prepare(materialKindsQuery).all();
    const materialKindsMap = new Map(
      (materialKindsResult.results as { id: string; name: string }[]).map(k => [k.id, k.name])
    );

    // Enrich materials with kind names
    const materials = (materialsResult.results as any[]).map(m => ({
      ...m,
      material_kind_name: materialKindsMap.get(m.material_kind) || 'Unknown',
    }));

    return c.json({
      data: {
        ...praiseResult,
        tag_ids: tagIds,
        tags,
        materials,
      },
    });
  } catch (error) {
    console.error('Error fetching praise:', error);
    return c.json({ error: 'Failed to fetch praise' }, 500);
  }
});

// GET /api/materials/kinds - List all material kinds
app.get('/api/materials/kinds', async (c) => {
  try {
    const result = await c.env.DB.prepare(
      `SELECT id, name FROM material_kinds ORDER BY name ASC`
    ).all();
    return c.json({ data: result.results });
  } catch (error) {
    console.error('Error fetching material kinds:', error);
    return c.json({ error: 'Failed to fetch material kinds' }, 500);
  }
});

// GET /api/tags - List all tags
app.get('/api/tags', async (c) => {
  try {
    const result = await c.env.DB.prepare(
      `SELECT id, name FROM tags ORDER BY name ASC`
    ).all();
    return c.json({ data: result.results });
  } catch (error) {
    console.error('Error fetching tags:', error);
    return c.json({ error: 'Failed to fetch tags' }, 500);
  }
});

// GET /assets/* - Serve files from R2
app.get('/assets/*', async (c) => {
  const r2Key = c.req.path.replace(/^\/assets\//, 'storage/assets/');
  const rangeHeader = c.req.header('range') ?? c.req.header('Range');
  
  const metadata = await c.env.ASSETS.head(r2Key);
  if (!metadata) {
    return c.json({ error: 'File not found' }, 404);
  }
  const totalSize = metadata.size;
  let object: R2ObjectBody | null = null;
  let status = 200;
  
  if (rangeHeader && totalSize > 0) {
    const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
    if (!match) {
      c.header('Accept-Ranges', 'bytes');
      c.header('Content-Range', `bytes */${totalSize}`);
      return c.body(null, 416);
    }

    const [, startRaw, endRaw] = match;
    let start = startRaw === '' ? 0 : Number.parseInt(startRaw, 10);
    let end = endRaw === '' ? totalSize - 1 : Number.parseInt(endRaw, 10);

    if (startRaw === '' && endRaw !== '') {
      const suffixLength = Number.parseInt(endRaw, 10);
      if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
        c.header('Accept-Ranges', 'bytes');
        c.header('Content-Range', `bytes */${totalSize}`);
        return c.body(null, 416);
      }
      start = Math.max(totalSize - suffixLength, 0);
      end = totalSize - 1;
    }

    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end < start ||
      start >= totalSize
    ) {
      c.header('Accept-Ranges', 'bytes');
      c.header('Content-Range', `bytes */${totalSize}`);
      return c.body(null, 416);
    }

    end = Math.min(end, totalSize - 1);
    const length = end - start + 1;
    object = await c.env.ASSETS.get(r2Key, { range: { offset: start, length } });
    if (!object) {
      return c.json({ error: 'File not found' }, 404);
    }
    status = 206;
    c.header('Content-Range', `bytes ${start}-${end}/${totalSize}`);
    c.header('Content-Length', String(length));
  } else {
    object = await c.env.ASSETS.get(r2Key);
    if (!object) {
      return c.json({ error: 'File not found' }, 404);
    }
    if (totalSize > 0) {
      c.header('Content-Length', String(totalSize));
    }
  }
  
  const ext = r2Key.split('.').pop()?.toLowerCase();
  const contentTypes: Record<string, string> = {
    pdf: 'application/pdf',
    mp3: 'audio/mpeg',
    mid: 'audio/midi',
    midi: 'audio/midi',
    chord: 'text/plain',
  };
  
  const contentType = contentTypes[ext || ''] || 'application/octet-stream';
  
  c.header('Content-Type', contentType);
  c.header('Accept-Ranges', 'bytes');
  c.header('Content-Disposition', `inline; filename="${r2Key.split('/').pop()}"`);
  
  c.status(status as 200 | 206);
  return c.body(object.body);
});

// Root endpoint
app.get('/', (c) => c.json({ name: 'coldigom-api', version: '1.0.0' }));

// Health check endpoint
app.get('/health', (c) => c.json({ status: 'ok' }));

export default app;
