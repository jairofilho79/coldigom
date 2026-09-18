import { pdfUrl } from './plpcgManifest';

/**
 * GET /api/plpcg/resolve/:shortId — o `?s=<short_id>` do plpcg.com e das
 * listas salvas do coldigui apontando para o material do coldigom (spec §8.2).
 */
export const RESOLVE_SQL = `
  SELECT cw.pdf_id, cw.praise_id, cw.praise_material_id AS material_id, pm.r2_key
  FROM plpcg_crosswalk cw
  JOIN praise_materials pm ON pm.id = cw.praise_material_id
  WHERE cw.short_id = ?
  ORDER BY cw.pdf_id
  LIMIT 1`;

type ResolveRow = { pdf_id: string; praise_id: string; material_id: string; r2_key: string | null };

export type PlpcgResolved = {
  pdf_id: string;
  praise_id: string;
  material_id: string;
  url: string;
};

/**
 * `short_id` do PLPCG é hex minúsculo ("0000" é válido; o contador
 * `short_id_next` pode passar de quatro dígitos). Fora disso, nem consulta.
 */
export function normalizarShortId(bruto: string): string | null {
  const s = bruto.trim().toLowerCase();
  return /^[0-9a-f]{1,16}$/.test(s) ? s : null;
}

export async function resolvePlpcgShortId(
  db: D1Database,
  shortId: string,
  origin: string,
): Promise<PlpcgResolved | null> {
  const row = await db.prepare(RESOLVE_SQL).bind(shortId).first<ResolveRow>();
  if (!row) return null;
  return {
    pdf_id: row.pdf_id,
    praise_id: row.praise_id,
    material_id: row.material_id,
    url: pdfUrl(origin, row.praise_id, row.material_id, row.r2_key),
  };
}
