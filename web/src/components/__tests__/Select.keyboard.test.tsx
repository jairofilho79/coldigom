import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Select } from '../Select';

const OPCOES = [
  { value: 'number', label: 'Número' },
  { value: 'name', label: 'Nome' },
  { value: 'author', label: 'Autor' },
];

function focada() {
  return document.querySelector('.app-select-option.is-focused')?.textContent ?? null;
}

describe('Select — teclado', () => {
  it('a seta para baixo move o destaque', async () => {
    // O efeito de "focar a opção selecionada ao abrir" dependia de um array
    // recriado a cada render, então rodava depois de TODO commit com o menu
    // aberto e devolvia o destaque para a opção já selecionada. As setas não
    // saíam do lugar.
    const usuario = userEvent.setup();
    render(<Select value="number" onChange={vi.fn()} options={OPCOES} aria-label="Ordenar" />);

    await usuario.click(screen.getByRole('button', { name: 'Ordenar' }));
    expect(focada()).toBe('Número');

    await usuario.keyboard('{ArrowDown}');
    expect(focada()).toBe('Nome');

    await usuario.keyboard('{ArrowDown}');
    expect(focada()).toBe('Autor');
  });

  it('a seta para cima volta, e circula nas pontas', async () => {
    const usuario = userEvent.setup();
    render(<Select value="number" onChange={vi.fn()} options={OPCOES} aria-label="Ordenar" />);

    await usuario.click(screen.getByRole('button', { name: 'Ordenar' }));
    await usuario.keyboard('{ArrowUp}');
    expect(focada()).toBe('Autor');
  });

  it('Enter escolhe a opção destacada, não a que já estava selecionada', async () => {
    const usuario = userEvent.setup();
    const aoMudar = vi.fn();
    render(<Select value="number" onChange={aoMudar} options={OPCOES} aria-label="Ordenar" />);

    await usuario.click(screen.getByRole('button', { name: 'Ordenar' }));
    await usuario.keyboard('{ArrowDown}');
    await usuario.keyboard('{Enter}');

    expect(aoMudar).toHaveBeenCalledWith('name');
  });

  it('o destaque do mouse permanece', async () => {
    // onMouseEnter marcava a opção e o efeito desmarcava no render seguinte:
    // o realce piscava e voltava.
    const usuario = userEvent.setup();
    render(<Select value="number" onChange={vi.fn()} options={OPCOES} aria-label="Ordenar" />);

    await usuario.click(screen.getByRole('button', { name: 'Ordenar' }));
    await usuario.hover(screen.getByRole('option', { name: 'Autor' }));
    expect(focada()).toBe('Autor');
  });

  it('abre pelo teclado já com a opção atual destacada', async () => {
    const usuario = userEvent.setup();
    render(<Select value="name" onChange={vi.fn()} options={OPCOES} aria-label="Ordenar" />);

    screen.getByRole('button', { name: 'Ordenar' }).focus();
    await usuario.keyboard('{Enter}');
    expect(focada()).toBe('Nome');
  });

  it('Escape fecha', async () => {
    const usuario = userEvent.setup();
    render(<Select value="number" onChange={vi.fn()} options={OPCOES} aria-label="Ordenar" />);

    await usuario.click(screen.getByRole('button', { name: 'Ordenar' }));
    expect(screen.getByRole('listbox')).toBeTruthy();
    await usuario.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('não escolhe opção desabilitada com as setas', async () => {
    const usuario = userEvent.setup();
    const aoMudar = vi.fn();
    render(
      <Select
        value="number"
        onChange={aoMudar}
        options={[OPCOES[0], { value: 'x', label: 'Indisponível', disabled: true }, OPCOES[1]]}
        aria-label="Ordenar"
      />
    );
    await usuario.click(screen.getByRole('button', { name: 'Ordenar' }));
    await usuario.keyboard('{ArrowDown}');
    expect(focada()).toBe('Nome');
  });
});
