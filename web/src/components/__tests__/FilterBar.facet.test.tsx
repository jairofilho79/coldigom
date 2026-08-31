import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { FilterBar } from '../FilterBar';

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/api')>();
  return {
    ...actual,
    getFilterOptions: vi.fn(),
    getMaterialKinds: vi.fn(),
  };
});

import { getFilterOptions, getMaterialKinds } from '../../services/api';

async function montar(inicial = '/') {
  vi.mocked(getFilterOptions).mockResolvedValue({
    rhythms: ['Valsa', 'Marcha'],
    tonalities: ['C'],
    categories: ['Louvor', 'Adoração'],
    tags: [],
  });
  vi.mocked(getMaterialKinds).mockResolvedValue([]);
  render(<MemoryRouter initialEntries={[inicial]}><FilterBar /></MemoryRouter>);
  await screen.findByText('Coleções');
}

describe('FilterBar — opções conscientes do filtro', () => {
  beforeEach(() => vi.clearAllMocks());

  it('manda os filtros aplicados ao pedir as opções', async () => {
    await montar('/?category=Louvor&rhythm=Valsa');

    expect(getFilterOptions).toHaveBeenCalledWith(
      expect.objectContaining({ category: ['Louvor'], rhythm: ['Valsa'] })
    );
  });

  it('refaz a consulta quando um filtro muda', async () => {
    const usuario = userEvent.setup();
    await montar('/');
    expect(getFilterOptions).toHaveBeenCalledTimes(1);

    await usuario.click(screen.getByRole('button', { name: /categoria/i }));
    await usuario.click(screen.getByRole('checkbox', { name: 'Louvor' }));

    await waitFor(() => expect(getFilterOptions).toHaveBeenCalledTimes(2));
    expect(vi.mocked(getFilterOptions).mock.calls[1][0]).toMatchObject({ category: ['Louvor'] });
  });

  it('a barra não some enquanto as opções são refeitas', async () => {
    // Limpar filterOptions antes de refazer faria a barra inteira piscar para
    // spinner a cada clique de filtro.
    const usuario = userEvent.setup();
    await montar('/');

    await usuario.click(screen.getByRole('button', { name: /categoria/i }));
    await usuario.click(screen.getByRole('checkbox', { name: 'Louvor' }));

    expect(screen.getByText('Coleções')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('mudar só a página não refaz as opções', async () => {
    // Paginar não muda o conjunto de resultados possível.
    await montar('/?page=3');
    expect(getFilterOptions).toHaveBeenCalledTimes(1);
    expect(vi.mocked(getFilterOptions).mock.calls[0][0]).not.toHaveProperty('page');
  });
});
