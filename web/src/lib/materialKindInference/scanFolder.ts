import { inferMaterialKind, inferTypeFromExtension, UNKNOWN_MATERIAL_KIND_ID } from './index';
import type { InferenceResult } from './index';

export type BulkFileItem = {
  file: File;
  relPath: string;
  type: string;
  material_kind: string;
  inference: InferenceResult;
};

export type MaterialKindRef = { id: string; name: string };

const BATCH_SIZE = 8;

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

export function folderNameFromFiles(files: File[]): string | null {
  const first = files[0];
  if (!first) return null;
  const rel = (first as File & { webkitRelativePath?: string }).webkitRelativePath;
  if (!rel) return null;
  return rel.split(/[/\\]/)[0] || null;
}

export function mapSingleBulkFile(
  f: File,
  catalogIds: Set<string>
): BulkFileItem {
  const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
  const inference = inferMaterialKind({ fileName: f.name, relPath: rel, catalogIds });
  return {
    file: f,
    relPath: rel,
    type: inferTypeFromExtension(f.name),
    material_kind: inference.materialKindId,
    inference,
  };
}

/** Process folder files in batches so the UI stays responsive. */
export async function scanFolderFilesAsync(
  files: File[],
  materialKinds: MaterialKindRef[],
  onProgress: (processed: number, total: number) => void,
  signal?: AbortSignal
): Promise<BulkFileItem[]> {
  const catalogIds = new Set(materialKinds.map((k) => k.id));
  if (!catalogIds.has(UNKNOWN_MATERIAL_KIND_ID)) {
    catalogIds.add(UNKNOWN_MATERIAL_KIND_ID);
  }

  const results: BulkFileItem[] = [];
  const total = files.length;
  onProgress(0, total);

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    if (signal?.aborted) {
      throw new DOMException('Scan cancelled', 'AbortError');
    }

    const batch = files.slice(i, i + BATCH_SIZE);
    for (const f of batch) {
      results.push(mapSingleBulkFile(f, catalogIds));
    }

    onProgress(Math.min(i + batch.length, total), total);
    await yieldToUi();
  }

  return results;
}

export function bulkScanSummary(items: BulkFileItem[]): {
  total: number;
  identified: number;
  unknown: number;
} {
  const unknown = items.filter((f) => f.inference.method === 'unknown').length;
  return {
    total: items.length,
    identified: items.length - unknown,
    unknown,
  };
}
