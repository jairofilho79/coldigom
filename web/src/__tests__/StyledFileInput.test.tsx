import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { StyledFileInput } from '../components/StyledFileInput';

function inputNativo(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="file"]');
  if (!input) throw new Error('sem input de arquivo na tela');
  return input as HTMLInputElement;
}

describe('StyledFileInput', () => {
  it('repassa os arquivos escolhidos e limpa o value do input', async () => {
    // O navegador não dispara `change` quando o value não muda: sem limpar,
    // escolher o MESMO arquivo (ou a MESMA pasta) de novo não fazia nada.
    const onChange = vi.fn();
    const { container } = render(<StyledFileInput label="Escolher PDF" accept=".pdf" onChange={onChange} />);
    const input = inputNativo(container);
    const arquivo = new File(['%PDF'], 'partitura.pdf', { type: 'application/pdf' });

    await userEvent.upload(input, arquivo);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].map((f: File) => f.name)).toEqual(['partitura.pdf']);
    expect(input.value).toBe('');
    expect(input.files?.length ?? 0).toBe(0);
  });

  it('escolher a mesma seleção duas vezes avisa o pai as duas vezes', async () => {
    const onChange = vi.fn();
    const { container } = render(
      <StyledFileInput label="Escolher pasta" directory onChange={onChange} />
    );
    const input = inputNativo(container);
    const arquivos = [
      new File(['a'], 'a.mp3', { type: 'audio/mpeg' }),
      new File(['b'], 'b.mp3', { type: 'audio/mpeg' }),
    ];

    await userEvent.upload(input, arquivos);
    await userEvent.upload(input, arquivos);

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls[1][0]).toHaveLength(2);
    expect(input.value).toBe('');
  });

  it('mostra o rótulo e o texto padrão de arquivo e de pasta', () => {
    const { rerender } = render(<StyledFileInput label="Escolher PDF" onChange={vi.fn()} />);
    expect(screen.getByText('Escolher PDF')).toBeTruthy();
    expect(screen.getByText('Nenhum arquivo selecionado')).toBeTruthy();

    rerender(<StyledFileInput label="Escolher pasta" directory onChange={vi.fn()} />);
    expect(screen.getByText('Nenhuma pasta selecionada')).toBeTruthy();

    rerender(
      <StyledFileInput label="Escolher PDF" selectedName="partitura.pdf" onChange={vi.fn()} />
    );
    expect(screen.getByText('partitura.pdf')).toBeTruthy();
  });

  it('pasta implica seleção múltipla, e desabilitado desabilita o input', () => {
    const { container, rerender } = render(
      <StyledFileInput label="Escolher pasta" directory onChange={vi.fn()} />
    );
    expect(inputNativo(container).multiple).toBe(true);
    expect(inputNativo(container).getAttribute('webkitdirectory')).toBe('');

    rerender(<StyledFileInput label="Escolher PDF" disabled onChange={vi.fn()} />);
    expect(inputNativo(container).disabled).toBe(true);
  });
});
