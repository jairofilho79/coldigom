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

// Room Types
export type RoomAccessType = 'public' | 'password' | 'approval';
export type RoomJoinRequestStatus = 'pending' | 'approved' | 'rejected';

export interface RoomResponse {
  id: string; // UUID
  code: string; // 8-character code
  name: string;
  description?: string | null;
  creator_id: string; // UUID
  access_type: RoomAccessType;
  is_open_for_requests?: boolean | null;
  auto_destroy_on_empty: boolean;
  created_at: string; // ISO datetime
  updated_at: string; // ISO datetime
  last_activity_at: string; // ISO datetime
  participants_count: number;
  praises_count: number;
}

export interface RoomCreate {
  name: string;
  description?: string | null;
  access_type: RoomAccessType;
  password?: string | null;
  is_open_for_requests?: boolean | null;
  auto_destroy_on_empty: boolean;
}

export interface RoomUpdate {
  name?: string;
  description?: string | null;
  access_type?: RoomAccessType;
  password?: string | null;
  is_open_for_requests?: boolean | null;
  auto_destroy_on_empty?: boolean;
}

export interface RoomDetailResponse extends RoomResponse {
  creator_username?: string | null;
  is_creator: boolean;
  is_participant: boolean;
  praises: Array<{
    id: string;
    praise_id: string;
    praise_name: string | null;
    praise_number: number | null;
    order: number;
    added_at: string;
  }>;
  participants: Array<{
    id: string;
    user_id: string;
    username: string | null;
    material_kind_name?: string | null;
    joined_at: string;
    last_seen_at: string;
  }>;
}

export interface RoomJoinRequest {
  password?: string | null;
}

export interface RoomMessageResponse {
  id: string; // UUID
  room_id: string; // UUID
  user_id: string; // UUID
  username: string;
  material_kind_name?: string | null;
  message: string; // max 140 chars
  created_at: string; // ISO datetime
}

export interface RoomMessageCreate {
  message: string; // max 140 chars
}

export interface RoomParticipantResponse {
  id: string; // UUID
  user_id: string; // UUID
  username: string;
  material_kind_name?: string | null;
  joined_at: string; // ISO datetime
  last_seen_at: string; // ISO datetime
}

export interface RoomJoinRequestDetail {
  id: string; // UUID
  room_id: string; // UUID
  user_id: string; // UUID
  username: string;
  status: RoomJoinRequestStatus;
  requested_at: string; // ISO datetime
  responded_at?: string | null; // ISO datetime
}

export interface RoomPraiseReorder {
  praise_orders: Array<{ praise_id: string; order: number }>;
}
