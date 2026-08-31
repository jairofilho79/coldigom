import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { HomePage } from '../pages/HomePage';
import { AuthProvider } from '../context/AuthContext';
import type { Praise } from '../types';

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    searchPraises: vi.fn(),
    getFilterOptions: vi.fn().mockResolvedValue({ rhythms: [], tonalities: [], categories: [], tags: [] }),
    getMaterialKinds: vi.fn().mockResolvedValue([]),
    getMe: vi.fn().mockResolvedValue(null),
    refreshSession: vi.fn().mockResolvedValue(false),
  };
});

const FILTROS_BASE = {
  query: '',
  tags: [] as string[],
  rhythm: [] as string[],
  tonality: [] as string[],
  category: [] as string[],
  materialKinds: [] as string[],
  numberMin: undefined,
  numberMax: undefined,
  sort: 'number' as const,
  order: 'asc' as const,
  page: 1,
};

let filtrosAtuais: typeof FILTROS_BASE = { ...FILTROS_BASE };

vi.mock('../hooks/useFilters', () => ({
  useFilters: () => ({
    filters: filtrosAtuais,
    setFilters: vi.fn(),
    toggleTag: vi.fn(),
    clearAllFilters: vi.fn(),
    activeFilterCount: 0,
  }),
}));

import { searchPraises } from '../services/api';

function louvor(nome: string): Praise {
  return {
    id: `id-${nome}`,
    name: nome,
    number: '001',
    author: '',
    rhythm: '',
    tonality: '',
    category: '',
    lyrics: '',
    group_id: null,
    tag_ids: null,
    tag_names: null,
  };
}

/** Promessa que só resolve quando mandarmos. */
function adiada<T>() {
  let resolver!: (v: T) => void;
  const promessa = new Promise<T>((r) => { resolver = r; });
  return { promessa, resolver };
}

describe('HomePage — corrida entre respostas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    filtrosAtuais = { ...FILTROS_BASE };
  });

  it('descarta a resposta antiga que chega depois da nova', async () => {
    // Sem cancelamento, duas buscas em voo resolvem em ordem arbitrária e a
    // última a chegar vence — mesmo sendo a mais antiga. Clicar dois filtros
    // em sequência rápida podia deixar a tela mostrando o resultado do
    // primeiro clique.
    const antiga = adiada<{ data: Praise[]; pagination: never }>();
    const nova = adiada<{ data: Praise[]; pagination: never }>();
    const paginacao = { page: 1, limit: 20, total: 1, totalPages: 1 } as never;

    vi.mocked(searchPraises)
      .mockReturnValueOnce(antiga.promessa as never)
      .mockReturnValueOnce(nova.promessa as never);

    const { rerender } = render(
      <MemoryRouter><AuthProvider><HomePage /></AuthProvider></MemoryRouter>
    );

    // segunda busca dispara antes de a primeira responder
    filtrosAtuais = { ...FILTROS_BASE, query: 'novo' };
    rerender(<MemoryRouter><AuthProvider><HomePage /></AuthProvider></MemoryRouter>);
    await waitFor(() => expect(searchPraises).toHaveBeenCalledTimes(2));

    nova.resolver({ data: [louvor('Resultado Novo')], pagination: paginacao });
    await screen.findByText('Resultado Novo');

    antiga.resolver({ data: [louvor('Resultado Antigo')], pagination: paginacao });
    await new Promise((r) => setTimeout(r, 20));

    expect(screen.queryByText('Resultado Antigo')).toBeNull();
    expect(screen.getByText('Resultado Novo')).toBeTruthy();
  });

  it('erro de uma busca já superada não pinta erro sobre o resultado válido', async () => {
    const antiga = adiada<never>();
    const nova = adiada<{ data: Praise[]; pagination: never }>();
    const paginacao = { page: 1, limit: 20, total: 1, totalPages: 1 } as never;

    vi.mocked(searchPraises)
      .mockReturnValueOnce(antiga.promessa as never)
      .mockReturnValueOnce(nova.promessa as never);

    const { rerender } = render(
      <MemoryRouter><AuthProvider><HomePage /></AuthProvider></MemoryRouter>
    );
    filtrosAtuais = { ...FILTROS_BASE, query: 'novo' };
    rerender(<MemoryRouter><AuthProvider><HomePage /></AuthProvider></MemoryRouter>);
    await waitFor(() => expect(searchPraises).toHaveBeenCalledTimes(2));

    nova.resolver({ data: [louvor('Resultado Novo')], pagination: paginacao });
    await screen.findByText('Resultado Novo');

    (antiga.resolver as unknown as (v: unknown) => void)(Promise.reject(new Error('falhou')));
    await new Promise((r) => setTimeout(r, 20));

    expect(screen.getByText('Resultado Novo')).toBeTruthy();
  });
});
