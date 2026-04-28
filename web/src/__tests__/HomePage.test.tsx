import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { HomePage } from '../pages/HomePage';
import { MemoryRouter } from 'react-router-dom';
import type { Praise, PaginationInfo } from '../types';

// Mock the api module
vi.mock('../services/api', () => ({
  searchPraises: vi.fn(),
  getFilterOptions: vi.fn(),
}));

// Mock useFilters hook
const mockSetFilters = vi.fn();
const mockToggleTag = vi.fn();
const mockClearAllFilters = vi.fn();

vi.mock('../hooks/useFilters', () => ({
  useFilters: () => ({
    filters: {
      query: '',
      tags: [],
      rhythm: [],
      tonality: [],
      category: [],
      numberMin: undefined,
      numberMax: undefined,
      sort: 'number',
      order: 'asc',
      page: 1,
    },
    setFilters: mockSetFilters,
    toggleTag: mockToggleTag,
    clearAllFilters: mockClearAllFilters,
    activeFilterCount: 0,
  }),
}));

import { searchPraises, getFilterOptions } from '../services/api';

describe('HomePage Component', () => {
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

  const mockPagination: PaginationInfo = {
    page: 1,
    limit: 20,
    total: 2,
    totalPages: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (searchPraises as any).mockResolvedValue({
      data: mockPraises,
      pagination: mockPagination,
    });
    (getFilterOptions as any).mockResolvedValue({
      rhythms: ['Avulsos', 'Coletânea'],
      tonalities: ['C', 'G'],
      categories: ['Louvor', 'Adoração'],
      tags: [
        { id: 'tag1', name: 'Coletânea', count: 10 },
        { id: 'tag2', name: 'Avulsos', count: 5 },
      ],
    });
  });

  it('should render brand header', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      );
    });

    expect(screen.getByText('Coldigom')).toBeTruthy();
    expect(screen.getByText('Coletânea Digital de Objetos Musicais')).toBeTruthy();
  });

  it('should render search bar', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      );
    });

    expect(screen.getByPlaceholderText(/buscar por nome, letra, autor/i)).toBeTruthy();
  });

  it('should render results count', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      );
    });

    await waitFor(() => {
      expect(screen.getByText('2 resultados encontrados')).toBeTruthy();
    });
  });

  it('should render praise list', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Grande Deus')).toBeTruthy();
      expect(screen.getByText('Santo Deus')).toBeTruthy();
    });
  });

  it('should show loading state initially', async () => {
    (searchPraises as any).mockImplementation(
      () => new Promise(() => {})
    );

    await act(async () => {
      render(
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      );
    });

    expect(screen.getByText(/buscando louvores/i)).toBeTruthy();
  });

  it('should show error state on API error', async () => {
    (searchPraises as any).mockRejectedValue(new Error('API Error'));

    await act(async () => {
      render(
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/erro ao carregar/i)).toBeTruthy();
    });
  });

  it('should show empty state when no results', async () => {
    (searchPraises as any).mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    await act(async () => {
      render(
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/nenhum louvor encontrado/i)).toBeTruthy();
    });
  });

  it('should call searchPraises with filters', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      );
    });

    await waitFor(() => {
      expect(searchPraises).toHaveBeenCalledWith(
        expect.objectContaining({
          query: '',
          page: 1,
          tags: [],
          rhythm: [],
          tonality: [],
          category: [],
          sort: 'number',
          order: 'asc',
        })
      );
    });
  });

  it('should show pagination when there are multiple pages', async () => {
    (searchPraises as any).mockResolvedValue({
      data: mockPraises,
      pagination: { page: 1, limit: 1, total: 2, totalPages: 2 },
    });

    await act(async () => {
      render(
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      );
    });

    await waitFor(() => {
      const nextButton = screen.queryByLabelText(/próxima página/i);
      expect(nextButton).toBeTruthy();
    });
  });
});
