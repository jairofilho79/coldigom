/**
 * chord.ts é o único módulo do editor que sabe o que é um acorde. Tudo que valida,
 * autocompleta ou realça acorde passa por `parseChordToken` — nenhum outro lugar
 * reimplementa esta gramática.
 */
export type ChordToken =
  | {
      kind: 'chord';
      root: string;
      accidental: '' | '#' | 'b';
      quality: string;
      bass: string | null;
      raw: string;
    }
  | { kind: 'annotation'; text: string; raw: string }
  | { kind: 'unknown'; raw: string; reason: string };

const ROOT_RE = /^([A-G])([#b]?)/;
const BASS_RE = /^[A-G][#b]?$/;

/**
 * Qualidade, derivada dos 2.224 acordes do gabarito humano:
 *   ø  meio-diminuto        °  diminuto (sem precedente no corpus)
 *   m? sus(2|4)? (6|7|9|11|13|7M)? alteração*
 *   alteração := ( [#b]? número )      ex.: (b13) (#5) (9)
 */
const QUALITY_RE = /^(?:ø|°|m?(?:sus[24])?(?:7M|6|7|9|11|13)?(?:\([#b]?\d{1,2}\))*)$/;

export function parseChordToken(raw: string): ChordToken {
  if (raw === '') return { kind: 'unknown', raw, reason: 'token vazio' };

  // Anotação do acervo: [*2x], [*Coro]. Nunca é acorde, nunca é erro.
  if (raw.startsWith('*')) return { kind: 'annotation', text: raw.slice(1), raw };

  const rootMatch = ROOT_RE.exec(raw);
  if (!rootMatch) {
    return { kind: 'unknown', raw, reason: `"${raw}" não começa com uma raiz de A a G` };
  }
  const root = rootMatch[0];
  const accidental = (rootMatch[2] as '' | '#' | 'b') ?? '';

  let resto = raw.slice(root.length);
  let bass: string | null = null;

  const barra = resto.indexOf('/');
  if (barra !== -1) {
    const depois = resto.slice(barra + 1);
    if (!BASS_RE.test(depois)) {
      return {
        kind: 'unknown',
        raw,
        reason: `depois da barra, "${depois}" não é um baixo válido (esperado A a G, com # ou b)`,
      };
    }
    bass = depois;
    resto = resto.slice(0, barra);
  }

  if (!QUALITY_RE.test(resto)) {
    return {
      kind: 'unknown',
      raw,
      reason: `depois da raiz ${root}, "${resto}" não é uma qualidade válida`,
    };
  }

  return { kind: 'chord', root, accidental, quality: resto, bass, raw };
}

/**
 * Formas digitáveis viram a forma do acervo. Só isto é normalizado — espaçamento,
 * letra e ordem nunca são tocados. Token não reconhecido volta intacto:
 * normalizar não é consertar.
 */
const ALIASES: Array<[RegExp, string]> = [
  [/m7\(b5\)|m7b5/g, 'ø'],
  [/dim(?![a-z])/g, '°'],
  [/maj7|M7/g, '7M'],
];

export function normalizeChord(raw: string): string {
  if (raw.startsWith('*')) return raw;

  let out = raw;
  for (const [re, para] of ALIASES) out = out.replace(re, para);

  // Havia aqui uma heurística que virava "Co" em "C°", supondo OCR de "°" como "o".
  // Ela disparava em EXATAMENTE um token em todo o acervo (5590 arquivos): "Do" — que
  // é o nome português da nota Dó, o único caso genuinamente ambíguo. Ou seja, não
  // resgatava nada e reinterpretava justamente o que não dava para decidir sozinha.
  // Este módulo promete "normalizar não é consertar"; agora "Do" volta como não
  // reconhecido, o revisor vê marcado e decide — e o editor tem botão para inserir "°".

  return parseChordToken(out).kind === 'unknown' ? raw : out;
}
