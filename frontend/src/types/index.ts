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
  is_old?: boolean;
  old_description?: string | null;
  material_kind?: MaterialKindResponse;
  material_type?: MaterialTypeResponse;
}

export interface PraiseMaterialCreate {
  praise_id: string; // UUID
  material_kind_id: string; // UUID
  material_type_id: string; // UUID
  path: string;
  is_old?: boolean;
  old_description?: string | null;
}

export interface PraiseMaterialUpdate {
  material_kind_id?: string; // UUID
  material_type_id?: string; // UUID
  path?: string;
  is_old?: boolean;
  old_description?: string | null;
}

export interface PraiseMaterialSimple {
  id: string;
  material_kind_id: string;
  material_type_id: string;
  path: string;
  is_old?: boolean;
  old_description?: string | null;
  material_kind?: MaterialKindResponse;
  material_type?: MaterialTypeResponse;
}

// Review types
export type ReviewEventType = 'in_review' | 'review_cancelled' | 'review_finished';

export interface ReviewHistoryEvent {
  type: ReviewEventType;
  date: string; // ISO datetime
}

export type ReviewAction = 'start' | 'cancel' | 'finish';

export interface ReviewActionRequest {
  action: ReviewAction;
  in_review_description?: string | null;
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
  in_review: boolean;
  in_review_description?: string | null;
  review_history: ReviewHistoryEvent[];
}

export interface PraiseCreate {
  name: string;
  number?: number | null;
  tag_ids?: string[]; // UUID[]
  materials?: PraiseMaterialCreate[];
  in_review?: boolean;
  in_review_description?: string | null;
}

export interface PraiseUpdate {
  name?: string;
  number?: number | null;
  tag_ids?: string[] | null; // UUID[]
  in_review_description?: string | null;
}

// Download URL Response
export interface DownloadUrlResponse {
  download_url: string;
  expires_in: number;
}

// User Preferences Types
export interface UserMaterialKindPreferenceResponse {
  id: string; // UUID
  user_id: string; // UUID
  material_kind_id: string; // UUID
  order: number; // 0-4
  created_at: string; // ISO datetime
  updated_at: string; // ISO datetime
  material_kind?: MaterialKindResponse;
}

export interface MaterialKindOrderUpdate {
  material_kind_ids: string[]; // UUID[], máximo 5 itens
}

// Praise List Types
export interface PraiseListResponse {
  id: string; // UUID
  name: string; // min: 1, max: 255
  description?: string | null; // max: 1000
  is_public: boolean;
  user_id: string; // UUID
  owner?: string | null; // username do dono
  praises_count: number;
  created_at: string; // ISO datetime
  updated_at: string; // ISO datetime
}

export interface PraiseListCreate {
  name: string;
  description?: string | null;
  is_public?: boolean; // default: true
}

export interface PraiseListUpdate {
  name?: string;
  description?: string | null;
  is_public?: boolean;
}

export interface PraiseInList {
  id: string; // UUID
  name: string;
  number: number | null;
  order: number;
}

export interface PraiseListDetailResponse extends PraiseListResponse {
  praises: PraiseInList[];
  is_owner: boolean;
  is_following: boolean;
}

export interface ReorderPraisesRequest {
  praise_orders: Array<{
    praise_id: string; // UUID
    order: number;
  }>;
}
