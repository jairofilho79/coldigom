import type { Env } from '../env';
import type { ContributionFileRow } from '../contributions/repo';
import { MAX_CONTRIBUTION_FILE_BYTES } from '../contributions/limits';
import { CONTENT_TYPES, type DeclaredType } from '../contributions/sniff';
import { storageKeyFor } from '../storageKeys';

export const MATERIAL_TYPE_BY_ATTACHMENT_TYPE = {
  pdf: 'pdf',
  mp3: 'mp3',
  chordpro: 'chord',
  mscz: 'mscz',
  mxl: 'mxl',
  musicxml: 'musicxml',
} as const;

export type AddMaterialType = (typeof MATERIAL_TYPE_BY_ATTACHMENT_TYPE)[keyof typeof MATERIAL_TYPE_BY_ATTACHMENT_TYPE] | 'gestures';

type EligibleAttachment = Pick<
  ContributionFileRow,
  'id' | 'declared_type' | 'detected_type' | 'size' | 'r2_key' | 'scan_status'
>;

type ContributionTarget = {
  status: string;
  scan_status: string;
  target_praise_id: string | null;
};

type PraiseMaterialRow = {
  id: string;
  praise_id: string;
  material_kind: string;
  type: string;
  r2_key: string;
  source_material_id: string | null;
  notes: string | null;
};

type AddMaterialResult = {
  material_id: string;
  r2_key: string;
};

function expectedContributionKey(contributionId: string, fileId: string, declaredType: string): string {
  return `contributions/${contributionId}/${fileId}.${declaredType}`;
}

export function isPromotableContributionFile(
  file: EligibleAttachment,
  contributionId: string
): file is EligibleAttachment & { declared_type: keyof typeof MATERIAL_TYPE_BY_ATTACHMENT_TYPE } {
  return (
    file.scan_status === 'limpa' &&
    file.detected_type === file.declared_type &&
    Object.hasOwn(MATERIAL_TYPE_BY_ATTACHMENT_TYPE, file.declared_type) &&
    Number.isSafeInteger(file.size) &&
    file.size > 0 &&
    file.size <= MAX_CONTRIBUTION_FILE_BYTES &&
    file.r2_key === expectedContributionKey(contributionId, file.id, file.declared_type)
  );
}

function requiredString(params: Record<string, unknown>, key: string): string {
  const value = params[key];
  if (typeof value !== 'string' || value.length === 0 || value.length > 200 || value.trim() !== value) {
    throw new Error(`invalid_${key}`);
  }
  return value;
}

function assertOnlyKeys(params: Record<string, unknown>, allowedKeys: readonly string[]): void {
  const allowed = new Set(allowedKeys);
  if (Object.keys(params).some((key) => !allowed.has(key))) {
    throw new Error('unexpected_add_material_parameter');
  }
}

