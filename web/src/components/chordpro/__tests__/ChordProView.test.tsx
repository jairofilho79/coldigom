import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChordProView } from '../ChordProView';
import { parse } from '../../../lib/chordpro/parse';

const renderSource = (source: string) => render(<ChordProView song={parse(source)} />);

describe('ChordProView', () => {
  it('desenha uma célula por acorde, com rótulo e texto', () => {
    const { container } = renderSource('ha[Cm]bi - [Gm]ta,');
    const cells = container.querySelectorAll('.cp-cell');
    expect(cells).toHaveLength(3);
    expect(cells[1].querySelector('.cp-chord')!.textContent).toBe('Cm');
    expect(cells[1].querySelector('.cp-text')!.textContent).toBe('bi - ');
  });

  it('marca com --bar só as células de acorde encostado', () => {
    const { container } = renderSource('[E]   A linda [A]flor');
    const cells = container.querySelectorAll('.cp-cell');
    expect(cells[0].className).not.toContain('cp-cell--bar');
    expect(cells[1].className).toContain('cp-cell--bar');
  });

  it('marca com --free a célula sem acorde, que pode quebrar linha', () => {
    const { container } = renderSource('Confio em [A]Deus');
    const cells = container.querySelectorAll('.cp-cell');
    expect(cells[0].className).toContain('cp-cell--free');
    expect(cells[1].className).not.toContain('cp-cell--free');
  });

  it('renderiza célula com texto vazio e barra sem colapsar', () => {
    const { container } = renderSource('Sinai[C#m7]');
    const ultima = container.querySelectorAll('.cp-cell')[1];
    expect(ultima.className).toContain('cp-cell--bar');
    expect(ultima.querySelector('.cp-text')).not.toBeNull();
  });

  it('renderiza {comment} e nunca as notas ";"', () => {
    const { container } = renderSource('{comment: Refrão}\n; recado de pipeline\nletra [C]aqui');
    expect(screen.getByText('Refrão')).toBeInTheDocument();
    expect(container.textContent).not.toContain('recado de pipeline');
  });
});

describe('espaçamento sobrevive até o DOM', () => {
  it('mantém os espaços literais no nó de texto', () => {
    const { container } = renderSource('[E]   A linda [A]flor');
    expect(container.querySelectorAll('.cp-text')[0].textContent).toBe('   A linda ');
  });

  it('um espaço e três espaços produzem nós de texto diferentes', () => {
    const um = renderSource('Deus é Amor [C]').container.querySelector('.cp-text')!.textContent;
    const tres = renderSource('Deus é Amor   [C]').container.querySelector('.cp-text')!.textContent;
    expect(um).toBe('Deus é Amor ');
    expect(tres).toBe('Deus é Amor   ');
    expect(tres).not.toBe(um);
  });
});
