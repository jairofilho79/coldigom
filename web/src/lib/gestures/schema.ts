/**
 * ESPELHO de api/src/gestures/schema.ts — cópia byte a byte fora deste comentário.
 *
 * O servidor manda. Esta cópia existe para o revisor ver a recusa ANTES de gastar
 * rede, com a mesma frase que a API devolveria. Se um dia divergirem, o servidor
 * recusa e o usuário vê a recusa dele; o teste em __tests__/schema.test.ts compara
 * os dois arquivos e lê as fixtures da API para isso não acontecer em silêncio.
 */

export const GESTURE_SCHEMA = 'coldigom.gestures/1' as const;

/** 12 hex, estável para sempre — é a chave do dicionário. */
export const GESTURE_ID_RE = /^[0-9a-f]{12}$/;

/** Reaproveita o teto da cifra: mesma ordem de grandeza, mesmo `lerCorpoComTeto`. */
export const MAX_GESTURES_DOCUMENT_BYTES = 256 * 1024;

export const INSTRUCTION_KINDS = [
  'instruments',
  'repeat_praise',
  'back_to_chorus',
  'back_to_chorus_and_finish',
] as const;
export type InstructionKind = (typeof INSTRUCTION_KINDS)[number];

export type LyricLine = { trigger: string; text: string };
export type GestureItem = { type: 'gesture'; gestureId: string; lyrics: LyricLine[] };
export type RepeatBlock = { type: 'repeat'; count: number; children: BlockChild[] };
export type ChorusBlock = { type: 'coro'; children: BlockChild[] };
export type LinkBlock = { type: 'link'; children: BlockChild[] };
export type FinalBlock = { type: 'final'; children: BlockChild[] };
export type BlockChild = GestureItem | RepeatBlock | ChorusBlock | LinkBlock;
export type InstructionItem = { type: 'instruction'; kind: InstructionKind };
export type TextItem = { type: 'text'; text: string };
export type Item = BlockChild | FinalBlock | InstructionItem | TextItem;
export type Bloco = RepeatBlock | ChorusBlock | LinkBlock | FinalBlock;

export type GestureDocument = {
  schema: typeof GESTURE_SCHEMA;
  title: string;
  dictionaryVersion: number;
  items: Item[];
};

export type CodigoDeErro =
  | 'json_invalido'
  | 'schema_desconhecido'
  | 'titulo_invalido'
  | 'versao_dicionario_invalida'
  | 'itens_vazios'
  | 'sem_gesto'
  | 'tipo_desconhecido'
  | 'gesture_id_invalido'
  | 'letras_fora_do_limite'
  | 'linha_invalida'
  | 'primeira_linha_vazia'
  | 'repeticao_invalida'
  | 'bloco_vazio'
  | 'link_com_filhos_invalidos'
  | 'final_fora_da_raiz'
  | 'final_duplicado'
  | 'item_depois_do_final'
  | 'instrucao_fora_da_raiz'
  | 'instrucao_desconhecida'
  | 'texto_invalido'
  | 'documento_grande';

/** Uma tabela só, nos dois lados: a API responde com a frase e o editor mostra a mesma. */
export const MENSAGENS: Record<CodigoDeErro, string> = {
  json_invalido: 'O corpo não é um JSON válido.',
  schema_desconhecido: 'O documento não declara o schema "coldigom.gestures/1".',
  titulo_invalido: 'O título do documento não pode ficar vazio.',
  versao_dicionario_invalida: 'A versão do dicionário precisa ser um inteiro maior ou igual a zero.',
  itens_vazios: 'O documento precisa ter ao menos um item.',
  sem_gesto: 'O documento precisa ter ao menos um gesto.',
  tipo_desconhecido: 'Tipo de item desconhecido neste ponto do documento.',
  gesture_id_invalido: 'O id do gesto precisa ter 12 caracteres hexadecimais minúsculos.',
  letras_fora_do_limite: 'Cada gesto tem de 1 a 3 linhas de letra.',
  linha_invalida: 'Cada linha de letra precisa de "trigger" e "text" como texto.',
  primeira_linha_vazia: 'A primeira linha do gesto precisa ter gatilho ou leitura.',
  repeticao_invalida: 'A repetição precisa de um número inteiro de vezes, no mínimo 2.',
  bloco_vazio: 'O bloco não pode ficar sem filhos.',
  link_com_filhos_invalidos: 'Um link liga exatamente 2 ou 3 itens.',
  final_fora_da_raiz: 'O bloco FINAL só pode estar na raiz do documento.',
  final_duplicado: 'O documento só pode ter um bloco FINAL.',
  item_depois_do_final: 'Depois do FINAL só cabem instruções.',
  instrucao_fora_da_raiz: 'Instruções só podem estar na raiz do documento.',
  instrucao_desconhecida: 'Instrução desconhecida.',
  texto_invalido: 'A linha de texto livre precisa de "text" como texto.',
  documento_grande: 'O documento de gestos passa do limite de 256 KB.',
};

export type ErroDeValidacao = { codigo: CodigoDeErro; caminho: string };
export type ResultadoDaValidacao =
  | { ok: true; doc: GestureDocument }
  | { ok: false; erro: ErroDeValidacao };

