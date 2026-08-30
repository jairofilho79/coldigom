import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from '../parse';
import { validateSong } from '../validate';

const fixture = (name: string) =>
  readFileSync(join(__dirname, '../../../__tests__/fixtures/chordpro', name), 'utf8');

describe('validateSong', () => {
  it('cifra correta não tem issue', () => {
    expect(validateSong(parse('Confio em [A]Deus [Bm]hoje\n'))).toEqual([]);
  });

  it('aponta o token e o lugar exato', () => {
    const issues = validateSong(parse('linha boa [A]ok\n\noutra [Bmm]ruim\n'));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ stanza: 1, line: 0, cell: 1, raw: 'Bmm' });
    expect(issues[0].reason).toMatch(/qualidade/i);
  });

  it('anotação nunca é issue', () => {
    expect(validateSong(parse('[*2x]\n[*Coro]\n'))).toEqual([]);
  });

  it('linha de comentário não produz issue', () => {
    expect(validateSong(parse('{comment: Refrão}\n'))).toEqual([]);
  });

  it('os três fixtures reais publicados passam limpos', () => {
    for (const nome of ['denso.chord', 'solto.chord', 'lapide.chord']) {
      expect(validateSong(parse(fixture(nome)))).toEqual([]);
    }
  });

  it('acha vários issues numa linha só', () => {
    const issues = validateSong(parse('[H]um [Bmm]dois\n'));
    expect(issues.map((i) => i.raw)).toEqual(['H', 'Bmm']);
  });
});
