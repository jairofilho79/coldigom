import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { ResultsTable } from '../ResultsTable';
import type { Praise } from '../../types';

function louvor(id: string, nome: string, grupo: string | null): Praise {
  return {
    id,
    name: nome,
    number: '001',
    author: '',
    rhythm: '',
    tonality: '',
    category: '',
    lyrics: '',
    group_id: grupo,
    tag_ids: null,
    tag_names: null,
  };
}

const AGRUPADOS = [
  louvor('a', 'Grande é o Senhor', 'g1'),
  louvor('b', 'Grande é o Senhor (versão 2)', 'g1'),
];

describe('ResultsTable — expansão de grupo por teclado', () => {
  it('o expansor é um controle alcançável e operável por teclado', async () => {
    // A linha era um <tr onClick> com aria-expanded, sem tabIndex, sem role e
    // sem onKeyDown: só existia para o mouse.
    const usuario = userEvent.setup();
    render(<MemoryRouter><ResultsTable praises={AGRUPADOS} loading={false} /></MemoryRouter>);

    const expansor = screen.getByRole('button', { expanded: false });
    expansor.focus();
    expect(document.activeElement).toBe(expansor);

    await usuario.keyboard('{Enter}');
    expect(screen.getByRole('button', { expanded: true })).toBeTruthy();
  });

  it('a barra de espaço também alterna', async () => {
    const usuario = userEvent.setup();
    render(<MemoryRouter><ResultsTable praises={AGRUPADOS} loading={false} /></MemoryRouter>);

    screen.getByRole('button', { expanded: false }).focus();
    await usuario.keyboard(' ');
    expect(screen.getByRole('button', { expanded: true })).toBeTruthy();
  });

  it('clicar na linha continua alternando, e não alterna duas vezes', async () => {
    const usuario = userEvent.setup();
    render(<MemoryRouter><ResultsTable praises={AGRUPADOS} loading={false} /></MemoryRouter>);

    await usuario.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByRole('button', { expanded: true })).toBeTruthy();
  });
});