/** Sinaliza o primeiro erro e sobe até `validarDocumento`. Só existe dentro deste arquivo. */
class Falha {
  constructor(public readonly erro: ErroDeValidacao) {}
}
function falhar(codigo: CodigoDeErro, caminho: string): never {
  throw new Falha({ codigo, caminho });
}

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Para no PRIMEIRO erro. Quem edita conserta um problema por vez, e o caminho
 * (`items[3].children[1]`) é o que leva o revisor direto ao cartão.
 */
export function validarDocumento(valor: unknown): ResultadoDaValidacao {
  try {
    if (!ehObjeto(valor)) falhar('schema_desconhecido', '');
    if (valor.schema !== GESTURE_SCHEMA) falhar('schema_desconhecido', 'schema');
    if (typeof valor.title !== 'string' || valor.title.trim() === '') falhar('titulo_invalido', 'title');
    if (!Number.isInteger(valor.dictionaryVersion) || (valor.dictionaryVersion as number) < 0) {
      falhar('versao_dicionario_invalida', 'dictionaryVersion');
    }
    if (!Array.isArray(valor.items) || valor.items.length === 0) falhar('itens_vazios', 'items');

    const contexto = { gestos: 0 };
    let finalVisto = false;
    valor.items.forEach((item, i) => {
      const caminho = `items[${i}]`;
      const tipo = ehObjeto(item) ? item.type : undefined;
      if (tipo === 'final') {
        if (finalVisto) falhar('final_duplicado', caminho);
        finalVisto = true;
      } else if (finalVisto && tipo !== 'instruction') {
        falhar('item_depois_do_final', caminho);
      }
      validarItem(item, caminho, true, contexto);
    });
    if (contexto.gestos === 0) falhar('sem_gesto', 'items');

    return { ok: true, doc: valor as unknown as GestureDocument };
  } catch (e) {
    if (e instanceof Falha) return { ok: false, erro: e.erro };
    throw e;
  }
}

function validarItem(
  item: unknown,
  caminho: string,
  raiz: boolean,
  contexto: { gestos: number }
): void {
  if (!ehObjeto(item) || typeof item.type !== 'string') falhar('tipo_desconhecido', caminho);
  switch (item.type) {
    case 'gesture': {
      if (typeof item.gestureId !== 'string' || !GESTURE_ID_RE.test(item.gestureId)) {
        falhar('gesture_id_invalido', `${caminho}.gestureId`);
      }
      const lyrics = item.lyrics;
      if (!Array.isArray(lyrics) || lyrics.length < 1 || lyrics.length > 3) {
        falhar('letras_fora_do_limite', `${caminho}.lyrics`);
      }
      lyrics.forEach((linha, j) => {
        if (!ehObjeto(linha) || typeof linha.trigger !== 'string' || typeof linha.text !== 'string') {
          falhar('linha_invalida', `${caminho}.lyrics[${j}]`);
        }
      });
      const primeira = lyrics[0] as LyricLine;
      if (primeira.trigger.trim() === '' && primeira.text.trim() === '') {
        falhar('primeira_linha_vazia', `${caminho}.lyrics[0]`);
      }
      contexto.gestos += 1;
      return;
    }
    case 'repeat': {
      if (!Number.isInteger(item.count) || (item.count as number) < 2) {
        falhar('repeticao_invalida', `${caminho}.count`);
      }
      validarFilhos(item.children, caminho, contexto);
      return;
    }
    case 'coro':
      validarFilhos(item.children, caminho, contexto);
      return;
    case 'link': {
      const filhos = item.children;
      if (!Array.isArray(filhos) || filhos.length < 2 || filhos.length > 3) {
        falhar('link_com_filhos_invalidos', `${caminho}.children`);
      }
      filhos.forEach((f, j) => validarItem(f, `${caminho}.children[${j}]`, false, contexto));
      return;
    }
    case 'final':
      if (!raiz) falhar('final_fora_da_raiz', caminho);
      validarFilhos(item.children, caminho, contexto);
      return;
    case 'instruction':
      if (!raiz) falhar('instrucao_fora_da_raiz', caminho);
      if (!(INSTRUCTION_KINDS as readonly unknown[]).includes(item.kind)) {
        falhar('instrucao_desconhecida', `${caminho}.kind`);
      }
      return;
    case 'text':
      // Texto livre só cabe na raiz: dentro de bloco não faz parte do contrato
      // (BlockChild), e o cliente o renderizaria como desconhecido.
      if (!raiz) falhar('tipo_desconhecido', caminho);
      if (typeof item.text !== 'string') falhar('texto_invalido', `${caminho}.text`);
      return;
    default:
      falhar('tipo_desconhecido', caminho);
  }
}

/** repeat / coro / final: filhos não-vazios, cada um validado fora da raiz. */
function validarFilhos(filhos: unknown, caminho: string, contexto: { gestos: number }): void {
  if (!Array.isArray(filhos) || filhos.length === 0) falhar('bloco_vazio', `${caminho}.children`);
  filhos.forEach((f, j) => validarItem(f, `${caminho}.children[${j}]`, false, contexto));
}
