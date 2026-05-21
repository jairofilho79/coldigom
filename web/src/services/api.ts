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

export async function getMaterialKinds(): Promise<MaterialKind[]> {
  const response = await fetchJson<ApiResponse<MaterialKind[]>>(
    `${API_BASE_URL}/api/materials/kinds`
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
