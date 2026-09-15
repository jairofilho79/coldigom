import { describe, expect, it } from 'vitest';

import { buildLyricsExcerpt } from '../lyricsExcerpt';

describe('buildLyricsExcerpt', () => {
  it('acha o termo mesmo sem o acento que a letra tem', () => {
    const lyrics = 'Ainda que a terra se abale, eu não temerei, pois Tu és comigo.';
    expect(buildLyricsExcerpt(lyrics, 'nao temerei')).toContain('não temerei');
  });

  it('acha o termo acentuado numa letra sem o mesmo acento', () => {
    const lyrics = 'e a chuva de bencaos cai sobre nos';
    expect(buildLyricsExcerpt(lyrics, 'chuva de bênçãos')).toContain('bencaos');
  });

  it('sem match nenhum devolve null', () => {
    expect(buildLyricsExcerpt('Grande é o Senhor', 'inexistente')).toBeNull();
  });

  it('letra vazia devolve null', () => {
    expect(buildLyricsExcerpt('', 'graça')).toBeNull();
  });

  it('busca vazia devolve null', () => {
    expect(buildLyricsExcerpt('Grande é o Senhor', '')).toBeNull();
  });

  it('palavra maior que a janela de contexto é omitida inteira, nunca cortada no meio', () => {
    const longWord = 'a'.repeat(70);
    const lyrics = `${longWord} termodobusca depois disso`;
    const excerpt = buildLyricsExcerpt(lyrics, 'termodobusca')!;
    expect(excerpt.startsWith('…')).toBe(true);
    expect(excerpt).not.toContain('a'.repeat(10));
    expect(excerpt).toContain('termodobusca');
  });

  it('sem conteúdo antes do match, não prefixa com reticências', () => {
    const lyrics = 'graça infinita cobre a minha vida';
    const excerpt = buildLyricsExcerpt(lyrics, 'graça')!;
    expect(excerpt.startsWith('…')).toBe(false);
  });

  it('sem conteúdo depois do match, não sufixa com reticências', () => {
    const lyrics = 'a minha vida é coberta pela graça';
    const excerpt = buildLyricsExcerpt(lyrics, 'graça')!;
    expect(excerpt.endsWith('…')).toBe(false);
  });

  it('prefere a frase completa a um token isolado', () => {
    const lyrics = 'não vou temer porque não temerei o mal';
    const excerpt = buildLyricsExcerpt(lyrics, 'não temerei')!;
    expect(excerpt).toContain('não temerei');
  });

  it('sem a frase completa, não faz fallback para um token isolado — devolve null', () => {
    const lyrics = 'eu não vou vacilar diante do inimigo';
    expect(buildLyricsExcerpt(lyrics, 'não temerei')).toBeNull();
  });

  it('quebras de linha da letra viram espaço — uma linha só', () => {
    const lyrics = 'Refrão:\nEu não\ntemerei\no mal';
    const excerpt = buildLyricsExcerpt(lyrics, 'não temerei')!;
    expect(excerpt).not.toMatch(/[\n\r]/);
    expect(excerpt).toContain('não temerei');
  });

  it('match longo com contexto longo dos dois lados: não estoura o orçamento, preserva o match inteiro e nunca corta palavra no meio', () => {
    const matchPhrase =
      'graça infinita que cobre toda a nossa vida e nos alcança sempre';
    const before =
      'no princípio quando tudo começou o senhor criou os céus e a terra com muito amor e cuidado ';
    const after =
      ' para sempre e eternamente ele reina com poder e glória sobre todas as coisas do universo inteiro';
    const lyrics = `${before}${matchPhrase}${after}`;

    const excerpt = buildLyricsExcerpt(lyrics, matchPhrase)!;

    expect(excerpt).not.toBeNull();
    // (a) nunca estoura MAX_EXCERPT_CHARS (120) além de ~1 reticência de cada lado.
    expect(excerpt.length).toBeLessThanOrEqual(122);
    // (b) o match inteiro sobrevive intacto, não é truncado.
    expect(excerpt).toContain(matchPhrase);
    // (c) nenhuma palavra é cortada no meio: todo token do excerto (tirando
    // as reticências) é uma palavra inteira que existe no texto original.
    const allWords = new Set(`${before}${matchPhrase}${after}`.trim().split(/\s+/));
    const core = excerpt.replace(/^…/, '').replace(/…$/, '');
    for (const word of core.split(/\s+/)) {
      expect(allWords.has(word)).toBe(true);
    }
    expect(excerpt.startsWith('…')).toBe(true);
    expect(excerpt.endsWith('…')).toBe(true);
  });
});
