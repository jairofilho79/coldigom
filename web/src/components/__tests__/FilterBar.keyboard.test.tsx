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

async function montar() {
  vi.mocked(getFilterOptions).mockResolvedValue({
    rhythms: ['Valsa'],
    tonalities: ['C'],
    categories: ['Louvor', 'Adoração'],
    tags: [],
  });
  vi.mocked(getMaterialKinds).mockResolvedValue([]);
  render(<MemoryRouter><FilterBar /></MemoryRouter>);
  await screen.findByText('Coleções');
}

describe('FilterBar — teclado nos dropdowns', () => {
  beforeEach(() => vi.clearAllMocks());

  it('as opções são alcançáveis e marcáveis por teclado', async () => {
    // Os checkboxes tinham tabIndex={-1} e os rótulos, role="option" sem serem
    // focáveis: abrir por teclado levava a um beco sem saída, nenhuma opção
    // podia ser marcada sem mouse.
    const usuario = userEvent.setup();
    await montar();

    const gatilho = screen.getByRole('button', { name: /categoria/i });
    await usuario.click(gatilho);

    const caixa = screen.getByRole('checkbox', { name: 'Louvor' });
    expect(caixa.getAttribute('tabindex')).not.toBe('-1');

    caixa.focus();
    await usuario.keyboard(' ');
    expect((caixa as HTMLInputElement).checked).toBe(true);
  });

  it('Escape fecha e devolve o foco ao gatilho', async () => {
    const usuario = userEvent.setup();
    await montar();

    const gatilho = screen.getByRole('button', { name: /categoria/i });
    await usuario.click(gatilho);
    expect(screen.getByRole('checkbox', { name: 'Louvor' })).toBeTruthy();

    await usuario.keyboard('{Escape}');
    expect(screen.queryByRole('checkbox', { name: 'Louvor' })).toBeNull();
    expect(document.activeElement).toBe(gatilho);
  });

  it('o grupo de opções se anuncia pelo nome do filtro', async () => {
    const usuario = userEvent.setup();
    await montar();

    await usuario.click(screen.getByRole('button', { name: /categoria/i }));
    expect(screen.getByRole('group', { name: /categoria/i })).toBeTruthy();
  });
});
