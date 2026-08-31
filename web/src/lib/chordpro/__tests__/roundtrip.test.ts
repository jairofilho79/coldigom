import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from '../parse';
import { serialize } from '../serialize';

const fixture = (name: string) =>
  readFileSync(join(__dirname, '../../../__tests__/fixtures/chordpro', name), 'utf8');

const FIXTURES = ['denso.chord', 'solto.chord', 'lapide.chord', 'barra.chord', 'meta.chord'];

/**
 * A propriedade que interessa é `serialize(parse(x)) === x`, byte a byte.
 *
 * Comparar dois `Song` — como esta suíte fazia — é estritamente mais fraco: continua
 * verdadeiro justamente quando a informação já se perdeu no parse, porque o que sumiu
 * não está em nenhum dos dois lados. Abrir uma cifra e salvar sem mudar nada não pode
 * reescrever o arquivo: o R2 não versiona, o que se perde não volta.
 */
describe('round-trip serialize(parse(x)) === x', () => {
  it.each(FIXTURES)('devolve %s byte a byte', (name) => {
    const src = fixture(name);
    expect(serialize(parse(src))).toBe(src);
  });

  it.each([
    ['diretiva desconhecida no cabeçalho', '{title: X}\n{meta: column full}\n\nletra [C]aqui\n'],
    ['diretiva desconhecida sem cabeçalho nenhum', '{qualquer: coisa}\nletra\n'],
    ['diretiva de valor vazio', '{title: X}\n{key: }\n{subtitle: ?}\n\nletra\n'],
    ['brancos consecutivos', 'a\n\n\nb\n'],
    ['branco a mais no fim', 'a\n\n'],
    ['branco antes de tudo', '\na\n'],
    ['nota ";" no meio do corpo', 'linha um\n; recado\nlinha dois\n'],
    ['nota ";" entre estrofes', 'linha um\n\n; recado\nlinha dois\n'],
    ['nota ";" no fim', 'linha um\n\n; recado\n'],
    ['nota ";" sem espaço depois do ponto e vírgula', ';recado\nlinha\n'],
    ['colchete sem par veio assim do PDF', 'Ds [Usa-m\n'],
    ['colchete vazio veio assim do PDF', 'vazio [] aqui\n'],
    ['colchete escapado continua escapado', 'um \\[dois\\] tres\n'],
    ['espaço dentro do valor do comment', '{comment: Coro }\nletra\n'],
    ['acorde solto antes, no meio e depois', '[G]   antes\nno meio [C]   da frase\ndepois   [D]\n'],
  ])('devolve byte a byte: %s', (_nome, src) => {
    expect(serialize(parse(src))).toBe(src);
  });
});

describe('round-trip parse → serialize → parse', () => {
  it.each(FIXTURES)('é idempotente para %s', (name) => {
    const once = parse(fixture(name));
    expect(parse(serialize(once))).toEqual(once);
  });

  it('preserva espaçamento significativo na ida e volta', () => {
    const once = parse('Deus é Amor   [C]\n[E]   A linda [A]flor\n');
    expect(parse(serialize(once))).toEqual(once);
    expect(serialize(once)).toContain('Deus é Amor   [C]');
    expect(serialize(once)).toContain('[E]   A linda [A]flor');
  });

  it('preserva colado e solto', () => {
    const song = parse('ha[Cm]bi\nDeus é Amor [C]\n');
    expect(parse(serialize(song)).stanzas[0].lines).toEqual(song.stanzas[0].lines);
  });

  it('preserva colchete literal escapado', () => {
    const once = parse('um \\[dois\\] tres\n');
    expect(once.stanzas[0].lines[0]).toEqual({
      kind: 'cells',
      cells: [{ chord: null, attached: false, text: 'um [dois] tres' }],
    });
    expect(serialize(once)).toContain('um \\[dois\\] tres');
    expect(parse(serialize(once))).toEqual(once);
  });

  it('colchete literal não vira acorde na volta', () => {
    const song = parse('um \\[dois\\] tres\n');
    const linha = parse(serialize(song)).stanzas[0].lines[0];
    if (linha.kind !== 'cells') throw new Error('esperava linha de células');
    expect(linha.cells.map((c) => c.chord)).toEqual([null]);
  });
});

/**
 * O serializer escapava TODO colchete do texto, inclusive o que veio sem escape do PDF.
 * O revisor via `\[` onde o PDF tem `[` — correção automática de letra, que o dono do
 * acervo proíbe. Escapar só é obrigatório quando a linha crua voltaria com outras células.
 */
describe('escape de colchete — só quando muda o parse', () => {
  it('não escapa colchete que o parser já lê como texto', () => {
    expect(serialize(parse('Ds [Usa-m\n'))).toBe('Ds [Usa-m\n');
    expect(serialize(parse('vazio [] aqui\n'))).toBe('vazio [] aqui\n');
  });

  it('escapa quando o texto cru viraria acorde na volta', () => {
    // "um [dois] tres" sem escape reparsearia [dois] como acorde.
    expect(serialize(parse('um \\[dois\\] tres\n'))).toBe('um \\[dois\\] tres\n');
  });

  it('escapa quando um "[" do texto abocanharia o "]" de um acorde seguinte', () => {
    const song = parse('a\\[b [C]d\n');
    // Sem escape sairia "a[b [C]d", e o parser leria o acorde "b [C".
    const linha = parse(serialize(song)).stanzas[0].lines[0];
    if (linha.kind !== 'cells') throw new Error('esperava linha de células');
    expect(linha.cells.map((c) => c.chord)).toEqual([null, 'C']);
  });
});

/** As estrofes que a edição cria não têm linha em branco gravada; o separador
 *  ainda tem de sair, senão as duas estrofes voltam coladas numa só. */
describe('separador de estrofe sobrevive à edição', () => {
  it('estrofe montada à mão continua separada por linha em branco', () => {
    const song = parse('a\n\nb\n');
    const semCruas = { ...song, rawLines: [] };
    expect(parse(serialize(semCruas)).stanzas).toHaveLength(2);
  });

  it('Song montado à mão, sem cabeçalho literal, sai na ordem canônica', () => {
    const texto = serialize({
      header: { title: 'X', key: 'A' },
      stanzas: [{ lines: [{ kind: 'comment', text: 'Coro' }] }],
      notes: ['recado'],
      hasLyrics: false,
    });
    expect(texto).toBe('{title: X}\n{key: A}\n; recado\n\n{comment: Coro}\n');
  });
});
