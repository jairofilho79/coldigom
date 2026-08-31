import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResultsTable } from '../components/ResultsTable';
import { MemoryRouter } from 'react-router-dom';
import type { Praise } from '../types';

describe('ResultsTable Component', () => {
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
      group_id: null,
      tag_ids: 'tag1,tag2',
      tag_names: 'Coletânea,GLTM',
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
      group_id: null,
      tag_ids: 'tag1',
      tag_names: 'Coletânea',
    },
  ];

  function renderWithRouter(ui: React.ReactElement) {
    return render(<MemoryRouter>{ui}</MemoryRouter>);
  }

  it('should render table with praises', () => {
    renderWithRouter(<ResultsTable praises={mockPraises} />);

    expect(screen.getByText('Grande Deus')).toBeTruthy();
    expect(screen.getByText('Santo Deus')).toBeTruthy();
  });

  it('should render table headers', () => {
    renderWithRouter(<ResultsTable praises={mockPraises} />);

    expect(screen.getByText('Nº')).toBeTruthy();
    expect(screen.getByText('Nome')).toBeTruthy();
    expect(screen.getByText('Coleções')).toBeTruthy();
    expect(screen.getByText('Tom')).toBeTruthy();
  });

  it('should render praise numbers', () => {
    renderWithRouter(<ResultsTable praises={mockPraises} />);

    expect(screen.getByText('001')).toBeTruthy();
    expect(screen.getByText('002')).toBeTruthy();
  });

  it('should render tag names as chips', () => {
    renderWithRouter(<ResultsTable praises={mockPraises} />);

    expect(screen.getByText('GLTM')).toBeTruthy();
    expect(screen.getAllByText('Coletânea').length).toBeGreaterThanOrEqual(2);
  });

  it('should render tonalities', () => {
    renderWithRouter(<ResultsTable praises={mockPraises} />);

    expect(screen.getByText('C')).toBeTruthy();
    expect(screen.getByText('G')).toBeTruthy();
  });

  it('should show dash for missing number', () => {
    const praiseWithoutNumber: Praise[] = [
      {
        ...mockPraises[0],
        number: '',
      },
    ];

    renderWithRouter(<ResultsTable praises={praiseWithoutNumber} />);

    expect(screen.getByText('—')).toBeTruthy();
  });

  it('should show dash for missing tags', () => {
    const praiseWithoutTags: Praise[] = [
      {
        ...mockPraises[0],
        tag_names: null,
      },
    ];

    renderWithRouter(<ResultsTable praises={praiseWithoutTags} />);

    expect(screen.getByText('—')).toBeTruthy();
  });

  it('should show dash for missing tonality', () => {
    const praiseWithoutTonality: Praise[] = [
      {
        ...mockPraises[0],
        tonality: '',
      },
    ];

    renderWithRouter(<ResultsTable praises={praiseWithoutTonality} />);

    expect(screen.getByText('—')).toBeTruthy();
  });

  it('should render links to praise details', () => {
    renderWithRouter(<ResultsTable praises={mockPraises} />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', '/praise/1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    expect(links[1]).toHaveAttribute('href', '/praise/1c12786e-4d32-4e95-a136-d85266008e11');
  });

  it('mostra estado vazio sem sugerir ajuste de filtro quando não há filtro', async () => {
    // A mensagem era fixa — "Tente ajustar seus filtros" — mesmo sem filtro
    // nenhum aplicado. Vazio sem causa visível é o que faz a busca parecer
    // quebrada.
    render(
      <MemoryRouter>
        <ResultsTable praises={[]} />
      </MemoryRouter>
    );

    expect(screen.getByText(/nenhum louvor encontrado/i)).toBeTruthy();
    expect(screen.queryByText(/ajustar seus filtros/i)).toBeNull();
  });

  it('should render single praise', () => {
    renderWithRouter(<ResultsTable praises={[mockPraises[0]]} />);

    expect(screen.getByText('Grande Deus')).toBeTruthy();
    expect(screen.queryByText('Santo Deus')).toBeNull();
  });

  it('should collapse grouped praises and expand tag subitems on click', async () => {
    const user = userEvent.setup();
    const grouped: Praise[] = [
      {
        ...mockPraises[0],
        group_id: 'group-1',
        tag_names: 'Coletânea',
      },
      {
        ...mockPraises[1],
        name: 'Grande Deus',
        number: '001',
        group_id: 'group-1',
        tag_names: 'GLTM',
      },
    ];

    renderWithRouter(<ResultsTable praises={grouped} />);

    expect(screen.getByText(/Grande Deus/)).toBeTruthy();
    expect(screen.queryByText('GLTM')).toBeNull();

    await user.click(screen.getByText(/Grande Deus/));

    expect(screen.getByText('Coletânea')).toBeTruthy();
    expect(screen.getByText('GLTM')).toBeTruthy();
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', '/praise/1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    expect(links[1]).toHaveAttribute('href', '/praise/1c12786e-4d32-4e95-a136-d85266008e11');
  });
});
