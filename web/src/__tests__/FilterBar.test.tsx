import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FilterBar } from '../components/FilterBar';
import { MemoryRouter } from 'react-router-dom';
import type { FilterOptions } from '../types';

vi.mock('../services/api', () => ({
  getFilterOptions: vi.fn(),
  getMaterialKinds: vi.fn(),
}));

vi.mock('../hooks/useFilters', () => ({
  useFilters: () => ({
    filters: {
      query: '',
      tags: [],
      rhythm: [],
      tonality: [],
      category: [],
      materialKinds: [],
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

import { getFilterOptions, getMaterialKinds } from '../services/api';

describe('FilterBar Component', () => {
  const mockFilterOptions: FilterOptions = {
    rhythms: ['Avulsos', 'Coletânea'],
    tonalities: ['C', 'G', 'D'],
    categories: ['Louvor', 'Adoração'],
    tags: [
      { id: 'tag1', name: 'Coletânea', parent_id: null, count: 10 },
      { id: 'tag2', name: 'Avulsos', parent_id: null, count: 5 },
      { id: 'tag3', name: 'GLTM', parent_id: null, count: 3 },
    ],
  };

  const mockMaterialKinds = [
    { id: 'kind1', name: 'Partitura' },
    { id: 'kind2', name: 'Áudio' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (getFilterOptions as ReturnType<typeof vi.fn>).mockResolvedValue(mockFilterOptions);
    (getMaterialKinds as ReturnType<typeof vi.fn>).mockResolvedValue(mockMaterialKinds);
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

  it('should render Materiais dropdown', async () => {
    render(
      <MemoryRouter>
        <FilterBar />
      </MemoryRouter>
    );

    expect((await screen.findAllByText('Materiais'))[0]).toBeTruthy();
  });

  it('should not render Ritmo or Tom filter dropdowns', async () => {
    render(
      <MemoryRouter>
        <FilterBar />
      </MemoryRouter>
    );

    await screen.findByText('Coleções');
    expect(screen.queryByRole('button', { name: /^Ritmo/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Tom$/ })).toBeNull();
  });

  it('should render category dropdown', async () => {
    render(
      <MemoryRouter>
        <FilterBar />
      </MemoryRouter>
    );

    expect((await screen.findAllByText('Categoria'))[0]).toBeTruthy();
  });

  it('should open Materiais dropdown when clicked', async () => {
    render(
      <MemoryRouter>
        <FilterBar />
      </MemoryRouter>
    );

    const materiaisButton = (await screen.findAllByText('Materiais'))[0];
    fireEvent.click(materiaisButton);

    await waitFor(() => {
      expect(screen.getByText('Partitura')).toBeTruthy();
      expect(screen.getByText('Áudio')).toBeTruthy();
    });
  });

  it('should show loading state initially', async () => {
    (getFilterOptions as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(() => {}));

    const { container } = render(
      <MemoryRouter>
        <FilterBar />
      </MemoryRouter>
    );

    expect(container.querySelector('.loading-spinner')).toBeTruthy();
  });

  it('mostra erro com opção de tentar de novo quando as opções falham', async () => {
    // A asserção anterior era `queryByText('Coletânea')).toBeNull()` — um texto
    // que este componente nunca renderiza em cenário nenhum. Passava com ou sem
    // o bug do spinner eterno, que é justamente o que deveria pegar.
    (getFilterOptions as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('API Error'));

    render(
      <MemoryRouter>
        <FilterBar />
      </MemoryRouter>
    );

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: /tentar de novo/i })).toBeTruthy();
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
