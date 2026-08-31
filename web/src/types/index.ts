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
  group_id: string | null;
  tag_ids: string | null;
  tag_names: string | null;
}

/** Os tipos que a tela do louvor desenha com apresentação própria. */
export type KnownMaterialType = 'pdf' | 'mp3' | 'chord' | 'youtube';

/**
 * O acervo guarda mais que os quatro acima — mid, gestures, txt e link vieram da
 * ingestão legada, e a importação em lote infere o tipo pela extensão do arquivo.
 * A API aceita de propósito qualquer `^[a-z0-9]{1,16}$` (api/src/uploadLimits.ts),
 * então declarar só os quatro fazia o tipo mentir e a tela descartar material real.
 * O `string & {}` preserva o autocompletar dos quatro conhecidos.
 */
export type MaterialType = KnownMaterialType | (string & {});

export interface Material {
  id: string;
  praise_id: string;
  material_kind: string;
  material_kind_name?: string;
  type: MaterialType;
  r2_key: string | null;
  url?: string | null;
  file_path_legacy: string;
  source_material_id: string | null;
  merged_from_praise_id?: string | null;
  merged_from_praise_name?: string | null;
  /** Só em materiais type:'chord' — se o .chord existe de verdade no R2. */
  has_content?: boolean;
  /** Passou por revisão humana. O lote gerado por pipeline entra como false. */
  is_reviewed?: boolean;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
}

export interface Tag {
  id: string;
  name: string;
  parent_id: string | null;
  parent_name?: string | null;
}

export interface PraiseGroupMember {
  id: string;
  tags: Tag[];
}

export interface PraiseDetail extends Praise {
  tags: Tag[];
  materials: Material[];
  group_members: PraiseGroupMember[];
}

/** Display name for the default locale (pt-BR); resolved by the API from D1 translations. */
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

/** Espelha VALID_SORT_FIELDS da API. Existe como valor, e não só como tipo,
 *  porque o `sort` vem da URL, que é editável à mão. */
export const VALID_SORT_FIELDS = [
  'number',
  'name',
  'rhythm',
  'tonality',
  'category',
  'author',
  'created_at',
] as const;

export type SortField = (typeof VALID_SORT_FIELDS)[number];

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
  { field: 'created_at', label: 'Cadastro', ascending: { label: 'Mais antigos', order: 'asc' }, descending: { label: 'Mais recentes', order: 'desc' } },
];
