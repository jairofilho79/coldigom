import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
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
      tag_ids: 'tag1,tag2',
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
      tag_ids: 'tag1',
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
    expect(screen.getByText('Autor')).toBeTruthy();
    expect(screen.getByText('Ritmo')).toBeTruthy();
    expect(screen.getByText('Tom')).toBeTruthy();
    expect(screen.getByText('Categoria')).toBeTruthy();
  });

  it('should render praise numbers', () => {
    renderWithRouter(<ResultsTable praises={mockPraises} />);

    expect(screen.getByText('001')).toBeTruthy();
    expect(screen.getByText('002')).toBeTruthy();
  });

  it('should render authors', () => {
    renderWithRouter(<ResultsTable praises={mockPraises} />);

    expect(screen.getByText('Autor 1')).toBeTruthy();
    expect(screen.getByText('Autor 2')).toBeTruthy();
  });

  it('should render rhythms', () => {
    renderWithRouter(<ResultsTable praises={mockPraises} />);

    expect(screen.getByText('Avulsos')).toBeTruthy();
    expect(screen.getByText('Coletânea')).toBeTruthy();
  });

  it('should render tonalities', () => {
    renderWithRouter(<ResultsTable praises={mockPraises} />);

    expect(screen.getByText('C')).toBeTruthy();
    expect(screen.getByText('G')).toBeTruthy();
  });

  it('should render categories', () => {
    renderWithRouter(<ResultsTable praises={mockPraises} />);

    expect(screen.getByText('Louvor')).toBeTruthy();
    expect(screen.getByText('Adoração')).toBeTruthy();
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

  it('should show dash for missing author', () => {
    const praiseWithoutAuthor: Praise[] = [
      {
        ...mockPraises[0],
        author: '',
      },
    ];

    renderWithRouter(<ResultsTable praises={praiseWithoutAuthor} />);

    expect(screen.getByText('—')).toBeTruthy();
  });

  it('should show dash for missing rhythm', () => {
    const praiseWithoutRhythm: Praise[] = [
      {
        ...mockPraises[0],
        rhythm: '',
      },
    ];

    renderWithRouter(<ResultsTable praises={praiseWithoutRhythm} />);

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

  it('should show dash for missing category', () => {
    const praiseWithoutCategory: Praise[] = [
      {
        ...mockPraises[0],
        category: '',
      },
    ];

    renderWithRouter(<ResultsTable praises={praiseWithoutCategory} />);

    expect(screen.getByText('—')).toBeTruthy();
  });

  it('should render links to praise details', () => {
    renderWithRouter(<ResultsTable praises={mockPraises} />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', '/praise/1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    expect(links[1]).toHaveAttribute('href', '/praise/1c12786e-4d32-4e95-a136-d85266008e11');
  });

  it('should render empty state when no praises', () => {
    renderWithRouter(<ResultsTable praises={[]} />);

    expect(screen.getByText(/nenhum louvor encontrado/i)).toBeTruthy();
    expect(screen.getByText(/tente ajustar seus filtros/i)).toBeTruthy();
  });

  it('should render single praise', () => {
    renderWithRouter(<ResultsTable praises={[mockPraises[0]]} />);

    expect(screen.getByText('Grande Deus')).toBeTruthy();
    expect(screen.queryByText('Santo Deus')).toBeNull();
  });
});
