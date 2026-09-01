import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SearchBar } from '../SearchBar';

describe('SearchBar — sincronia com o termo aplicado', () => {
  it('acompanha quando o termo aplicado muda por fora', async () => {
    // O estado era iniciado com initialValue e nunca mais olhava para ele.
    // Clicar em "Limpar filtros" ou apertar Voltar desfiltrava a lista e
    // deixava o campo exibindo o termo antigo: o usuário via escrito na tela
    // um filtro que não estava aplicado.
    const { rerender } = render(<SearchBar onSearch={vi.fn()} initialValue="aleluia" />);
    const campo = screen.getByRole('searchbox') as HTMLInputElement;
    expect(campo.value).toBe('aleluia');

    rerender(<SearchBar onSearch={vi.fn()} initialValue="" />);
    expect(campo.value).toBe('');

    rerender(<SearchBar onSearch={vi.fn()} initialValue="graça" />);
    expect(campo.value).toBe('graça');
  });

  it('não atropela o que o usuário está digitando', async () => {
    // A sincronia não pode reescrever o campo a cada render, senão digitar
    // vira impossível.
    const usuario = userEvent.setup();
    const { rerender } = render(<SearchBar onSearch={vi.fn()} initialValue="" />);
    const campo = screen.getByRole('searchbox') as HTMLInputElement;

    await usuario.type(campo, 'canta');
    expect(campo.value).toBe('canta');

    // re-render sem mudança do termo aplicado
    rerender(<SearchBar onSearch={vi.fn()} initialValue="" />);
    expect(campo.value).toBe('canta');
  });

  it('tem semântica de busca e rótulo acessível', () => {
    // Era type="text" sem rótulo nenhum, só placeholder.
    render(<SearchBar onSearch={vi.fn()} initialValue="" />);
    expect(screen.getByRole('search')).toBeTruthy();
    expect(screen.getByRole('searchbox')).toBeTruthy();
    expect(screen.getByLabelText(/buscar/i)).toBeTruthy();
  });
});
