import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SearchableSelect } from '../SearchableSelect';

const OPCOES = [
  { value: 'a', label: 'Violão' },
  { value: 'b', label: 'Violino' },
  { value: 'c', label: 'Piano' },
];

function focada() {
  return document.querySelector('.app-select-option.is-focused')?.textContent ?? null;
}

async function abrir(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.click(screen.getByRole('button', { name: 'Instrumento' }));
}

describe('SearchableSelect — teclado e foco', () => {
  it('a seta para baixo move o destaque', async () => {
    // Mesma causa do Select: o efeito dependia de um array recriado a cada
    // render, rodava depois de todo commit e devolvia o destaque para o topo.
    const usuario = userEvent.setup();
    render(<SearchableSelect value="" onChange={vi.fn()} options={OPCOES} aria-label="Instrumento" />);

    await abrir(usuario);
    expect(focada()).toBe('Violão');

    await usuario.keyboard('{ArrowDown}');
    expect(focada()).toBe('Violino');
  });

  it('Enter escolhe a opção destacada', async () => {
    const usuario = userEvent.setup();
    const aoMudar = vi.fn();
    render(<SearchableSelect value="" onChange={aoMudar} options={OPCOES} aria-label="Instrumento" />);

    await abrir(usuario);
    await usuario.keyboard('{ArrowDown}');
    await usuario.keyboard('{Enter}');

    expect(aoMudar).toHaveBeenCalledWith('b');
  });

  it('não arranca o foco do campo de busca quando o mouse passa numa opção', async () => {
    // searchRef.current.focus() rodava em todo render: passar o mouse sobre uma
    // opção devolvia o foco ao campo e o destaque saltava para o topo.
    const usuario = userEvent.setup();
    render(<SearchableSelect value="" onChange={vi.fn()} options={OPCOES} aria-label="Instrumento" />);

    await abrir(usuario);
    await usuario.hover(screen.getByRole('option', { name: 'Piano' }));
    expect(focada()).toBe('Piano');
  });

  it('digitar na busca reposiciona o destaque no primeiro resultado', async () => {
    const usuario = userEvent.setup();
    render(<SearchableSelect value="" onChange={vi.fn()} options={OPCOES} aria-label="Instrumento" />);

    await abrir(usuario);
    await usuario.keyboard('pia');
    expect(focada()).toBe('Piano');
  });

  it('o campo de busca recebe o foco ao abrir', async () => {
    const usuario = userEvent.setup();
    render(<SearchableSelect value="" onChange={vi.fn()} options={OPCOES} aria-label="Instrumento" />);

    await abrir(usuario);
    expect(document.activeElement?.getAttribute('type')).toBe('search');
  });
});
