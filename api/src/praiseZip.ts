import yaml from 'js-yaml';
import { Zip, ZipPassThrough, zipSync, type AsyncFlateStreamHandler } from 'fflate';
import { labelFor, loadMaterialKindLabels } from './materialKindLabels';

/** Limite de bytes não comprimidos no ZIP (evita estourar 128 MB do Worker). */
export const MAX_PRAISE_ZIP_UNCOMPRESSED_BYTES = 80 * 1024 * 1024;

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

export class PraiseZipTooLargeError extends Error {
  constructor(
    public readonly bytes: number,
    public readonly limit: number = MAX_PRAISE_ZIP_UNCOMPRESSED_BYTES
  ) {
    super(
      `Este louvor excede o limite de download (${Math.round(limit / (1024 * 1024))} MB de materiais).`
    );
    this.name = 'PraiseZipTooLargeError';
  }
}

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
  const base = `${safeLabel}-${material.id}`;
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

export async function estimatePraiseZipUncompressedSize(
  assets: R2Bucket,
  materials: MaterialRow[],
  metadataByteLength: number
): Promise<number> {
  let total = metadataByteLength;
  for (const material of materials) {
    if (!material.r2_key) continue;
    const head = await assets.head(`storage/${material.r2_key}`);
    if (head?.size) total += head.size;
  }
  for (const material of materials) {
    if (material.url?.trim()) {
      total += new TextEncoder().encode(`${material.url.trim()}\n`).byteLength;
    }
  }
  return total;
}

async function addBytesToZip(zip: Zip, entryName: string, data: Uint8Array): Promise<void> {
  const pass = new ZipPassThrough(entryName);
  zip.add(pass);
  pass.push(data, true);
}

async function addR2ObjectToZip(
  zip: Zip,
  assets: R2Bucket,
  storageKey: string,
  entryName: string
): Promise<void> {
  const object = await assets.get(storageKey);
  const pass = new ZipPassThrough(entryName);
  zip.add(pass);

  if (!object?.body) {
    pass.push(new Uint8Array(0), true);
    return;
  }

  const reader = object.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        pass.push(new Uint8Array(0), true);
        break;
      }
      pass.push(value, false);
    }
  } finally {
    reader.releaseLock();
  }
}

async function populateStreamingZip(
  zip: Zip,
  assets: R2Bucket,
  praise: PraiseRow,
  tagIds: string[],
  materials: MaterialRow[],
  materialKindLabels: Map<string, string>
): Promise<void> {
  const usedNames = new Set<string>();
  const yamlText = buildMetadataYaml(praise, tagIds, materials);
  await addBytesToZip(zip, 'metadata.yml', new TextEncoder().encode(yamlText));

  for (const material of materials) {
    const label = labelFor(materialKindLabels, material.material_kind);
    const entryName = materialZipEntryName(material, label, usedNames);

    if (material.r2_key) {
      await addR2ObjectToZip(zip, assets, `storage/${material.r2_key}`, entryName);
      continue;
    }

    if (material.url?.trim()) {
      await addBytesToZip(
        zip,
        entryName,
        new TextEncoder().encode(`${material.url.trim()}\n`)
      );
    }
  }
}

/**
 * ZIP em streaming (STORE / sem compressão) — um arquivo R2 por vez na memória.
 */
export async function buildPraiseZipStream(
  db: D1Database,
  assets: R2Bucket,
  praiseId: string
): Promise<{ stream: ReadableStream<Uint8Array>; filename: string } | null> {
  const data = await fetchPraiseForZip(db, praiseId);
  if (!data) return null;

  const { praise, tagIds, materials } = data;
  const materialKindLabels = await loadMaterialKindLabels(db);
  const filename = buildZipArchiveFilename(praise);
  const yamlText = buildMetadataYaml(praise, tagIds, materials);
  const metaBytes = new TextEncoder().encode(yamlText);

  const estimated = await estimatePraiseZipUncompressedSize(assets, materials, metaBytes.byteLength);
  if (estimated > MAX_PRAISE_ZIP_UNCOMPRESSED_BYTES) {
    throw new PraiseZipTooLargeError(estimated);
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const onZipData: AsyncFlateStreamHandler = (err, chunk, final) => {
        if (err) {
          controller.error(err);
          return;
        }
        if (chunk.length) controller.enqueue(chunk);
        if (final) controller.close();
      };

      try {
        const zip = new Zip(onZipData);
        await populateStreamingZip(zip, assets, praise, tagIds, materials, materialKindLabels);
        zip.end();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return { stream, filename };
}

/** Coleta o stream em memória (testes e uso interno leve). */
export async function readableStreamToBytes(
  stream: ReadableStream<Uint8Array>
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** Monta ZIP em memória com STORE (sem DEFLATE) — apenas para testes unitários. */
export async function buildPraiseZipBytes(
  db: D1Database,
  assets: R2Bucket,
  praiseId: string
): Promise<{ bytes: Uint8Array; filename: string } | null> {
  const data = await fetchPraiseForZip(db, praiseId);
  if (!data) return null;

  const { praise, tagIds, materials } = data;
  const materialKindLabels = await loadMaterialKindLabels(db);
  const filename = buildZipArchiveFilename(praise);
  const yamlText = buildMetadataYaml(praise, tagIds, materials);
  const metaBytes = new TextEncoder().encode(yamlText);

  const estimated = await estimatePraiseZipUncompressedSize(assets, materials, metaBytes.byteLength);
  if (estimated > MAX_PRAISE_ZIP_UNCOMPRESSED_BYTES) {
    throw new PraiseZipTooLargeError(estimated);
  }

  const entries: Record<string, Uint8Array> = { 'metadata.yml': metaBytes };
  const usedNames = new Set<string>();

  for (const material of materials) {
    const label = labelFor(materialKindLabels, material.material_kind);
    const entryName = materialZipEntryName(material, label, usedNames);

    if (material.r2_key) {
      const object = await assets.get(`storage/${material.r2_key}`);
      if (object) {
        entries[entryName] = new Uint8Array(await object.arrayBuffer());
      }
      continue;
    }

    if (material.url?.trim()) {
      entries[entryName] = new TextEncoder().encode(`${material.url.trim()}\n`);
    }
  }

  const bytes = zipSync(entries, { level: 0 });
  return { bytes, filename };
}
