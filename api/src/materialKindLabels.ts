export const DEFAULT_MATERIAL_KIND_LOCALE = 'pt-BR';

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
         ON t.material_kind_id = mk.id AND t.locale = ?
       ORDER BY name ASC`
    )
    .bind(locale)
    .all();

  return (result.results ?? []) as Array<{ id: string; name: string }>;
}
