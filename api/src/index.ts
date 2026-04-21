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

// GET /api/praises - List all praises with optional search
app.get('/api/praises', async (c) => {
  const search = c.req.query('q') || '';
  const page = parseInt(c.req.query('page') || '1', 10);
  const limit = parseInt(c.req.query('limit') || '20', 10);
  const offset = (page - 1) * limit;

  try {
    let query: string;
    let bindings: (string | number)[];

    if (search) {
      // Search in name and lyrics fields
      query = `
        SELECT 
          p.id, p.name, p.number, p.author, p.rhythm, p.tonality, p.category, p.lyrics,
          GROUP_CONCAT(DISTINCT pt.tag_id) as tag_ids
        FROM praises p
        LEFT JOIN praise_tags pt ON p.id = pt.praise_id
        WHERE p.name LIKE ? OR p.lyrics LIKE ?
        GROUP BY p.id
        ORDER BY p.number ASC
        LIMIT ? OFFSET ?
      `;
      const searchPattern = `%${search}%`;
      bindings = [searchPattern, searchPattern, limit, offset];
    } else {
      query = `
        SELECT 
          p.id, p.name, p.number, p.author, p.rhythm, p.tonality, p.category, p.lyrics,
          GROUP_CONCAT(DISTINCT pt.tag_id) as tag_ids
        FROM praises p
        LEFT JOIN praise_tags pt ON p.id = pt.praise_id
        GROUP BY p.id
        ORDER BY p.number ASC
        LIMIT ? OFFSET ?
      `;
      bindings = [limit, offset];
    }

    const result = await c.env.DB.prepare(query).bind(...bindings).all();
    
    // Get total count for pagination
    let countQuery: string;
    let countBindings: string[];
    
    if (search) {
      countQuery = `
        SELECT COUNT(*) as total FROM praises 
        WHERE name LIKE ? OR lyrics LIKE ?
      `;
      const searchPattern = `%${search}%`;
      countBindings = [searchPattern, searchPattern];
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
  const r2Key = c.req.path.replace('/assets/', 'storage/');
  
  const object = await c.env.ASSETS.get(r2Key);
  
  if (!object) {
    return c.json({ error: 'File not found' }, 404);
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
  c.header('Content-Disposition', `inline; filename="${r2Key.split('/').pop()}"`);
  
  return c.body(object.body);
});

// Health check endpoint
app.get('/health', (c) => c.json({ status: 'ok' }));

export default app;
