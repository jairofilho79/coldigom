import { describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';
import { unzipSync } from 'fflate';
import yaml from 'js-yaml';
import { app } from '../index';


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
  { id: 'tag1', name: 'Coletânea', parent_id: null },
  { id: 'tag2', name: 'Avulsos', parent_id: null },
  { id: 'tag3', name: 'GLTM', parent_id: null },
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
  if (query.includes('FROM tags') && !query.includes('parent_id') && query.includes('GROUP BY')) {
    return { results: (responses.tags ?? mockTags).map((t) => ({ ...t, count: 1 })) };
  }
  if (query.includes('FROM tags') && !query.includes('praise_tags') && !query.includes('id IN')) {
    return { results: responses.tags ?? mockTags };
  }
  return responses.all || { results: [] };
}

// Mock D1Database
const createMockD1 = (responses: any = {}) => ({
  prepare: vi.fn((query: string) => ({
    bind: vi.fn((...args: unknown[]) => ({
      all: vi.fn().mockImplementation(async () => {
        if (query.includes('FROM tags WHERE parent_id')) {
          const tags = (responses.tags ?? mockTags) as typeof mockTags;
          return { results: tags.filter((t) => t.parent_id === args[0]) };
        }
        return resolveMockAll(query, responses);
      }),
      first: vi.fn().mockImplementation(async () => {
        if (query.includes('FROM tags WHERE parent_id')) {
          const tags = (responses.tags ?? mockTags) as typeof mockTags;
          return tags.find((t) => t.parent_id === args[0]) ?? null;
        }
        return responses.first || null;
      }),
      run: vi.fn().mockResolvedValue({}),
    })),
    all: vi.fn().mockImplementation(async () => resolveMockAll(query, responses)),
    first: vi.fn().mockResolvedValue(responses.first || null),
  })),
});

const TEST_JWT_SECRET = '0123456789abcdef0123456789abcdef';
const TEST_WEB_ORIGIN = 'https://web.example';

