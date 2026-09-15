/** Contrato do dicionário — coldigom.gesture-dictionary/1 — e a forma da linha no D1. */

export const DICTIONARY_SCHEMA = 'coldigom.gesture-dictionary/1' as const;

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
