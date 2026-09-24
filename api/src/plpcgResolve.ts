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

/** POST /api/plpcg/crosswalk — teto do lote (contrato C2 do spec coldigui 2026-09-23-fim-fonte-plpcg §7.2). */
export const CROSSWALK_MAX_IDS = 500;

/**
 * Lote de pdf_id legados → material do coldigom, para o normalizador do app
 * trocar de uma vez os ids que as listas e o offline ainda guardam.
 *
 * Um parâmetro só (`json_each`): o D1 recusa mais de 100 parâmetros por
 * consulta, e o lote vai até 500. O praise é o DONO ATUAL do material
 * (`pm.praise_id`), não o `cw.praise_id`: merge e move mudam o dono e o
 * crosswalk fica para trás. JOIN interno como no /resolve: material apagado
 * no app fica de fora em vez de virar uma URL para um 404.
 */
export const CROSSWALK_SQL = `
  SELECT cw.pdf_id, pm.praise_id, pm.id AS material_id, pm.r2_key
  FROM plpcg_crosswalk cw
  JOIN praise_materials pm ON pm.id = cw.praise_material_id
  WHERE cw.pdf_id IN (SELECT value FROM json_each(?))`;

type CrosswalkRow = { pdf_id: string; praise_id: string; material_id: string; r2_key: string | null };

export type PlpcgCrosswalkItem = { praiseId: string; materialId: string; url: string };

/** `{"pdfIds": [string, …]}` com 1 a 500 itens; repetidos saem, a ordem fica. */
export function parseCrosswalkBody(
  body: unknown,
): { ok: true; pdfIds: string[] } | { ok: false; error: string } {
  const pdfIds =
    body && typeof body === 'object' && !Array.isArray(body) ? (body as { pdfIds?: unknown }).pdfIds : undefined;
  if (!Array.isArray(pdfIds) || pdfIds.length === 0 || !pdfIds.every((id) => typeof id === 'string')) {
    return { ok: false, error: `pdfIds: lista de 1 a ${CROSSWALK_MAX_IDS} strings` };
  }
  if (pdfIds.length > CROSSWALK_MAX_IDS) {
    return { ok: false, error: `pdfIds: no máximo ${CROSSWALK_MAX_IDS} por lote` };
  }
  return { ok: true, pdfIds: [...new Set(pdfIds as string[])] };
}

/** Os conhecidos, por pdf_id; os desconhecidos simplesmente não aparecem. */
export async function resolvePlpcgCrosswalk(
  db: D1Database,
  pdfIds: string[],
  origin: string,
): Promise<Record<string, PlpcgCrosswalkItem>> {
  const { results } = await db.prepare(CROSSWALK_SQL).bind(JSON.stringify(pdfIds)).all<CrosswalkRow>();
  const items: Record<string, PlpcgCrosswalkItem> = {};
  for (const r of results ?? []) {
    items[r.pdf_id] = {
      praiseId: r.praise_id,
      materialId: r.material_id,
      url: pdfUrl(origin, r.praise_id, r.material_id, r.r2_key),
    };
  }
  return items;
}
