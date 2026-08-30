import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChordHints } from '../ChordHints';

describe('ChordHints', () => {
  it('ensina a convenção do acervo, não teoria genérica', async () => {
    render(<ChordHints onInsert={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /como escrever/i }));

    expect(screen.getByText('C7M')).toBeInTheDocument();
    expect(screen.getByText(/o acervo usa 7M/i)).toBeInTheDocument();
    expect(screen.getByText('Cø')).toBeInTheDocument();
    expect(screen.getByText('C(#5)')).toBeInTheDocument();
    expect(screen.getByText('[*2x]')).toBeInTheDocument();
    expect(screen.getByText(/anotação, não acorde/i)).toBeInTheDocument();
  });

  it('não sugere maj7, que é convenção alheia', async () => {
    render(<ChordHints onInsert={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /como escrever/i }));
    expect(screen.queryByText(/maj7/)).not.toBeInTheDocument();
  });

  it('insere os símbolos que não estão no teclado', async () => {
    const onInsert = vi.fn();
    render(<ChordHints onInsert={onInsert} />);
    await userEvent.click(screen.getByRole('button', { name: /como escrever/i }));

    await userEvent.click(screen.getByRole('button', { name: 'Inserir ø' }));
    expect(onInsert).toHaveBeenCalledWith('ø');

    await userEvent.click(screen.getByRole('button', { name: 'Inserir °' }));
    expect(onInsert).toHaveBeenCalledWith('°');
  });

  it('começa fechado', () => {
    render(<ChordHints onInsert={vi.fn()} />);
    expect(screen.queryByText('C7M')).not.toBeInTheDocument();
  });
});
