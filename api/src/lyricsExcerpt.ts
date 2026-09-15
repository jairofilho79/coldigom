/**
 * Trecho de uma linha da letra ao redor do primeiro match de uma busca —
 * usado pelo card de resultado quando o match não está no título (D2/D3 do
 * design doc `2026-09-15-trecho-letra-pesquisa-design.md`).
 */

const MAX_CONTEXT_CHARS = 55;
const MAX_EXCERPT_CHARS = 120;

function stripDiacritics(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Mesma tokenização de `buildFtsMatchQuery` em `praiseQuery.ts`, sem a
 * parte específica de sintaxe FTS5. */
function tokenize(query: string): string[] {
  return query
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Acento-insensível, case-insensível, qualquer espaço em branco (inclusive
 * quebra de linha) vira um espaço — preservando 1 caractere de saída por
 * caractere de entrada, para que os índices da string normalizada valham
 * também para [input] original.
 */
function normalizeKeepingIndex(
  input: string
): { normalized: string; indexMap: number[] } {
  let normalized = '';
  const indexMap: number[] = [];
  for (let i = 0; i < input.length; i++) {
    const raw = input[i];
    const piece = /\s/.test(raw) ? ' ' : stripDiacritics(raw).toLowerCase();
    for (const ch of piece) {
      normalized += ch;
      indexMap.push(i);
    }
  }
  return { normalized, indexMap };
}

/**
 * Expande [matchStart, matchEnd) até a borda de palavra mais próxima,
 * reservando espaço para o match em si dentro do orçamento de ~120
 * caracteres antes de gastar o restante como contexto (até ~55 de cada
 * lado) — sempre uma linha, nunca no meio de uma palavra, e nunca corta o
 * próprio match.
 */
function extractWindow(text: string, matchStart: number, matchEnd: number): string {
  const matchLen = matchEnd - matchStart;
  const budget = Math.max(0, MAX_EXCERPT_CHARS - matchLen);
  const sideContext = Math.min(MAX_CONTEXT_CHARS, Math.floor(budget / 2));

  let left = matchStart - sideContext;
  if (left <= 0) {
    left = 0;
  } else {
    while (left < matchStart && !/\s/.test(text[left])) left++;
    while (left < matchStart && /\s/.test(text[left])) left++;
  }

  let right = matchEnd + sideContext;
  if (right >= text.length) {
    right = text.length;
  } else {
    while (right > matchEnd && !/\s/.test(text[right])) right--;
  }

  const prefix = left > 0 ? '…' : '';
  const suffix = right < text.length ? '…' : '';
  const collapsed = text.slice(left, right).replace(/\s+/g, ' ').trim();
  return `${prefix}${collapsed}${suffix}`;
}

export function buildLyricsExcerpt(lyrics: string, rawQuery: string): string | null {
  const trimmedLyrics = lyrics.trim();
  const tokens = tokenize(rawQuery);
  if (!trimmedLyrics || tokens.length === 0) return null;

  const { normalized, indexMap } = normalizeKeepingIndex(trimmedLyrics);
  const normTokens = tokens.map((t) => stripDiacritics(t).toLowerCase());

  // Separador tolerante a pontuação (vírgula, hífen etc.), não só espaço em
  // branco puro — mesma regra do tokenizer do FTS5 no backend
  // (`buildFtsMatchQuery`): qualquer caractere não-alfanumérico entre as
  // palavras conta como fronteira de token, então "A Ti, pertence" bate
  // igual a "A Ti pertence".
  const match = new RegExp(normTokens.join('[^\\p{L}\\p{N}]+'), 'u').exec(normalized);
  if (!match) return null;

  const matchStart = indexMap[match.index];
  const matchEnd = indexMap[match.index + match[0].length - 1] + 1;

  return extractWindow(trimmedLyrics, matchStart, matchEnd);
}
