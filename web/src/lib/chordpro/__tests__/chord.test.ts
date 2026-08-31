import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeChord, parseChordToken } from '../chord';

const vocab = JSON.parse(
  readFileSync(
    join(__dirname, '../../../__tests__/fixtures/chordpro/chord-vocabulary.json'),
    'utf8'
  )
) as { tokens: Record<string, number>; ocorrencias: number };

describe('o gabarito humano inteiro é reconhecido', () => {
  it('nenhum dos 109 tokens do acervo cai em unknown', () => {
    const recusados = Object.keys(vocab.tokens)
      .map((raw) => ({ raw, tok: parseChordToken(raw) }))
      .filter(({ tok }) => tok.kind === 'unknown')
      .map(({ raw, tok }) => `${raw}: ${(tok as { reason: string }).reason}`);
    expect(recusados).toEqual([]);
  });

  it('o fixture é o que se espera — 109 tokens, 2224 ocorrências', () => {
    expect(Object.keys(vocab.tokens)).toHaveLength(109);
    expect(vocab.ocorrencias).toBe(2224);
  });
});

describe('as 15 qualidades observadas no corpus', () => {
  it.each([
    ['C', '', 'maior'],
    ['Cm', 'm', 'menor'],
    ['C7', '7', 'com sétima'],
    ['Cm7', 'm7', 'menor com sétima'],
    ['C6', '6', 'com sexta'],
    ['C9', '9', 'com nona'],
    ['Cø', 'ø', 'meio-diminuto'],
    ['Cm6', 'm6', 'menor com sexta'],
    ['C7M', '7M', 'com sétima maior'],
    ['Csus4', 'sus4', 'suspenso'],
    ['Cm(b13)', 'm(b13)', 'menor com b13'],
    ['Cm7(9)', 'm7(9)', 'menor com sétima e nona'],
    ['C7(b13)', '7(b13)', 'com sétima e b13'],
    ['C(b13)', '(b13)', 'com b13'],
    ['C(#5)', '(#5)', 'aumentado'],
  ])('%s tem qualidade %s (%s)', (raw, quality) => {
    const tok = parseChordToken(raw);
    expect(tok.kind).toBe('chord');
    if (tok.kind !== 'chord') return;
    expect(tok.root).toBe('C');
    expect(tok.quality).toBe(quality);
    expect(tok.bass).toBeNull();
  });
});

describe('raiz e alteração', () => {
  it('lê sustenido e bemol na raiz', () => {
    expect(parseChordToken('F#m')).toMatchObject({ root: 'F#', accidental: '#', quality: 'm' });
    expect(parseChordToken('Bb7')).toMatchObject({ root: 'Bb', accidental: 'b', quality: '7' });
  });

  it('aceita diminuto, que não tem precedente no corpus', () => {
    expect(parseChordToken('C°')).toMatchObject({ kind: 'chord', quality: '°' });
  });
});

describe('baixo invertido', () => {
  it.each(['G/B', 'Am/C', 'B/D#', 'C7/E', 'E7/Ab', 'F#m/E', 'Gm/Bb'])('%s', (raw) => {
    const tok = parseChordToken(raw);
    expect(tok.kind).toBe('chord');
    if (tok.kind !== 'chord') return;
    expect(tok.bass).toBe(raw.split('/')[1]);
  });
});

describe('anotação não é acorde nem erro', () => {
  it.each(['*2x', '*Coro', '*3x'])('%s é annotation', (raw) => {
    expect(parseChordToken(raw)).toEqual({ kind: 'annotation', text: raw.slice(1), raw });
  });
});

describe('recusas', () => {
  it.each([
    ['Bmm', /qualidade/i],
    ['H', /raiz/i],
    ['Am7/', /baixo/i],
    ['C#m7(', /qualidade/i],
    ['', /vazio/i],
    ['xyz', /raiz/i],
  ])('%s é unknown com motivo legível', (raw, motivo) => {
    const tok = parseChordToken(raw);
    expect(tok.kind).toBe('unknown');
    if (tok.kind !== 'unknown') return;
    expect(tok.reason).toMatch(motivo);
  });
});

describe('normalização — só as formas declaradas', () => {
  it.each([
    ['Cm7(b5)', 'Cø'],
    ['Cm7b5', 'Cø'],
    ['Cø', 'Cø'],
    ['Cdim', 'C°'],
    ['C°', 'C°'],
    ['Cmaj7', 'C7M'],
    ['CM7', 'C7M'],
    ['C7M', 'C7M'],
  ])('%s vira %s', (entrada, saida) => {
    expect(normalizeChord(entrada)).toBe(saida);
  });

  it('não mexe no que já está certo', () => {
    for (const raw of ['C', 'Am', 'F#m7', 'G/B', 'E7(b13)', '*2x']) {
      expect(normalizeChord(raw)).toBe(raw);
    }
  });

  it('devolve intacto o que não reconhece — normalizar não é consertar', () => {
    expect(normalizeChord('Bmm')).toBe('Bmm');
  });
});

describe('normalizar não é adivinhar', () => {
  it('"Do" continua não reconhecido — é o nome da nota, não um D diminuto', () => {
    // A heurística antiga virava "Do" em "D°". Ela disparava em exatamente um token
    // em todo o acervo, e era este: o único caso genuinamente ambíguo. Marcar e
    // deixar o revisor decidir é o comportamento certo numa ferramenta de gestão.
    expect(normalizeChord('Do')).toBe('Do');
    expect(parseChordToken('Do').kind).toBe('unknown');
  });

  it('o símbolo escrito por extenso continua valendo', () => {
    expect(parseChordToken('D°').kind).toBe('chord');
  });
});
