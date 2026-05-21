import { describe, expect, it, vi, beforeEach } from 'vitest';
import app from '../index';


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

const mockMaterialKindLabels = [
  { id: 'kind1', label: 'Partitura' },
  { id: 'kind2', label: 'Áudio' },
  { id: 'kind3', label: 'Cifra' },
];

const mockMaterialKinds = mockMaterialKindLabels.map(({ id, label }) => ({ id, name: label }));

function resolveMockAll(query: string, responses: { all?: { results: unknown[] }; tags?: typeof mockTags }) {
  if (query.includes('COALESCE(t.label')) {
    if (query.includes('AS name')) {
      return { results: mockMaterialKinds };
    }
    return { results: mockMaterialKindLabels };
  }
  if (query.includes('FROM tags')) {
    return { results: responses.tags ?? mockTags };
  }
  return responses.all || { results: [] };
}

// Mock D1Database
const createMockD1 = (responses: any) => ({
  prepare: vi.fn((query: string) => ({
    bind: vi.fn().mockReturnThis(),
    all: vi.fn().mockImplementation(async () => resolveMockAll(query, responses)),
    first: vi.fn().mockResolvedValue(responses.first || null),
  })),
});

// Mock R2Bucket (head + ranged get, aligned with Worker R2 API)
const createMockR2 = (object: any = null) => {
  const objectBody = object?.body ?? null;
  const defaultBytes =
    objectBody instanceof Uint8Array ? objectBody : objectBody ? new Uint8Array(objectBody) : null;

  return {
    head: vi.fn().mockImplementation(async () => {
      if (!object) return null;
      return { size: defaultBytes?.byteLength ?? 0 };
    }),
    get: vi.fn().mockImplementation(async (_key: string, opts?: { range?: { offset: number; length: number } }) => {
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
      
      const res = await app.request('/health', {}, {
        DB: mockDB,
        ASSETS: mockR2,
      });
      
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
      
      const res = await app.request('/api/praises', {}, {
        DB: mockDB,
        ASSETS: mockR2,
      });
      
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
      
      const res = await app.request('/api/praises', {}, {
        DB: mockDB,
        ASSETS: mockR2,
      });
      
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
      
      const res = await app.request('/api/praises?q=Grande', {}, {
        DB: mockDB,
        ASSETS: mockR2,
      });
      
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
      
      const res = await app.request('/api/praises?page=2&limit=1', {}, {
        DB: mockDB,
        ASSETS: mockR2,
      });
      
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
      
      const res = await app.request('/api/praises?sort=name&order=desc', {}, {
        DB: mockDB,
        ASSETS: mockR2,
      });
      
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
      
      const res = await app.request('/api/praises?tags=tag1,tag2', {}, {
        DB: mockDB,
        ASSETS: mockR2,
      });
      
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
      
      const res = await app.request('/api/praises?rhythm=Avulsos', {}, {
        DB: mockDB,
        ASSETS: mockR2,
      });
      
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
      
      const res = await app.request('/api/praises?tonality=C', {}, {
        DB: mockDB,
        ASSETS: mockR2,
      });
      
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
      
      const res = await app.request('/api/praises?category=Adoração', {}, {
        DB: mockDB,
        ASSETS: mockR2,
      });
      
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
      
      const res = await app.request('/api/praises?numberMin=1&numberMax=10', {}, {
        DB: mockDB,
        ASSETS: mockR2,
      });
      
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
      
      const res = await app.request('/api/praises', {}, {
        DB: mockDB,
        ASSETS: mockR2,
      });
      
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
      
      const res = await app.request('/api/praises/filters', {}, {
        DB: mockDB,
        ASSETS: mockR2,
      });
      
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
      
      const res = await app.request('/api/praises/filters', {}, {
        DB: mockDB,
        ASSETS: mockR2,
      });
      
      expect(res.status).toBe(500);
    });
  });

  describe('GET /api/praises/:id', () => {
    it('should return praise details with materials', async () => {
      const mockPraise = { ...mockPraises[0], tag_ids: 'tag1,tag2' };
      const mockDB = {
        prepare: vi.fn((query: string) => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockImplementation(async () => {
            if (query.includes('COALESCE(t.label')) {
              return { results: mockMaterialKindLabels };
            }
            if (query.includes('FROM tags')) {
              return { results: mockTags.slice(0, 2) };
            }
            if (query.includes('praise_materials')) {
              return { results: mockMaterials };
            }
            return { results: [] };
          }),
          first: vi.fn().mockResolvedValue(mockPraise),
        })),
      };
      const mockR2 = createMockR2();
      
      const res = await app.request(`/api/praises/${mockPraise.id}`, {}, {
        DB: mockDB,
        ASSETS: mockR2,
      });
      
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.id).toBe(mockPraise.id);
      expect(json.data.name).toBe('Grande Deus');
      expect(json.data.tags).toHaveLength(2);
      expect(json.data.materials).toHaveLength(2);
      expect(json.data.materials[0].material_kind_name).toBe('Partitura');
      expect(json.data.materials[1].material_kind_name).toBe('Áudio');
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
      
      const res = await app.request('/api/praises/non-existent-id', {}, {
        DB: mockDB,
        ASSETS: mockR2,
      });
      
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
      
      const res = await app.request(`/api/praises/${mockPraise.id}`, {}, {
        DB: mockDB,
        ASSETS: mockR2,
      });
      
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
      
      const res = await app.request('/api/praises/some-id', {}, {
        DB: mockDB,
        ASSETS: mockR2,
      });
      
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
      
      const res = await app.request('/api/materials/kinds', {}, {
        DB: mockDB,
        ASSETS: mockR2,
      });
      
      expect(res.status).toBe(200);
      
      const json = await res.json();
      expect(json.data).toHaveLength(3);
      expect(json.data.map((k: { name: string }) => k.name)).toEqual(['Áudio', 'Cifra', 'Partitura']);
    });

    it('should return 500 on database error', async () => {
      const mockDB = {
        prepare: vi.fn().mockReturnValue({
          all: vi.fn().mockRejectedValue(new Error('DB Error')),
        }),
      };
      const mockR2 = createMockR2();
      
      const res = await app.request('/api/materials/kinds', {}, {
        DB: mockDB,
        ASSETS: mockR2,
      });
      
      expect(res.status).toBe(500);
    });
  });

  describe('GET /api/tags', () => {
    it('should return tags', async () => {
      const mockDB = createMockD1({
        all: { results: mockTags },
      });
      const mockR2 = createMockR2();
      
      const res = await app.request('/api/tags', {}, {
        DB: mockDB,
        ASSETS: mockR2,
      });
      
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
      
      const res = await app.request('/api/tags', {}, {
        DB: mockDB,
        ASSETS: mockR2,
      });
      
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
      
      const res = await app.request('/assets/praises/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/file.pdf', {}, {
        DB: mockDB,
        ASSETS: mockR2,
      });
      
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/pdf');
    });

    it('should return 404 when file not found', async () => {
      const mockR2 = createMockR2(null);
      const mockDB = createMockD1({});
      
      const res = await app.request('/assets/praises/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/nonexistent.pdf', {}, {
        DB: mockDB,
        ASSETS: mockR2,
      });
      
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe('File not found');
    });

    it('should return correct content type for mp3', async () => {
      const mockObject = { body: new Uint8Array([0xFF, 0xFB]) };
      const mockR2 = createMockR2(mockObject);
      const mockDB = createMockD1({});
      
      const res = await app.request('/assets/praises/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/file.mp3', {}, {
        DB: mockDB,
        ASSETS: mockR2,
      });
      
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('audio/mpeg');
    });

    it('should return correct content type for midi', async () => {
      const mockObject = { body: new Uint8Array([0x4D, 0x54, 0x68, 0x64]) };
      const mockR2 = createMockR2(mockObject);
      const mockDB = createMockD1({});
      
      const res = await app.request('/assets/praises/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/file.midi', {}, {
        DB: mockDB,
        ASSETS: mockR2,
      });
      
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('audio/midi');
    });

    it('should return correct content type for chord', async () => {
      const mockObject = { body: new Uint8Array([0x74, 0x65, 0x78, 0x74]) };
      const mockR2 = createMockR2(mockObject);
      const mockDB = createMockD1({});
      
      const res = await app.request('/assets/praises/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/file.chord', {}, {
        DB: mockDB,
        ASSETS: mockR2,
      });
      
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('text/plain');
    });

    it('should return octet-stream for unknown extension', async () => {
      const mockObject = { body: new Uint8Array([0x00, 0x01]) };
      const mockR2 = createMockR2(mockObject);
      const mockDB = createMockD1({});
      
      const res = await app.request('/assets/praises/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/file.xyz', {}, {
        DB: mockDB,
        ASSETS: mockR2,
      });
      
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
    });
  });

  describe('GET /auth/status', () => {
    it('returns configuration flags without secrets', async () => {
      const mockDB = createMockD1({});
      const mockR2 = createMockR2();

      const res = await app.request('/auth/status', {}, {
        DB: mockDB,
        ASSETS: mockR2,
        GOOGLE_CLIENT_ID: 'client-id',
        GOOGLE_CLIENT_SECRET: 'secret',
        AUTH_JWT_SECRET: '0123456789abcdef0123456789abcdef',
        AUTH_BASE_URL: 'https://api.example',
        WEB_ORIGIN: 'https://web.example',
        AUTH_COOKIE_SAMESITE: 'None',
      });

      expect(res.status).toBe(200);
      const body = await res.json() as {
        googleClientConfigured: boolean;
        webOriginSet: boolean;
        cookieSameSiteEffective: string;
        callbackUrl: string;
      };
      expect(body.googleClientConfigured).toBe(true);
      expect(body.webOriginSet).toBe(true);
      expect(body.cookieSameSiteEffective).toBe('None');
      expect(body.callbackUrl).toBe('https://api.example/auth/callback');
    });
  });

  describe('POST /auth/refresh', () => {
    it('returns 401 when no refresh cookie', async () => {
      const mockDB = createMockD1({});
      const mockR2 = createMockR2();

      const res = await app.request(
        '/auth/refresh',
        { method: 'POST' },
        {
          DB: mockDB,
          ASSETS: mockR2,
          AUTH_JWT_SECRET: '0123456789abcdef0123456789abcdef',
        }
      );

      expect(res.status).toBe(401);
    });

    it('returns 403 when Origin does not match WEB_ORIGIN', async () => {
      const mockDB = createMockD1({});
      const mockR2 = createMockR2();

      const res = await app.request(
        '/auth/refresh',
        {
          method: 'POST',
          headers: { origin: 'https://evil.example' },
        },
        {
          DB: mockDB,
          ASSETS: mockR2,
          AUTH_JWT_SECRET: '0123456789abcdef0123456789abcdef',
          WEB_ORIGIN: 'https://good.example',
        }
      );

      expect(res.status).toBe(403);
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
