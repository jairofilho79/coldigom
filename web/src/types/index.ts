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
  type: 'pdf' | 'mp3' | 'chord';
  r2_key: string;
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
