import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from '../parse';
import type { Cell } from '../types';

const fixture = (name: string) =>
  readFileSync(join(__dirname, '../../../__tests__/fixtures/chordpro', name), 'utf8');

/** Extrai as células da n-ésima linha de letra do documento inteiro. */
function cellsOf(source: string, index = 0): Cell[] {
  const lines = parse(source).stanzas.flatMap((s) => s.lines);
  const line = lines.filter((l) => l.kind === 'cells')[index];
  if (!line || line.kind !== 'cells') throw new Error('sem linha de letra');
  return line.cells;
}

describe('tabela de adjacência — as 7 combinações', () => {
  it('espaço → texto: tem barra', () => {
    expect(cellsOf('é [Ab]Deus')).toEqual([
      { chord: null, attached: false, text: 'é ' },
      { chord: 'Ab', attached: true, text: 'Deus' },
    ]);
  });

  it('texto → texto: tem barra', () => {
    expect(cellsOf('ha[Cm]bi')[1]).toEqual({ chord: 'Cm', attached: true, text: 'bi' });
  });

  it('início de linha → texto: tem barra', () => {
    expect(cellsOf('[Eb]Co - ')[0]).toEqual({ chord: 'Eb', attached: true, text: 'Co - ' });
  });

  it('texto → fim de linha: tem barra, com texto vazio', () => {
    expect(cellsOf('Sinai[C#m7]')[1]).toEqual({ chord: 'C#m7', attached: true, text: '' });
  });

  it('espaço → fim de linha: sem barra', () => {
    expect(cellsOf('Deus é Amor [C]')[1]).toEqual({ chord: 'C', attached: false, text: '' });
  });

  it('espaço → espaço: sem barra', () => {
    expect(cellsOf('Amor [C] eterno')[1]).toEqual({ chord: 'C', attached: false, text: ' eterno' });
  });

  it('início → espaço: sem barra', () => {
    expect(cellsOf('[E]   A linda ')[0]).toEqual({
      chord: 'E',
      attached: false,
      text: '   A linda ',
    });
  });
});

describe('espaçamento é dado, não estilo', () => {
  it('preserva corrida de espaços dentro do texto', () => {
    expect(cellsOf('[Eb]A  [Fm]grande')[0].text).toBe('A  ');
  });

  it('preserva espaço em fim de linha', () => {
    const cells = cellsOf('[Ab]terna [C]reden[Fm]ção, ');
    expect(cells[cells.length - 1].text).toBe('ção, ');
  });

  it('distingue um espaço de três antes do acorde solto', () => {
    expect(cellsOf('Deus é Amor [C]')[0].text).toBe('Deus é Amor ');
    expect(cellsOf('Deus é Amor   [C]')[0].text).toBe('Deus é Amor   ');
  });
});

describe('colchetes literais', () => {
  it('trata \\[ e \\] escapados como texto', () => {
    expect(cellsOf('um \\[dois\\] tres')).toEqual([
      { chord: null, attached: false, text: 'um [dois] tres' },
    ]);
  });

  it('trata [] vazio como texto literal, não acorde sem nome', () => {
    expect(cellsOf('vazio [] aqui')).toEqual([
      { chord: null, attached: false, text: 'vazio [] aqui' },
    ]);
  });

  it('trata colchete sem fechamento como texto', () => {
    expect(cellsOf('aberto [ sem fim')).toEqual([
      { chord: null, attached: false, text: 'aberto [ sem fim' },
    ]);
  });
});

describe('arquivos reais', () => {
  it('a primeira linha do denso tem 5 acordes, todos encostados', () => {
    const cells = cellsOf(fixture('denso.chord'));
    expect(cells.map((c) => c.chord)).toEqual(['Eb', 'Bb', 'Cm', 'Gm', 'Ab']);
    expect(cells.every((c) => c.attached)).toBe(true);
    expect(cells[0].text).toBe('Co - ');
  });

  it('o solto tem a linha com [E] seguido de 3 espaços, sem barra', () => {
    const linhas = parse(fixture('solto.chord')).stanzas.flatMap((s) => s.lines);
    const alvo = linhas
      .filter((l): l is { kind: 'cells'; cells: Cell[] } => l.kind === 'cells')
      .find((l) => l.cells[0]?.chord === 'E');
    expect(alvo).toBeDefined();
    expect(alvo!.cells[0]).toEqual({ chord: 'E', attached: false, text: '   A linda ' });
  });
});
