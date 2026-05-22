import yaml from 'js-yaml';
import { zipSync } from 'fflate';
import { labelFor, loadMaterialKindLabels } from './materialKindLabels';

export type PraiseRow = {
  id: string;
  name: string;
  number: string;
  author: string;
  rhythm: string;
  tonality: string;
  category: string;
  lyrics: string;
  tag_ids: string | null;
};

export type MaterialRow = {
  id: string;
  praise_id: string;
  material_kind: string;
  type: string;
  r2_key: string | null;
  file_path_legacy: string;
  source_material_id: string | null;
  url?: string | null;
};

export type TagRow = { id: string; name: string };

/** Remove caracteres inválidos em nomes de arquivo (mantém acentos PT-BR). */
export function sanitizeFileNamePart(value: string): string {
  return value
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export function materialZipExtension(type: string): string {
  if (type === 'youtube' || type === 'chord') return 'txt';
  return type || 'bin';
}

export function materialZipEntryName(
  material: MaterialRow,
  label: string,
  usedNames: Set<string>
): string {
  const safeLabel = sanitizeFileNamePart(label || 'Material');
  const ext = materialZipExtension(material.type);
  let base = `${safeLabel}-${material.id}`;
  let name = `${base}.${ext}`;
  let n = 2;
  while (usedNames.has(name)) {
    name = `${base}-${n}.${ext}`;
    n++;
  }
  usedNames.add(name);
  return name;
}

export function buildMetadataYaml(
  praise: PraiseRow,
  tagIds: string[],
  materials: MaterialRow[]
): string {
  const payload = {
    praise_id: praise.id,
    praise_name: praise.name,
    praise_number: praise.number || undefined,
    praise_author: praise.author || undefined,
    praise_rhythm: praise.rhythm || undefined,
    praise_tonality: praise.tonality || undefined,
    praise_category: praise.category || undefined,
    praise_lyrics: praise.lyrics || undefined,
    praise_tags: tagIds,
    praise_materials: materials.map((m) => {
      const entry: Record<string, unknown> = {
        praise_material_id: m.id,
        material_kind: m.material_kind,
        type: m.type,
        file_path_legacy: m.file_path_legacy || '',
      };
      if (m.source_material_id) entry.source_material_id = m.source_material_id;
      if (m.url) entry.url = m.url;
      return entry;
    }),
  };
  return yaml.dump(payload, { lineWidth: -1, noRefs: true });
}

export function buildZipArchiveFilename(praise: PraiseRow): string {
  const parts: string[] = [];
  if (praise.number?.trim()) parts.push(sanitizeFileNamePart(praise.number));
  if (praise.name?.trim()) parts.push(sanitizeFileNamePart(praise.name));
  const base = parts.length > 0 ? parts.join('_') : `louvor_${praise.id}`;
  return `${base}.zip`;
}

export async function fetchPraiseForZip(
  db: D1Database,
  praiseId: string
): Promise<{ praise: PraiseRow; tagIds: string[]; materials: MaterialRow[] } | null> {
  const praiseQuery = `
    SELECT 
      p.id, p.name, p.number, p.author, p.rhythm, p.tonality, p.category, p.lyrics,
      GROUP_CONCAT(pt.tag_id) as tag_ids
    FROM praises p
    LEFT JOIN praise_tags pt ON p.id = pt.praise_id
    WHERE p.id = ?
    GROUP BY p.id
  `;
  const praise = (await db.prepare(praiseQuery).bind(praiseId).first()) as PraiseRow | null;
  if (!praise) return null;

  const materialsQuery = `
    SELECT 
      pm.id, pm.praise_id, pm.material_kind, pm.type, pm.r2_key, pm.file_path_legacy,
      pm.source_material_id, pm.url
    FROM praise_materials pm
    WHERE pm.praise_id = ?
  `;
  const materialsResult = await db.prepare(materialsQuery).bind(praiseId).all();
  const materials = (materialsResult.results ?? []) as MaterialRow[];
  const tagIds = praise.tag_ids ? praise.tag_ids.split(',').filter(Boolean) : [];

  return { praise, tagIds, materials };
}

export async function buildPraiseZipBytes(
  db: D1Database,
  assets: R2Bucket,
  praiseId: string
): Promise<{ bytes: Uint8Array; filename: string } | null> {
  const data = await fetchPraiseForZip(db, praiseId);
  if (!data) return null;

  const { praise, tagIds, materials } = data;
  const materialKindLabels = await loadMaterialKindLabels(db);
  const entries: Record<string, Uint8Array> = {};
  const usedNames = new Set<string>();

  const yamlText = buildMetadataYaml(praise, tagIds, materials);
  entries['metadata.yml'] = new TextEncoder().encode(yamlText);

  for (const material of materials) {
    const label = labelFor(materialKindLabels, material.material_kind);
    const entryName = materialZipEntryName(material, label, usedNames);

    if (material.r2_key) {
      const storageKey = `storage/${material.r2_key}`;
      const object = await assets.get(storageKey);
      if (object) {
        entries[entryName] = new Uint8Array(await object.arrayBuffer());
      }
      continue;
    }

    if (material.url?.trim()) {
      entries[entryName] = new TextEncoder().encode(`${material.url.trim()}\n`);
    }
  }

  const bytes = zipSync(entries);
  return { bytes, filename: buildZipArchiveFilename(praise) };
}
