import type { ApiResponse, Praise, PraiseDetail, MaterialKind, Tag, PaginationInfo, FilterOptions, SortField } from '../types';

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787';

function isAuthPathNoRefresh(url: string): boolean {
  return /\/auth\/(login|callback|refresh)(?:\?|$)/.test(url);
}

let refreshInFlight: Promise<boolean> | null = null;

/** Rotates refresh cookie + issues new access cookie. Returns true if session renewed. */
export async function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      return res.ok;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function fetchJson<T>(url: string, init?: RequestInit, isAfterRefresh = false): Promise<T> {
  const response = await fetch(url, { credentials: 'include', ...init });
  if (response.status === 401 && !isAfterRefresh && !isAuthPathNoRefresh(url)) {
    const renewed = await refreshSession();
    if (renewed) {
      return fetchJson<T>(url, init, true);
    }
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' })) as { error?: string };
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export interface SearchParams {
  query?: string;
  page?: number;
  limit?: number;
  tags?: string[];
  rhythm?: string[];
  tonality?: string[];
  category?: string[];
  materialKinds?: string[];
  numberMin?: number;
  numberMax?: number;
  sort?: SortField;
  order?: 'asc' | 'desc';
}

export async function searchPraises(
  params: SearchParams = {}
): Promise<{ data: Praise[]; pagination: PaginationInfo }> {
  const urlParams = new URLSearchParams();

  if (params.query) urlParams.set('q', params.query);
  urlParams.set('page', (params.page || 1).toString());
  urlParams.set('limit', (params.limit || 20).toString());

  if (params.tags && params.tags.length > 0) urlParams.set('tags', params.tags.join(','));
  if (params.rhythm && params.rhythm.length > 0) urlParams.set('rhythm', params.rhythm.join(','));
  if (params.tonality && params.tonality.length > 0) urlParams.set('tonality', params.tonality.join(','));
  if (params.category && params.category.length > 0) urlParams.set('category', params.category.join(','));
  if (params.materialKinds && params.materialKinds.length > 0) {
    urlParams.set('materialKinds', params.materialKinds.join(','));
  }
  if (params.numberMin !== undefined) urlParams.set('numberMin', params.numberMin.toString());
  if (params.numberMax !== undefined) urlParams.set('numberMax', params.numberMax.toString());
  if (params.sort) urlParams.set('sort', params.sort);
  if (params.order) urlParams.set('order', params.order);

  const response = await fetchJson<ApiResponse<Praise[]>>(
    `${API_BASE_URL}/api/praises?${urlParams}`
  );
  return {
    data: response.data,
    pagination: response.pagination!,
  };
}

export async function getFilterOptions(): Promise<FilterOptions> {
  const response = await fetchJson<FilterOptions>(
    `${API_BASE_URL}/api/praises/filters`
  );
  return response;
}

export async function getPraise(id: string): Promise<PraiseDetail> {
  const response = await fetchJson<ApiResponse<PraiseDetail>>(
    `${API_BASE_URL}/api/praises/${id}`
  );
  return response.data;
}

export function getPraiseDownloadZipUrl(id: string): string {
  return `${API_BASE_URL}/api/praises/${id}/download.zip`;
}

export type CreatePraiseInput = {
  name: string;
  number?: string | null;
  author?: string | null;
  rhythm?: string | null;
  tonality?: string | null;
  category?: string | null;
  lyrics?: string | null;
  tag_ids?: string[];
};

export async function createPraise(body: CreatePraiseInput): Promise<PraiseDetail> {
  const response = await fetchJson<ApiResponse<PraiseDetail>>(
    `${API_BASE_URL}/api/praises`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  return response.data;
}

export async function updatePraise(
  id: string,
  updates: Partial<Pick<Praise, 'name' | 'number' | 'author' | 'rhythm' | 'tonality' | 'category' | 'lyrics'>>
): Promise<PraiseDetail> {
  const response = await fetchJson<ApiResponse<PraiseDetail>>(
    `${API_BASE_URL}/api/praises/${id}`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(updates),
    }
  );
  return response.data;
}

export async function addPraiseTag(praiseId: string, tagId: string): Promise<PraiseDetail> {
  const response = await fetchJson<ApiResponse<PraiseDetail>>(
    `${API_BASE_URL}/api/praises/${praiseId}/tags`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tag_id: tagId }),
    }
  );
  return response.data;
}

export async function removePraiseTag(praiseId: string, tagId: string): Promise<PraiseDetail> {
  const response = await fetchJson<ApiResponse<PraiseDetail>>(
    `${API_BASE_URL}/api/praises/${praiseId}/tags/${tagId}`,
    { method: 'DELETE' }
  );
  return response.data;
}

export async function createMaterial(praiseId: string, material: {
  material_kind: string;
  type: string;
  url?: string;
}): Promise<PraiseDetail> {
  const response = await fetchJson<ApiResponse<PraiseDetail>>(
    `${API_BASE_URL}/api/praises/${praiseId}/materials`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(material),
    }
  );
  return response.data;
}

