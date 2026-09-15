import { MENSAGENS, type BlockChild, type Bloco, type GestureDocument, type GestureItem, type InstructionKind, type Item, type LyricLine } from './schema';
import { irmaosContiguos, itemEm, ordenar, pai, type Caminho } from './flatten';

export type Resultado = { doc: GestureDocument; foco: Caminho | null };
export type EspecDeBloco =
  | { type: 'repeat'; count: number }
  | { type: 'coro' }
  | { type: 'link' }
  | { type: 'final' };

const SO_NA_RAIZ = new Set<Item['type']>(['instruction', 'text', 'final']);
const ehBloco = (i: Item | undefined): i is Bloco => !!i && 'children' in i;
const ehFilhoDeBloco = (i: Item): i is BlockChild => !SO_NA_RAIZ.has(i.type);

export function novoGesto(gestureId: string): GestureItem {
  return { type: 'gesture', gestureId, lyrics: [{ trigger: '', text: '' }] };
}

/** Devolve o documento com a lista de irmãos em `caminhoDoPai` (null = raiz) trocada por `fn(lista)`. */
function comIrmaos(doc: GestureDocument, caminhoDoPai: Caminho | null, fn: (lista: Item[]) => Item[]): GestureDocument {
  if (caminhoDoPai === null) return { ...doc, items: fn(doc.items) };
  const trocar = (lista: Item[], resto: Caminho): Item[] => {
    const [i, ...demais] = resto;
    const alvo = lista[i];
    if (!ehBloco(alvo)) return lista;
    const filhos = demais.length === 0 ? fn(alvo.children) : trocar(alvo.children, demais);
    return lista.map((x, n) => (n === i ? ({ ...alvo, children: filhos } as Item) : x));
  };
  return { ...doc, items: trocar(doc.items, caminhoDoPai) };
}

/** Devolve o documento com o item em `caminho` trocado por `fn(item)`. */
function comItem(doc: GestureDocument, caminho: Caminho, fn: (item: Item) => Item): GestureDocument {
  const i = caminho[caminho.length - 1];
  return comIrmaos(doc, pai(caminho), (lista) => lista.map((x, n) => (n === i ? fn(x) : x)));
}

function indiceDoFinal(doc: GestureDocument): number {
  return doc.items.findIndex((i) => i.type === 'final');
}

// ---------- estrutura ----------

export function inserirApos(doc: GestureDocument, caminho: Caminho | null, item: Item): Resultado {
  // Foco morto (item removido por outra aba, ou por Desfazer/Refazer que pulou
  // por cima) não pode virar exceção: vira "sem foco", ou seja, insere no fim.
  if (caminho && !itemEm(doc, caminho)) caminho = null;
  // O que só cabe na raiz sobe até o ancestral de topo.
  let alvo = caminho;
  if (alvo && SO_NA_RAIZ.has(item.type)) alvo = [alvo[0]];
  // Link cheio: entra depois do link, não dentro.
  if (alvo) {
    const p = pai(alvo);
    const bloco = p ? itemEm(doc, p) : null;
    if (bloco && bloco.type === 'link' && bloco.children.length >= 3) alvo = p;
  }
  const p = alvo ? pai(alvo) : null;
  let indice = alvo ? alvo[alvo.length - 1] + 1 : doc.items.length;
  // Na raiz, o que não é instrução nunca cai depois do FINAL.
  if (p === null && item.type !== 'instruction') {
    const f = indiceDoFinal(doc);
    if (f >= 0 && indice > f) indice = f;
  }
  const novo = comIrmaos(doc, p, (lista) => [...lista.slice(0, indice), item, ...lista.slice(indice)]);
  return { doc: novo, foco: [...(p ?? []), indice] };
}

