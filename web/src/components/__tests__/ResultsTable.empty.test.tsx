import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { ResultsTable } from '../ResultsTable';

describe('ResultsTable — estado vazio', () => {
  it('sem filtro nenhum, não sugere ajustar filtro', async () => {
    // O texto era fixo: "Tente ajustar seus filtros" mesmo quando não havia
    // filtro nenhum aplicado, e sem dizer quais estavam.
    render(<MemoryRouter><ResultsTable praises={[]} /></MemoryRouter>);
    expect(screen.queryByText(/ajustar/i)).toBeNull();
  });

  it('com busca aplicada, diz qual termo não encontrou nada', async () => {
    render(
      <MemoryRouter>
        <ResultsTable praises={[]} termoBuscado="aleluia" filtrosAplicados={[]} />
      </MemoryRouter>
    );
    expect(screen.getByText(/aleluia/)).toBeTruthy();
  });

  it('com filtros aplicados, lista quais são e oferece limpá-los ali mesmo', async () => {
    const usuario = userEvent.setup();
    const limpar = vi.fn();
    render(
      <MemoryRouter>
        <ResultsTable
          praises={[]}
          filtrosAplicados={['Ritmo: Valsa', 'Categoria: Louvor']}
          aoLimparFiltros={limpar}
        />
      </MemoryRouter>
    );

    expect(screen.getByText(/Ritmo: Valsa/)).toBeTruthy();
    expect(screen.getByText(/Categoria: Louvor/)).toBeTruthy();

    await usuario.click(screen.getByRole('button', { name: /limpar filtros/i }));
    expect(limpar).toHaveBeenCalled();
  });
});
