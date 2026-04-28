import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
    render(
      <MemoryRouter>
        <FilterBar />
      </MemoryRouter>
    );

    expect(await screen.findByText('Coleções')).toBeTruthy();
  });

  it('should render tag chips', async () => {
    render(
      <MemoryRouter>
        <FilterBar />
      </MemoryRouter>
    );

    expect(await screen.findByText('Coletânea')).toBeTruthy();
    expect(screen.getByText('Avulsos')).toBeTruthy();
    expect(screen.getByText('GLTM')).toBeTruthy();
  });

  it('should render tag counts', async () => {
    render(
      <MemoryRouter>
        <FilterBar />
      </MemoryRouter>
    );

    expect(await screen.findByText('10')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('should render rhythm dropdown', async () => {
    render(
      <MemoryRouter>
        <FilterBar />
      </MemoryRouter>
    );

    expect((await screen.findAllByText('Ritmo'))[0]).toBeTruthy();
  });

  it('should render tonality dropdown', async () => {
    render(
      <MemoryRouter>
        <FilterBar />
      </MemoryRouter>
    );

    expect((await screen.findAllByText('Tom'))[0]).toBeTruthy();
  });

  it('should render category dropdown', async () => {
    render(
      <MemoryRouter>
        <FilterBar />
      </MemoryRouter>
    );

    expect((await screen.findAllByText('Categoria'))[0]).toBeTruthy();
  });

  it('should open dropdown when clicked', async () => {
    render(
      <MemoryRouter>
        <FilterBar />
      </MemoryRouter>
    );

    const rhythmButton = (await screen.findAllByText('Ritmo'))[0];
    fireEvent.click(rhythmButton);

    await waitFor(() => {
      expect(screen.getAllByText('Avulsos').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Coletânea').length).toBeGreaterThan(0);
    });
  });

  it('should show loading state initially', async () => {
    (getFilterOptions as any).mockImplementation(() => new Promise(() => {}));

    const { container } = render(
      <MemoryRouter>
        <FilterBar />
      </MemoryRouter>
    );

    expect(container.querySelector('.loading-spinner')).toBeTruthy();
  });

  it('should handle API error gracefully', async () => {
    (getFilterOptions as any).mockRejectedValue(new Error('API Error'));

    render(
      <MemoryRouter>
        <FilterBar />
      </MemoryRouter>
    );

    expect(screen.queryByText('Coletânea')).toBeNull();
  });

  it('should render sort selector', async () => {
    render(
      <MemoryRouter>
        <FilterBar />
      </MemoryRouter>
    );

    const sortSelect = await screen.findByLabelText(/ordenar por/i);
    expect(sortSelect).toBeTruthy();
  });
});