async function authRequestInit(body?: object): Promise<RequestInit> {
  const jwt = await new SignJWT({ email: 'admin@test.com', name: 'Admin', jti: 'j1' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('sub-admin')
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(new TextEncoder().encode(TEST_JWT_SECRET));

  return {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: TEST_WEB_ORIGIN,
      cookie: `coldigom_access=${encodeURIComponent(jwt)}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };
}

function createStatefulMockD1() {
  const praises = new Map<string, Record<string, unknown>>();
  const praiseTagIds = new Map<string, string[]>();

  return {
    /**
     * O merge passou a escrever em lote, para ser atômico. O mock executa os
     * statements do lote em ordem, que é o que o D1 faz — assim as asserções
     * sobre o estado final continuam valendo.
     */
    batch: vi.fn(async (stmts: { run: () => Promise<unknown> }[]) => {
      const saidas = [];
      for (const stmt of stmts) saidas.push(await stmt.run());
      return saidas;
    }),
    prepare: vi.fn((query: string) => ({
      bind: vi.fn((...args: unknown[]) => ({
        run: vi.fn(async () => {
          if (query.includes('INSERT INTO praises')) {
            praises.set(args[0] as string, {
              id: args[0],
              name: args[1],
              number: args[2],
              author: args[3],
              rhythm: args[4],
              tonality: args[5],
              category: args[6],
              lyrics: args[7],
            });
          }
          if (query.includes('INSERT OR IGNORE INTO praise_tags')) {
            const praiseId = args[0] as string;
            const tagId = args[1] as string;
            const list = praiseTagIds.get(praiseId) ?? [];
            if (!list.includes(tagId)) list.push(tagId);
            praiseTagIds.set(praiseId, list);
          }
        }),
        first: vi.fn(async () => {
          if (query.includes('FROM tags WHERE parent_id')) {
            return mockTags.find((t) => t.parent_id === args[0]) ?? null;
          }
          if (query.includes('SELECT id FROM tags') || query.includes('FROM tags WHERE id')) {
            return mockTags.find((t) => t.id === args[0]) ?? null;
          }
          if (query.includes('FROM praises p') && query.includes('WHERE p.id')) {
            const p = praises.get(args[0] as string);
            if (!p) return null;
            const tagIds = praiseTagIds.get(p.id as string) ?? [];
            return { ...p, tag_ids: tagIds.length > 0 ? tagIds.join(',') : null };
          }
          return null;
        }),
        all: vi.fn(async () => {
          if (query.includes('FROM tags WHERE parent_id')) {
            return { results: mockTags.filter((t) => t.parent_id === args[0]) };
          }
          if (query.includes('FROM praise_materials')) {
            return { results: [] };
          }
          if (query.includes('id IN') && query.includes('tags')) {
            const ids = args as string[];
            return {
              results: mockTags
                .filter((t) => ids.includes(t.id))
                .map((t) => ({
                  ...t,
                  parent_name: t.parent_id
                    ? mockTags.find((p) => p.id === t.parent_id)?.name ?? null
                    : null,
                })),
            };
          }
          return resolveMockAll(query, {});
        }),
      })),
    })),
  };
}

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
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
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

    it('should return D1 counts on /health/db', async () => {
      const mockDB = createMockD1({
        first: { n: 3 },
      });
      const mockR2 = createMockR2();

      const res = await app.request('/health/db', {}, {
        DB: mockDB,
        ASSETS: mockR2,
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('ok');
      expect(json.praises).toBe(3);
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

    it('should search praises by YouTube watch URL', async () => {
      const prepare = vi.fn((_query: string) => ({
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: [mockPraises[0]] }),
        first: vi.fn().mockResolvedValue({ total: 1 }),
      }));
      const mockDB = { prepare };
      const mockR2 = createMockR2();

      const res = await app.request(
        '/api/praises?q=https://www.youtube.com/watch?v=iU0Km8CV6-E',
        {},
        { DB: mockDB, ASSETS: mockR2 }
      );

      expect(res.status).toBe(200);
      const listQuery = prepare.mock.calls.find(([q]) => q.includes('GROUP BY p.id'))?.[0] as string;
      expect(listQuery).toContain("praise_materials");
      expect(listQuery).toContain("type = 'youtube'");
      expect(listQuery).toContain('url LIKE ?');
      expect(listQuery).not.toContain('praises_fts');
      const bindCall = prepare.mock.calls
        .map((_, i) => prepare.mock.results[i]?.value)
        .find((stmt) => stmt?.bind?.mock?.calls?.some((args: unknown[]) => args.includes('%iU0Km8CV6-E%')));
      expect(bindCall).toBeTruthy();
    });

    it('should search praises by youtu.be URL and playlist watch URL', async () => {
      const prepare = vi.fn((_query: string) => ({
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: [mockPraises[0]] }),
        first: vi.fn().mockResolvedValue({ total: 1 }),
      }));
      const mockDB = { prepare };
      const mockR2 = createMockR2();

      for (const q of [
        'https://youtu.be/iU0Km8CV6-E',
        'https://www.youtube.com/watch?v=iU0Km8CV6-E&list=PLidOZq9zaXedqPRH_URsb4-sT3Trm83Ft',
      ]) {
        prepare.mockClear();
        const res = await app.request(`/api/praises?q=${encodeURIComponent(q)}`, {}, {
          DB: mockDB,
          ASSETS: mockR2,
        });
        expect(res.status).toBe(200);
        const listQuery = prepare.mock.calls.find(([sql]) => sql.includes('GROUP BY p.id'))?.[0] as string;
        expect(listQuery).toContain("type = 'youtube'");
        const binds = prepare.mock.results.flatMap((r) =>
          (r.value.bind.mock.calls as unknown[][]).flat()
        );
        expect(binds).toContain('%iU0Km8CV6-E%');
      }
    });

    it('should keep text search on FTS path for normal queries', async () => {
      const prepare = vi.fn((_query: string) => ({
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: [mockPraises[0]] }),
        first: vi.fn().mockResolvedValue({ total: 1 }),
      }));
      const mockDB = { prepare };
      const mockR2 = createMockR2();

      const res = await app.request('/api/praises?q=Grande', {}, {
        DB: mockDB,
        ASSETS: mockR2,
      });

      expect(res.status).toBe(200);
      const listQuery = prepare.mock.calls.find(([q]) => q.includes('GROUP BY p.id'))?.[0] as string;
      expect(listQuery).toContain('praises_fts');
      expect(listQuery).not.toContain("type = 'youtube'");
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

    it('should rank search matches by number then title then lyrics', async () => {
      const prepare = vi.fn((_query: string) => ({
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: mockPraises }),
        first: vi.fn().mockResolvedValue({ total: 2 }),
      }));
      const mockDB = { prepare };
      const mockR2 = createMockR2();

      const res = await app.request('/api/praises?q=A%20Ti%20Senhor', {}, {
        DB: mockDB,
        ASSETS: mockR2,
      });

      expect(res.status).toBe(200);
      const listQuery = prepare.mock.calls.find(([q]) => q.includes('GROUP BY p.id'))?.[0] as string;
      expect(listQuery).toContain('WHEN TRIM(p.number) = ? THEN 0');
      expect(listQuery).toContain('WHEN LOWER(TRIM(p.name)) = LOWER(?) THEN 2');
      expect(listQuery).toContain('ELSE 5 END ASC');
      expect(listQuery).toContain('p.name COLLATE NOCASE ASC');
      expect(listQuery).not.toMatch(/ORDER BY CASE WHEN p\.number IS NULL/);
    });

    it('should use natural number order for digit-only search', async () => {
      const prepare = vi.fn((_query: string) => ({
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: mockPraises }),
        first: vi.fn().mockResolvedValue({ total: 2 }),
      }));
      const mockDB = { prepare };
      const mockR2 = createMockR2();

      const res = await app.request('/api/praises?q=5', {}, {
        DB: mockDB,
        ASSETS: mockR2,
      });

      expect(res.status).toBe(200);
      const listCall = prepare.mock.calls.find(([q]) => q.includes('GROUP BY p.id'));
      const listQuery = listCall?.[0] as string;
      expect(listQuery).toContain('INSTR(CAST(CAST(p.number AS INTEGER) AS TEXT), ?) > 0');
      expect(listQuery).toContain('CASE WHEN CAST(p.number AS INTEGER) = ? THEN 0 ELSE 1 END ASC');
      expect(listQuery).toContain('CAST(p.number AS INTEGER) ASC');
      expect(listQuery).not.toContain('praises_fts MATCH');
    });

    it('should exact-match number when query has leading zeros', async () => {
      const prepare = vi.fn((_query: string) => ({
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: mockPraises }),
        first: vi.fn().mockResolvedValue({ total: 1 }),
      }));
      const mockDB = { prepare };
      const mockR2 = createMockR2();

      const res = await app.request('/api/praises?q=005', {}, {
        DB: mockDB,
        ASSETS: mockR2,
      });

      expect(res.status).toBe(200);
      const listQuery = prepare.mock.calls.find(([q]) => q.includes('GROUP BY p.id'))?.[0] as string;
      expect(listQuery).toContain('CAST(p.number AS INTEGER) = ?');
      expect(listQuery).not.toContain('INSTR(');
      expect(listQuery).not.toContain('praises_fts MATCH');
    });

    it('should build valid COLLATE NOCASE order for tonality sort', async () => {
      const prepare = vi.fn((_query: string) => ({
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: mockPraises }),
        first: vi.fn().mockResolvedValue({ total: 2 }),
      }));
      const mockDB = { prepare };
      const mockR2 = createMockR2();

      const res = await app.request('/api/praises?sort=tonality&order=asc', {}, {
        DB: mockDB,
        ASSETS: mockR2,
      });

      expect(res.status).toBe(200);
      const listQuery = prepare.mock.calls.find(([q]) => q.includes('GROUP BY p.id'))?.[0] as string;
      expect(listQuery).toContain('ORDER BY CASE WHEN p.tonality IS NULL OR p.tonality = \'\' THEN 1 ELSE 0 END ASC');
      expect(listQuery).toContain('p.tonality COLLATE NOCASE ASC');
      expect(listQuery).not.toMatch(/ASC COLLATE NOCASE/);
    });

    it('should put empty values last for desc sort too', async () => {
      const prepare = vi.fn((_query: string) => ({
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: mockPraises }),
        first: vi.fn().mockResolvedValue({ total: 2 }),
      }));
      const mockDB = { prepare };
      const mockR2 = createMockR2();

      const res = await app.request('/api/praises?sort=author&order=desc', {}, {
        DB: mockDB,
        ASSETS: mockR2,
      });

      expect(res.status).toBe(200);
      const listQuery = prepare.mock.calls.find(([q]) => q.includes('GROUP BY p.id'))?.[0] as string;
      expect(listQuery).toContain('CASE WHEN p.author IS NULL OR p.author = \'\' THEN 1 ELSE 0 END ASC');
      expect(listQuery).toContain('p.author COLLATE NOCASE DESC');
    });

    it('should use numeric cast for number sort with empty last', async () => {
      const prepare = vi.fn((_query: string) => ({
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: mockPraises }),
        first: vi.fn().mockResolvedValue({ total: 2 }),
      }));
      const mockDB = { prepare };
      const mockR2 = createMockR2();

      const res = await app.request('/api/praises?sort=number&order=asc', {}, {
        DB: mockDB,
        ASSETS: mockR2,
      });

      expect(res.status).toBe(200);
      const listQuery = prepare.mock.calls.find(([q]) => q.includes('GROUP BY p.id'))?.[0] as string;
      expect(listQuery).toContain('CASE WHEN p.number IS NULL OR p.number = \'\' THEN 1 ELSE 0 END ASC');
      expect(listQuery).toContain('CAST(p.number AS INTEGER) ASC');
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

    it('should handle materialKinds filter', async () => {
      const mockDB = createMockD1({
        all: { results: [mockPraises[0]] },
        first: { total: 1 },
      });
      const mockR2 = createMockR2();

      const res = await app.request('/api/praises?materialKinds=kind1,kind2', {}, {
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

  describe('GET /api/plpcg/praises', () => {
    const plpcgListRow = {
      id: mockPraises[0].id,
      name: mockPraises[0].name,
      number: mockPraises[0].number,
      author: mockPraises[0].author,
      rhythm: mockPraises[0].rhythm,
      tonality: mockPraises[0].tonality,
      category: mockPraises[0].category,
      group_id: null,
      tag_ids: 'tag1',
      tag_names: 'Coletânea',
      has_lyrics: 1,
    };

    const slimMaterials = [
      {
        id: 'mat1',
        praise_id: mockPraises[0].id,
        material_kind: 'kind1',
        type: 'pdf',
        r2_key: 'assets/praises/x/mat1.pdf',
        url: null,
      },
    ];

    function createPlpcgMockDB(opts: {
      listRows?: typeof plpcgListRow[];
      materials?: typeof slimMaterials;
      fail?: boolean;
    } = {}) {
      const listRows = opts.listRows ?? [plpcgListRow];
      const materials = opts.materials ?? slimMaterials;
      return {
        prepare: vi.fn((query: string) => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockImplementation(async () => {
            if (opts.fail) throw new Error('DB Error');
            if (query.includes('COALESCE(t.label')) {
              return { results: mockMaterialKindLabels };
            }
            if (query.includes('FROM praise_materials')) {
              return { results: materials };
            }
            if (query.includes('has_lyrics') || query.includes('GROUP BY p.id')) {
              return { results: listRows };
            }
            return { results: [] };
          }),
          first: vi.fn().mockImplementation(async () => {
            if (opts.fail) throw new Error('DB Error');
            return { total: listRows.length };
          }),
        })),
      };
    }

    it('should omit lyrics and include slim materials with lyrics stub', async () => {
      const mockDB = createPlpcgMockDB();
      const res = await app.request('/api/plpcg/praises', {}, {
        DB: mockDB,
        ASSETS: createMockR2(),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toHaveLength(1);
      expect(json.data[0]).not.toHaveProperty('lyrics');
      expect(json.data[0]).not.toHaveProperty('has_lyrics');
      expect(json.data[0].materials).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            material_kind_name: 'Partitura',
            type: 'pdf',
          }),
          expect.objectContaining({ type: 'lyrics', material_kind_name: 'Letra' }),
        ])
      );
      expect(json.data[0].materials[0]).not.toHaveProperty('file_path_legacy');
    });

    it('should use has_lyrics in SQL and not select p.lyrics', async () => {
      const mockDB = createPlpcgMockDB();
      const res = await app.request('/api/plpcg/praises', {}, {
        DB: mockDB,
        ASSETS: createMockR2(),
      });

      expect(res.status).toBe(200);
      const listQuery = (mockDB.prepare as ReturnType<typeof vi.fn>).mock.calls.find(
        ([q]: [string]) => q.includes('GROUP BY p.id')
      )?.[0] as string;
      expect(listQuery).toContain('has_lyrics');
      expect(listQuery).not.toContain('p.lyrics,');
      expect(listQuery).not.toContain(', p.lyrics');
    });

    it('should accept q= search parameter', async () => {
      const mockDB = createPlpcgMockDB();
      const res = await app.request('/api/plpcg/praises?q=deus&limit=2', {}, {
        DB: mockDB,
        ASSETS: createMockR2(),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toHaveLength(1);
      expect(json.pagination.limit).toBe(2);
    });

    it('should return 500 on database error', async () => {
      const mockDB = createPlpcgMockDB({ fail: true });
      const res = await app.request('/api/plpcg/praises', {}, {
        DB: mockDB,
        ASSETS: createMockR2(),
      });

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe('Failed to fetch praises');
    });

    it('should allow CORS from listed PLPCG origin', async () => {
      const mockDB = createPlpcgMockDB();
      const res = await app.request('/api/plpcg/praises', {
        headers: { origin: 'https://v2.plpcg.com' },
      }, {
        DB: mockDB,
        ASSETS: createMockR2(),
        WEB_ORIGIN: 'https://coldigom-web.pages.dev,https://*plpcg.com',
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBe('https://v2.plpcg.com');
    });

    it('should omit CORS header for untrusted origin', async () => {
      const mockDB = createPlpcgMockDB();
      const res = await app.request('/api/plpcg/praises', {
        headers: { origin: 'https://evil.example' },
      }, {
        DB: mockDB,
        ASSETS: createMockR2(),
        WEB_ORIGIN: 'https://coldigom-web.pages.dev,https://*plpcg.com',
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBeNull();
    });
  });

  describe('CORS origin patterns', () => {
    const webOrigin = 'https://coldigom-web.pages.dev,https://*plpcg.com';

    async function corsHeader(origin: string): Promise<string | null> {
      const res = await app.request('/auth/status', { headers: { origin } }, { WEB_ORIGIN: webOrigin });
      return res.headers.get('access-control-allow-origin');
    }

    it('should allow apex and subdomains via *plpcg.com', async () => {
      await expect(corsHeader('https://plpcg.com')).resolves.toBe('https://plpcg.com');
      await expect(corsHeader('https://v2.plpcg.com')).resolves.toBe('https://v2.plpcg.com');
      await expect(corsHeader('https://120826.plpcg.com')).resolves.toBe('https://120826.plpcg.com');
    });

    it('should reject lookalike domains', async () => {
      await expect(corsHeader('https://evilplpcg.com')).resolves.toBeNull();
      await expect(corsHeader('https://plpcg.com.evil.com')).resolves.toBeNull();
    });
  });

  describe('GET /api/praises/filters', () => {
    it('should return filter options', async () => {
      const mockDB = {
        prepare: vi.fn((query: string) => {
          // Responde igual com e sem .bind(): a rota passou a montar as
          // consultas com os filtros aplicados como bindings. E casa pela
          // tabela, não pelo texto exato do COUNT.
          const responder = (results: unknown[]) => ({
            all: vi.fn().mockResolvedValue({ results }),
            bind: vi.fn(() => ({ all: vi.fn().mockResolvedValue({ results }) })),
          });
          if (query.includes('DISTINCT rhythm')) {
            return responder([{ rhythm: 'Avulsos' }, { rhythm: 'Coletânea' }]);
          }
          if (query.includes('DISTINCT tonality')) {
            return responder([{ tonality: 'C' }, { tonality: 'G' }]);
          }
          if (query.includes('DISTINCT category')) {
            return responder([{ category: 'Louvor' }, { category: 'Adoração' }]);
          }
          if (query.includes('FROM tags')) {
            return responder(mockTags.map(t => ({ ...t, count: 1 })));
          }
          return responder([]);
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

    function praiseWithChords(headImpl: (key: string) => Promise<unknown>) {
      const mockPraise = { ...mockPraises[0], tag_ids: null };
      const materials = [
        {
          id: 'ch1', praise_id: mockPraise.id, material_kind: 'kind1', type: 'chord',
          r2_key: `assets/praises/${mockPraise.id}/ch1.chord`,
          file_path_legacy: '', source_material_id: 'mat1',
        },
        {
          id: 'ch2', praise_id: mockPraise.id, material_kind: 'kind1', type: 'chord',
          r2_key: `assets/praises/${mockPraise.id}/ch2.chord`,
          file_path_legacy: '', source_material_id: 'mat1',
        },
        mockMaterials[0],
      ];
      const DB = {
        prepare: vi.fn((query: string) => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockImplementation(async () => {
            if (query.includes('COALESCE(t.label')) return { results: mockMaterialKindLabels };
            if (query.includes('FROM tags')) return { results: [] };
            if (query.includes('praise_materials')) return { results: materials };
            return { results: [] };
          }),
          first: vi.fn().mockResolvedValue(mockPraise),
        })),
      };
      const head = vi.fn(headImpl);
      return { mockPraise, DB, ASSETS: { ...createMockR2(), head }, head };
    }

    it('marca has_content nos materiais de cifra conforme o R2', async () => {
      const { mockPraise, DB, ASSETS } = praiseWithChords(async (key: string) =>
        key.endsWith('ch1.chord') ? { size: 611 } : null
      );

      const res = await app.request(`/api/praises/${mockPraise.id}`, {}, { DB, ASSETS });
      expect(res.status).toBe(200);

      const json = await res.json();
      const cifras = json.data.materials.filter((m: any) => m.type === 'chord');
      expect(cifras.find((m: any) => m.id === 'ch1').has_content).toBe(true);
      expect(cifras.find((m: any) => m.id === 'ch2').has_content).toBe(false);
    });

    it('consulta o R2 com o prefixo storage/ e só para cifras', async () => {
      const { mockPraise, DB, ASSETS, head } = praiseWithChords(async () => null);

      await app.request(`/api/praises/${mockPraise.id}`, {}, { DB, ASSETS });

      expect(head).toHaveBeenCalledTimes(2);
      for (const call of head.mock.calls) {
        expect(String(call[0])).toMatch(/^storage\/assets\/.*\.chord$/);
      }
    });

    it('não devolve has_content em material que não é cifra', async () => {
      const { mockPraise, DB, ASSETS } = praiseWithChords(async () => null);
      const res = await app.request(`/api/praises/${mockPraise.id}`, {}, { DB, ASSETS });
      const json = await res.json();
      const pdf = json.data.materials.find((m: any) => m.type === 'pdf');
      expect(pdf.has_content).toBeUndefined();
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
        prepare: vi.fn((_query: string) => ({
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

  describe('GET /api/praises/:id/download.zip', () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const mp3Bytes = new Uint8Array([0xff, 0xfb]);

    function createZipRouteMocks(praise = mockPraises[0], materials = mockMaterials) {
      const r2ByKey: Record<string, Uint8Array> = {};
      for (const m of materials) {
        if (m.r2_key) {
          r2ByKey[`storage/${m.r2_key}`] = m.type === 'pdf' ? pdfBytes : mp3Bytes;
        }
      }

      const mockDB = {
        prepare: vi.fn((query: string) => ({
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockImplementation(async () => {
            if (query.includes('FROM praises p')) return { ...praise, tag_ids: praise.tag_ids };
            return null;
          }),
          all: vi.fn().mockImplementation(async () => {
            if (query.includes('COALESCE(t.label')) {
              return { results: mockMaterialKindLabels };
            }
            if (query.includes('praise_materials')) {
              return { results: materials };
            }
            return { results: [] };
          }),
        })),
      };

      const mockR2 = {
        head: vi.fn(async (key: string) => {
          const bytes = r2ByKey[key];
          return bytes ? { size: bytes.byteLength } : null;
        }),
        get: vi.fn(async (key: string) => {
          const bytes = r2ByKey[key];
          if (!bytes) return null;
          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(bytes);
              controller.close();
            },
          });
          return {
            body: stream,
            arrayBuffer: async () =>
              bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
          };
        }),
      };

      return { mockDB, mockR2 };
    }

    it('should return zip without authentication', async () => {
      const { mockDB, mockR2 } = createZipRouteMocks();

      const res = await app.request(
        `/api/praises/${mockPraises[0].id}/download.zip`,
        {},
        { DB: mockDB, ASSETS: mockR2 }
      );

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/zip');
      expect(res.headers.get('Content-Disposition')).toContain('attachment');
      expect(res.headers.get('Content-Disposition')).toContain('001_Grande Deus.zip');

      const buf = new Uint8Array(await res.arrayBuffer());
      const unzipped = unzipSync(buf);
      expect(unzipped['metadata.yml']).toBeDefined();
      expect(unzipped['Partitura-mat1.pdf']).toEqual(pdfBytes);
      expect(unzipped['Áudio-mat2.mp3']).toEqual(mp3Bytes);

      const meta = yaml.load(new TextDecoder().decode(unzipped['metadata.yml'])) as Record<string, unknown>;
      expect(meta.praise_id).toBe(mockPraises[0].id);
    });

    it('should return 404 when praise not found', async () => {
      const mockDB = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(null),
          all: vi.fn(),
        })),
      };
      const mockR2 = createMockR2();

      const res = await app.request(
        '/api/praises/non-existent-id/download.zip',
        {},
        { DB: mockDB, ASSETS: mockR2 }
      );

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe('Praise not found');
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

  describe('PUT /api/materials/:materialId/content', () => {
    async function putInit(body: string, contentType = 'text/plain; charset=utf-8'): Promise<RequestInit> {
      const jwt = await new SignJWT({ email: 'admin@test.com', name: 'Admin', jti: 'j3' })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject('sub-admin')
        .setIssuedAt()
        .setExpirationTime('2h')
        .sign(new TextEncoder().encode(TEST_JWT_SECRET));
      return {
        method: 'PUT',
        headers: {
          'content-type': contentType,
          origin: TEST_WEB_ORIGIN,
          authorization: `Bearer ${jwt}`,
        },
        body,
      };
    }

    it('aceita o JWT do usuário logado mesmo com COLDIGOM_UPLOAD_TOKEN configurado', async () => {
      // Regressão de produção: com o secret definido, o guard comparava o JWT do
      // usuário com o token de upload e devolvia 401 antes de chegar no requireAuth.
      // Estar logado era exatamente o que quebrava. O teste anterior passava porque
      // omitia COLDIGOM_UPLOAD_TOKEN do env — a combinação real nunca era exercitada.
      const praiseId = '1b2b33ab-4dff-4014-8582-dcb9a92efbc8';
      const chordId = 'chord-mat-1';
      const r2Key = `assets/praises/${praiseId}/${chordId}.chord`;
      const mockDB = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue({ id: chordId, praise_id: praiseId, type: 'chord', r2_key: r2Key }),
        })),
      };
      const mockR2 = createMockR2();

      const res = await app.request(
        `/api/materials/${chordId}/content`,
        await putInit('{title: X}\n\n[A]letra\n'),
        {
          DB: mockDB,
          ASSETS: mockR2,
          AUTH_JWT_SECRET: TEST_JWT_SECRET,
          AUTH_ALLOWED_EMAILS: '*',
          WEB_ORIGIN: TEST_WEB_ORIGIN,
          COLDIGOM_UPLOAD_TOKEN: 'token-do-review-app',
        }
      );

      expect(res.status).toBe(200);
      expect(mockR2.put).toHaveBeenCalled();
    });

    // Os dois jeitos de chegar neste endpoint falham de formas diferentes, e as duas
    // recusas importam: o review-app chama SEM Origin (token de upload), o navegador
    // chama COM Origin (JWT de sessão). Nenhum dos dois pode entrar com credencial errada.
    it('recusa token de upload errado vindo do review-app (sem Origin)', async () => {
      const res = await app.request(
        `/api/materials/chord-mat-1/content`,
        {
          method: 'PUT',
          headers: { 'content-type': 'text/plain; charset=utf-8', authorization: 'Bearer token-errado' },
          body: 'x',
        },
        {
          DB: createMockD1(),
          ASSETS: createMockR2(),
          AUTH_JWT_SECRET: TEST_JWT_SECRET,
          AUTH_ALLOWED_EMAILS: '*',
          WEB_ORIGIN: TEST_WEB_ORIGIN,
          COLDIGOM_UPLOAD_TOKEN: 'token-do-review-app',
        }
      );
      expect(res.status).toBe(403);
    });

    it('recusa Bearer inválido vindo do navegador (com Origin)', async () => {
      const res = await app.request(
        `/api/materials/chord-mat-1/content`,
        {
          method: 'PUT',
          headers: {
            'content-type': 'text/plain; charset=utf-8',
            origin: TEST_WEB_ORIGIN,
            authorization: 'Bearer jwt-invalido',
          },
          body: 'x',
        },
        {
          DB: createMockD1(),
          ASSETS: createMockR2(),
          AUTH_JWT_SECRET: TEST_JWT_SECRET,
          AUTH_ALLOWED_EMAILS: '*',
          WEB_ORIGIN: TEST_WEB_ORIGIN,
          COLDIGOM_UPLOAD_TOKEN: 'token-do-review-app',
        }
      );
      expect(res.status).toBe(401);
    });

    it('should replace chord content in R2', async () => {
      const praiseId = '1b2b33ab-4dff-4014-8582-dcb9a92efbc8';
      const chordId = 'chord-mat-1';
      const r2Key = `assets/praises/${praiseId}/${chordId}.chord`;
      const mockDB = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            first: vi.fn(async () => ({
              id: chordId,
              praise_id: praiseId,
              type: 'chord',
              r2_key: r2Key,
            })),
          })),
        })),
      };
      const mockR2 = createMockR2();
      const content = '{title: Test}\n[C]hello';
      const res = await app.request(
        `/api/materials/${chordId}/content`,
        await putInit(content),
        {
          DB: mockDB,
          ASSETS: mockR2,
          AUTH_JWT_SECRET: TEST_JWT_SECRET,
          AUTH_ALLOWED_EMAILS: '*',
          WEB_ORIGIN: TEST_WEB_ORIGIN,
        }
      );
      expect(res.status).toBe(200);
      const json = await res.json() as { ok: boolean; material_id: string; praise_id: string; r2_key: string };
      expect(json.ok).toBe(true);
      expect(json.material_id).toBe(chordId);
      expect(json.praise_id).toBe(praiseId);
      expect(json.r2_key).toBe(r2Key);
      expect(mockR2.put).toHaveBeenCalledWith(
        `storage/${r2Key}`,
        content,
        expect.objectContaining({
          httpMetadata: expect.objectContaining({ contentType: 'text/plain; charset=utf-8' }),
        })
      );
    });

    it('should reject non-chord materials', async () => {
      const mockDB = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            first: vi.fn(async () => ({
              id: 'mat1',
              praise_id: 'p1',
              type: 'pdf',
              r2_key: 'assets/praises/p1/mat1.pdf',
            })),
          })),
        })),
      };
      const res = await app.request(
        '/api/materials/mat1/content',
        await putInit('{title: X}'),
        {
          DB: mockDB,
          ASSETS: createMockR2(),
          AUTH_JWT_SECRET: TEST_JWT_SECRET,
          AUTH_ALLOWED_EMAILS: '*',
          WEB_ORIGIN: TEST_WEB_ORIGIN,
        }
      );
      expect(res.status).toBe(400);
    });

    it('should accept COLDIGOM_UPLOAD_TOKEN without Origin', async () => {
      const praiseId = '1b2b33ab-4dff-4014-8582-dcb9a92efbc8';
      const chordId = 'chord-mat-1';
      const r2Key = `assets/praises/${praiseId}/${chordId}.chord`;
      const mockDB = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            first: vi.fn(async () => ({
              id: chordId,
              praise_id: praiseId,
              type: 'chord',
              r2_key: r2Key,
            })),
          })),
        })),
      };
      const mockR2 = createMockR2();
      const uploadToken = 'test-upload-token-abc';
      const res = await app.request(`/api/materials/${chordId}/content`, {
        method: 'PUT',
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          authorization: `Bearer ${uploadToken}`,
        },
        body: '{title: ViaToken}',
      }, {
        DB: mockDB,
        ASSETS: mockR2,
        AUTH_JWT_SECRET: TEST_JWT_SECRET,
        AUTH_ALLOWED_EMAILS: '*',
        WEB_ORIGIN: TEST_WEB_ORIGIN,
        COLDIGOM_UPLOAD_TOKEN: uploadToken,
      });
      expect(res.status).toBe(200);
      expect(mockR2.put).toHaveBeenCalled();
    });

    it('should require auth', async () => {
      const res = await app.request('/api/materials/chord-mat-1/content', {
        method: 'PUT',
        headers: {
          'content-type': 'text/plain',
          origin: TEST_WEB_ORIGIN,
        },
        body: '{title: X}',
      }, {
        DB: createMockD1(),
        ASSETS: createMockR2(),
        AUTH_JWT_SECRET: TEST_JWT_SECRET,
        AUTH_ALLOWED_EMAILS: '*',
        WEB_ORIGIN: TEST_WEB_ORIGIN,
      });
      expect(res.status).toBe(401);
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
      expect(res.headers.get('Cross-Origin-Resource-Policy')).toBe(
        'cross-origin',
      );
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
      expect(res.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
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
      // Deixou de ser público: expunha WEB_ORIGIN, callbackUrl e quais segredos
      // existem, sem nenhuma tela consumir.
      const jwt = await new SignJWT({ email: 'admin@test.com', jti: 'j-cfg' })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject('sub-admin')
        .setIssuedAt()
        .setExpirationTime('2h')
        .sign(new TextEncoder().encode('0123456789abcdef0123456789abcdef'));

      const res = await app.request('/auth/status', {
        headers: { cookie: `coldigom_access=${encodeURIComponent(jwt)}` },
      }, {
        DB: mockDB,
        ASSETS: mockR2,
        GOOGLE_CLIENT_ID: 'client-id',
        GOOGLE_CLIENT_SECRET: 'secret',
        AUTH_JWT_SECRET: '0123456789abcdef0123456789abcdef',
        AUTH_ALLOWED_EMAILS: '*',
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

  describe('POST /api/praises', () => {
    const envBase = {
      AUTH_JWT_SECRET: TEST_JWT_SECRET,
      AUTH_ALLOWED_EMAILS: '*',
      WEB_ORIGIN: TEST_WEB_ORIGIN,
    };

    it('returns 401 without auth', async () => {
      const mockDB = createStatefulMockD1();
      const mockR2 = createMockR2();

      const res = await app.request(
        '/api/praises',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: TEST_WEB_ORIGIN },
          body: JSON.stringify({ name: 'Novo Louvor' }),
        },
        { DB: mockDB, ASSETS: mockR2, ...envBase }
      );

      expect(res.status).toBe(401);
    });

    it('returns 400 when name is missing', async () => {
      const mockDB = createStatefulMockD1();
      const mockR2 = createMockR2();

      const res = await app.request(
        '/api/praises',
        await authRequestInit({}),
        { DB: mockDB, ASSETS: mockR2, ...envBase }
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('name');
    });

    it('returns 400 when name is empty', async () => {
      const mockDB = createStatefulMockD1();
      const mockR2 = createMockR2();

      const res = await app.request(
        '/api/praises',
        await authRequestInit({ name: '   ' }),
        { DB: mockDB, ASSETS: mockR2, ...envBase }
      );

      expect(res.status).toBe(400);
    });

    it('creates praise with minimal name', async () => {
      const mockDB = createStatefulMockD1();
      const mockR2 = createMockR2();

      const res = await app.request(
        '/api/praises',
        await authRequestInit({ name: 'Louvor Novo' }),
        { DB: mockDB, ASSETS: mockR2, ...envBase }
      );

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.data.name).toBe('Louvor Novo');
      expect(json.data.materials).toEqual([]);
    });

    it('creates praise with metadata and tag_ids', async () => {
      const mockDB = createStatefulMockD1();
      const mockR2 = createMockR2();

      const res = await app.request(
        '/api/praises',
        await authRequestInit({
          name: 'Completo',
          number: '099',
          author: 'Autor X',
          rhythm: 'Marcha',
          tonality: 'C',
          category: 'Adoração',
          lyrics: 'Letra nova',
          tag_ids: ['tag1', 'tag2'],
        }),
        { DB: mockDB, ASSETS: mockR2, ...envBase }
      );

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.data.name).toBe('Completo');
      expect(json.data.number).toBe('099');
      expect(json.data.tags).toHaveLength(2);
      expect(json.data.tags.map((t: { id: string }) => t.id).sort()).toEqual(['tag1', 'tag2']);
    });

    it('returns 400 when tag_id does not exist', async () => {
      const mockDB = createStatefulMockD1();
      const mockR2 = createMockR2();

      const res = await app.request(
        '/api/praises',
        await authRequestInit({ name: 'Com tag inválida', tag_ids: ['missing-tag'] }),
        { DB: mockDB, ASSETS: mockR2, ...envBase }
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('Tag not found');
    });
  });

  describe('POST /api/tags', () => {
    const envBase = {
      AUTH_JWT_SECRET: TEST_JWT_SECRET,
      AUTH_ALLOWED_EMAILS: '*',
      WEB_ORIGIN: TEST_WEB_ORIGIN,
    };

    function createTagsMockD1(extraTags: typeof mockTags = []) {
      const tags = [...mockTags, ...extraTags];
      return {
        prepare: vi.fn((query: string) => ({
          bind: vi.fn((...args: unknown[]) => ({
            run: vi.fn(async () => {
              if (query.includes('INSERT INTO tags')) {
                tags.push({
                  id: args[0] as string,
                  name: args[1] as string,
                  parent_id: (args[2] as string | null) ?? null,
                });
              }
            }),
            first: vi.fn(async () => {
              if (query.includes('FROM tags WHERE parent_id')) {
                return tags.find((t) => t.parent_id === args[0]) ?? null;
              }
              if (query.includes('SELECT id, parent_id FROM tags') || query.includes('SELECT id, parent_id')) {
                const t = tags.find((x) => x.id === args[0]);
                return t ? { id: t.id, parent_id: t.parent_id } : null;
              }
              if (query.includes('SELECT name FROM tags')) {
                const t = tags.find((x) => x.id === args[0]);
                return t ? { name: t.name } : null;
              }
              if (query.includes('FROM tags')) {
                return tags.find((t) => t.id === args[0]) ?? null;
              }
              return null;
            }),
            all: vi.fn(async () => ({ results: tags })),
          })),
        })),
      };
    }

    it('creates a subtag under a root', async () => {
      const mockDB = createTagsMockD1();
      const res = await app.request(
        '/api/tags',
        await authRequestInit({ name: '4.2026', parent_id: 'tag1' }),
        { DB: mockDB, ASSETS: createMockR2(), ...envBase }
      );
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.data.name).toBe('4.2026');
      expect(json.data.parent_id).toBe('tag1');
      expect(json.data.parent_name).toBe('Coletânea');
    });

    it('rejects nested subtag (parent already has parent)', async () => {
      const mockDB = createTagsMockD1([
        { id: 'child1', name: '2025', parent_id: 'tag1' },
      ]);
      const res = await app.request(
        '/api/tags',
        await authRequestInit({ name: 'nested', parent_id: 'child1' }),
        { DB: mockDB, ASSETS: createMockR2(), ...envBase }
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('one level');
    });
  });

  describe('POST /api/praises/:id/tags leaf-only', () => {
    const envBase = {
      AUTH_JWT_SECRET: TEST_JWT_SECRET,
      AUTH_ALLOWED_EMAILS: '*',
      WEB_ORIGIN: TEST_WEB_ORIGIN,
    };

    it('rejects attaching a parent that has children', async () => {
      const tags = [
        ...mockTags,
        { id: 'child1', name: '4.2026', parent_id: 'tag1' },
      ];
      const mockDB = {
        prepare: vi.fn((query: string) => ({
          bind: vi.fn((...args: unknown[]) => ({
            run: vi.fn(),
            first: vi.fn(async () => {
              if (query.includes('SELECT id FROM praises')) {
                return { id: mockPraises[0].id };
              }
              if (query.includes('FROM tags WHERE parent_id')) {
                return tags.find((t) => t.parent_id === args[0]) ?? null;
              }
              if (query.includes('FROM tags')) {
                return tags.find((t) => t.id === args[0]) ?? null;
              }
              return null;
            }),
            all: vi.fn(async () => ({ results: [] })),
          })),
        })),
      };

      const res = await app.request(
        `/api/praises/${mockPraises[0].id}/tags`,
        await authRequestInit({ tag_id: 'tag1' }),
        { DB: mockDB, ASSETS: createMockR2(), ...envBase }
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('subtag');
    });
  });

  describe('POST /api/praises/:keeperId/merge', () => {
    const envBase = {
      AUTH_JWT_SECRET: TEST_JWT_SECRET,
      AUTH_ALLOWED_EMAILS: '*',
      WEB_ORIGIN: TEST_WEB_ORIGIN,
    };
    const keeperId = mockPraises[0].id;
    const sourceId = mockPraises[1].id;

    function createMergeMockD1() {
      const praises = new Map<string, Record<string, unknown>>([
        [keeperId, { ...mockPraises[0] }],
        [sourceId, { ...mockPraises[1] }],
      ]);
      const materials = new Map<string, Record<string, unknown>>([
        [
          'mat-source',
          {
            id: 'mat-source',
            praise_id: sourceId,
            material_kind: 'kind1',
            type: 'pdf',
            r2_key: `assets/praises/${sourceId}/mat-source.pdf`,
            file_path_legacy: '',
            source_material_id: null,
            merged_from_praise_id: null,
            url: null,
          },
        ],
        [
          'mat-leftover',
          {
            id: 'mat-leftover',
            praise_id: sourceId,
            material_kind: 'kind2',
            type: 'mp3',
            r2_key: `assets/praises/${sourceId}/mat-leftover.mp3`,
            file_path_legacy: '',
            source_material_id: null,
            merged_from_praise_id: null,
            url: null,
          },
        ],
      ]);
      const praiseTagIds = new Map<string, string[]>([
        [keeperId, ['tag1']],
        [sourceId, ['tag2']],
      ]);
      const assetsDelete = vi.fn().mockResolvedValue(undefined);

      const db = {
        /**
         * O merge passou a escrever em lote, para ser atômico: o D1 executa a
         * sequência em transação e reverte tudo se um statement falhar. O mock
         * executa os statements em ordem, que é o mesmo efeito no caminho feliz
         * — assim as asserções sobre o estado final continuam valendo.
         */
        batch: vi.fn(async (stmts: { run: () => Promise<unknown> }[]) => {
          const saidas = [];
          for (const stmt of stmts) saidas.push(await stmt.run());
          return saidas;
        }),
        prepare: vi.fn((query: string) => ({
          bind: vi.fn((...args: unknown[]) => ({
            run: vi.fn(async () => {
              if (query.includes('UPDATE praises SET')) {
                const id = args[7] as string;
                const p = praises.get(id);
                if (p) {
                  praises.set(id, {
                    ...p,
                    name: args[0],
                    number: args[1],
                    author: args[2],
                    rhythm: args[3],
                    tonality: args[4],
                    category: args[5],
                    lyrics: args[6],
                  });
                }
              }
              if (query.includes('DELETE FROM praise_tags WHERE praise_id')) {
                praiseTagIds.set(args[0] as string, []);
              }
              if (query.includes('INSERT OR IGNORE INTO praise_tags')) {
                const pid = args[0] as string;
                const tid = args[1] as string;
                const list = praiseTagIds.get(pid) ?? [];
                if (!list.includes(tid)) list.push(tid);
                praiseTagIds.set(pid, list);
              }
              if (query.includes('UPDATE praise_materials SET praise_id')) {
                const mat = materials.get(args[2] as string);
                if (mat) {
                  materials.set(args[2] as string, {
                    ...mat,
                    praise_id: args[0],
                    merged_from_praise_id: args[1],
                  });
                }
              }
              if (query.includes('DELETE FROM praises WHERE id')) {
                praises.delete(args[0] as string);
                for (const [mid, m] of materials.entries()) {
                  if ((m as { praise_id: string }).praise_id === args[0]) {
                    materials.delete(mid);
                  }
                }
                praiseTagIds.delete(args[0] as string);
              }
            }),
            first: vi.fn(async () => {
              if (query.includes('SELECT id FROM praises WHERE id')) {
                return praises.has(args[0] as string) ? { id: args[0] } : null;
              }
              if (query.includes('FROM tags WHERE parent_id')) {
                return mockTags.find((t) => t.parent_id === args[0]) ?? null;
              }
              if (query.includes('SELECT id FROM tags WHERE id')) {
                return mockTags.find((t) => t.id === args[0]) ?? null;
              }
              if (query.includes('SELECT id, praise_id FROM praise_materials')) {
                const m = materials.get(args[0] as string);
                return m ? { id: m.id, praise_id: m.praise_id } : null;
              }
              if (query.includes('FROM praises p') && query.includes('WHERE p.id')) {
                const p = praises.get(args[0] as string);
                if (!p) return null;
                const tagIds = praiseTagIds.get(p.id as string) ?? [];
                return { ...p, tag_ids: tagIds.length > 0 ? tagIds.join(',') : null };
              }
              if (query.includes('SELECT praise_id, r2_key FROM praise_materials')) {
                const pid = args[0] as string;
                const row = [...materials.values()].find((m) => (m as { praise_id: string }).praise_id === pid);
                return row ? { praise_id: row.praise_id, r2_key: row.r2_key } : null;
              }
              return null;
            }),
            all: vi.fn(async () => {
              if (query.includes('COALESCE(t.label')) {
                if (query.includes('AS name')) return { results: mockMaterialKinds };
                return { results: mockMaterialKindLabels };
              }
              if (query.includes('SELECT id, r2_key FROM praise_materials WHERE praise_id')) {
                const pid = args[0] as string;
                return {
                  results: [...materials.values()].filter((m) => (m as { praise_id: string }).praise_id === pid),
                };
              }
              if (query.includes('FROM praise_materials pm')) {
                const pid = args[0] as string;
                return {
                  results: [...materials.values()].filter((m) => (m as { praise_id: string }).praise_id === pid),
                };
              }
              if (query.includes('id IN') && query.includes('tags')) {
                const ids = args as string[];
                return {
                  results: mockTags
                    .filter((t) => ids.includes(t.id))
                    .map((t) => ({
                      ...t,
                      parent_name: t.parent_id
                        ? mockTags.find((p) => p.id === t.parent_id)?.name ?? null
                        : null,
                    })),
                };
              }
              return resolveMockAll(query, {});
            }),
          })),
        })),
      };

      return { db, assetsDelete, materials, praises };
    }

    const mergeBody = {
      source_praise_id: sourceId,
      metadata: {
        name: 'Grande Deus',
        number: '001',
        author: 'Autor mesclado',
        rhythm: 'Avulsos',
        tonality: 'C',
        category: 'Louvor',
        lyrics: 'Letra escolhida',
      },
      tag_ids: ['tag1', 'tag2'],
      material_ids_to_import: ['mat-source'],
    };

    it('returns 401 without auth', async () => {
      const { db } = createMergeMockD1();
      const mockR2 = { delete: vi.fn() };

      const res = await app.request(
        `/api/praises/${keeperId}/merge`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: TEST_WEB_ORIGIN },
          body: JSON.stringify(mergeBody),
        },
        { DB: db, ASSETS: mockR2, ...envBase }
      );

      expect(res.status).toBe(401);
    });

    it('returns 400 when merging into itself', async () => {
      const { db } = createMergeMockD1();
      const mockR2 = { delete: vi.fn() };

      const res = await app.request(
        `/api/praises/${keeperId}/merge`,
        await authRequestInit({ ...mergeBody, source_praise_id: keeperId }),
        { DB: db, ASSETS: mockR2, ...envBase }
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('itself');
    });

    it('merges source into keeper and deletes source', async () => {
      const { db, assetsDelete, materials, praises } = createMergeMockD1();
      const mockR2 = { delete: assetsDelete };

      const res = await app.request(
        `/api/praises/${keeperId}/merge`,
        await authRequestInit(mergeBody),
        { DB: db, ASSETS: mockR2, ...envBase }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.author).toBe('Autor mesclado');
      expect(json.data.tags.map((t: { id: string }) => t.id).sort()).toEqual(['tag1', 'tag2']);
      expect(praises.has(sourceId)).toBe(false);
      const moved = materials.get('mat-source') as { praise_id: string; merged_from_praise_id: string };
      expect(moved.praise_id).toBe(keeperId);
      expect(moved.merged_from_praise_id).toBe(sourceId);
      expect(assetsDelete).toHaveBeenCalled();
    });

    it('returns 409 when material does not belong to source', async () => {
      const { db } = createMergeMockD1();
      const mockR2 = { delete: vi.fn() };

      const res = await app.request(
        `/api/praises/${keeperId}/merge`,
        await authRequestInit({ ...mergeBody, material_ids_to_import: ['mat1'] }),
        { DB: db, ASSETS: mockR2, ...envBase }
      );

      expect(res.status).toBe(409);
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
          AUTH_ALLOWED_EMAILS: '*',
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
          AUTH_ALLOWED_EMAILS: '*',
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
      conditions.push(`(p.name LIKE ? OR p.lyrics LIKE ? OR p.author LIKE ? OR p.rhythm LIKE ? OR p.tonality LIKE ? OR p.category LIKE ? OR p.id LIKE ?)`);
      const pattern = `%${params.search}%`;
      bindings.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern);
    }

    if (params.tagGroups && params.tagGroups.length > 0) {
      for (const group of params.tagGroups) {
        conditions.push(`p.id IN (SELECT praise_id FROM praise_tags WHERE tag_id IN (${group.map(() => '?').join(',')}))`);
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
    expect(result.clause).toContain('p.id LIKE ?');
    expect(result.bindings).toEqual(['%test%', '%test%', '%test%', '%test%', '%test%', '%test%', '%test%']);
  });

  it('should include id in search bindings for uuid', () => {
    const uuid = '1b2b33ab-4dff-4014-8582-dcb9a92efbc8';
    const result = buildWhereClause({ search: uuid });
    expect(result.clause).toContain('p.id LIKE ?');
    expect(result.bindings).toContain(`%${uuid}%`);
  });

  it('should build single tag clause correctly', () => {
    const result = buildWhereClause({ tagGroups: [['tag1']] });
    expect(result.clause).toContain('tag_id IN (?)');
    expect(result.bindings).toEqual(['tag1']);
  });

  it('should build multiple tags clause correctly', () => {
    const result = buildWhereClause({ tagGroups: [['tag1'], ['tag2'], ['tag3']] });
    expect(result.clause).toContain('tag_id IN (?)');
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

  it('should build materialKinds clause correctly', () => {
    const result = buildWhereClause({ materialKinds: ['kind1', 'kind2'] });
    expect(result.clause).toContain('praise_materials pm');
    expect(result.clause).toContain('pm.material_kind IN (?,?)');
    expect(result.clause).toContain('HAVING COUNT(DISTINCT pm.material_kind) = ?');
    expect(result.bindings).toEqual(['kind1', 'kind2', 2]);
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
      tagGroups: [['tag1']],
      rhythm: ['Avulsos'],
      numberMin: 1,
      numberMax: 10,
    });
    expect(result.clause).toContain('WHERE');
    expect(result.clause).toContain('p.name LIKE ?');
    expect(result.clause).toContain('tag_id IN (?)');
    expect(result.clause).toContain('p.rhythm IN (?)');
    expect(result.clause).toContain('CAST(p.number AS INTEGER) >= ?');
    expect(result.clause).toContain('CAST(p.number AS INTEGER) <= ?');
    expect(result.bindings).toHaveLength(11);
  });
});

describe('AUTH_ALLOWED_EMAILS — autorização de quem já autenticou', () => {
  // authRequestInit assina a sessão de admin@test.com.
  const baseEnv = {
    AUTH_JWT_SECRET: TEST_JWT_SECRET,
    WEB_ORIGIN: TEST_WEB_ORIGIN,
  };

  function tagsDb() {
    return {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          run: vi.fn(async () => ({})),
          first: vi.fn(async () => null),
          all: vi.fn(async () => ({ results: [] })),
        })),
      })),
    };
  }

  it('recusa com 500 quando a política não está configurada', async () => {
    const res = await app.request(
      '/api/tags',
      await authRequestInit({ name: 'Nova' }),
      { ...baseEnv, DB: tagsDb(), ASSETS: createMockR2() }
    );
    expect(res.status).toBe(500);
  });

  it('deixa passar quando a política é "*"', async () => {
    const res = await app.request(
      '/api/tags',
      await authRequestInit({ name: 'Nova' }),
      { ...baseEnv, AUTH_ALLOWED_EMAILS: '*', DB: tagsDb(), ASSETS: createMockR2() }
    );
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(500);
  });

  it('deixa passar quem está na lista', async () => {
    const res = await app.request(
      '/api/tags',
      await authRequestInit({ name: 'Nova' }),
      {
        ...baseEnv,
        AUTH_ALLOWED_EMAILS: 'outro@exemplo.org,admin@test.com',
        DB: tagsDb(),
        ASSETS: createMockR2(),
      }
    );
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(500);
  });

  it('recusa com 403 quem autenticou mas não está na lista', async () => {
    const res = await app.request(
      '/api/tags',
      await authRequestInit({ name: 'Nova' }),
      {
        ...baseEnv,
        AUTH_ALLOWED_EMAILS: 'so-esse@exemplo.org',
        DB: tagsDb(),
        ASSETS: createMockR2(),
      }
    );
    expect(res.status).toBe(403);
  });

  it('o token de upload do review-app continua passando sem política de e-mail', async () => {
    // O review-app roda sem sessão e sem e-mail; a lista não se aplica a ele.
    const uploadToken = 'test-upload-token-abc';
    const mockDB = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          first: vi.fn(async () => ({
            id: 'chord-mat-1',
            praise_id: 'praise-1',
            type: 'chord',
            r2_key: 'storage/assets/praises/praise-1/chord-mat-1.chord',
          })),
          run: vi.fn(async () => ({})),
        })),
      })),
    };
    const res = await app.request(
      '/api/materials/chord-mat-1/content',
      {
        method: 'PUT',
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          authorization: `Bearer ${uploadToken}`,
        },
        body: '{title: ViaToken}',
      },
      { ...baseEnv, DB: mockDB, ASSETS: createMockR2(), COLDIGOM_UPLOAD_TOKEN: uploadToken }
    );
    expect(res.status).toBe(200);
  });
});

describe('destino de redirect depois do OAuth', () => {
  const baseEnv = {
    AUTH_JWT_SECRET: TEST_JWT_SECRET,
    AUTH_ALLOWED_EMAILS: '*',
    WEB_ORIGIN: TEST_WEB_ORIGIN,
    GOOGLE_CLIENT_ID: 'test-client-id',
  };

  /** Sessão válida num GET — /auth/drive/connect é GET, não POST. */
  async function authGet(): Promise<RequestInit> {
    const jwt = await new SignJWT({ email: 'admin@test.com', name: 'Admin', jti: 'j-drive' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('sub-admin')
      .setIssuedAt()
      .setExpirationTime('2h')
      .sign(new TextEncoder().encode(TEST_JWT_SECRET));
    return {
      method: 'GET',
      headers: {
        origin: TEST_WEB_ORIGIN,
        cookie: `coldigom_access=${encodeURIComponent(jwt)}`,
      },
    };
  }

  it('/auth/callback não leva para fora do site quando o fluxo falha', async () => {
    // Sem code/state o callback lança de imediato e cai no catch. O caminho de
    // erro usava o parâmetro cru, virando trampolim de phishing a partir do
    // nosso domínio — sem precisar de login nenhum.
    const res = await app.request(
      '/auth/callback?redirect=https://evil.example/roubo',
      {},
      { ...baseEnv, DB: createMockD1({}), ASSETS: createMockR2() }
    );

    expect(res.status).toBe(302);
    const location = res.headers.get('location') ?? '';
    expect(location).not.toContain('evil.example');
  });

  it('/auth/drive/connect não guarda destino de fora do site', async () => {
    // O destino vai para o oauth_pending e volta como redirect do callback.
    const binds: unknown[][] = [];
    const db = {
      prepare: vi.fn(() => ({
        bind: vi.fn((...args: unknown[]) => {
          binds.push(args);
          return { run: vi.fn(async () => ({})), first: vi.fn(async () => null) };
        }),
      })),
    };

    const res = await app.request(
      '/auth/drive/connect?redirect=https://evil.example/roubo',
      await authGet(),
      { ...baseEnv, DB: db, ASSETS: createMockR2() }
    );

    expect(res.status).toBe(302);
    const guardado = binds.flat().filter((v): v is string => typeof v === 'string');
    expect(guardado.some((v) => v.includes('evil.example'))).toBe(false);
  });

  it('/auth/drive/connect preserva destino absoluto do próprio site', async () => {
    // O fluxo do Drive volta para uma URL absoluta de propósito; sanitizar para
    // caminho relativo mandaria o usuário para a origem da API.
    const binds: unknown[][] = [];
    const db = {
      prepare: vi.fn(() => ({
        bind: vi.fn((...args: unknown[]) => {
          binds.push(args);
          return { run: vi.fn(async () => ({})), first: vi.fn(async () => null) };
        }),
      })),
    };
    const destino = `${TEST_WEB_ORIGIN}/praise/abc`;

    await app.request(
      `/auth/drive/connect?redirect=${encodeURIComponent(destino)}`,
      await authGet(),
      { ...baseEnv, DB: db, ASSETS: createMockR2() }
    );

    const guardado = binds.flat().filter((v): v is string => typeof v === 'string');
    expect(guardado).toContain(destino);
  });
});

describe('endurecimento da borda', () => {
  const baseEnv = {
    AUTH_JWT_SECRET: TEST_JWT_SECRET,
    AUTH_ALLOWED_EMAILS: '*',
    WEB_ORIGIN: TEST_WEB_ORIGIN,
  };

  it('/auth/status não é mais público', async () => {
    // Devolvia o WEB_ORIGIN inteiro, o callbackUrl e quais segredos existem.
    // Nenhuma tela do site consome — é endpoint de diagnóstico.
    const res = await app.request('/auth/status', {}, { ...baseEnv, DB: createMockD1({}), ASSETS: createMockR2() });
    expect(res.status).toBe(401);
  });

  it('/auth/status responde para quem está autenticado', async () => {
    const jwt = await new SignJWT({ email: 'admin@test.com', jti: 'j-status' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('sub-admin')
      .setIssuedAt()
      .setExpirationTime('2h')
      .sign(new TextEncoder().encode(TEST_JWT_SECRET));

    const res = await app.request(
      '/auth/status',
      { headers: { origin: TEST_WEB_ORIGIN, cookie: `coldigom_access=${encodeURIComponent(jwt)}` } },
      { ...baseEnv, DB: createMockD1({}), ASSETS: createMockR2() }
    );
    expect(res.status).toBe(200);
  });

  it('token de upload errado no último caractere é recusado', async () => {
    // Guarda contra comparação por prefixo; a propriedade de tempo constante em
    // si não é observável por teste.
    const res = await app.request(
      '/api/materials/chord-mat-1/content',
      {
        method: 'PUT',
        headers: {
          'content-type': 'text/plain',
          origin: TEST_WEB_ORIGIN,
          authorization: 'Bearer test-upload-token-abd',
        },
        body: '{title: X}',
      },
      { ...baseEnv, DB: createMockD1(), ASSETS: createMockR2(), COLDIGOM_UPLOAD_TOKEN: 'test-upload-token-abc' }
    );
    expect(res.status).toBe(401);
  });
});

