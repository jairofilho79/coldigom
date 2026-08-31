import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { searchPraises, getFilterOptions, getPraise, getPraiseDownloadZipUrl, getMaterialKinds, getTags, getAssetUrl, setAuthTokens, clearAuthTokens } from '../services/api';
import type { ApiResponse, Praise, PraiseDetail, MaterialKind, Tag, FilterOptions } from '../types';

// Mock fetch (API client always sends credentials: 'include')
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;
// objectContaining, e não igualdade exata: o fetchJson também injeta `headers`
// (o Bearer da sessão). O que importa aqui é a credencial ir junto; o cabeçalho
// de autorização tem asserção própria em "Authorization header" abaixo.
const withCreds = expect.objectContaining({ credentials: 'include' });

describe('API Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('searchPraises', () => {
    const mockPraises: Praise[] = [
      {
        id: '1b2b33ab-4dff-4014-8582-dcb9a92efbc8',
        name: 'Grande Deus',
        number: '001',
        author: 'Autor 1',
        rhythm: 'Avulsos',
        tonality: 'C',
        category: 'Louvor',
        lyrics: 'Letra do louvor 1',
        group_id: null,
        tag_ids: 'tag1,tag2',
        tag_names: 'Coletânea,GLTM',
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
        group_id: null,
        tag_ids: 'tag1',
        tag_names: 'Coletânea',
      },
    ];

    const mockResponse: ApiResponse<Praise[]> = {
      data: mockPraises,
      pagination: {
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
      },
    };

    it('should call API with default parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await searchPraises();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/praises'),
        withCreds
      );
      expect(result.data).toEqual(mockPraises);
      expect(result.pagination.total).toBe(2);
    });

    it('should include query parameter when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await searchPraises({ query: 'Grande' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('q=Grande'),
        withCreds
      );
    });

    it('should include pagination parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await searchPraises({ page: 2, limit: 10 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('page=2'),
        withCreds
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=10'),
        withCreds
      );
    });

    it('should include array filters as comma-separated', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await searchPraises({ tags: ['tag1', 'tag2'], rhythm: ['Avulsos'] });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      const url = new URL(calledUrl);
      expect(url.searchParams.get('tags')).toBe('tag1,tag2');
      expect(url.searchParams.get('rhythm')).toBe('Avulsos');
    });

    it('should include materialKinds filter as comma-separated', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await searchPraises({ materialKinds: ['kind1', 'kind2'] });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      const url = new URL(calledUrl);
      expect(url.searchParams.get('materialKinds')).toBe('kind1,kind2');
    });

    it('should include number range parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await searchPraises({ numberMin: 1, numberMax: 10 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('numberMin=1'),
        withCreds
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('numberMax=10'),
        withCreds
      );
    });

    it('should include sort and order parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await searchPraises({ sort: 'name', order: 'desc' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('sort=name'),
        withCreds
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('order=desc'),
        withCreds
      );
    });

    it('should retry after 401 when session refresh succeeds', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: 'Unauthorized' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ ok: true, user: { sub: 'u1' } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

      const result = await searchPraises();

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result.data).toEqual(mockPraises);
      const urls = mockFetch.mock.calls.map(c => String(c[0]));
      expect(urls.some(u => u.includes('/auth/refresh'))).toBe(true);
      const refreshCall = mockFetch.mock.calls.find(c => String(c[0]).includes('/auth/refresh'));
      expect((refreshCall?.[1] as RequestInit)?.method).toBe('POST');
    });

    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Server error' }),
      });

      await expect(searchPraises()).rejects.toThrow('Server error');
    });

    it('should include category parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await searchPraises({ category: ['Louvor', 'Adoração'] });

      const url = new URL(mockFetch.mock.calls[0][0] as string);
      expect(url.searchParams.get('category')).toBe('Louvor,Adoração');
    });

    it('should include tonality parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await searchPraises({ tonality: ['C', 'G'] });

      const url = new URL(mockFetch.mock.calls[0][0] as string);
      expect(url.searchParams.get('tonality')).toBe('C,G');
    });

    it('should prefer JSON error message when present', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Bad request' }),
      });

      await expect(searchPraises()).rejects.toThrow('Bad request');
    });

    it('should fall back to HTTP status when error JSON has no message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: () => Promise.resolve({}),
      });

      await expect(searchPraises()).rejects.toThrow('HTTP 503');
    });

    it('should throw generic error when response parsing fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('Parse error')),
      });

      await expect(searchPraises()).rejects.toThrow('Request failed');
    });
  });

  describe('getFilterOptions', () => {
    const mockFilterOptions: FilterOptions = {
      rhythms: ['Avulsos', 'Coletânea'],
      tonalities: ['C', 'G'],
      categories: ['Louvor', 'Adoração'],
      tags: [
        { id: 'tag1', name: 'Coletânea', parent_id: null, count: 10 },
        { id: 'tag2', name: 'Avulsos', parent_id: null, count: 5 },
      ],
    };

    it('should return filter options', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockFilterOptions),
      });

      const result = await getFilterOptions();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/praises/filters'),
        withCreds
      );
      expect(result.rhythms).toEqual(['Avulsos', 'Coletânea']);
      expect(result.tags).toHaveLength(2);
    });

    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Server error' }),
      });

      await expect(getFilterOptions()).rejects.toThrow('Server error');
    });
  });

  describe('getPraise', () => {
    const mockPraiseDetail: PraiseDetail = {
      id: '1b2b33ab-4dff-4014-8582-dcb9a92efbc8',
      name: 'Grande Deus',
      number: '001',
      author: 'Autor 1',
      rhythm: 'Avulsos',
      tonality: 'C',
      category: 'Louvor',
      lyrics: 'Letra do louvor 1',
      group_id: null,
      tag_ids: 'tag1,tag2',
      tag_names: 'Coletânea,Avulsos',
      tags: [
        { id: 'tag1', name: 'Coletânea', parent_id: null },
        { id: 'tag2', name: 'Avulsos', parent_id: null },
      ],
      materials: [
        {
          id: 'mat1',
          praise_id: '1b2b33ab-4dff-4014-8582-dcb9a92efbc8',
          material_kind: 'kind1',
          material_kind_name: 'Partitura',
          type: 'pdf',
          r2_key: 'assets/praises/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/mat1.pdf',
          file_path_legacy: 'path/to/file.pdf',
          source_material_id: null,
        },
      ],
      group_members: [],
    };

    it('should return praise detail', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockPraiseDetail }),
      });

      const result = await getPraise('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/praises/1b2b33ab-4dff-4014-8582-dcb9a92efbc8'),
        withCreds
      );
      expect(result.name).toBe('Grande Deus');
      expect(result.materials).toHaveLength(1);
    });

    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Praise not found' }),
      });

      await expect(getPraise('non-existent')).rejects.toThrow('Praise not found');
    });
  });

  describe('getPraiseDownloadZipUrl', () => {
    it('should return public download zip URL for praise id', () => {
      expect(getPraiseDownloadZipUrl('1b2b33ab-4dff-4014-8582-dcb9a92efbc8')).toBe(
        'http://localhost:8787/api/praises/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/download.zip'
      );
    });
  });

  describe('getMaterialKinds', () => {
    const mockMaterialKinds: MaterialKind[] = [
      { id: 'kind1', name: 'Partitura' },
      { id: 'kind2', name: 'Audio' },
    ];

    it('should return material kinds', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockMaterialKinds }),
      });

      const result = await getMaterialKinds();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/materials/kinds'),
        withCreds
      );
      expect(result).toHaveLength(2);
    });
  });

  describe('getTags', () => {
    const mockTags: Tag[] = [
      { id: 'tag1', name: 'Coletânea', parent_id: null },
      { id: 'tag2', name: 'Avulsos', parent_id: null },
    ];

    it('should return tags', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockTags }),
      });

      const result = await getTags();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/tags'),
        withCreds
      );
      expect(result).toHaveLength(2);
    });
  });

  describe('getAssetUrl', () => {
    it('should return full URL for asset', () => {
      const r2Key = 'assets/praises/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/file.pdf';
      const result = getAssetUrl(r2Key);
      
      expect(result).toContain(r2Key);
    });
  });

  // O Bearer da sessão é injetado pelo fetchJson em toda chamada. Antes isto era
  // garantido por acidente, pela igualdade exata do init nas asserções acima;
  // agora é explícito — inclusive o caso anônimo, que não pode vazar cabeçalho.
  describe('Authorization header', () => {
    afterEach(() => {
      clearAuthTokens();
    });

    it('omite Authorization quando não há sessão', async () => {
      clearAuthTokens();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      await getTags();

      const [, init] = mockFetch.mock.calls[0];
      expect(init.headers).toEqual({});
    });

    it('envia o access token como Bearer quando há sessão', async () => {
      setAuthTokens('access-abc', 'refresh-xyz');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      await getTags();

      const [, init] = mockFetch.mock.calls[0];
      expect(init.headers).toEqual({ Authorization: 'Bearer access-abc' });
    });
  });
});
