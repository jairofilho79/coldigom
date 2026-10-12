import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChordProRawEditor } from '../ChordProRawEditor';

describe('ChordProRawEditor', () => {
  it('renderiza o textarea com o conteúdo inicial', () => {
    render(
      <ChordProRawEditor
        value={'{title: Teste}\n[C]Louvai'}
        onChange={vi.fn()}
        issues={[]}
      />
    );

    const textarea = screen.getByRole('textbox', { name: /cifra.*raw/i });
    expect(textarea).toHaveValue('{title: Teste}\n[C]Louvai');
  });

  it('chama onChange ao digitar no textarea', async () => {
    const onChange = vi.fn();
    render(
      <ChordProRawEditor
        value="[C]"
        onChange={onChange}
        issues={[]}
      />
    );

    const textarea = screen.getByRole('textbox', { name: /cifra.*raw/i });
    await userEvent.type(textarea, 'G');
    expect(onChange).toHaveBeenCalled();
  });

  it('exibe lista de acordes não reconhecidos quando há issues', () => {
    render(
      <ChordProRawEditor
        value="[Bmm]letra"
        onChange={vi.fn()}
        issues={[
          {
            stanza: 0,
            line: 0,
            cell: 0,
            raw: 'Bmm',
            reason: 'Acorde "Bmm" não reconhecido',
          },
        ]}
      />
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('[Bmm]')).toBeInTheDocument();
    expect(screen.getByText(/Acorde "Bmm" não reconhecido/)).toBeInTheDocument();
  });

  it('permite inserir símbolos especiais de acordes via ChordHints', async () => {
    const onChange = vi.fn();
    render(
      <ChordProRawEditor
        value="C"
        onChange={onChange}
        issues={[]}
      />
    );

    // Abre o ChordHints
    await userEvent.click(screen.getByRole('button', { name: /como escrever os acordes/i }));
    // Clica para inserir ø
    await userEvent.click(screen.getByRole('button', { name: /inserir ø/i }));
    expect(onChange).toHaveBeenCalledWith('Cø');
  });

  it('contém bloco retrátil de pré-visualização', () => {
    render(
      <ChordProRawEditor
        value={'{title: Teste}\n[A]letra'}
        onChange={vi.fn()}
        issues={[]}
      />
    );

    expect(screen.getByText(/pré-visualização/i)).toBeInTheDocument();
  });
});
