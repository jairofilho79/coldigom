import type { ApiResponse, Praise, PraiseDetail, MaterialKind, Tag, PaginationInfo } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787';

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function searchPraises(
  query: string = '',
  page: number = 1,
  limit: number = 20
): Promise<{ data: Praise[]; pagination: PaginationInfo }> {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  });
  if (query) params.set('q', query);

  const response = await fetchJson<ApiResponse<Praise[]>>(
    `${API_BASE_URL}/api/praises?${params}`
  );
  return {
    data: response.data,
    pagination: response.pagination!,
  };
}

export async function getPraise(id: string): Promise<PraiseDetail> {
  const response = await fetchJson<ApiResponse<PraiseDetail>>(
    `${API_BASE_URL}/api/praises/${id}`
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

export function getAssetUrl(r2Key: string): string {
  // r2Key already contains the full path starting with assets/
  // Example: assets/praises/228bf66e-3723-41f1-98ae-9d3a49d3d615/fd1ccc3a-03e3-450e-9d0c-4706bfe56f4c.pdf
  return `${API_BASE_URL}/${r2Key}`;
}
