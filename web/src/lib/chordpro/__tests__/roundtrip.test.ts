import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from '../parse';
import { serialize } from '../serialize';

const fixture = (name: string) =>
  readFileSync(join(__dirname, '../../../__tests__/fixtures/chordpro', name), 'utf8');

describe('round-trip parse → serialize → parse', () => {
  it.each(['denso.chord', 'solto.chord', 'lapide.chord'])('é idempotente para %s', (name) => {
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