function parseNotes(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new Error('invalid_notes');
  const notes = value.trim();
  if (!notes) return null;
  if (notes.length > 160 || Array.from(notes).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) {
    throw new Error('invalid_notes');
  }
  return notes;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function materialMatches(
  material: PraiseMaterialRow | null,
  expected: PraiseMaterialRow
): boolean {
  return (
    material !== null &&
    material.id === expected.id &&
    material.praise_id === expected.praise_id &&
    material.material_kind === expected.material_kind &&
    material.type === expected.type &&
    material.r2_key === expected.r2_key &&
    material.source_material_id === expected.source_material_id &&
    material.notes === expected.notes
  );
}

function objectMatches(
  object: R2Object | null,
  size: number,
  sha256: string
): boolean {
  return object !== null &&
    object.size === size &&
    object.customMetadata?.sha256 === sha256;
}

async function hashR2Object(object: R2ObjectBody): Promise<string> {
  const DigestStreamCtor = (
    crypto as unknown as {
      DigestStream?: new (algorithm: string) => WritableStream<ArrayBuffer | ArrayBufferView> & { digest: Promise<ArrayBuffer> };
    }
  ).DigestStream;
  if (DigestStreamCtor) {
    const digestStream = new DigestStreamCtor('SHA-256');
    await object.body.pipeTo(digestStream);
    const digest = await digestStream.digest;
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  return sha256Hex(new Uint8Array(await object.arrayBuffer()));
}

async function destinationContentMatches(
  assets: R2Bucket,
  key: string,
  size: number,
  sha256: string
): Promise<boolean> {
  const object = await assets.get(key);
  return object !== null && object.size === size && await hashR2Object(object) === sha256;
}

async function loadTarget(
  env: Pick<Env, 'DB'>,
  contributionId: string,
  praiseId: string,
  materialKindId: string,
  createdPraiseIds: ReadonlySet<string>
) {
  const contribution = await env.DB
    .prepare(`SELECT status, scan_status, target_praise_id FROM contributions WHERE id = ?`)
    .bind(contributionId)
    .first<ContributionTarget>();
  if (!contribution) throw new Error('contribution_not_found');
  if (!['pendente', 'em_analise', 'aceita'].includes(contribution.status)) {
    throw new Error('contribution_not_promotable');
  }
  if (contribution.scan_status !== 'limpa') throw new Error('contribution_not_fully_scanned');
  if (praiseId !== contribution.target_praise_id && !createdPraiseIds.has(praiseId)) {
    throw new Error('praise_outside_contribution_scope');
  }

  const [praise, materialKind] = await Promise.all([
    env.DB.prepare(`SELECT id FROM praises WHERE id = ?`).bind(praiseId).first<{ id: string }>(),
    env.DB.prepare(`SELECT id, name FROM material_kinds WHERE id = ?`).bind(materialKindId).first<{ id: string; name: string }>(),
  ]);
  if (!praise) throw new Error('praise_not_found');
  if (!materialKind) throw new Error('material_kind_not_found');
  return materialKind;
}

async function validateNotes(
  db: D1Database,
  praiseId: string,
  materialKind: string,
  materialId: string,
  notes: string | null
): Promise<void> {
  const { results } = await db
    .prepare(
      `SELECT id, notes FROM praise_materials
       WHERE praise_id = ? AND material_kind = ? AND id <> ?`
    )
    .bind(praiseId, materialKind, materialId)
    .all<{ id: string; notes: string | null }>();
  const duplicates = results ?? [];
  if (duplicates.length > 0 && !notes) throw new Error('material_kind_duplicate_requires_distinguishing_note');
  if (duplicates.length === 0 && notes) throw new Error('notes_only_allowed_for_duplicate_material_kind');
  if (notes && duplicates.some((material) => material.notes?.trim().toLowerCase() === notes.toLowerCase())) {
    throw new Error('material_note_must_distinguish_versions');
  }
}

async function ensureMaterialRecord(
  db: D1Database,
  material: PraiseMaterialRow,
  cleanup?: { bucket: R2Bucket; key: string }
): Promise<void> {
  const select = `SELECT id, praise_id, material_kind, type, r2_key, source_material_id, notes
                  FROM praise_materials WHERE id = ?`;
  const existing = await db.prepare(select).bind(material.id).first<PraiseMaterialRow>();
  if (existing) {
    if (!materialMatches(existing, material)) throw new Error('material_id_conflict');
    return;
  }

  try {
    const inserted = await db
      .prepare(
        `INSERT INTO praise_materials (
           id, praise_id, material_kind, type, r2_key, file_path_legacy,
           source_material_id, merged_from_praise_id, url, notes
         )
         SELECT ?, ?, ?, ?, ?, '', ?, NULL, NULL, ?
         WHERE
           (? IS NULL AND NOT EXISTS (
             SELECT 1 FROM praise_materials WHERE praise_id = ? AND material_kind = ?
           ))
           OR (
             ? IS NOT NULL
             AND EXISTS (
               SELECT 1 FROM praise_materials WHERE praise_id = ? AND material_kind = ?
             )
             AND NOT EXISTS (
               SELECT 1 FROM praise_materials
               WHERE praise_id = ? AND material_kind = ? AND lower(trim(notes)) = lower(?)
             )
           )`
      )
      .bind(
        material.id,
        material.praise_id,
        material.material_kind,
        material.type,
        material.r2_key,
        material.source_material_id,
        material.notes,
        material.notes,
        material.praise_id,
        material.material_kind,
        material.notes,
        material.praise_id,
        material.material_kind,
        material.praise_id,
        material.material_kind,
        material.notes
      )
      .run();
    if (inserted.meta.changes !== 1) throw new Error('material_insert_not_confirmed');
  } catch (insertError) {
    let materialAfterFailure: PraiseMaterialRow | null;
    try {
      materialAfterFailure = await db.prepare(select).bind(material.id).first<PraiseMaterialRow>();
    } catch (reconcileError) {
      console.error(JSON.stringify({
        msg: 'agent.add_material.reconciliation_pending',
        material_id: material.id,
        error: String(reconcileError),
      }));
      throw insertError;
    }

    if (materialMatches(materialAfterFailure, material)) return;
    if (!materialAfterFailure && cleanup) {
      try {
        await cleanup.bucket.delete(cleanup.key);
      } catch (cleanupError) {
        console.error(JSON.stringify({
          msg: 'agent.add_material.orphan_cleanup_failed',
          material_id: material.id,
          error: String(cleanupError),
        }));
      }
    }
    if (!materialAfterFailure) {
      await validateNotes(db, material.praise_id, material.material_kind, material.id, material.notes);
    }
    throw insertError;
  }
}

export async function addContributionMaterial(
  env: Pick<Env, 'DB' | 'ASSETS'>,
  contributionId: string,
  params: Record<string, unknown>,
  idempotencyKey: string,
  createdPraiseIds: ReadonlySet<string>
): Promise<AddMaterialResult> {
  const praiseId = requiredString(params, 'praise_id');
  const materialKindId = requiredString(params, 'material_kind_id');
  const type = requiredString(params, 'type');
  const notes = parseNotes(params.notes);
  if (!env.ASSETS) throw new Error('asset_storage_unavailable');
  const materialKind = await loadTarget(env, contributionId, praiseId, materialKindId, createdPraiseIds);
  const materialId = `agent-${await sha256Hex(new TextEncoder().encode(idempotencyKey))}`;

  if (type === 'gestures') {
    assertOnlyKeys(params, ['praise_id', 'material_kind_id', 'type', 'source_material_id', 'notes']);
    const sourceMaterialId = params.source_material_id === undefined || params.source_material_id === null
      ? null
      : requiredString(params, 'source_material_id');
    if (sourceMaterialId) {
      const sourceMaterial = await env.DB
        .prepare(`SELECT id, praise_id, type FROM praise_materials WHERE id = ?`)
        .bind(sourceMaterialId)
        .first<{ id: string; praise_id: string; type: string }>();
      if (!sourceMaterial || sourceMaterial.praise_id !== praiseId || sourceMaterial.type !== 'pdf') {
        throw new Error('gestures_source_must_be_pdf_of_target_praise');
      }
    }
    const gesturesMaterial: PraiseMaterialRow = {
      id: materialId,
      praise_id: praiseId,
      material_kind: materialKind.name,
      type,
      r2_key: `assets/praises/${praiseId}/${materialId}.gestures`,
      source_material_id: sourceMaterialId,
      notes,
    };
    await validateNotes(env.DB, praiseId, materialKind.name, materialId, notes);
    await ensureMaterialRecord(env.DB, gesturesMaterial);
    return { material_id: materialId, r2_key: gesturesMaterial.r2_key };
  }

  assertOnlyKeys(params, ['praise_id', 'attachment_id', 'material_kind_id', 'type', 'notes']);
  const attachmentId = requiredString(params, 'attachment_id');
  const declaredType = Object.entries(MATERIAL_TYPE_BY_ATTACHMENT_TYPE)
    .find(([, materialType]) => materialType === type)?.[0] as keyof typeof MATERIAL_TYPE_BY_ATTACHMENT_TYPE | undefined;

  if (!declaredType) throw new Error('unsupported_material_type');
  const attachment = await env.DB
    .prepare(`SELECT * FROM contribution_files WHERE id = ? AND contribution_id = ?`)
    .bind(attachmentId, contributionId)
    .first<ContributionFileRow>();

  if (!attachment) throw new Error('attachment_not_found_or_out_of_scope');
  if (attachment.scan_status !== 'limpa') throw new Error('attachment_not_fully_scanned');
  if (!isPromotableContributionFile(attachment, contributionId)) {
    throw new Error('attachment_storage_key_or_type_invalid');
  }
  if (MATERIAL_TYPE_BY_ATTACHMENT_TYPE[attachment.declared_type] !== type) {
    throw new Error('material_type_does_not_match_attachment');
  }

  const r2Key = `assets/praises/${praiseId}/${materialId}.${type}`;
  const expectedMaterial: PraiseMaterialRow = {
    id: materialId,
    praise_id: praiseId,
    material_kind: materialKind.name,
    type,
    r2_key: r2Key,
    source_material_id: null,
    notes,
  };
  await validateNotes(env.DB, praiseId, materialKind.name, materialId, notes);

  const source = await env.ASSETS.get(attachment.r2_key);
  if (!source || source.size !== attachment.size) throw new Error('attachment_object_missing_or_size_mismatch');
  const bytes = new Uint8Array(await source.arrayBuffer());
  if (bytes.byteLength !== attachment.size || await sha256Hex(bytes) !== attachment.sha256) {
    throw new Error('attachment_checksum_mismatch');
  }

  const destinationKey = storageKeyFor(r2Key);
  let destination = await env.ASSETS.head(destinationKey);
  if (
    destination &&
    (!objectMatches(destination, attachment.size, attachment.sha256) ||
      !(await destinationContentMatches(env.ASSETS, destinationKey, attachment.size, attachment.sha256)))
  ) {
    throw new Error('destination_object_integrity_collision');
  }
  if (!destination) {
    const contentType = CONTENT_TYPES[attachment.declared_type as DeclaredType];
    await env.ASSETS.put(destinationKey, bytes, {
      httpMetadata: { contentType },
      customMetadata: { sha256: attachment.sha256 },
    });
    destination = await env.ASSETS.head(destinationKey);
    if (
      !objectMatches(destination, attachment.size, attachment.sha256) ||
      !(await destinationContentMatches(env.ASSETS, destinationKey, attachment.size, attachment.sha256))
    ) {
      throw new Error('destination_object_integrity_check_failed');
    }
  }

  await ensureMaterialRecord(env.DB, expectedMaterial, { bucket: env.ASSETS, key: destinationKey });

  return { material_id: materialId, r2_key: r2Key };
}
