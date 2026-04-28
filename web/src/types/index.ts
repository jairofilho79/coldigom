// Types matching the API and PRD

export interface Praise {
  id: string;
  name: string;
  number: string;
  author: string;
  rhythm: string;
  tonality: string;
  category: string;
  lyrics: string;
  tag_ids: string | null;
}

export interface Material {
  id: string;
  praise_id: string;
  material_kind: string;
  material_kind_name?: string;
  type: 'pdf' | 'mp3' | 'chord' | 'youtube';
  r2_key: string | null;
  url?: string | null;
  file_path_legacy: string;
  source_material_id: string | null;
}

export interface Tag {
  id: string;
  name: string;
}

export interface PraiseDetail extends Praise {
  tags: Tag[];
  materials: Material[];
}

export interface MaterialKind {
  id: string;
  name: string;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  data: T;
  pagination?: PaginationInfo;
}

export interface ApiError {
  error: string;
}

export interface TagWithCount extends Tag {
  count: number;
}

export interface FilterOptions {
  rhythms: string[];
  tonalities: string[];
  categories: string[];
  tags: TagWithCount[];
}

export type SortField = 'number' | 'name' | 'rhythm' | 'tonality' | 'category' | 'author' | 'created_at';

export interface SortOption {
  field: SortField;
  label: string;
  ascending: SortOptionDetail;
  descending: SortOptionDetail;
}

export interface SortOptionDetail {
  label: string;
  order: 'asc' | 'desc';
}

export const SORT_OPTIONS: SortOption[] = [
  { field: 'number', label: 'Número', ascending: { label: 'Número (1-9)', order: 'asc' }, descending: { label: 'Número (9-1)', order: 'desc' } },
  { field: 'name', label: 'Nome', ascending: { label: 'Nome (A-Z)', order: 'asc' }, descending: { label: 'Nome (Z-A)', order: 'desc' } },
  { field: 'rhythm', label: 'Ritmo', ascending: { label: 'Ritmo (A-Z)', order: 'asc' }, descending: { label: 'Ritmo (Z-A)', order: 'desc' } },
  { field: 'tonality', label: 'Tom', ascending: { label: 'Tom (A-Z)', order: 'asc' }, descending: { label: 'Tom (Z-A)', order: 'desc' } },
  { field: 'category', label: 'Categoria', ascending: { label: 'Categoria (A-Z)', order: 'asc' }, descending: { label: 'Categoria (Z-A)', order: 'desc' } },
  { field: 'author', label: 'Autor', ascending: { label: 'Autor (A-Z)', order: 'asc' }, descending: { label: 'Autor (Z-A)', order: 'desc' } },
];
