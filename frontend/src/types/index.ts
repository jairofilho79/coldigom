// User Types
export interface UserResponse {
  id: string; // UUID
  email: string;
  username: string;
  is_active: boolean;
  created_at: string; // ISO datetime
  updated_at: string; // ISO datetime
}

export interface UserCreate {
  email: string;
  username: string; // min: 3, max: 50
  password: string; // min: 6
}

export interface Token {
  access_token: string;
  token_type: 'bearer';
}

// Material Type Types (replaced enum with entity)
export interface MaterialTypeResponse {
  id: string; // UUID
  name: string; // min: 1, max: 255
}

export interface MaterialTypeCreate {
  name: string;
}

export interface MaterialTypeUpdate {
  name?: string;
}

// Legacy enum deprecated - kept for backward compatibility during migration
// @deprecated Use MaterialTypeResponse from API instead
export enum MaterialType {
  FILE = 'file',
  YOUTUBE = 'youtube',
  SPOTIFY = 'spotify',
  TEXT = 'text',
}

// Praise Tag Types
export interface PraiseTagResponse {
  id: string; // UUID
  name: string; // min: 1, max: 255
}

export interface PraiseTagCreate {
  name: string;
}

export interface PraiseTagUpdate {
  name?: string;
}

export interface PraiseTagSimple {
  id: string;
  name: string;
}

// Material Kind Types
export interface MaterialKindResponse {
  id: string; // UUID
  name: string; // min: 1, max: 255
}

export interface MaterialKindCreate {
  name: string;
}

export interface MaterialKindUpdate {
  name?: string;
}

// Praise Material Types
export interface PraiseMaterialResponse {
  id: string; // UUID
  material_kind_id: string; // UUID
  material_type_id: string; // UUID
  praise_id: string; // UUID
  path: string; // URL ou caminho do arquivo
  material_kind?: MaterialKindResponse;
  material_type?: MaterialTypeResponse;
}

export interface PraiseMaterialCreate {
  praise_id: string; // UUID
  material_kind_id: string; // UUID
  material_type_id: string; // UUID
  path: string;
}

export interface PraiseMaterialUpdate {
  material_kind_id?: string; // UUID
  material_type_id?: string; // UUID
  path?: string;
}

export interface PraiseMaterialSimple {
  id: string;
  material_kind_id: string;
  material_type_id: string;
  path: string;
  material_kind?: MaterialKindResponse;
  material_type?: MaterialTypeResponse;
}

// Praise Types
export interface PraiseResponse {
  id: string; // UUID
  name: string; // min: 1, max: 255
  number: number | null;
  created_at: string; // ISO datetime
  updated_at: string; // ISO datetime
  tags: PraiseTagSimple[];
  materials: PraiseMaterialSimple[];
}

export interface PraiseCreate {
  name: string;
  number?: number | null;
  tag_ids?: string[]; // UUID[]
  materials?: PraiseMaterialCreate[];
}

export interface PraiseUpdate {
  name?: string;
  number?: number | null;
  tag_ids?: string[] | null; // UUID[]
}

// Download URL Response
export interface DownloadUrlResponse {
  download_url: string;
  expires_in: number;
}
