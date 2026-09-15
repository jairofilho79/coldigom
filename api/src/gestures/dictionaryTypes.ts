/** Contrato do dicionário — coldigom.gesture-dictionary/1 — e a forma da linha no D1. */

export const DICTIONARY_SCHEMA = 'coldigom.gesture-dictionary/1' as const;

/** Um vídeo youtube de um louvor em que o gesto aparece; seconds vazio = só ligado. */
export type GestureVideo = {
  materialId: string;
  praiseId: string;
  praiseNumber: string | null;
  praiseName: string;
  url: string;
  seconds: number[];
};

export type GestureEntry = {
  id: string;
  name: string;
  description: string;
  exampleTriggers: string[];
  image: string;
  gif: string | null;
  status: 'active' | 'deprecated';
  replacedBy: string | null;
  updatedAt: string;
  videos: GestureVideo[];
};

export type GestureDictionary = {
  schema: typeof DICTIONARY_SCHEMA;
  version: number;
  generatedAt: string;
  gestures: GestureEntry[];
};

export type LinhaDoDicionario = {
  id: string;
  name: string;
  description: string;
  example_triggers: string;
  image_key: string | null;
  gif_key: string | null;
  status: 'active' | 'deprecated';
  replaced_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Uso = {
  material_id: string;
  praise_id: string;
  praise_name: string;
  praise_number: string | null;
  count: number;
};

/** Linha de gesture_video_occurrences já com o JOIN em praise_materials e praises. */
export type LinhaDeOcorrencia = {
  gesture_id: string;
  material_id: string;
  praise_id: string;
  praise_number: string | null;
  praise_name: string;
  url: string;
  seconds: number | null;
};
