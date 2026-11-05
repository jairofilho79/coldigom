import { sha256Hex, etagMatches } from './etag';
import { TAG_LABEL_SQL } from './praiseQuery';

/**
 * GET /api/plpcg/manifest — o `louvores-manifest.json` do PLPCG gerado do
 * coldigom (spec docs/superpowers/specs/2026-09-15-migracao-plpcg-design.md §8.2).
 *
 * Uma entrada por linha de `plpcg_crosswalk`. `pdfId`, `groupId` e `shortId`
 * são os do PLPCG — as chaves de cache do coldigui/plpcjf e os links `?s=`
 * sobrevivem à troca de fonte. `nome`, `numero`, `classificacao` (tags) e
 * `categoria` (kind) vêm do coldigom; `pdf` é a URL absoluta do arquivo aqui.
 * Linha cujo material ou praise sumiu do app não entra (JOIN interno): melhor
 * faltar no manifest do que apontar para um 404.
 */
export type PlpcgManifestEntry = {
  nome: string;
  classificacao: string;
  numero: string;
  categoria: string;
  pdf: string;
  pdfId: string;
  groupId: string;
  shortId: string;
  praiseId: string;
  materialId: string;
};

type CrosswalkRow = {
  pdf_id: string;
  short_id: string;
  group_id: string;
  praise_id: string;
  material_id: string;
  nome: string;
  numero: string | null;
  kind: string | null;
  r2_key: string | null;
};

type TagRow = { praise_id: string; label: string };

export const MANIFEST_SQL = `
  SELECT cw.pdf_id, cw.short_id, cw.group_id, cw.praise_id,
         cw.praise_material_id AS material_id,
         p.name AS nome, p.number AS numero, mk.name AS kind, pm.r2_key
  FROM plpcg_crosswalk cw
  JOIN praise_materials pm ON pm.id = cw.praise_material_id
  JOIN praises p ON p.id = cw.praise_id
  LEFT JOIN material_kinds mk ON mk.id = pm.material_kind
  ORDER BY p.number, p.name, cw.pdf_id`;

/** Mesmo rótulo `pai · filha` do /api/plpcg/catalog; só dos praises que estão no crosswalk. */
export const MANIFEST_TAGS_SQL = `
  SELECT DISTINCT pt.praise_id, ${TAG_LABEL_SQL} AS label
  FROM praise_tags pt
  JOIN tags t ON t.id = pt.tag_id
  LEFT JOIN tags tp ON t.parent_id = tp.id
  WHERE pt.praise_id IN (SELECT praise_id FROM plpcg_crosswalk)
  ORDER BY pt.praise_id, label`;

/**
 * O PLPCG só tinha cinco categorias; o kind do coldigom é mais fino. Inverso
 * do KIND_PADRAO do site de revisão (D10): cifras e gestos têm nome próprio,
 * todo o resto (Choir, Sheet Music, Choir and Piano, …) era "Partitura" lá.
 */
export function categoriaPlpcg(kind: string | null): string {
  switch (kind) {
    case 'Chord Chart':
      return 'Cifra';
    case 'Chord Chart I':
      return 'Cifra nível I';
    case 'Chord Chart II':
      return 'Cifra nível II';
    case 'CIAs Gestures':
      return 'Gestos em Gravura';
    default:
      return 'Partitura';
  }
}

/** A `classificacao` do PLPCG era a coletânea ("Coletânea CIAs", "PES"); aqui são as tags do praise. */
export function classificacaoPlpcg(labels: string[]): string {
  return labels.join(', ');
}

/** URL absoluta do PDF no coldigom: a rota GET /assets/* serve `r2_key` tal qual. */
export function pdfUrl(origin: string, praiseId: string, materialId: string, r2Key: string | null): string {
  const path = (r2Key ?? `assets/praises/${praiseId}/${materialId}.pdf`).replace(/^\//, '');
  return `${origin.replace(/\/$/, '')}/${path}`;
}

export type PlpcgManifestDeps = {
  /** Origem da requisição (`new URL(c.req.url).origin`) — base de `pdf`. */
  origin: string;
};

export type PlpcgManifestResult = {
  status: 200 | 304;
  headers: Record<string, string>;
  body: string;
  /** sha256 do corpo, o mesmo hex do ETag — GET /api/plpcg/manifest/checksum devolve isto. */
  checksum: string;
};

export async function buildPlpcgManifest(
  db: D1Database,
  deps: PlpcgManifestDeps,
  ifNoneMatch: string | undefined,
): Promise<PlpcgManifestResult> {
  const linhas = ((await db.prepare(MANIFEST_SQL).all()).results ?? []) as CrosswalkRow[];
  const tags = ((await db.prepare(MANIFEST_TAGS_SQL).all()).results ?? []) as TagRow[];

  const tagsPorPraise = new Map<string, string[]>();
  for (const t of tags) {
    const lista = tagsPorPraise.get(t.praise_id) ?? [];
    lista.push(t.label);
    tagsPorPraise.set(t.praise_id, lista);
  }

  const entradas: PlpcgManifestEntry[] = linhas.map((r) => ({
    nome: r.nome,
    classificacao: classificacaoPlpcg(tagsPorPraise.get(r.praise_id) ?? []),
    numero: r.numero ?? '',
    categoria: categoriaPlpcg(r.kind),
    pdf: pdfUrl(deps.origin, r.praise_id, r.material_id, r.r2_key),
    pdfId: r.pdf_id,
    groupId: r.group_id,
    shortId: r.short_id,
    praiseId: r.praise_id,
    materialId: r.material_id,
  }));

  const body = JSON.stringify(entradas);
  const checksum = await sha256Hex(body);
  const headers: Record<string, string> = {
    ETag: `"${checksum}"`,
    'Cache-Control': 'public, max-age=300',
  };
  if (etagMatches(ifNoneMatch, headers.ETag)) {
    return { status: 304, headers, body: '', checksum };
  }
  return { status: 200, headers, body, checksum };
}
