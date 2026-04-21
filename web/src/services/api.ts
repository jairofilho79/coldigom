import type { ApiResponse, Praise, PraiseDetail, MaterialKind, Tag, PaginationInfo, FilterOptions, SortField } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787';

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  return response.json();
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
