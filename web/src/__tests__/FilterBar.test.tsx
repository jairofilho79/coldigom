import { describe, expect, it, vi, beforeEach, waitFor } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { FilterBar } from '../components/FilterBar';
import { MemoryRouter } from 'react-router-dom';
import type { FilterOptions } from '../types';

// Mock the api module
vi.mock('../services/api', () => ({
  getFilterOptions: vi.fn(),
}));

// Mock useFilters hook
vi.mock('../hooks/useFilters', () => ({
  useFilters: () => ({
    filters: {
      query: '',
      tags: [],
      rhythm: [],
      tonality: [],
      category: [],
      sort: 'number',
      order: 'asc',
      page: 1,
    },
    setFilters: vi.fn(),
    toggleTag: vi.fn(),
    clearAllFilters: vi.fn(),
    activeFilterCount: 0,
  }),
}));

import { getFilterOptions } from '../services/api';

describe('FilterBar Component', () => {
  const mockFilterOptions: FilterOptions = {
    rhythms: ['Avulsos', 'Coletânea'],
    tonalities: ['C', 'G', 'D'],
    categories: ['Louvor', 'Adoração'],
    tags: [
      { id: 'tag1', name: 'Coletânea', count: 10 },
      { id: 'tag2', name: 'Avulsos', count: 5 },
      { id: 'tag3', name: 'GLTM', count: 3 },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (getFilterOptions as any).mockResolvedValue(mockFilterOptions);
  });

  it('should render filter bar', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <FilterBar />
        </MemoryRouter>
      );
    });

    expect(screen.getByText('Coleções')).toBeTruthy();
  });

  it('should render tag chips', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <FilterBar />
        </MemoryRouter>
      );
    });

    expect(screen.getByText('Coletânea')).toBeTruthy();
    expect(screen.getByText('Avulsos')).toBeTruthy();
    expect(screen.getByText('GLTM')).toBeTruthy();
  });

  it('should render tag counts', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <FilterBar />
        </MemoryRouter>
      );
    });

    expect(screen.getByText('10')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('should render rhythm dropdown', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <FilterBar />
        </MemoryRouter>
      );
    });

    expect(screen.getByText('Ritmo')).toBeTruthy();
  });

  it('should render tonality dropdown', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <FilterBar />
        </MemoryRouter>
      );
    });

    expect(screen.getByText('Tom')).toBeTruthy();
  });

  it('should render category dropdown', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <FilterBar />
        </MemoryRouter>
      );
    });

    expect(screen.getByText('Categoria')).toBeTruthy();
  });

  it('should open dropdown when clicked', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <FilterBar />
        </MemoryRouter>
      );
    });

    const rhythmButton = screen.getByText('Ritmo');
    fireEvent.click(rhythmButton);

    await waitFor(() => {
      expect(screen.getByText('Avulsos')).toBeTruthy();
      expect(screen.getByText('Coletânea')).toBeTruthy();
    });
  });

  it('should show loading state initially', async () => {
    // Don't resolve the promise immediately
    (getFilterOptions as any).mockImplementation(
      () => new Promise(() => {})
    );

    await act(async () => {
      render(
        <MemoryRouter>
          <FilterBar />
        </MemoryRouter>
      );
    });

    // Should show loading spinner
    expect(screen.queryByTestId('loading-spinner') || screen.queryByRole('progressbar')).toBeTruthy();
  });

  it('should handle API error gracefully', async () => {
    (getFilterOptions as any).mockRejectedValue(new Error('API Error'));

    await act(async () => {
      render(
        <MemoryRouter>
          <FilterBar />
        </MemoryRouter>
      );
    });

    // Should not throw, but may show error state or empty
    expect(screen.queryByText('Coletânea')).toBeNull();
  });

  it('should render sort selector', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <FilterBar />
        </MemoryRouter>
      );
    });

    const sortSelect = screen.getByLabelText(/ordenar por/i);
    expect(sortSelect).toBeTruthy();
  });
});
