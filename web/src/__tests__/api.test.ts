import { describe, expect, it, vi, beforeEach } from 'vitest';
import { searchPraises, getFilterOptions, getPraise, getMaterialKinds, getTags, getAssetUrl, updatePraise, createMaterial, updateMaterial, deleteMaterial, bulkUploadMaterials, getMe, logout } from '../services/api';
import type { ApiResponse, Praise, PraiseDetail, MaterialKind, Tag, FilterOptions } from '../types';

// Mock fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

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
        expect.objectContaining({ credentials: 'include' })
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
        expect.objectContaining({ credentials: 'include' })
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
        expect.objectContaining({ credentials: 'include' })
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=10'),
        expect.objectContaining({ credentials: 'include' })
      );
    });

    it('should include array filters as comma-separated', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await searchPraises({ tags: ['tag1', 'tag2'], rhythm: ['Avulsos'] });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('tags=tag1%2Ctag2'),
        expect.objectContaining({ credentials: 'include' })
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('rhythm=Avulsos'),
        expect.objectContaining({ credentials: 'include' })
      );
    });

    it('should include number range parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await searchPraises({ numberMin: 1, numberMax: 10 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('numberMin=1'),
        expect.objectContaining({ credentials: 'include' })
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('numberMax=10'),
        expect.objectContaining({ credentials: 'include' })
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
        expect.objectContaining({ credentials: 'include' })
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('order=desc'),
        expect.objectContaining({ credentials: 'include' })
      );
    });

    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Server error' }),
      });

      await expect(searchPraises()).rejects.toThrow('Server error');
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
        { id: 'tag1', name: 'Coletânea', count: 10 },
        { id: 'tag2', name: 'Avulsos', count: 5 },
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
        expect.objectContaining({ credentials: 'include' })
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
      tag_ids: 'tag1,tag2',
      tags: [
        { id: 'tag1', name: 'Coletânea' },
        { id: 'tag2', name: 'Avulsos' },
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
    };

    it('should return praise detail', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockPraiseDetail }),
      });

      const result = await getPraise('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/praises/1b2b33ab-4dff-4014-8582-dcb9a92efbc8'),
        expect.objectContaining({ credentials: 'include' })
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
        expect.objectContaining({ credentials: 'include' })
      );
      expect(result).toHaveLength(2);
    });
  });

  describe('getTags', () => {
    const mockTags: Tag[] = [
      { id: 'tag1', name: 'Coletânea' },
      { id: 'tag2', name: 'Avulsos' },
    ];

    it('should return tags', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockTags }),
      });

      const result = await getTags();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/tags'),
        expect.objectContaining({ credentials: 'include' })
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

  describe('write endpoints', () => {
    it('should PATCH praise updates', async () => {
      const mockPraiseDetail = { id: 'p1' } as any as PraiseDetail;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockPraiseDetail }),
      });

      await updatePraise('p1', { name: 'Novo' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/praises/p1'),
        expect.objectContaining({
          method: 'PATCH',
          credentials: 'include',
        })
      );
    });

    it('should POST createMaterial', async () => {
      const mockPraiseDetail = { id: 'p1' } as any as PraiseDetail;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockPraiseDetail }),
      });

      await createMaterial('p1', { material_kind: 'k1', type: 'youtube', url: 'https://youtu.be/abc' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/praises/p1/materials'),
        expect.objectContaining({ method: 'POST', credentials: 'include' })
      );
    });

    it('should PATCH updateMaterial', async () => {
      const mockPraiseDetail = { id: 'p1' } as any as PraiseDetail;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockPraiseDetail }),
      });

      await updateMaterial('m1', { material_kind: 'k2' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/materials/m1'),
        expect.objectContaining({ method: 'PATCH', credentials: 'include' })
      );
    });

    it('should DELETE deleteMaterial', async () => {
      const mockPraiseDetail = { id: 'p1' } as any as PraiseDetail;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockPraiseDetail }),
      });

      await deleteMaterial('m1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/materials/m1'),
        expect.objectContaining({ method: 'DELETE', credentials: 'include' })
      );
    });

    it('should bulkUploadMaterials using FormData', async () => {
      const mockPraiseDetail = { id: 'p1' } as any as PraiseDetail;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockPraiseDetail }),
      });

      const file = new File(['abc'], 'a.pdf', { type: 'application/pdf' });
      await bulkUploadMaterials('p1', [{ file, material_kind: 'k1', type: 'pdf', file_path_legacy: 'dir/a.pdf' }]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/praises/p1/materials/bulk-upload'),
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          body: expect.any(FormData),
        })
      );
    });
  });

  describe('auth', () => {
    it('should call /auth/me', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ user: null }),
      });
      await getMe();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/me'),
        expect.objectContaining({ credentials: 'include' })
      );
    });

    it('should POST /auth/logout', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });
      await logout();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/logout'),
        expect.objectContaining({ method: 'POST', credentials: 'include' })
      );
    });
  });
});
