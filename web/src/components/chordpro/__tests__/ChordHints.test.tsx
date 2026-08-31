import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChordHints } from '../ChordHints';

describe('ChordHints', () => {
  it('ensina a convenção do acervo, não teoria genérica', async () => {
    render(<ChordHints onInsert={vi.fn()} podeInserir />);
    await userEvent.click(screen.getByRole('button', { name: /como escrever/i }));

    expect(screen.getByText('C7M')).toBeInTheDocument();
    expect(screen.getByText(/o acervo usa 7M/i)).toBeInTheDocument();
    expect(screen.getByText('Cø')).toBeInTheDocument();
    expect(screen.getByText('C(#5)')).toBeInTheDocument();
    expect(screen.getByText('[*2x]')).toBeInTheDocument();
    expect(screen.getByText(/anotação, não acorde/i)).toBeInTheDocument();
  });

  it('a forma que ensina para a sétima maior é 7M, e é a única', async () => {
    // A versão anterior deste teste só afirmava a AUSÊNCIA de "maj7" — um texto que
    // componente nenhum renderiza. Passaria com a lista vazia, que é justamente o
    // estado em que o manual não ensina nada. Agora a afirmação é sobre o que a
    // lista MOSTRA: as formas exibidas, e o fato de nenhuma delas ser a alheia.
    const { container } = render(<ChordHints onInsert={vi.fn()} podeInserir />);
    await userEvent.click(screen.getByRole('button', { name: /como escrever/i }));

    const formas = Array.from(container.querySelectorAll('.cp-hints-row dt')).map(
      (n) => n.textContent ?? ''
    );
    expect(formas).toContain('C7M');
    expect(formas.filter((f) => /7M|maj7|M7/i.test(f))).toEqual(['C7M']);
  });

  it('insere os símbolos que não estão no teclado', async () => {
    const onInsert = vi.fn();
    render(<ChordHints onInsert={onInsert} podeInserir />);
    await userEvent.click(screen.getByRole('button', { name: /como escrever/i }));

    await userEvent.click(screen.getByRole('button', { name: 'Inserir ø' }));
    expect(onInsert).toHaveBeenCalledWith('ø');

    await userEvent.click(screen.getByRole('button', { name: 'Inserir °' }));
    expect(onInsert).toHaveBeenCalledWith('°');
  });

  it('sem linha aberta os botões não fingem que funcionam', async () => {
    const onInsert = vi.fn();
    render(<ChordHints onInsert={onInsert} podeInserir={false} />);
    await userEvent.click(screen.getByRole('button', { name: /como escrever/i }));

    const inserir = screen.getByRole('button', { name: 'Inserir ø' });
    expect(inserir).toBeDisabled();
    // Desabilitar sem dizer por quê é trocar um mistério por outro.
    expect(inserir).toHaveAccessibleDescription(/abra uma linha/i);

    await userEvent.click(inserir);
    expect(onInsert).not.toHaveBeenCalled();
  });

  it('começa fechado', () => {
    render(<ChordHints onInsert={vi.fn()} podeInserir />);
    expect(screen.queryByText('C7M')).not.toBeInTheDocument();
  });
});
