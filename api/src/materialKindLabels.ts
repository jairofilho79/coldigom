export const DEFAULT_MATERIAL_KIND_LOCALE = 'pt-BR';

const PT_BR_COLLATOR = new Intl.Collator('pt-BR', {
  sensitivity: 'base',
  ignorePunctuation: true,
});

/** Ordem alfabética PT-BR (Áudio antes de Baixo, não no fim da lista ASCII). */
export function compareMaterialKindLabels(a: string, b: string): number {
  return PT_BR_COLLATOR.compare(a, b);
}

export type MaterialKindLabelRow = {
  id: string;
  label: string;
};

/** Load display labels: COALESCE(translation, canonical name). */
export async function loadMaterialKindLabels(
  db: D1Database,
  locale: string = DEFAULT_MATERIAL_KIND_LOCALE
): Promise<Map<string, string>> {
  const result = await db
    .prepare(
      `SELECT mk.id, COALESCE(t.label, mk.name) AS label
       FROM material_kinds mk
       LEFT JOIN material_kind_translations t
         ON t.material_kind_id = mk.id AND t.locale = ?`
    )
    .bind(locale)
    .all();

  const map = new Map<string, string>();
  for (const row of (result.results ?? []) as MaterialKindLabelRow[]) {
    map.set(row.id, row.label);
  }
  return map;
}

/**
 * Quais destes material_kind não estão no catálogo.
 *
 * `praise_materials` não tem FK para `material_kinds`, e as rotas de escrita só
 * exigiam string não vazia: um material com categoria inventada entrava com 200
 * e sumia dos filtros por categoria, porque nenhuma categoria tem aquele id.
 *
 * Um SELECT com IN para o lote inteiro — o bulk-upload aceita 200 itens, e uma
 * consulta por arquivo seriam 200 idas ao D1 antes da primeira escrita.
 */
export async function materialKindsForaDoCatalogo(
  db: D1Database,
  kinds: string[]
): Promise<string[]> {
  const pedidos = [...new Set(kinds)];
  if (pedidos.length === 0) return [];

  const result = await db
    .prepare(`SELECT id FROM material_kinds WHERE id IN (${pedidos.map(() => '?').join(',')})`)
    .bind(...pedidos)
    .all<{ id: string }>();

  const existentes = new Set((result.results ?? []).map((row) => row.id));
  return pedidos.filter((id) => !existentes.has(id));
}

/** Mensagem única para as três rotas de escrita, em PT-BR como a tela. */
export function erroDeCategoriaDesconhecida(faltando: string[]): string {
  return `Categoria de material desconhecida: ${faltando.map((k) => k.slice(0, 64)).join(', ')}`;
}

export function labelFor(
  map: Map<string, string>,
  kindId: string,
  fallback = 'Desconhecido'
): string {
  return map.get(kindId) ?? fallback;
}

/** Rows for GET /api/materials/kinds (sorted by display label). */
export async function listMaterialKindsForLocale(
  db: D1Database,
  locale: string = DEFAULT_MATERIAL_KIND_LOCALE
): Promise<Array<{ id: string; name: string }>> {
  const result = await db
    .prepare(
      `SELECT mk.id, COALESCE(t.label, mk.name) AS name
       FROM material_kinds mk
       LEFT JOIN material_kind_translations t
         ON t.material_kind_id = mk.id AND t.locale = ?`
    )
    .bind(locale)
    .all();

  const rows = (result.results ?? []) as Array<{ id: string; name: string }>;
  return rows.sort((a, b) => compareMaterialKindLabels(a.name, b.name));
}