export async function updateMaterial(materialId: string, updates: {
  material_kind?: string;
  type?: string;
  url?: string | null;
}): Promise<PraiseDetail> {
  const response = await fetchJson<ApiResponse<PraiseDetail>>(
    `${API_BASE_URL}/api/materials/${materialId}`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(updates),
    }
  );
  return response.data;
}

export async function deleteMaterial(materialId: string): Promise<PraiseDetail> {
  const response = await fetchJson<ApiResponse<PraiseDetail>>(
    `${API_BASE_URL}/api/materials/${materialId}`,
    { method: 'DELETE' }
  );
  return response.data;
}

export async function bulkUploadMaterials(
  praiseId: string,
  items: Array<{ file: File; material_kind: string; type: string; file_path_legacy?: string }>
): Promise<PraiseDetail> {
  const form = new FormData();
  const meta = items.map((it, idx) => {
    const key = `file_${idx}`;
    form.append(key, it.file);
    return {
      key,
      material_kind: it.material_kind,
      type: it.type,
      file_path_legacy: it.file_path_legacy,
    };
  });
  form.append('items', JSON.stringify(meta));

  const response = await fetchJson<ApiResponse<PraiseDetail>>(
    `${API_BASE_URL}/api/praises/${praiseId}/materials/bulk-upload`,
    { method: 'POST', body: form }
  );
  return response.data;
}

export function getDriveConnectUrl(redirectTo: string): string {
  const params = new URLSearchParams({ redirect: redirectTo });
  return `${API_BASE_URL}/auth/drive/connect?${params}`;
}

export async function getDriveStatus(): Promise<{ connected: boolean }> {
  return fetchJson<{ connected: boolean }>(`${API_BASE_URL}/api/drive/status`);
}

export type DriveScanFile = {
  drive_file_id: string;
  name: string;
  rel_path: string;
  mime_type?: string | null;
  size_bytes?: number | null;
};

export type DriveScanResult = {
  id: string;
  status: string;
  error?: string | null;
  files: DriveScanFile[];
  skipped: Array<{ path: string; reason: string }>;
};

export async function startDriveScan(url: string): Promise<DriveScanResult> {
  const response = await fetchJson<{ data: DriveScanResult }>(
    `${API_BASE_URL}/api/drive/scans`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
    }
  );
  return response.data;
}

export type ImportJobSummary = {
  id: string;
  praise_id: string;
  status: string;
  total_count: number;
  done_count: number;
  failed_count: number;
  skipped_count: number;
  items?: Array<{
    id: string;
    drive_file_id: string;
    file_path_legacy: string | null;
    status: string;
    error: string | null;
  }>;
};

export async function startDriveImport(
  praiseId: string,
  items: Array<{
    drive_file_id: string;
    material_kind: string;
    type: string;
    file_path_legacy?: string;
  }>
): Promise<ImportJobSummary> {
  const response = await fetchJson<{ data: ImportJobSummary }>(
    `${API_BASE_URL}/api/praises/${praiseId}/materials/drive-import`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items }),
    }
  );
  return response.data;
}

export async function getImportJob(jobId: string): Promise<ImportJobSummary> {
  const response = await fetchJson<{ data: ImportJobSummary }>(
    `${API_BASE_URL}/api/import-jobs/${jobId}`
  );
  return response.data;
}

export async function retryFailedImportItems(jobId: string): Promise<{ retried: number }> {
  const response = await fetchJson<{ data: { retried: number } }>(
    `${API_BASE_URL}/api/import-jobs/${jobId}/retry-failed`,
    { method: 'POST' }
  );
  return response.data;
}

export async function getMaterialKinds(): Promise<MaterialKind[]> {
  const response = await fetchJson<ApiResponse<MaterialKind[]>>(
    `${API_BASE_URL}/api/materials/kinds`
  );
  return response.data;
}

export type MergePraisesInput = {
  source_praise_id: string;
  metadata: {
    name: string;
    number: string | null;
    author: string | null;
    rhythm: string | null;
    tonality: string | null;
    category: string | null;
    lyrics: string | null;
  };
  tag_ids: string[];
  material_ids_to_import: string[];
};

export async function mergePraises(keeperId: string, body: MergePraisesInput): Promise<PraiseDetail> {
  const response = await fetchJson<ApiResponse<PraiseDetail>>(
    `${API_BASE_URL}/api/praises/${keeperId}/merge`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  return response.data;
}

export async function getTags(): Promise<Tag[]> {
  const response = await fetchJson<ApiResponse<Tag[]>>(
    `${API_BASE_URL}/api/tags`
  );
  return response.data;
}

export type AuthUser = { sub: string; email?: string; name?: string; picture?: string };

export async function getMe(): Promise<AuthUser | null> {
  const res = await fetchJson<{ user: AuthUser | null }>(`${API_BASE_URL}/auth/me`);
  return res.user;
}

export async function logout(): Promise<void> {
  await fetchJson<{ ok: true }>(`${API_BASE_URL}/auth/logout`, { method: 'POST' });
}

export function getAssetUrl(r2Key: string): string {
  return `${API_BASE_URL}/${r2Key}`;
}
