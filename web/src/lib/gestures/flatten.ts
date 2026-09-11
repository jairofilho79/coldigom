import type { Bloco, GestureDocument, Item } from './schema';

/** Índices de items e de cada children aninhado: [0, 2] = items[0].children[2]. */
export type Caminho = number[];

export type Cartao = {
  caminho: Caminho;
  item: Item;
  profundidade: number;
  /** Blocos ancestrais, do mais externo ao mais interno. */
  blocosAbertos: Bloco[];
};

function temFilhos(item: Item): item is Bloco {
  return 'children' in item;
}

/**
 * Projeção da árvore em lista, em pré-ordem. É o que o editor renderiza — mas o
 * que ele EDITA é a árvore, por caminho. Nunca guarde esta lista como estado.
 */
export function achatar(doc: GestureDocument): Cartao[] {
  const saida: Cartao[] = [];
  const visitar = (item: Item, caminho: Caminho, blocosAbertos: Bloco[]): void => {
    saida.push({ caminho, item, profundidade: blocosAbertos.length, blocosAbertos });
    if (temFilhos(item)) {
      item.children.forEach((f, i) => visitar(f, [...caminho, i], [...blocosAbertos, item]));
    }
  };
  doc.items.forEach((item, i) => visitar(item, [i], []));
  return saida;
}

export function itemEm(doc: GestureDocument, caminho: Caminho): Item | undefined {
  let lista: Item[] = doc.items;
  let atual: Item | undefined;
  for (const i of caminho) {
    atual = lista[i];
    if (!atual) return undefined;
    if (temFilhos(atual)) lista = atual.children;
    else lista = [];
  }
  return atual;
}

/** O mesmo formato do `path` que a API devolve — o editor foca o cartão do erro por ele. */
export function chaveDoCaminho(caminho: Caminho): string {
  return caminho.map((i, n) => (n === 0 ? `items[${i}]` : `.children[${i}]`)).join('');
}

/** Inverso de chaveDoCaminho; ignora sufixos como `.lyrics[2].trigger`. Sem `items[` na frente → null. */
export function caminhoDaChave(chave: string): Caminho | null {
  const m = chave.match(/^items\[(\d+)\]((?:\.children\[\d+\])*)/);
  if (!m) return null;
  const caminho = [Number(m[1])];
  for (const [, i] of m[2].matchAll(/\.children\[(\d+)\]/g)) caminho.push(Number(i));
  return caminho;
}

export function pai(caminho: Caminho): Caminho | null {
  return caminho.length <= 1 ? null : caminho.slice(0, -1);
}

export function ordenar(caminhos: Caminho[]): Caminho[] {
  return [...caminhos].sort((a, b) => {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] !== b[i]) return a[i] - b[i];
    }
    return a.length - b.length;
  });
}

/**
 * Seleção contígua entre irmãos do mesmo pai — é esta restrição que torna
 * "envolver" e "desagrupar" funções totais: nunca há seleção sem representação.
 */
export function irmaosContiguos(caminhos: Caminho[]): boolean {
  if (caminhos.length === 0) return false;
  const paiRef = JSON.stringify(pai(caminhos[0]));
  const profundidade = caminhos[0].length;
  const indices = caminhos.map((c) => c[c.length - 1]).sort((a, b) => a - b);
  for (const c of caminhos) {
    if (c.length !== profundidade || JSON.stringify(pai(c)) !== paiRef) return false;
  }
  return indices.every((v, i) => i === 0 || v === indices[i - 1] + 1);
}
