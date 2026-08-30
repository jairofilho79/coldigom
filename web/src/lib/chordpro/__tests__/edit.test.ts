import { describe, expect, it } from 'vitest';
import { parse } from '../parse';
import {
  insertLineAfter,
  lineToText,
  removeLine,
  replaceLine,
  setHeaderField,
  splitStanzaAt,
} from '../edit';

const song = () => parse('Confio em [A]Deus\n[E]   A linda [A]flor\n\nsegunda estrofe\n');

describe('lineToText / replaceLine', () => {
  it('lineToText devolve a linha como texto editável', () => {
    expect(lineToText(song(), { stanza: 0, line: 0 })).toBe('Confio em [A]Deus');
  });

  it('preserva os três espaços ao virar texto e voltar', () => {
    const s = song();
    const texto = lineToText(s, { stanza: 0, line: 1 });
    expect(texto).toBe('[E]   A linda [A]flor');
    const depois = replaceLine(s, { stanza: 0, line: 1 }, texto);
    expect(depois.stanzas[0].lines[1]).toEqual(s.stanzas[0].lines[1]);
  });

  it('replaceLine reparseia o texto novo', () => {
    const depois = replaceLine(song(), { stanza: 0, line: 0 }, 'Confio em [Bm]Deus');
    const linha = depois.stanzas[0].lines[0];
    if (linha.kind !== 'cells') throw new Error('esperava células');
    expect(linha.cells[1].chord).toBe('Bm');
  });

  it('não muta o Song original', () => {
    const s = song();
    const antes = JSON.stringify(s);
    replaceLine(s, { stanza: 0, line: 0 }, 'outra coisa');
    expect(JSON.stringify(s)).toBe(antes);
  });
});

describe('estrutura', () => {
  it('insertLineAfter põe uma linha vazia depois', () => {
    const depois = insertLineAfter(song(), { stanza: 0, line: 0 });
    expect(depois.stanzas[0].lines).toHaveLength(3);
    expect(depois.stanzas[0].lines[1]).toEqual({
      kind: 'cells',
      cells: [{ chord: null, attached: false, text: '' }],
    });
  });

  it('removeLine tira a linha', () => {
    const depois = removeLine(song(), { stanza: 0, line: 0 });
    expect(depois.stanzas[0].lines).toHaveLength(1);
    expect(lineToText(depois, { stanza: 0, line: 0 })).toBe('[E]   A linda [A]flor');
  });

  it('estrofe que esvazia é removida', () => {
    const s = parse('so uma linha\n\noutra estrofe\n');
    const depois = removeLine(s, { stanza: 0, line: 0 });
    expect(depois.stanzas).toHaveLength(1);
    expect(lineToText(depois, { stanza: 0, line: 0 })).toBe('outra estrofe');
  });

  it('splitStanzaAt manda a linha e as seguintes para uma estrofe nova', () => {
    const depois = splitStanzaAt(song(), { stanza: 0, line: 1 });
    expect(depois.stanzas).toHaveLength(3);
    expect(depois.stanzas[0].lines).toHaveLength(1);
    expect(lineToText(depois, { stanza: 1, line: 0 })).toBe('[E]   A linda [A]flor');
  });

  it('splitStanzaAt na primeira linha não cria estrofe vazia', () => {
    const depois = splitStanzaAt(song(), { stanza: 0, line: 0 });
    expect(depois.stanzas).toHaveLength(2);
  });
});

describe('cabeçalho', () => {
  it('define um campo', () => {
    expect(setHeaderField(song(), 'key', 'A').header.key).toBe('A');
  });

  it('valor vazio remove a diretiva', () => {
    const s = setHeaderField(song(), 'key', 'A');
    expect(setHeaderField(s, 'key', '').header.key).toBeUndefined();
    expect(setHeaderField(s, 'key', '   ').header.key).toBeUndefined();
  });
});