export function remover(doc: GestureDocument, caminho: Caminho): Resultado {
  // Total: um caminho morto (Desfazer/Refazer que trocou a árvore por baixo do
  // foco) não lança — devolve o doc como está, sem foco.
  if (!itemEm(doc, caminho)) return { doc, foco: null };
  const p = pai(caminho);
  const i = caminho[caminho.length - 1];
  const irmaosAntes = p ? (itemEm(doc, p) as Bloco).children : doc.items;
  const restantes = irmaosAntes.filter((_, n) => n !== i);
  const bloco = p ? (itemEm(doc, p) as Bloco) : null;

  // Bloco esvaziado some; link com 1 filho se dissolve — assim "remover" é total.
  if (bloco && restantes.length === 0) return remover(doc, p!);
  if (bloco && bloco.type === 'link' && restantes.length === 1) {
    const novo = comItem(doc, p!, () => restantes[0]);
    return { doc: novo, foco: p };
  }

  const novo = comIrmaos(doc, p, () => restantes);
  const foco: Caminho | null =
    restantes.length > i ? [...(p ?? []), i] : i > 0 ? [...(p ?? []), i - 1] : p;
  return { doc: novo, foco };
}

export function mover(doc: GestureDocument, caminho: Caminho, direcao: -1 | 1): Resultado {
  // Mesma totalidade de `remover`: caminho morto não lança.
  if (!itemEm(doc, caminho)) return { doc, foco: null };
  const p = pai(caminho);
  const i = caminho[caminho.length - 1];
  const lista = p ? (itemEm(doc, p) as Bloco).children : doc.items;
  const j = i + direcao;
  if (j < 0 || j >= lista.length) return { doc, foco: caminho };
  // Na raiz, o FINAL só troca de lugar com instrução: qualquer outra troca
  // poria algo que não é instrução depois dele.
  if (p === null) {
    const a = lista[i].type;
    const b = lista[j].type;
    if ((a === 'final' && b !== 'instruction') || (b === 'final' && a !== 'instruction')) return { doc, foco: caminho };
  }
  const novo = comIrmaos(doc, p, (l) => {
    const copia = [...l];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    return copia;
  });
  return { doc: novo, foco: [...(p ?? []), j] };
}

export function podeEnvolver(doc: GestureDocument, caminhos: Caminho[], espec: EspecDeBloco): string | null {
  if (!irmaosContiguos(caminhos)) return 'Selecione cartões vizinhos do mesmo bloco.';
  const itens = caminhos.map((c) => itemEm(doc, c));
  if (itens.some((i) => !i)) return 'Seleção inválida.';
  if (itens.some((i) => !ehFilhoDeBloco(i!))) return 'Instruções, texto livre e FINAL não entram em blocos.';
  const p = pai(caminhos[0]);
  if (espec.type === 'final') {
    if (p !== null) return 'FINAL só pode ficar na raiz.';
    if (indiceDoFinal(doc) >= 0) return 'Já existe um FINAL neste documento.';
    const ordenados = ordenar(caminhos);
    const inicio = ordenados[0][ordenados[0].length - 1];
    const fim = inicio + caminhos.length;
    if (doc.items.slice(fim).some((i) => i.type !== 'instruction')) return MENSAGENS.item_depois_do_final;
  }
  if (espec.type === 'link' && (caminhos.length < 2 || caminhos.length > 3)) return 'Um link liga 2 ou 3 cartões.';
  if (espec.type === 'repeat' && (!Number.isInteger(espec.count) || espec.count < 2)) return 'Repetir exige no mínimo 2 vezes.';
  const bloco = p ? itemEm(doc, p) : null;
  if (bloco && bloco.type === 'link') {
    const tamanho = bloco.children.length - caminhos.length + 1;
    if (tamanho < 2) return 'Isso deixaria o link com menos de 2 itens.';
  }
  return null;
}

