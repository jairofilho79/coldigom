import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from '../parse';

const fixture = (name: string) =>
  readFileSync(join(__dirname, '../../../__tests__/fixtures/chordpro', name), 'utf8');

describe('estrofes', () => {
  it('linha em branco separa estrofes', () => {
    expect(parse('linha um\n\nlinha dois\n').stanzas).toHaveLength(2);
  });

  it('brancos consecutivos colapsam em um separador', () => {
    expect(parse('linha um\n\n\n\nlinha dois\n').stanzas).toHaveLength(2);
  });

  it('separador no fim é descartado', () => {
    expect(parse('linha um\n\n\n').stanzas).toHaveLength(1);
  });

  it('o denso real tem 4 estrofes', () => {
    expect(parse(fixture('denso.chord')).stanzas).toHaveLength(4);
  });
});

describe('notas de pipeline', () => {
  it('linha ";" sai do corpo e entra em notes', () => {
    const song = parse('; recado\nletra [C]aqui\n');
    expect(song.notes).toEqual(['recado']);
    expect(song.stanzas.flatMap((s) => s.lines)).toHaveLength(1);
  });

  it('a lápide real carrega as duas notas', () => {
    const song = parse(fixture('lapide.chord'));
    expect(song.notes).toHaveLength(2);
    expect(song.notes[0]).toContain('Dobro os meus joelhos');
    expect(song.notes[1]).toContain('Reanexe o PDF correto');
  });
});

describe('comentários', () => {
  it('{comment} vira linha renderizável dentro da estrofe', () => {
    const song = parse('{comment: Refrão}\nletra [C]aqui\n');
    expect(song.stanzas[0].lines[0]).toEqual({ kind: 'comment', text: 'Refrão' });
  });
});

describe('regra 8 — indisponível com HTTP 200', () => {
  it('a lápide real não tem linha de letra', () => {
    const song = parse(fixture('lapide.chord'));
    expect(song.hasLyrics).toBe(false);
    expect(song.stanzas.flatMap((s) => s.lines).filter((l) => l.kind === 'cells')).toHaveLength(0);
  });

  it('só comentário não conta como letra', () => {
    expect(parse('{comment: nada aqui}\n').hasLyrics).toBe(false);
  });

  it('os arquivos reais com letra têm hasLyrics', () => {
    expect(parse(fixture('denso.chord')).hasLyrics).toBe(true);
    expect(parse(fixture('solto.chord')).hasLyrics).toBe(true);
  });
});
