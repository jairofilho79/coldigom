/**
 * Análise de parâmetros de consulta.
 *
 * Existe porque `parseInt` falha em silêncio: `parseInt('abc')` é NaN e seguia
 * até o SQL. `LIMIT NaN` quebrava a paginação, e `numberMin` NaN virava
 * `CAST(p.number AS INTEGER) >= NULL` — que nunca é verdade, então o usuário
 * filtrava por um número inválido e recebia zero resultados com HTTP 200 e
 * nenhuma explicação. Entrada malformada agora é erro do cliente, explícito.
 */

/** Teto de itens por página. Sem ele, ?limit=999999 devolvia o acervo inteiro. */
export const MAX_PAGE_SIZE = 100;

export type ParseResult =
  | { ok: true; value: number }
  | { ok: false; reason: 'not-an-integer' | 'below-minimum' };

/**
 * Inteiro estrito: recusa o que `parseInt` aceitaria calado, como '12abc'.
 * Ausente ou vazio devolve o padrão.
 */
export function parseIntParam(
  raw: string | undefined,
  opts: { fallback: number; min?: number }
): ParseResult {
  if (raw === undefined || raw.trim() === '') return { ok: true, value: opts.fallback };

  const trimmed = raw.trim();
  if (!/^-?\d+$/.test(trimmed)) return { ok: false, reason: 'not-an-integer' };

  const value = Number(trimmed);
  if (!Number.isSafeInteger(value)) return { ok: false, reason: 'not-an-integer' };
  if (opts.min !== undefined && value < opts.min) return { ok: false, reason: 'below-minimum' };

  return { ok: true, value };
}

/** Limita o tamanho de página ao teto. Excesso é limitado, não recusado: há
 *  consumidor externo (PLPCG) e recusar quebraria quem já pede mais. */
export function clampPageSize(limit: number): number {
  return Math.min(Math.max(limit, 1), MAX_PAGE_SIZE);
}

export type ListNumbers =
  | {
      ok: true;
      page: number;
      limit: number;
      offset: number;
      numberMin?: number;
      numberMax?: number;
    }
  | { ok: false; error: string };

/**
 * Os quatro parâmetros numéricos comuns a /api/praises e /api/plpcg/praises.
 * Compartilhado de propósito: as duas rotas repetiam a mesma análise sem
 * validação, e uma correção só numa delas deixaria o buraco aberto na outra.
 */
export function parseListNumbers(raw: {
  page?: string;
  limit?: string;
  numberMin?: string;
  numberMax?: string;
}): ListNumbers {
  const page = parseIntParam(raw.page, { fallback: 1, min: 1 });
  if (!page.ok) return { ok: false, error: "Parâmetro 'page' deve ser um inteiro maior ou igual a 1" };

  const limit = parseIntParam(raw.limit, { fallback: 20, min: 1 });
  if (!limit.ok) return { ok: false, error: "Parâmetro 'limit' deve ser um inteiro maior ou igual a 1" };

  const numberMin = parseIntParam(raw.numberMin, { fallback: Number.NaN });
  if (!numberMin.ok) return { ok: false, error: "Parâmetro 'numberMin' deve ser um inteiro" };

  const numberMax = parseIntParam(raw.numberMax, { fallback: Number.NaN });
  if (!numberMax.ok) return { ok: false, error: "Parâmetro 'numberMax' deve ser um inteiro" };

  const tamanho = clampPageSize(limit.value);
  return {
    ok: true,
    page: page.value,
    limit: tamanho,
    offset: (page.value - 1) * tamanho,
    numberMin: Number.isNaN(numberMin.value) ? undefined : numberMin.value,
    numberMax: Number.isNaN(numberMax.value) ? undefined : numberMax.value,
  };
}

/** Os filtros de lista, na forma que buildWhereClause espera. */
export type FiltrosDeLista = {
  search?: string;
  tags?: string[];
  rhythm?: string[];
  tonality?: string[];
  category?: string[];
  materialKinds?: string[];
  numberMin?: number;
  numberMax?: number;
};

function lista(bruto: string | undefined): string[] | undefined {
  const itens = bruto ? bruto.split(',').filter(Boolean) : [];
  return itens.length > 0 ? itens : undefined;
}

/**
 * Filtros vindos da query string, compartilhados por /api/praises e por
 * /api/praises/filters — que precisa dos mesmos filtros para saber quais
 * opções ainda produzem resultado.
 */
export function parseFiltrosDeLista(
  q: (chave: string) => string | undefined
): { ok: true; filtros: FiltrosDeLista; page: number; limit: number; offset: number } | { ok: false; error: string } {
  const numeros = parseListNumbers({
    page: q('page'),
    limit: q('limit'),
    numberMin: q('numberMin'),
    numberMax: q('numberMax'),
  });
  if (!numeros.ok) return { ok: false, error: numeros.error };

  return {
    ok: true,
    page: numeros.page,
    limit: numeros.limit,
    offset: numeros.offset,
    filtros: {
      search: q('q') || undefined,
      tags: lista(q('tags')),
      rhythm: lista(q('rhythm')),
      tonality: lista(q('tonality')),
      category: lista(q('category')),
      materialKinds: lista(q('materialKinds')),
      numberMin: numeros.numberMin,
      numberMax: numeros.numberMax,
    },
  };
}