export function envolver(doc: GestureDocument, caminhos: Caminho[], espec: EspecDeBloco): Resultado {
  const motivo = podeEnvolver(doc, caminhos, espec);
  if (motivo) throw new Error(motivo);
  const ordenados = ordenar(caminhos);
  const p = pai(ordenados[0]);
  const inicio = ordenados[0][ordenados[0].length - 1];
  const fim = inicio + ordenados.length;
  const novo = comIrmaos(doc, p, (lista) => {
    const filhos = lista.slice(inicio, fim) as BlockChild[];
    const bloco: Bloco =
      espec.type === 'repeat' ? { type: 'repeat', count: espec.count, children: filhos } : { type: espec.type, children: filhos };
    return [...lista.slice(0, inicio), bloco, ...lista.slice(fim)];
  });
  return { doc: novo, foco: [...(p ?? []), inicio] };
}

export function podeDesagrupar(doc: GestureDocument, caminho: Caminho): string | null {
  const item = itemEm(doc, caminho);
  if (!ehBloco(item)) return 'Só blocos podem ser desagrupados.';
  const p = pai(caminho);
  const bloco = p ? itemEm(doc, p) : null;
  if (bloco && bloco.type === 'link') {
    const tamanho = bloco.children.length - 1 + item.children.length;
    if (tamanho > 3) return 'Isso deixaria o link com mais de 3 itens.';
  }
  return null;
}

export function desagrupar(doc: GestureDocument, caminho: Caminho): Resultado {
  const motivo = podeDesagrupar(doc, caminho);
  if (motivo) throw new Error(motivo);
  const p = pai(caminho);
  const i = caminho[caminho.length - 1];
  const bloco = itemEm(doc, caminho) as Bloco;
  const novo = comIrmaos(doc, p, (lista) => [...lista.slice(0, i), ...bloco.children, ...lista.slice(i + 1)]);
  return { doc: novo, foco: [...(p ?? []), i] };
}

// ---------- conteúdo do cartão ----------

function soEm<T extends Item['type']>(tipo: T) {
  return (doc: GestureDocument, caminho: Caminho, fn: (item: Extract<Item, { type: T }>) => Item): Resultado => {
    const item = itemEm(doc, caminho);
    if (!item || item.type !== tipo) return { doc, foco: caminho };
    return { doc: comItem(doc, caminho, () => fn(item as Extract<Item, { type: T }>)), foco: caminho };
  };
}
const emGesto = soEm('gesture');

export function editarLinha(doc: GestureDocument, caminho: Caminho, indice: number, mudanca: Partial<LyricLine>): Resultado {
  return emGesto(doc, caminho, (g) => ({
    ...g,
    lyrics: g.lyrics.map((l, n) => (n === indice ? { ...l, ...mudanca } : l)),
  }));
}

export function adicionarLinha(doc: GestureDocument, caminho: Caminho): Resultado {
  return emGesto(doc, caminho, (g) => (g.lyrics.length >= 3 ? g : { ...g, lyrics: [...g.lyrics, { trigger: '', text: '' }] }));
}

export function removerLinha(doc: GestureDocument, caminho: Caminho, indice: number): Resultado {
  return emGesto(doc, caminho, (g) => (g.lyrics.length <= 1 ? g : { ...g, lyrics: g.lyrics.filter((_, n) => n !== indice) }));
}

export function trocarGesto(doc: GestureDocument, caminho: Caminho, gestureId: string): Resultado {
  return emGesto(doc, caminho, (g) => ({ ...g, gestureId }));
}

export function definirRepeticoes(doc: GestureDocument, caminho: Caminho, count: number): Resultado {
  return soEm('repeat')(doc, caminho, (r) => ({ ...r, count: Number.isInteger(count) && count >= 2 ? count : 2 }));
}

export function editarTexto(doc: GestureDocument, caminho: Caminho, text: string): Resultado {
  return soEm('text')(doc, caminho, (t) => ({ ...t, text }));
}

export function definirInstrucao(doc: GestureDocument, caminho: Caminho, kind: InstructionKind): Resultado {
  return soEm('instruction')(doc, caminho, (i) => ({ ...i, kind }));
}
