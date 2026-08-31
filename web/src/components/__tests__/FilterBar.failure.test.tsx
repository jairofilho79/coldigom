import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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

function renderFilterBar() {
  return render(<MemoryRouter><FilterBar /></MemoryRouter>);
}

describe('FilterBar — falha ao carregar as opções', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mostra o erro em vez de girar para sempre', async () => {
    // O .catch(console.error) engolia a falha e filterOptions ficava null
    // eternamente. A barra inteira — coleções, categorias, materiais,
    // ordenação, limpar — virava um spinner sem fim, enquanto a tabela de
    // resultados carregava normalmente ao lado. Sem mensagem, sem retry.
    vi.mocked(getFilterOptions).mockRejectedValue(new Error('rede caiu'));
    vi.mocked(getMaterialKinds).mockResolvedValue([]);

    renderFilterBar();

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('oferece tentar de novo, e funciona', async () => {
    const usuario = userEvent.setup();
    vi.mocked(getFilterOptions)
      .mockRejectedValueOnce(new Error('rede caiu'))
      .mockResolvedValueOnce({ rhythms: ['Valsa'], tonalities: ['C'], categories: ['Louvor'], tags: [] });
    vi.mocked(getMaterialKinds).mockResolvedValue([]);

    renderFilterBar();
    await screen.findByRole('alert');

    await usuario.click(screen.getByRole('button', { name: /tentar de novo/i }));

    expect(await screen.findByText('Coleções')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('enquanto carrega, anuncia carregamento a leitor de tela', async () => {
    vi.mocked(getFilterOptions).mockReturnValue(new Promise(() => {}));
    vi.mocked(getMaterialKinds).mockResolvedValue([]);

    renderFilterBar();
    expect(await screen.findByRole('status')).toBeTruthy();
  });
});
