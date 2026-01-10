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

// Material Type Enum
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
  praise_id: string; // UUID
  path: string; // URL ou caminho do arquivo
  type: MaterialType;
  material_kind?: MaterialKindResponse;
}

export interface PraiseMaterialCreate {
  praise_id: string; // UUID
  material_kind_id: string; // UUID
  path: string;
  type: MaterialType;
}

export interface PraiseMaterialUpdate {
  material_kind_id?: string; // UUID
  path?: string;
  type?: MaterialType;
}

export interface PraiseMaterialSimple {
  id: string;
  material_kind_id: string;
  path: string;
  type: string;
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
