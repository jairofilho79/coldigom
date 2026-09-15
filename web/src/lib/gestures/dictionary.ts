/** Vídeo youtube de um louvor em que o gesto aparece; seconds vazio = só ligado. */
export type GestureVideo = {
  materialId: string;
  praiseId: string;
  praiseNumber: string | null;
  praiseName: string;
  url: string;
  seconds: number[];
};

/** Contrato do dicionário — coldigom.gesture-dictionary/1. */
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
  schema: 'coldigom.gesture-dictionary/1';
  version: number;
  generatedAt: string;
  gestures: GestureEntry[];
};

export type Indice = {
  version: number;
  porId: Map<string, GestureEntry>;
  /** Ativos, por nome — o que o seletor mostra. */
  ativos: GestureEntry[];
};

/** Teto da cadeia de alias. Um gesto fundido em outro, fundido em outro… cinco vezes já é anomalia. */
export const MAX_SALTOS = 5;

export function indexar(dic: GestureDictionary): Indice {
  const porId = new Map(dic.gestures.map((g) => [g.id, g]));
  const ativos = dic.gestures
    .filter((g) => g.status === 'active')
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
  return { version: dic.version, porId, ativos };
}

/**
 * Índice com um gesto recém-criado (ou reescrito), sem baixar o dicionário de
 * novo. A versão avança em um porque o servidor incrementa a cada escrita — é
 * o carimbo que o documento leva em `dictionaryVersion` ao salvar.
 */
export function adicionarAoIndice(indice: Indice, entrada: GestureEntry): Indice {
  const porId = new Map(indice.porId);
  porId.set(entrada.id, entrada);
  return indexar({ schema: 'coldigom.gesture-dictionary/1', version: indice.version + 1, generatedAt: '', gestures: [...porId.values()] });
}

export type Resolucao =
  | { ok: true; entrada: GestureEntry; idFinal: string; viaAlias: boolean }
  | { ok: false; motivo: 'ausente' | 'ciclo' | 'estouro'; idFinal: string };

/**
 * Segue replacedBy até um ativo. O documento guarda o id de quando foi escrito;
 * um gesto fundido depois continua renderizando — com a figura do substituto.
 */
export function resolver(indice: Indice, id: string): Resolucao {
  const vistos = new Set<string>();
  let atual = id;
  let saltos = 0;
  for (;;) {
    const entrada = indice.porId.get(atual);
    if (!entrada) return { ok: false, motivo: 'ausente', idFinal: atual };
    if (entrada.status === 'active' || !entrada.replacedBy) {
      return { ok: true, entrada, idFinal: atual, viaAlias: saltos > 0 };
    }
    if (vistos.has(atual)) return { ok: false, motivo: 'ciclo', idFinal: atual };
    vistos.add(atual);
    if (saltos >= MAX_SALTOS) return { ok: false, motivo: 'estouro', idFinal: atual };
    saltos += 1;
    atual = entrada.replacedBy;
  }
}

export function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function buscar(indice: Indice, termo: string, limite = 20): GestureEntry[] {
  const t = normalizar(termo);
  if (!t) return indice.ativos.slice(0, limite);
  const casa = (texto: string) => normalizar(texto).split(/\s+/).some((palavra) => palavra.startsWith(t));
  return indice.ativos.filter((g) => casa(g.name) || g.exampleTriggers.some(casa)).slice(0, limite);
}
