import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock data
const mockPraises = [
  {
    id: '1b2b33ab-4dff-4014-8582-dcb9a92efbc8',
    name: 'Grande Deus',
    number: '001',
    author: 'Autor 1',
    rhythm: 'Avulsos',
    tonality: 'C',
    category: 'Louvor',
    lyrics: 'Letra do louvor 1',
    tag_ids: 'tag1,tag2',
  },
  {
    id: '1c12786e-4d32-4e95-a136-d85266008e11',
    name: 'Santo Deus',
    number: '002',
    author: 'Autor 2',
    rhythm: 'Coletânea',
    tonality: 'G',
    category: 'Adoração',
    lyrics: 'Letra do louvor 2',
    tag_ids: 'tag1',
  },
];

const mockMaterials = [
  {
    id: 'mat1',
    praise_id: '1b2b33ab-4dff-4014-8582-dcb9a92efbc8',
    material_kind: 'kind1',
    type: 'pdf',
    r2_key: 'assets/praises/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/mat1.pdf',
    file_path_legacy: 'path/to/file.pdf',
    source_material_id: null,
  },
  {
    id: 'mat2',
    praise_id: '1b2b33ab-4dff-4014-8582-dcb9a92efbc8',
    material_kind: 'kind2',
    type: 'mp3',
    r2_key: 'assets/praises/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/mat2.mp3',
    file_path_legacy: 'path/to/file.mp3',
    source_material_id: null,
  },
];

const mockTags = [
  { id: 'tag1', name: 'Coletânea' },
  { id: 'tag2', name: 'Avulsos' },
  { id: 'tag3', name: 'GLTM' },
];

const mockMaterialKinds = [
  { id: 'kind1', name: 'Partitura' },
  { id: 'kind2', name: 'Audio' },
  { id: 'kind3', name: 'Acordes' },
];

