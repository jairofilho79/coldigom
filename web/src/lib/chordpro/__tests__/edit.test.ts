import { describe, expect, it } from 'vitest';
import { parse } from '../parse';
import { serialize } from '../serialize';
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

  it('estrofe que só tem comentário não é descartada', () => {
    const s = parse('{comment: Refrão}\n\nletra [C]aqui\n');
    expect(s.stanzas).toHaveLength(2);
    const depois = removeLine(s, { stanza: 1, line: 0 });
    expect(depois.stanzas).toHaveLength(1);
    expect(depois.stanzas[0].lines[0]).toEqual({ kind: 'comment', text: 'Refrão' });
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

describe('linhas cruas acompanham a edição', () => {
  // A nota ";" do pipeline marca QUAL trecho está em dúvida. Guardá-la por índice
  // fazia ela derivar a cada edição: inserir antes empurrava a nota para depois da
  // linha nova, e remover a linha anterior mandava a nota para o fim da cifra.
  const FONTE = 'linha um\n; recado do pipeline\nlinha dois\n';

  it('sem editar, a nota volta byte a byte no lugar', () => {
    expect(serialize(parse(FONTE))).toBe(FONTE);
  });

  it('inserir uma linha antes da nota não desloca a nota', () => {
    const depois = serialize(insertLineAfter(parse(FONTE), { stanza: 0, line: 0 }));
    expect(depois).toBe('linha um\n\n; recado do pipeline\nlinha dois\n');
  });

  it('remover a linha anterior mantém a nota colada ao trecho que ela comenta', () => {
    const depois = serialize(removeLine(parse(FONTE), { stanza: 0, line: 0 }));
    expect(depois).toBe('; recado do pipeline\nlinha dois\n');
  });

  it('separar estrofe leva a nota junto para a estrofe nova', () => {
    const depois = serialize(splitStanzaAt(parse(FONTE), { stanza: 0, line: 1 }));
    expect(depois).toContain('; recado do pipeline\nlinha dois');
  });

  it('substituir a linha que a nota precedia mantém a nota na posição', () => {
    const depois = serialize(replaceLine(parse(FONTE), { stanza: 0, line: 1 }, 'outra [C]coisa'));
    expect(depois).toBe('linha um\n; recado do pipeline\noutra [C]coisa\n');
  });

  it('Song montado à mão continua sem linhas cruas — não inventa nenhuma', () => {
    const song = parse('a\nb\n');
    const semCruas = { ...song, rawLines: undefined };
    expect(removeLine(semCruas, { stanza: 0, line: 0 }).rawLines).toBeUndefined();
  });
});
