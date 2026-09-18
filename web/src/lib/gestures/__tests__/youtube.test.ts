import { describe, expect, it } from 'vitest';

import { formatarTempo, linkNoTempo, parseTempos } from '../youtube';

describe('linkNoTempo', () => {
  it.each([
    ['https://www.youtube.com/watch?v=abc123XYZ_-', 'abc123XYZ_-'],
    ['https://youtube.com/watch?list=PL1&v=abc123XYZ_-', 'abc123XYZ_-'],
    ['https://m.youtube.com/watch?v=abc123XYZ_-', 'abc123XYZ_-'],
    ['https://youtu.be/abc123XYZ_-', 'abc123XYZ_-'],
    ['https://youtu.be/abc123XYZ_-?si=xyz', 'abc123XYZ_-'],
    ['https://www.youtube.com/shorts/abc123XYZ_-', 'abc123XYZ_-'],
  ])('%s → watch canônico com t=', (url, id) => {
    expect(linkNoTempo(url, 83)).toBe(`https://www.youtube.com/watch?v=${id}&t=83s`);
    expect(linkNoTempo(url, null)).toBe(`https://www.youtube.com/watch?v=${id}`);
  });

  it('URL que não reconhece volta como veio, com ou sem tempo', () => {
    expect(linkNoTempo('https://vimeo.com/123', 83)).toBe('https://vimeo.com/123');
    expect(linkNoTempo('lixo', null)).toBe('lixo');
  });
});

describe('formatarTempo', () => {
  it.each([[0, '0:00'], [7, '0:07'], [83, '1:23'], [600, '10:00'], [3661, '1:01:01']])('%d → %s', (s, esperado) => {
    expect(formatarTempo(s)).toBe(esperado);
  });
});

describe('parseTempos', () => {
  it('aceita m:ss, h:mm:ss e inteiros, misturados; ordena e deduplica', () => {
    expect(parseTempos('2:21, 83; 1:23\n1:01:01, 0')).toEqual({ ok: true, seconds: [0, 83, 141, 3661] });
  });

  it('vazio ou só separadores é lista vazia', () => {
    expect(parseTempos('')).toEqual({ ok: true, seconds: [] });
    expect(parseTempos(' , ; ')).toEqual({ ok: true, seconds: [] });
  });

  it('recusa o que não é tempo, dizendo qual', () => {
    expect(parseTempos('1:23, abc')).toEqual({ ok: false, erro: 'Tempo inválido: "abc"' });
    expect(parseTempos('1:75')).toEqual({ ok: false, erro: 'Tempo inválido: "1:75"' });
    expect(parseTempos('-5')).toEqual({ ok: false, erro: 'Tempo inválido: "-5"' });
    expect(parseTempos('1.5')).toEqual({ ok: false, erro: 'Tempo inválido: "1.5"' });
  });
});