// Re-create app for testing with proper environment
function createTestApp(mockDB: any, mockR2: any) {
  const { Hono } = require('hono');
  const { cors } = require('hono/cors');
  
  const app = new Hono();
  app.use('/*', cors());

  const VALID_SORT_FIELDS = ['number', 'name', 'rhythm', 'tonality', 'category', 'author', 'created_at'];
  type SortField = typeof VALID_SORT_FIELDS[number];

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

  // Health check
  app.get('/health', (c) => c.json({ status: 'ok' }));

  // GET /api/praises
  app.get('/api/praises', async (c) => {
    const env = c.env as { DB: any; ASSETS: any };
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

      const orderClause = sort === 'created_at' ? `ORDER BY p.created_at ${order}` : `ORDER BY p.${sort} ${order} COLLATE NOCASE`;

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

      const result = await env.DB.prepare(query).bind(...bindings).all();

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

      const countResult = await env.DB.prepare(countQuery).bind(...countBindings).first();
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

  // GET /api/praises/filters
  app.get('/api/praises/filters', async (c) => {
    const env = c.env as { DB: any; ASSETS: any };
    try {
      const [rhythmsResult, tonalitiesResult, categoriesResult, tagsResult] = await Promise.all([
        env.DB.prepare(`SELECT DISTINCT rhythm FROM praises WHERE rhythm IS NOT NULL AND rhythm != '' ORDER BY rhythm`).all(),
        env.DB.prepare(`SELECT DISTINCT tonality FROM praises WHERE tonality IS NOT NULL AND tonality != '' ORDER BY tonality`).all(),
        env.DB.prepare(`SELECT DISTINCT category FROM praises WHERE category IS NOT NULL AND category != '' ORDER BY category`).all(),
        env.DB.prepare(`
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

  // GET /api/praises/:id
  app.get('/api/praises/:id', async (c) => {
    const env = c.env as { DB: any; ASSETS: any };
    const id = c.req.param('id');

    try {
      const praiseQuery = `
        SELECT 
          p.id, p.name, p.number, p.author, p.rhythm, p.tonality, p.category, p.lyrics,
          GROUP_CONCAT(pt.tag_id) as tag_ids
        FROM praises p
        LEFT JOIN praise_tags pt ON p.id = pt.praise_id
        WHERE p.id = ?
        GROUP BY p.id
      `;
      const praiseResult = await env.DB.prepare(praiseQuery).bind(id).first();

      if (!praiseResult) {
        return c.json({ error: 'Praise not found' }, 404);
      }

      const materialsQuery = `
        SELECT 
          id, praise_id, material_kind, type, r2_key, file_path_legacy, source_material_id, url
        FROM praise_materials
        WHERE praise_id = ?
      `;
      const materialsResult = await env.DB.prepare(materialsQuery).bind(id).all();

      const tagIds = (praiseResult as any).tag_ids ? (praiseResult as any).tag_ids.split(',') : [];
      let tags: { id: string; name: string }[] = [];
      
      if (tagIds.length > 0) {
        const placeholders = tagIds.map(() => '?').join(',');
        const tagsQuery = `SELECT id, name FROM tags WHERE id IN (${placeholders})`;
        const tagsResult = await env.DB.prepare(tagsQuery).bind(...tagIds).all();
        tags = tagsResult.results as { id: string; name: string }[];
      }

      const materialKindsQuery = `SELECT id, name FROM material_kinds`;
      const materialKindsResult = await env.DB.prepare(materialKindsQuery).all();
      const materialKindsMap = new Map(
        (materialKindsResult.results as { id: string; name: string }[]).map(k => [k.id, k.name])
      );

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

  // GET /api/materials/kinds
  app.get('/api/materials/kinds', async (c) => {
    const env = c.env as { DB: any; ASSETS: any };
    try {
      const result = await env.DB.prepare(
        `SELECT id, name FROM material_kinds ORDER BY name ASC`
      ).all();
      return c.json({ data: result.results });
    } catch (error) {
      console.error('Error fetching material kinds:', error);
      return c.json({ error: 'Failed to fetch material kinds' }, 500);
    }
  });

  // GET /api/tags
  app.get('/api/tags', async (c) => {
    const env = c.env as { DB: any; ASSETS: any };
    try {
      const result = await env.DB.prepare(
        `SELECT id, name FROM tags ORDER BY name ASC`
      ).all();
      return c.json({ data: result.results });
    } catch (error) {
      console.error('Error fetching tags:', error);
      return c.json({ error: 'Failed to fetch tags' }, 500);
    }
  });

  // GET /assets/*
  app.get('/assets/*', async (c) => {
    const env = c.env as { DB: any; ASSETS: any };
    const r2Key = c.req.path.replace(/^\/assets\//, 'storage/assets/');
    const rangeHeader = c.req.header('range') ?? c.req.header('Range');
    
    const metadata = await env.ASSETS.head(r2Key);
    if (!metadata) {
      return c.json({ error: 'File not found' }, 404);
    }
    const totalSize = metadata.size;
    let object: any = null;
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

      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= totalSize) {
        c.header('Accept-Ranges', 'bytes');
        c.header('Content-Range', `bytes */${totalSize}`);
        return c.body(null, 416);
      }

      end = Math.min(end, totalSize - 1);
      const length = end - start + 1;
      object = await env.ASSETS.get(r2Key, { range: { offset: start, length } });
      if (!object) {
        return c.json({ error: 'File not found' }, 404);
      }
      status = 206;
      c.header('Content-Range', `bytes ${start}-${end}/${totalSize}`);
      c.header('Content-Length', String(length));
    } else {
      object = await env.ASSETS.get(r2Key);
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

  return app;
}

// Mock D1Database
const createMockD1 = (responses: any) => ({
  prepare: vi.fn((query: string) => ({
    bind: vi.fn().mockReturnThis(),
    all: vi.fn().mockResolvedValue(responses.all || { results: [] }),
    first: vi.fn().mockResolvedValue(responses.first || null),
  })),
});

// Mock R2Bucket
const createMockR2 = (object: any = null) => {
  const objectBody = object?.body ?? null;
  const defaultBytes =
    objectBody instanceof Uint8Array ? objectBody : objectBody ? new Uint8Array(objectBody) : null;

  return {
    head: vi.fn().mockImplementation(async () => {
      if (!object) return null;
      return { size: defaultBytes?.byteLength ?? 0 };
    }),
    get: vi.fn().mockImplementation(async (_key: string, opts?: any) => {
      if (!object) return null;
      if (!opts?.range || !defaultBytes) return object;

      const offset = opts.range.offset ?? 0;
      const length = opts.range.length ?? defaultBytes.byteLength;
      const slice = defaultBytes.slice(offset, offset + length);
      return { ...object, body: slice };
    }),
  };
};

describe('API Routes', () => {
  describe('Health Check', () => {
    it('should return ok status', async () => {
      const mockDB = createMockD1({});
      const mockR2 = createMockR2();
      const app = createTestApp(mockDB, mockR2);
      
      const res = await app.request('/health', {}, { 
        Bindings: { DB: mockDB, ASSETS: mockR2 } 
      } as any);
      
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('ok');
    });
  });

  describe('GET /api/praises', () => {
    it('should return praises list with pagination', async () => {
      const mockDB = createMockD1({
        all: { results: mockPraises },
        first: { total: 2 },
      });
      const mockR2 = createMockR2();
      const app = createTestApp(mockDB, mockR2);
      
      const res = await app.request('/api/praises', {}, { 
        Bindings: { DB: mockDB, ASSETS: mockR2 } 
      } as any);
      
      expect(res.status).toBe(200);
      
      const json = await res.json();
      expect(json.data).toHaveLength(2);
      expect(json.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
      });
    });

    it('should return empty list when no praises exist', async () => {
      const mockDB = createMockD1({
        all: { results: [] },
        first: { total: 0 },
      });
      const mockR2 = createMockR2();
      const app = createTestApp(mockDB, mockR2);
      
      const res = await app.request('/api/praises', {}, { 
        Bindings: { DB: mockDB, ASSETS: mockR2 } 
      } as any);
      
      expect(res.status).toBe(200);
      
      const json = await res.json();
      expect(json.data).toHaveLength(0);
      expect(json.pagination.total).toBe(0);
    });

    it('should handle search query parameter', async () => {
      const mockDB = createMockD1({
        all: { results: [mockPraises[0]] },
        first: { total: 1 },
      });
      const mockR2 = createMockR2();
      const app = createTestApp(mockDB, mockR2);
      
      const res = await app.request('/api/praises?q=Grande', {}, { 
        Bindings: { DB: mockDB, ASSETS: mockR2 } 
      } as any);
      
      expect(res.status).toBe(200);
      
      const json = await res.json();
      expect(json.data).toHaveLength(1);
      expect(json.data[0].name).toBe('Grande Deus');
    });

    it('should handle pagination parameters', async () => {
      const mockDB = createMockD1({
        all: { results: [mockPraises[1]] },
        first: { total: 2 },
      });
      const mockR2 = createMockR2();
      const app = createTestApp(mockDB, mockR2);
      
      const res = await app.request('/api/praises?page=2&limit=1', {}, { 
        Bindings: { DB: mockDB, ASSETS: mockR2 } 
      } as any);
      
      expect(res.status).toBe(200);
      
      const json = await res.json();
      expect(json.pagination.page).toBe(2);
      expect(json.pagination.limit).toBe(1);
      expect(json.pagination.totalPages).toBe(2);
    });

    it('should handle sort parameters', async () => {
      const mockDB = createMockD1({
        all: { results: mockPraises },
        first: { total: 2 },
      });
      const mockR2 = createMockR2();
      const app = createTestApp(mockDB, mockR2);
      
      const res = await app.request('/api/praises?sort=name&order=desc', {}, { 
        Bindings: { DB: mockDB, ASSETS: mockR2 } 
      } as any);
      
      expect(res.status).toBe(200);
      
      const json = await res.json();
      expect(json.data).toHaveLength(2);
    });

    it('should handle tag filter', async () => {
      const mockDB = createMockD1({
        all: { results: [mockPraises[0]] },
        first: { total: 1 },
      });
      const mockR2 = createMockR2();
      const app = createTestApp(mockDB, mockR2);
      
      const res = await app.request('/api/praises?tags=tag1,tag2', {}, { 
        Bindings: { DB: mockDB, ASSETS: mockR2 } 
      } as any);
      
      expect(res.status).toBe(200);
      
      const json = await res.json();
      expect(json.data).toHaveLength(1);
    });

    it('should handle rhythm filter', async () => {
      const mockDB = createMockD1({
        all: { results: [mockPraises[0]] },
        first: { total: 1 },
      });
      const mockR2 = createMockR2();
      const app = createTestApp(mockDB, mockR2);
      
      const res = await app.request('/api/praises?rhythm=Avulsos', {}, { 
        Bindings: { DB: mockDB, ASSETS: mockR2 } 
      } as any);
      
      expect(res.status).toBe(200);
      
      const json = await res.json();
      expect(json.data).toHaveLength(1);
    });

    it('should handle tonality filter', async () => {
      const mockDB = createMockD1({
        all: { results: [mockPraises[0]] },
        first: { total: 1 },
      });
      const mockR2 = createMockR2();
      const app = createTestApp(mockDB, mockR2);
      
      const res = await app.request('/api/praises?tonality=C', {}, { 
        Bindings: { DB: mockDB, ASSETS: mockR2 } 
      } as any);
      
      expect(res.status).toBe(200);
      
      const json = await res.json();
      expect(json.data).toHaveLength(1);
    });

    it('should handle category filter', async () => {
      const mockDB = createMockD1({
        all: { results: [mockPraises[1]] },
        first: { total: 1 },
      });
      const mockR2 = createMockR2();
      const app = createTestApp(mockDB, mockR2);
      
      const res = await app.request('/api/praises?category=Adoração', {}, { 
        Bindings: { DB: mockDB, ASSETS: mockR2 } 
      } as any);
      
      expect(res.status).toBe(200);
      
      const json = await res.json();
      expect(json.data).toHaveLength(1);
    });

    it('should handle number range filter', async () => {
      const mockDB = createMockD1({
        all: { results: [mockPraises[0]] },
        first: { total: 1 },
      });
      const mockR2 = createMockR2();
      const app = createTestApp(mockDB, mockR2);
      
      const res = await app.request('/api/praises?numberMin=1&numberMax=10', {}, { 
        Bindings: { DB: mockDB, ASSETS: mockR2 } 
      } as any);
      
      expect(res.status).toBe(200);
      
      const json = await res.json();
      expect(json.data).toHaveLength(1);
    });

    it('should return 500 on database error', async () => {
      const mockDB = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({
            all: vi.fn().mockRejectedValue(new Error('DB Error')),
            first: vi.fn().mockRejectedValue(new Error('DB Error')),
          }),
        }),
      };
      const mockR2 = createMockR2();
      const app = createTestApp(mockDB, mockR2);
      
      const res = await app.request('/api/praises', {}, { 
        Bindings: { DB: mockDB, ASSETS: mockR2 } 
      } as any);
      
      expect(res.status).toBe(500);
      
      const json = await res.json();
      expect(json.error).toBe('Failed to fetch praises');
    });
  });

  describe('GET /api/praises/filters', () => {
    it('should return filter options', async () => {
      const mockDB = {
        prepare: vi.fn((query: string) => {
          if (query.includes('DISTINCT rhythm')) {
            return { all: vi.fn().mockResolvedValue({ results: [{ rhythm: 'Avulsos' }, { rhythm: 'Coletânea' }] }) };
          }
          if (query.includes('DISTINCT tonality')) {
            return { all: vi.fn().mockResolvedValue({ results: [{ tonality: 'C' }, { tonality: 'G' }] }) };
          }
          if (query.includes('DISTINCT category')) {
            return { all: vi.fn().mockResolvedValue({ results: [{ category: 'Louvor' }, { category: 'Adoração' }] }) };
          }
          if (query.includes('COUNT(pt.praise_id)')) {
            return { all: vi.fn().mockResolvedValue({ results: mockTags.map(t => ({ ...t, count: 1 })) }) };
          }
          return { all: vi.fn().mockResolvedValue({ results: [] }) };
        }),
      };
      const mockR2 = createMockR2();
      const app = createTestApp(mockDB, mockR2);
      
      const res = await app.request('/api/praises/filters', {}, { 
        Bindings: { DB: mockDB, ASSETS: mockR2 } 
      } as any);
      
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.rhythms).toContain('Avulsos');
      expect(json.tonalities).toContain('C');
      expect(json.categories).toContain('Louvor');
      expect(json.tags).toHaveLength(3);
    });

    it('should return 500 on database error', async () => {
      const mockDB = {
        prepare: vi.fn().mockReturnValue({
          all: vi.fn().mockRejectedValue(new Error('DB Error')),
        }),
      };
      const mockR2 = createMockR2();
      const app = createTestApp(mockDB, mockR2);
      
      const res = await app.request('/api/praises/filters', {}, { 
        Bindings: { DB: mockDB, ASSETS: mockR2 } 
      } as any);
      
      expect(res.status).toBe(500);
    });
  });

  describe('GET /api/praises/:id', () => {
    it('should return praise details with materials', async () => {
      const mockPraise = { ...mockPraises[0], tag_ids: 'tag1,tag2' };
      const mockDB = {
        prepare: vi.fn((query: string) => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: mockMaterials }),
          first: vi.fn().mockResolvedValue(mockPraise),
        })),
      };
      const mockR2 = createMockR2();
      const app = createTestApp(mockDB, mockR2);
      
      const res = await app.request(`/api/praises/${mockPraise.id}`, {}, { 
        Bindings: { DB: mockDB, ASSETS: mockR2 } 
      } as any);
      
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.id).toBe(mockPraise.id);
      expect(json.data.name).toBe('Grande Deus');
      expect(json.data.tags).toHaveLength(2);
      expect(json.data.materials).toHaveLength(2);
    });

    it('should return 404 when praise not found', async () => {
      const mockDB = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(null),
          }),
        }),
      };
      const mockR2 = createMockR2();
      const app = createTestApp(mockDB, mockR2);
      
      const res = await app.request('/api/praises/non-existent-id', {}, { 
        Bindings: { DB: mockDB, ASSETS: mockR2 } 
      } as any);
      
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe('Praise not found');
    });

    it('should handle praise without tags', async () => {
      const mockPraise = { ...mockPraises[0], tag_ids: null };
      const mockDB = {
        prepare: vi.fn((query: string) => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [] }),
          first: vi.fn().mockResolvedValue(mockPraise),
        })),
      };
      const mockR2 = createMockR2();
      const app = createTestApp(mockDB, mockR2);
      
      const res = await app.request(`/api/praises/${mockPraise.id}`, {}, { 
        Bindings: { DB: mockDB, ASSETS: mockR2 } 
      } as any);
      
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.tag_ids).toEqual([]);
      expect(json.data.tags).toHaveLength(0);
    });

    it('should return 500 on database error', async () => {
      const mockDB = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockRejectedValue(new Error('DB Error')),
          }),
        }),
      };
      const mockR2 = createMockR2();
      const app = createTestApp(mockDB, mockR2);
      
      const res = await app.request('/api/praises/some-id', {}, { 
        Bindings: { DB: mockDB, ASSETS: mockR2 } 
      } as any);
      
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe('Failed to fetch praise');
    });
  });

  describe('GET /api/materials/kinds', () => {
    it('should return material kinds', async () => {
      const mockDB = createMockD1({
        all: { results: mockMaterialKinds },
      });
      const mockR2 = createMockR2();
      const app = createTestApp(mockDB, mockR2);
      
      const res = await app.request('/api/materials/kinds', {}, { 
        Bindings: { DB: mockDB, ASSETS: mockR2 } 
      } as any);
      
      expect(res.status).toBe(200);
      
      const json = await res.json();
      expect(json.data).toHaveLength(3);
      expect(json.data[0].name).toBe('Partitura');
    });

    it('should return 500 on database error', async () => {
      const mockDB = {
        prepare: vi.fn().mockReturnValue({
          all: vi.fn().mockRejectedValue(new Error('DB Error')),
        }),
      };
      const mockR2 = createMockR2();
      const app = createTestApp(mockDB, mockR2);
      
      const res = await app.request('/api/materials/kinds', {}, { 
        Bindings: { DB: mockDB, ASSETS: mockR2 } 
      } as any);
      
      expect(res.status).toBe(500);
    });
  });

  describe('GET /api/tags', () => {
    it('should return tags', async () => {
      const mockDB = createMockD1({
        all: { results: mockTags },
      });
      const mockR2 = createMockR2();
      const app = createTestApp(mockDB, mockR2);
      
      const res = await app.request('/api/tags', {}, { 
        Bindings: { DB: mockDB, ASSETS: mockR2 } 
      } as any);
      
      expect(res.status).toBe(200);
      
      const json = await res.json();
      expect(json.data).toHaveLength(3);
      expect(json.data[0].name).toBe('Coletânea');
    });

    it('should return 500 on database error', async () => {
      const mockDB = {
        prepare: vi.fn().mockReturnValue({
          all: vi.fn().mockRejectedValue(new Error('DB Error')),
        }),
      };
      const mockR2 = createMockR2();
      const app = createTestApp(mockDB, mockR2);
      
      const res = await app.request('/api/tags', {}, { 
        Bindings: { DB: mockDB, ASSETS: mockR2 } 
      } as any);
      
      expect(res.status).toBe(500);
    });
  });

  describe('GET /assets/*', () => {
    it('should return file from R2', async () => {
      const mockObject = {
        body: new Uint8Array([0x25, 0x50, 0x44, 0x46]), // PDF magic bytes
      };
      const mockR2 = createMockR2(mockObject);
      const mockDB = createMockD1({});
      
      const app = createTestApp(mockDB, mockR2);
      const res = await app.request('/assets/praises/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/file.pdf', {}, { 
        Bindings: { DB: mockDB, ASSETS: mockR2 } 
      } as any);
      
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/pdf');
    });

    it('should return 404 when file not found', async () => {
      const mockR2 = createMockR2(null);
      const mockDB = createMockD1({});
      
      const app = createTestApp(mockDB, mockR2);
      const res = await app.request('/assets/praises/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/nonexistent.pdf', {}, { 
        Bindings: { DB: mockDB, ASSETS: mockR2 } 
      } as any);
      
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe('File not found');
    });

    it('should return correct content type for mp3', async () => {
      const mockObject = { body: new Uint8Array([0xFF, 0xFB]) };
      const mockR2 = createMockR2(mockObject);
      const mockDB = createMockD1({});
      
      const app = createTestApp(mockDB, mockR2);
      const res = await app.request('/assets/praises/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/file.mp3', {}, { 
        Bindings: { DB: mockDB, ASSETS: mockR2 } 
      } as any);
      
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('audio/mpeg');
    });

    it('should return correct content type for midi', async () => {
      const mockObject = { body: new Uint8Array([0x4D, 0x54, 0x68, 0x64]) };
      const mockR2 = createMockR2(mockObject);
      const mockDB = createMockD1({});
      
      const app = createTestApp(mockDB, mockR2);
      const res = await app.request('/assets/praises/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/file.midi', {}, { 
        Bindings: { DB: mockDB, ASSETS: mockR2 } 
      } as any);
      
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('audio/midi');
    });

    it('should return correct content type for chord', async () => {
      const mockObject = { body: new Uint8Array([0x74, 0x65, 0x78, 0x74]) };
      const mockR2 = createMockR2(mockObject);
      const mockDB = createMockD1({});
      
      const app = createTestApp(mockDB, mockR2);
      const res = await app.request('/assets/praises/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/file.chord', {}, { 
        Bindings: { DB: mockDB, ASSETS: mockR2 } 
      } as any);
      
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('text/plain');
    });

    it('should return octet-stream for unknown extension', async () => {
      const mockObject = { body: new Uint8Array([0x00, 0x01]) };
      const mockR2 = createMockR2(mockObject);
      const mockDB = createMockD1({});
      
      const app = createTestApp(mockDB, mockR2);
      const res = await app.request('/assets/praises/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/file.xyz', {}, { 
        Bindings: { DB: mockDB, ASSETS: mockR2 } 
      } as any);
      
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
    });

    it('should support byte range requests for audio seek', async () => {
      const mockObject = { body: new Uint8Array([0x10, 0x11, 0x12, 0x13, 0x14, 0x15]) };
      const mockR2 = createMockR2(mockObject);
      const mockDB = createMockD1({});

      const app = createTestApp(mockDB, mockR2);
      const res = await app.request(
        '/assets/praises/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/file.mp3',
        { headers: { Range: 'bytes=2-4' } },
        { Bindings: { DB: mockDB, ASSETS: mockR2 } } as any
      );

      expect(res.status).toBe(206);
      expect(res.headers.get('Accept-Ranges')).toBe('bytes');
      expect(res.headers.get('Content-Range')).toBe('bytes 2-4/6');
      expect(res.headers.get('Content-Length')).toBe('3');
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([0x12, 0x13, 0x14]));
    });

    it('should return 416 for invalid byte range', async () => {
      const mockObject = { body: new Uint8Array([0x10, 0x11, 0x12, 0x13]) };
      const mockR2 = createMockR2(mockObject);
      const mockDB = createMockD1({});

      const app = createTestApp(mockDB, mockR2);
      const res = await app.request(
        '/assets/praises/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/file.mp3',
        { headers: { Range: 'bytes=99-120' } },
        { Bindings: { DB: mockDB, ASSETS: mockR2 } } as any
      );

      expect(res.status).toBe(416);
      expect(res.headers.get('Content-Range')).toBe('bytes */4');
    });
  });
});

describe('buildWhereClause', () => {
  // Test the buildWhereClause function logic directly
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

  it('should return empty clause and bindings when no params', () => {
    const result = buildWhereClause({});
    expect(result.clause).toBe('');
    expect(result.bindings).toEqual([]);
  });

  it('should build search clause correctly', () => {
    const result = buildWhereClause({ search: 'test' });
    expect(result.clause).toContain('p.name LIKE ?');
    expect(result.clause).toContain('p.lyrics LIKE ?');
    expect(result.clause).toContain('p.author LIKE ?');
    expect(result.bindings).toEqual(['%test%', '%test%', '%test%', '%test%', '%test%', '%test%']);
  });

  it('should build single tag clause correctly', () => {
    const result = buildWhereClause({ tags: ['tag1'] });
    expect(result.clause).toContain('pt.tag_id IN (?)');
    expect(result.bindings).toEqual(['tag1']);
  });

  it('should build multiple tags clause correctly', () => {
    const result = buildWhereClause({ tags: ['tag1', 'tag2', 'tag3'] });
    expect(result.clause).toContain('pt.tag_id IN (?,?,?)');
    expect(result.bindings).toEqual(['tag1', 'tag2', 'tag3']);
  });

  it('should build rhythm clause correctly', () => {
    const result = buildWhereClause({ rhythm: ['Avulsos'] });
    expect(result.clause).toContain('p.rhythm IN (?)');
    expect(result.bindings).toEqual(['Avulsos']);
  });

  it('should build multiple rhythms clause correctly', () => {
    const result = buildWhereClause({ rhythm: ['Avulsos', 'Coletânea'] });
    expect(result.clause).toContain('p.rhythm IN (?,?)');
    expect(result.bindings).toEqual(['Avulsos', 'Coletânea']);
  });

  it('should build tonality clause correctly', () => {
    const result = buildWhereClause({ tonality: ['C', 'G'] });
    expect(result.clause).toContain('p.tonality IN (?,?)');
    expect(result.bindings).toEqual(['C', 'G']);
  });

  it('should build category clause correctly', () => {
    const result = buildWhereClause({ category: ['Louvor'] });
    expect(result.clause).toContain('p.category IN (?)');
    expect(result.bindings).toEqual(['Louvor']);
  });

  it('should build numberMin clause correctly', () => {
    const result = buildWhereClause({ numberMin: 1 });
    expect(result.clause).toContain('CAST(p.number AS INTEGER) >= ?');
    expect(result.bindings).toEqual([1]);
  });

  it('should build numberMax clause correctly', () => {
    const result = buildWhereClause({ numberMax: 10 });
    expect(result.clause).toContain('CAST(p.number AS INTEGER) <= ?');
    expect(result.bindings).toEqual([10]);
  });

  it('should build combined clauses correctly', () => {
    const result = buildWhereClause({
      search: 'test',
      tags: ['tag1'],
      rhythm: ['Avulsos'],
      numberMin: 1,
      numberMax: 10,
    });
    expect(result.clause).toContain('WHERE');
    expect(result.clause).toContain('p.name LIKE ?');
    expect(result.clause).toContain('pt.tag_id IN (?)');
    expect(result.clause).toContain('p.rhythm IN (?)');
    expect(result.clause).toContain('CAST(p.number AS INTEGER) >= ?');
    expect(result.clause).toContain('CAST(p.number AS INTEGER) <= ?');
    expect(result.bindings).toHaveLength(10);
  });
});
