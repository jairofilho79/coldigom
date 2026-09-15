# Editor de gestos CIAs — plano do web

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O web do coldigom ganha o editor de documentos de gestos por louvor (com pré-visualização fiel às regras de desenho), a seção "Gestos CIAs" na tela do louvor, e as páginas do dicionário de gestos.

**Architecture:** O estado do editor **é** a árvore `GestureDocument`; `flatten.ts` deriva a lista de cartões com caminho, `edit.ts` opera sobre a árvore por caminho e devolve `{ doc, foco }`, `dictionary.ts` indexa e resolve alias. `schema.ts` é cópia declarada do da API e os testes leem as mesmas fixtures. `GestureDocumentView` é o único renderizador, com as cores em `regras.css`. Salvar manda `If-Match`; 412/409 viram o cartão de conflito.

**Tech Stack:** React 19, react-router-dom 7, Vite, vitest 4 + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-09-05-editor-de-gestos-design.md` — o plano argumenta a partir dela; leia as duas. **Pré-requisito:** o plano da API (`2026-09-05-editor-de-gestos-api.md`) executado até a Task 4 (fixtures em `api/src/gestures/__fixtures__/`, CORS expondo `ETag`).

## Global Constraints

- Testes, comentários, rótulos e mensagens em **português**; nomes em português como em `web/src/lib/chordpro/`.
- A catraca de cobertura (`web/vitest.config.ts`) nunca desce: hoje `statements: 79, branches: 72, functions: 76, lines: 81`.
- `web/src/lib/gestures/schema.ts` é **cópia byte a byte** de `api/src/gestures/schema.ts` (só o comentário de cabeçalho pode diferir). Se precisar mudar, mude nos dois.
- Cores e regras de desenho da spec, **verbatim**: papel `#FFFFFF`; gatilho `#D32F2F` negrito; leitura `#1A1A1A`; chave/`Nx`/`CORO`/chave tracejada `#1E63C8`; conector de link `#E08A1E`; divisor e rótulo `FINAL` `#6A2F2F`; instrução fundo `#F3F4F6`, texto `#374151`, borda `#D1D5DB`; gesto ausente fundo `#FFF7E6`, borda tracejada `#E0B45C`; texto livre `#6B7280` itálico. Figura 64 px no editor, 96 px no visualizador. Sem espaço antes de leitura que começa com `, . ; : ! ? ) ]`. Nunca quebrar linha dentro do gatilho. Coluna única, 720 px, título em caixa alta.
- **Sem visualizador de PDF** dentro do editor: "Abrir PDF de gestos" abre em aba nova.
- coldigom é ferramenta de gestão: densidade e CRUD ganham de conforto de leitura.
- Produção do web não importa nada de `../../api` (o `tsconfig.app.json` só inclui `src`); só os **testes** leem as fixtures da API por `fs`.
- Antes de dar uma fatia por pronta: `npm run verify` na raiz, verde, resultado colado no relatório.
- Commits terminam com `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `web/src/lib/gestures/schema.ts` (novo) | espelho do contrato e do validador |
| `web/src/lib/gestures/flatten.ts` (novo) | `Caminho`, `Cartao`, `achatar`, `itemEm`, `chaveDoCaminho`, `irmaosContiguos` |
| `web/src/lib/gestures/edit.ts` (novo) | operações imutáveis por caminho, todas devolvendo `{ doc, foco }` |
| `web/src/lib/gestures/dictionary.ts` (novo) | `indexar`, `resolver` (alias, 5 saltos), `buscar` |
| `web/src/components/gestures/regras.css` (novo) | as cores como custom properties e as regras de desenho |
| `web/src/components/gestures/GestureThumb.tsx` (novo) | figura ou placeholder de gesto ausente |
| `web/src/components/gestures/GestureDocumentView.tsx` (novo) | o renderizador (editor e qualquer outro lugar) |
| `web/src/components/gestures/GesturePicker.tsx` (novo) | diálogo de busca no dicionário |
| `web/src/components/gestures/GesturesEditor.tsx` (novo) | lista de cartões, seleção entre irmãos, barra de ações |
| `web/src/components/gestures/SecaoGestos.tsx` (novo) | a seção "Gestos CIAs" da tela do louvor |
| `web/src/components/ReviewSwitch.tsx` (novo) | extraído de `ChordProPage.tsx` sem mudança de comportamento |
| `web/src/pages/GesturesEditorPage.tsx`, `GestureDictionaryPage.tsx`, `GestureDetailPage.tsx` (novos) | as três páginas |
| `web/src/services/api.ts` | funções do dicionário, `putGesturesContent` com `If-Match`, `createMaterial` com `source_material_id` |
| `web/src/hooks/useMaterialContent.ts` | `ready` ganha `etag` |
| `web/src/lib/materials.ts`, `web/src/types/index.ts` | `'gestures'` como tipo conhecido, rótulo "Gestos CIAs" |
| `web/src/pages/PraiseDetailPage.tsx` | um import e um elemento (`<SecaoGestos>`), e `'gestures'` em `TIPOS_COM_SECAO_PROPRIA` |
| `web/src/App.tsx` | três rotas |
| `web/src/styles/global.css` | `@import` do `regras.css` e o CSS das telas (`ge-*`, `gd-*`) |

Fatia (d) = Tasks 1–5. Fatia (e) = Tasks 6–10. Fatia (f) = Task 11. Task 12 fecha a catraca.

---

### Task 1: Espelho do `schema.ts` e o teste que lê as fixtures da API

**Files:**
- Create: `web/src/lib/gestures/schema.ts`
- Test: `web/src/lib/gestures/__tests__/schema.test.ts`

**Interfaces:**
- Produces: exatamente o que `api/src/gestures/schema.ts` exporta — `validarDocumento`, `MENSAGENS`, `GESTURE_SCHEMA`, `GESTURE_ID_RE`, `MAX_GESTURES_DOCUMENT_BYTES`, `INSTRUCTION_KINDS` e os tipos `GestureDocument`, `Item`, `BlockChild`, `Bloco`, `GestureItem`, `LyricLine`, `RepeatBlock`, `ChorusBlock`, `LinkBlock`, `FinalBlock`, `InstructionItem`, `InstructionKind`, `TextItem`, `CodigoDeErro`, `ErroDeValidacao`, `ResultadoDaValidacao`.

- [ ] **Step 1: Escrever o teste**

`web/src/lib/gestures/__tests__/schema.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MENSAGENS, validarDocumento, type CodigoDeErro } from '../schema';

/**
 * Este arquivo é o espelho de api/src/gestures/schema.ts. O teste lê a MESMA
 * pasta de fixtures da API — por fs, não por import, para não arrastar arquivos
 * de fora de src/ pelo Vite. Comportamento igual sobre o mesmo corpo de casos é
 * o que segura o espelho.
 */
const FIXTURES = resolve(__dirname, '..', '..', '..', '..', '..', 'api', 'src', 'gestures', '__fixtures__');
const ler = (nome: string) => JSON.parse(readFileSync(resolve(FIXTURES, nome), 'utf8'));

const BASE = { type: 'gesture', gestureId: '000000000001', lyrics: [{ trigger: 'a', text: 'b' }] };
function expandir(valor: unknown): unknown {
  if (valor === 'BASE') return BASE;
  if (Array.isArray(valor)) return valor.map(expandir);
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, expandir(v)]));
  }
  return valor;
}

type CasoInvalido = { nome: string; doc: unknown; codigo: CodigoDeErro; caminho: string };

describe('validarDocumento (espelho do web) — fixtures da API', () => {
  it('aceita os documentos válidos', () => {
    expect(validarDocumento(ler('valido-exemplo.json')).ok).toBe(true);
    expect(validarDocumento(ler('valido-minimo.json')).ok).toBe(true);
  });

  for (const caso of ler('invalidos.json') as CasoInvalido[]) {
    it(`recusa: ${caso.nome} → ${caso.codigo} em "${caso.caminho}"`, () => {
      const r = validarDocumento(expandir(caso.doc));
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.erro.codigo).toBe(caso.codigo);
      expect(r.erro.caminho).toBe(caso.caminho);
      expect(MENSAGENS[r.erro.codigo]).toBeTruthy();
    });
  }
});

describe('o espelho é cópia da API', () => {
  it('o corpo dos dois arquivos é idêntico fora do comentário de cabeçalho', () => {
    const semCabecalho = (s: string) => s.replace(/^\/\*\*[\s\S]*?\*\/\s*/, '');
    const api = readFileSync(resolve(FIXTURES, '..', 'schema.ts'), 'utf8');
    const web = readFileSync(resolve(__dirname, '..', 'schema.ts'), 'utf8');
    expect(semCabecalho(web)).toBe(semCabecalho(api));
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd web && npx vitest run src/lib/gestures/__tests__/schema.test.ts`
Expected: FAIL — módulo `../schema` não existe.

- [ ] **Step 3: Copiar o arquivo da API**

```bash
mkdir -p web/src/lib/gestures
cp api/src/gestures/schema.ts web/src/lib/gestures/schema.ts
```

Depois troque **só** o comentário de cabeçalho (o primeiro bloco `/** … */`) por:

```ts
/**
 * ESPELHO de api/src/gestures/schema.ts — cópia byte a byte fora deste comentário.
 *
 * O servidor manda. Esta cópia existe para o revisor ver a recusa ANTES de gastar
 * rede, com a mesma frase que a API devolveria. Se um dia divergirem, o servidor
 * recusa e o usuário vê a recusa dele; o teste em __tests__/schema.test.ts compara
 * os dois arquivos e lê as fixtures da API para isso não acontecer em silêncio.
 */
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd web && npx vitest run src/lib/gestures/__tests__/schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/gestures/schema.ts web/src/lib/gestures/__tests__/schema.test.ts
git commit -m "feat(gestos/web): espelho do contrato e do validador, provado contra as fixtures da API"
```

---

### Task 2: `flatten.ts` — cartões com caminho

**Files:**
- Create: `web/src/lib/gestures/flatten.ts`
- Test: `web/src/lib/gestures/__tests__/flatten.test.ts`

**Interfaces:**
- `type Caminho = number[]` — índices de `items` e de cada `children` aninhado: `[0, 2]` é `items[0].children[2]`. Só blocos têm filhos, então o segmento `children` é implícito.
- `type Cartao = { caminho: Caminho; item: Item; profundidade: number; blocosAbertos: Bloco[] }` — `blocosAbertos` são os blocos ancestrais, do mais externo ao mais interno.
- `achatar(doc: GestureDocument): Cartao[]` — pré-ordem: o bloco vem antes dos filhos.
- `itemEm(doc, caminho): Item | undefined`
- `chaveDoCaminho(caminho): string` → `items[0].children[2]` (o mesmo formato do `path` que a API devolve, para o editor focar o cartão do erro).
- `caminhoDaChave(chave: string): Caminho | null` — o inverso.
- `pai(caminho): Caminho | null` — `[]` para a raiz é representado por `null`.
- `irmaosContiguos(caminhos: Caminho[]): boolean` — mesmo pai, índices consecutivos (em qualquer ordem de entrada).
- `ordenar(caminhos: Caminho[]): Caminho[]` — ordem do documento.

- [ ] **Step 1: Escrever o teste**

`web/src/lib/gestures/__tests__/flatten.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { GestureDocument } from '../schema';
import { achatar, caminhoDaChave, chaveDoCaminho, irmaosContiguos, itemEm, ordenar, pai } from '../flatten';

const FIXTURES = resolve(__dirname, '..', '..', '..', '..', '..', 'api', 'src', 'gestures', '__fixtures__');
const exemplo = JSON.parse(readFileSync(resolve(FIXTURES, 'valido-exemplo.json'), 'utf8')) as GestureDocument;

describe('achatar', () => {
  it('lista em pré-ordem, com o bloco antes dos filhos', () => {
    const cartoes = achatar(exemplo);
    expect(cartoes.map((c) => c.item.type)).toEqual([
      'coro', 'gesture', 'gesture', 'gesture', 'gesture', 'gesture',
      'repeat', 'gesture', 'link', 'gesture', 'gesture',
      'text', 'final', 'gesture', 'instruction', 'instruction',
    ]);
  });

  it('cada cartão carrega caminho, profundidade e blocos abertos', () => {
    const cartoes = achatar(exemplo);
    const dentroDoLink = cartoes[9];
    expect(dentroDoLink.caminho).toEqual([1, 1, 0]);
    expect(dentroDoLink.profundidade).toBe(2);
    expect(dentroDoLink.blocosAbertos.map((b) => b.type)).toEqual(['repeat', 'link']);
    expect(cartoes[0].profundidade).toBe(0);
    expect(cartoes[0].blocosAbertos).toEqual([]);
  });

  it('achatar → caminho → itemEm é identidade', () => {
    for (const c of achatar(exemplo)) expect(itemEm(exemplo, c.caminho)).toBe(c.item);
  });
});

describe('caminhos', () => {
  it('chaveDoCaminho usa o formato do path da API, e caminhoDaChave é o inverso', () => {
    expect(chaveDoCaminho([0])).toBe('items[0]');
    expect(chaveDoCaminho([1, 1, 0])).toBe('items[1].children[1].children[0]');
    expect(caminhoDaChave('items[1].children[1].children[0]')).toEqual([1, 1, 0]);
    expect(caminhoDaChave('items[0].lyrics[2].trigger')).toEqual([0]);
    expect(caminhoDaChave('')).toBeNull();
    expect(caminhoDaChave('schema')).toBeNull();
  });

  it('pai da raiz é null', () => {
    expect(pai([3])).toBeNull();
    expect(pai([1, 1, 0])).toEqual([1, 1]);
  });

  it('itemEm devolve undefined para caminho inexistente', () => {
    expect(itemEm(exemplo, [99])).toBeUndefined();
    expect(itemEm(exemplo, [2, 0])).toBeUndefined(); // items[2] é text, não tem filhos
  });
});

describe('irmaosContiguos', () => {
  it('aceita irmãos consecutivos em qualquer ordem', () => {
    expect(irmaosContiguos([[0, 2], [0, 0], [0, 1]])).toBe(true);
    expect(irmaosContiguos([[3]])).toBe(true);
  });

  it('recusa pais diferentes, buracos e lista vazia', () => {
    expect(irmaosContiguos([[0, 0], [1, 0]])).toBe(false);
    expect(irmaosContiguos([[0, 0], [0, 2]])).toBe(false);
    expect(irmaosContiguos([[0], [0, 0]])).toBe(false);
    expect(irmaosContiguos([])).toBe(false);
  });

  it('ordenar põe na ordem do documento', () => {
    expect(ordenar([[1, 1], [0], [1, 0], [1]])).toEqual([[0], [1], [1, 0], [1, 1]]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd web && npx vitest run src/lib/gestures/__tests__/flatten.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Escrever `flatten.ts`**

```ts
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd web && npx vitest run src/lib/gestures/__tests__/flatten.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/gestures/flatten.ts web/src/lib/gestures/__tests__/flatten.test.ts
git commit -m "feat(gestos/web): flatten — cartões com caminho, chave no formato da API, seleção entre irmãos"
```

---

### Task 3: `edit.ts` — operações imutáveis por caminho

**Files:**
- Create: `web/src/lib/gestures/edit.ts`
- Test: `web/src/lib/gestures/__tests__/edit.test.ts`

**Interfaces:**
- `type Resultado = { doc: GestureDocument; foco: Caminho | null }` — toda operação devolve documento **novo** e o caminho que deve ficar em foco.
- `type EspecDeBloco = { type: 'repeat'; count: number } | { type: 'coro' } | { type: 'link' } | { type: 'final' }`
- `novoGesto(gestureId: string): GestureItem` — `lyrics: [{ trigger: '', text: '' }]`
- `inserirApos(doc, caminho: Caminho | null, item: Item): Resultado` — `null` = fim da raiz. Item que só cabe na raiz (`instruction`, `text`, `final`) é inserido depois do ancestral de topo; item que não é `instruction` nunca cai depois do `FINAL`; link cheio (3) recebe o novo item **depois** do link, não dentro.
- `remover(doc, caminho): Resultado` — se esvaziar um `repeat`/`coro`/`final`, o bloco some; se deixar um `link` com 1 filho, o link se dissolve (o filho sobe). Foco: quem ocupa o índice agora, senão o irmão anterior, senão o pai.
- `mover(doc, caminho, direcao: -1 | 1): Resultado` — troca com o irmão; na borda, não faz nada.
- `podeEnvolver(doc, caminhos, espec): string | null` — o motivo em português, ou `null` se pode.
- `envolver(doc, caminhos, espec): Resultado` — lança `Error(motivo)` se `podeEnvolver` recusar. Foco: o bloco novo.
- `podeDesagrupar(doc, caminho): string | null` e `desagrupar(doc, caminho): Resultado` — os filhos sobem para o lugar do bloco. Foco: o primeiro filho.
- `editarLinha(doc, caminho, indice, mudanca: Partial<LyricLine>)`, `adicionarLinha(doc, caminho)` (teto 3), `removerLinha(doc, caminho, indice)` (piso 1), `trocarGesto(doc, caminho, gestureId)`, `definirRepeticoes(doc, caminho, count)` (piso 2), `editarTexto(doc, caminho, text)`, `definirInstrucao(doc, caminho, kind)` — todas `Resultado`, foco no próprio cartão.

**Os quatro invariantes** (cobrados no teste): documento novo a cada operação; entrada válida ⇒ saída válida; seleção só entre irmãos contíguos; `final` e `instruction` só na raiz.

- [ ] **Step 1: Escrever o teste**

`web/src/lib/gestures/__tests__/edit.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { validarDocumento, type GestureDocument, type Item } from '../schema';
import { achatar, itemEm } from '../flatten';
import {
  adicionarLinha, definirInstrucao, definirRepeticoes, desagrupar, editarLinha, editarTexto, envolver,
  inserirApos, mover, novoGesto, podeDesagrupar, podeEnvolver, remover, removerLinha, trocarGesto,
} from '../edit';

const FIXTURES = resolve(__dirname, '..', '..', '..', '..', '..', 'api', 'src', 'gestures', '__fixtures__');
const ler = (n: string) => JSON.parse(readFileSync(resolve(FIXTURES, n), 'utf8')) as GestureDocument;
const exemplo = ler('valido-exemplo.json');
const minimo = ler('valido-minimo.json');
const valido = (doc: GestureDocument) => expect(validarDocumento(doc)).toMatchObject({ ok: true });

describe('envolver', () => {
  it('três cartões vizinhos viram { type: "repeat", count: 2, children: [...] }', () => {
    // o critério de aceite: os 3 primeiros gestos do coro em "Repetir 2x"
    const { doc, foco } = envolver(exemplo, [[0, 0], [0, 1], [0, 2]], { type: 'repeat', count: 2 });
    const bloco = itemEm(doc, [0, 0]);
    expect(bloco).toMatchObject({ type: 'repeat', count: 2 });
    expect((bloco as { children: Item[] }).children).toHaveLength(3);
    expect((bloco as { children: Item[] }).children[0]).toBe(exemplo.items[0] && (exemplo.items[0] as { children: Item[] }).children[0]);
    expect((itemEm(doc, [0]) as { children: Item[] }).children).toHaveLength(3); // 1 repeat + 2 gestos
    expect(foco).toEqual([0, 0]);
    expect(doc).not.toBe(exemplo);
    valido(doc);
  });

  it('aceita a seleção em qualquer ordem', () => {
    const { doc } = envolver(exemplo, [[0, 2], [0, 0], [0, 1]], { type: 'coro' });
    expect(itemEm(doc, [0, 0])).toMatchObject({ type: 'coro' });
    valido(doc);
  });

  it('recusa seleção que não é de irmãos contíguos', () => {
    expect(podeEnvolver(exemplo, [[0, 0], [0, 2]], { type: 'coro' })).toMatch(/vizinhos/);
    expect(podeEnvolver(exemplo, [[0, 0], [1, 0]], { type: 'coro' })).toMatch(/vizinhos/);
    expect(() => envolver(exemplo, [[0, 0], [0, 2]], { type: 'coro' })).toThrow(/vizinhos/);
  });

  it('recusa instrução, texto livre e FINAL dentro de bloco', () => {
    expect(podeEnvolver(exemplo, [[2]], { type: 'coro' })).toMatch(/não entram/);
    expect(podeEnvolver(exemplo, [[4]], { type: 'repeat', count: 2 })).toMatch(/não entram/);
    expect(podeEnvolver(exemplo, [[3]], { type: 'coro' })).toMatch(/não entram/);
  });

  it('FINAL só na raiz e só um', () => {
    expect(podeEnvolver(exemplo, [[0, 0]], { type: 'final' })).toMatch(/raiz/);
    expect(podeEnvolver(exemplo, [[1]], { type: 'final' })).toMatch(/Já existe/);
    const { doc } = envolver(minimo, [[0]], { type: 'final' });
    expect(doc.items[0]).toMatchObject({ type: 'final' });
    valido(doc);
  });

  it('link exige 2 ou 3 cartões, e repetir exige count >= 2', () => {
    expect(podeEnvolver(exemplo, [[0, 0]], { type: 'link' })).toMatch(/2 ou 3/);
    expect(podeEnvolver(exemplo, [[0, 0], [0, 1], [0, 2], [0, 3]], { type: 'link' })).toMatch(/2 ou 3/);
    expect(podeEnvolver(exemplo, [[0, 0], [0, 1]], { type: 'repeat', count: 1 })).toMatch(/mínimo 2/);
  });

  it('não deixa um link com menos de 2 itens ao envolver parte dele', () => {
    // items[1].children[1] é um link com 2 filhos; envolver um deles deixaria o link com 1
    expect(podeEnvolver(exemplo, [[1, 1, 0]], { type: 'coro' })).toBeNull(); // 2 - 1 + 1 = 2, ainda válido
    const tres = envolver(exemplo, [[0, 0], [0, 1], [0, 2]], { type: 'link' }).doc; // link de 3 no coro
    expect(podeEnvolver(tres, [[0, 0, 0], [0, 0, 1]], { type: 'coro' })).toBeNull(); // 3 - 2 + 1 = 2
    expect(podeEnvolver(tres, [[0, 0, 0], [0, 0, 1], [0, 0, 2]], { type: 'coro' })).toMatch(/link/); // 3 - 3 + 1 = 1
  });
});

describe('desagrupar', () => {
  it('os filhos sobem para o lugar do bloco', () => {
    const { doc, foco } = desagrupar(exemplo, [0]);
    expect(doc.items.slice(0, 5).every((i) => i.type === 'gesture')).toBe(true);
    expect(doc.items).toHaveLength(exemplo.items.length + 4);
    expect(foco).toEqual([0]);
    valido(doc);
  });

  it('recusa cartão que não é bloco e link que ficaria fora de 2..3', () => {
    expect(podeDesagrupar(exemplo, [0, 0])).toMatch(/blocos/);
    const doc = envolver(exemplo, [[1, 1, 0]], { type: 'coro' }).doc; // link: [coro(1), gesto]
    const depois = envolver(doc, [[1, 1, 0, 0]], { type: 'repeat', count: 2 }).doc; // coro: [repeat: [gesto]]
    // desagrupar o coro dentro do link deixaria o link com 2 (repeat, gesto): ok
    expect(podeDesagrupar(depois, [1, 1, 0])).toBeNull();
    // FINAL na raiz desagrupa normalmente
    expect(podeDesagrupar(exemplo, [3])).toBeNull();
    valido(desagrupar(exemplo, [3]).doc);
  });
});

describe('remover', () => {
  it('foca quem ocupa o índice, senão o anterior, senão o pai', () => {
    expect(remover(exemplo, [0, 0]).foco).toEqual([0, 0]);
    expect(remover(exemplo, [0, 4]).foco).toEqual([0, 3]);
    expect(remover(exemplo, [3, 0]).foco).toEqual([3]); // final esvaziou e sumiu; foco em quem ocupa o índice 3 agora
    valido(remover(exemplo, [3, 0]).doc);
  });

  it('esvaziar um bloco remove o bloco; deixar um link com 1 dissolve o link', () => {
    const semFinal = remover(exemplo, [3, 0]).doc;
    expect(semFinal.items.some((i) => i.type === 'final')).toBe(false);
    const semUmDoLink = remover(exemplo, [1, 1, 0]).doc;
    expect(itemEm(semUmDoLink, [1, 1])).toMatchObject({ type: 'gesture', gestureId: 'deadbeef0004' });
    valido(semUmDoLink);
  });

  it('remover o último gesto do documento é permitido (o editor barra o salvar)', () => {
    const { doc } = remover(minimo, [0]);
    expect(doc.items).toEqual([]);
  });
});

describe('inserirApos e mover', () => {
  it('insere depois do cartão, dentro do mesmo pai', () => {
    const { doc, foco } = inserirApos(exemplo, [0, 1], novoGesto('aaaaaaaaaaaa'));
    expect(itemEm(doc, [0, 2])).toMatchObject({ gestureId: 'aaaaaaaaaaaa' });
    expect(foco).toEqual([0, 2]);
    valido(doc);
  });

  it('null insere no fim da raiz; instrução vai para a raiz mesmo com foco aninhado', () => {
    expect(inserirApos(exemplo, null, { type: 'instruction', kind: 'instruments' }).foco).toEqual([6]);
    const { doc, foco } = inserirApos(exemplo, [0, 1], { type: 'text', text: 'x' });
    expect(foco).toEqual([1]);
    expect(doc.items[1]).toMatchObject({ type: 'text' });
    valido(doc);
  });

  it('gesto nunca cai depois do FINAL; link cheio recebe depois do link', () => {
    const { doc, foco } = inserirApos(exemplo, [4], novoGesto('aaaaaaaaaaaa'));
    expect(foco).toEqual([3]); // antes do final, que agora é items[4]
    expect(doc.items[4]).toMatchObject({ type: 'final' });
    valido(doc);
    const cheio = envolver(exemplo, [[0, 0], [0, 1], [0, 2]], { type: 'link' }).doc;
    const r = inserirApos(cheio, [0, 0, 2], novoGesto('aaaaaaaaaaaa'));
    expect(r.foco).toEqual([0, 1]);
    valido(r.doc);
  });

  it('mover troca com o irmão e não faz nada na borda', () => {
    const { doc, foco } = mover(exemplo, [0, 0], 1);
    expect(itemEm(doc, [0, 1])).toBe((exemplo.items[0] as { children: Item[] }).children[0]);
    expect(foco).toEqual([0, 1]);
    const borda = mover(exemplo, [0, 0], -1);
    expect(borda.doc).toBe(exemplo);
    expect(borda.foco).toEqual([0, 0]);
  });
});

describe('edição do cartão', () => {
  it('linhas: editar, adicionar até 3, remover até 1', () => {
    let doc = editarLinha(minimo, [0], 0, { trigger: 'Só' }).doc;
    expect(itemEm(doc, [0])).toMatchObject({ lyrics: [{ trigger: 'Só', text: 'só leitura' }] });
    doc = adicionarLinha(doc, [0]).doc;
    doc = adicionarLinha(doc, [0]).doc;
    doc = adicionarLinha(doc, [0]).doc; // 4ª não entra
    expect((itemEm(doc, [0]) as { lyrics: unknown[] }).lyrics).toHaveLength(3);
    doc = removerLinha(doc, [0], 2).doc;
    doc = removerLinha(doc, [0], 1).doc;
    doc = removerLinha(doc, [0], 0).doc; // a última não sai
    expect((itemEm(doc, [0]) as { lyrics: unknown[] }).lyrics).toHaveLength(1);
    valido(doc);
  });

  it('trocarGesto, definirRepeticoes (piso 2), editarTexto e definirInstrucao', () => {
    expect(itemEm(trocarGesto(exemplo, [0, 0], 'bbbbbbbbbbbb').doc, [0, 0])).toMatchObject({ gestureId: 'bbbbbbbbbbbb' });
    expect(itemEm(definirRepeticoes(exemplo, [1], 1).doc, [1])).toMatchObject({ count: 2 });
    expect(itemEm(definirRepeticoes(exemplo, [1], 4).doc, [1])).toMatchObject({ count: 4 });
    expect(itemEm(editarTexto(exemplo, [2], 'novo').doc, [2])).toMatchObject({ text: 'novo' });
    expect(itemEm(definirInstrucao(exemplo, [4], 'instruments').doc, [4])).toMatchObject({ kind: 'instruments' });
  });
});

describe('invariantes sobre o corpo de fixtures', () => {
  it('toda operação devolve documento novo e válido, e nunca muda o original', () => {
    for (const base of [exemplo, minimo]) {
      const congelado = JSON.stringify(base);
      const cartoes = achatar(base);
      for (const c of cartoes) {
        const ops = [
          () => remover(base, c.caminho),
          () => mover(base, c.caminho, 1),
          () => mover(base, c.caminho, -1),
          () => inserirApos(base, c.caminho, { ...novoGesto('cccccccccccc'), lyrics: [{ trigger: 'x', text: '' }] }),
          () => inserirApos(base, c.caminho, { type: 'instruction', kind: 'repeat_praise' }),
          () => (podeEnvolver(base, [c.caminho], { type: 'coro' }) ? null : envolver(base, [c.caminho], { type: 'coro' })),
          () => (podeDesagrupar(base, c.caminho) ? null : desagrupar(base, c.caminho)),
        ];
        for (const op of ops) {
          const r = op();
          if (!r) continue;
          expect(r.doc).not.toBe(base);
          // remover pode deixar o documento sem gesto (o editor barra o salvar); fora isso, válido
          const v = validarDocumento(r.doc);
          if (!v.ok) expect(v.erro.codigo).toMatch(/^(sem_gesto|itens_vazios)$/);
        }
      }
      expect(JSON.stringify(base)).toBe(congelado);
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd web && npx vitest run src/lib/gestures/__tests__/edit.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Escrever `edit.ts`**

```ts
import type { BlockChild, Bloco, GestureDocument, GestureItem, InstructionKind, Item, LyricLine } from './schema';
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd web && npx vitest run src/lib/gestures/__tests__/edit.test.ts`
Expected: PASS. Se um caso de `foco` divergir por um índice, confira o teste contra a regra escrita na interface antes de mexer no código — o teste é a especificação do foco.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/gestures/edit.ts web/src/lib/gestures/__tests__/edit.test.ts
git commit -m "feat(gestos/web): edit — operações imutáveis por caminho que preservam a validade do documento"
```

---

### Task 4: `dictionary.ts` — índice, alias e busca

**Files:**
- Create: `web/src/lib/gestures/dictionary.ts`
- Test: `web/src/lib/gestures/__tests__/dictionary.test.ts`

**Interfaces:**
- `type GestureEntry`, `type GestureDictionary` — o contrato da spec (copiado aqui; o web não importa da API).
- `type Indice = { version: number; porId: Map<string, GestureEntry>; ativos: GestureEntry[] }`
- `indexar(dic: GestureDictionary): Indice`
- `type Resolucao = { ok: true; entrada: GestureEntry; idFinal: string; viaAlias: boolean } | { ok: false; motivo: 'ausente' | 'ciclo' | 'estouro'; idFinal: string }`
- `resolver(indice: Indice, id: string): Resolucao` — segue `replacedBy` no máximo `MAX_SALTOS = 5` vezes.
- `normalizar(s: string): string` — minúsculas, sem acento, sem espaço nas pontas.
- `buscar(indice, termo, limite = 20): GestureEntry[]` — só ativos; casa por prefixo de palavra em `name` e `exampleTriggers`; termo vazio devolve os primeiros `limite` por nome.

- [ ] **Step 1: Escrever o teste**

`web/src/lib/gestures/__tests__/dictionary.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { MAX_SALTOS, buscar, indexar, normalizar, resolver, type GestureDictionary, type GestureEntry } from '../dictionary';

const entrada = (id: string, extra: Partial<GestureEntry> = {}): GestureEntry => ({
  id, name: id, description: '', exampleTriggers: [], image: `assets/cia/gestures/${id}.png`, gif: null,
  status: 'active', replacedBy: null, updatedAt: 't', ...extra,
});

const dic: GestureDictionary = {
  schema: 'coldigom.gesture-dictionary/1',
  version: 4,
  generatedAt: 't',
  gestures: [
    entrada('aaaaaaaaaaaa', { name: 'Quero', exampleTriggers: ['Quero', 'Desejo'] }),
    entrada('bbbbbbbbbbbb', { name: 'Viver', exampleTriggers: ['viver', 'vida'] }),
    entrada('cccccccccccc', { name: 'Coração', exampleTriggers: ['coração'] }),
    entrada('111111111111', { name: 'Velho', status: 'deprecated', replacedBy: 'aaaaaaaaaaaa' }),
    entrada('222222222222', { name: 'Mais velho', status: 'deprecated', replacedBy: '111111111111' }),
    entrada('333333333333', { name: 'Ciclo A', status: 'deprecated', replacedBy: '444444444444' }),
    entrada('444444444444', { name: 'Ciclo B', status: 'deprecated', replacedBy: '333333333333' }),
    entrada('999999999999', { name: 'Solto', status: 'deprecated', replacedBy: 'nao-existe-0' }),
  ],
};

describe('indexar', () => {
  it('guarda a versão, o mapa por id e só os ativos na lista', () => {
    const i = indexar(dic);
    expect(i.version).toBe(4);
    expect(i.porId.size).toBe(8);
    expect(i.ativos.map((g) => g.name)).toEqual(['Coração', 'Quero', 'Viver']);
  });
});

describe('resolver', () => {
  const i = indexar(dic);

  it('ativo resolve para ele mesmo', () => {
    expect(resolver(i, 'aaaaaaaaaaaa')).toEqual({ ok: true, entrada: i.porId.get('aaaaaaaaaaaa'), idFinal: 'aaaaaaaaaaaa', viaAlias: false });
  });

  it('segue a cadeia de replacedBy até o ativo', () => {
    const r = resolver(i, '222222222222');
    expect(r).toMatchObject({ ok: true, idFinal: 'aaaaaaaaaaaa', viaAlias: true });
  });

  it('ausente, ciclo e alvo inexistente falham com motivo', () => {
    expect(resolver(i, 'nao-existe-0')).toEqual({ ok: false, motivo: 'ausente', idFinal: 'nao-existe-0' });
    expect(resolver(i, '333333333333')).toMatchObject({ ok: false, motivo: 'ciclo' });
    expect(resolver(i, '999999999999')).toEqual({ ok: false, motivo: 'ausente', idFinal: 'nao-existe-0' });
  });

  it('estoura em 5 saltos', () => {
    const longa: GestureDictionary = { ...dic, gestures: [entrada('ffffffffffff')] };
    for (let n = 0; n <= MAX_SALTOS; n++) {
      const id = `${n}`.repeat(12);
      const proximo = n === MAX_SALTOS ? 'ffffffffffff' : `${n + 1}`.repeat(12);
      longa.gestures.push(entrada(id, { status: 'deprecated', replacedBy: proximo }));
    }
    // 0→1→2→3→4→5→f: 6 saltos
    expect(resolver(indexar(longa), '000000000000')).toMatchObject({ ok: false, motivo: 'estouro' });
    // 1→2→3→4→5→f: 5 saltos, no limite
    expect(resolver(indexar(longa), '111111111111')).toMatchObject({ ok: true, idFinal: 'ffffffffffff' });
  });
});

describe('buscar', () => {
  const i = indexar(dic);

  it('ignora acento e caixa, casa por prefixo de palavra no nome e nos exemplos', () => {
    expect(normalizar('  Coração ')).toBe('coracao');
    expect(buscar(i, 'cora').map((g) => g.name)).toEqual(['Coração']);
    expect(buscar(i, 'VID').map((g) => g.name)).toEqual(['Viver']);
    expect(buscar(i, 'desej').map((g) => g.name)).toEqual(['Quero']);
  });

  it('não devolve depreciados, e termo vazio lista por nome até o limite', () => {
    expect(buscar(i, 'velho')).toEqual([]);
    expect(buscar(i, '', 2).map((g) => g.name)).toEqual(['Coração', 'Quero']);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd web && npx vitest run src/lib/gestures/__tests__/dictionary.test.ts`
Expected: FAIL.

- [ ] **Step 3: Escrever `dictionary.ts`**

```ts
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
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function buscar(indice: Indice, termo: string, limite = 20): GestureEntry[] {
  const t = normalizar(termo);
  if (!t) return indice.ativos.slice(0, limite);
  const casa = (texto: string) => normalizar(texto).split(/\s+/).some((palavra) => palavra.startsWith(t));
  return indice.ativos.filter((g) => casa(g.name) || g.exampleTriggers.some(casa)).slice(0, limite);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd web && npx vitest run src/lib/gestures/__tests__/dictionary.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/gestures/dictionary.ts web/src/lib/gestures/__tests__/dictionary.test.ts
git commit -m "feat(gestos/web): dictionary — índice, cadeia de alias com teto e busca sem acento"
```

---

### Task 5: `regras.css`, `GestureThumb` e `GestureDocumentView`

**Files:**
- Create: `web/src/components/gestures/regras.css`
- Create: `web/src/components/gestures/GestureThumb.tsx`
- Create: `web/src/components/gestures/GestureDocumentView.tsx`
- Modify: `web/src/styles/global.css:5` (acrescentar `@import '../components/gestures/regras.css';` logo após o `@import` existente — `@import` precisa vir antes de qualquer regra)
- Test: `web/src/components/gestures/__tests__/GestureDocumentView.test.tsx`

**Interfaces:**
- `GestureThumb({ id, indice, tamanho }: { id: string; indice: Indice | null; tamanho: 64 | 96 })` — `<img>` com `getAssetUrl(entrada.image)` e `alt={entrada.name}`; classe `gv-figura--alias` quando resolvido por `replacedBy`; sem dicionário ou gesto ausente → `<div class="gv-figura gv-figura--ausente" role="img" aria-label="Gesto não encontrado no dicionário">`.
- `GestureDocumentView({ doc, indice, tamanhoDaFigura = 96, emFoco, onClicarCartao })` — `emFoco?: string` é a chave do caminho (`chaveDoCaminho`); cada cartão tem `data-caminho={chave}`; `onClicarCartao?: (chave: string) => void`.
- `ROTULOS_DE_INSTRUCAO: Record<InstructionKind, string>` exportado — `instruments: 'Instrumentos'`, `repeat_praise: 'Repetir o louvor'`, `back_to_chorus: 'Voltar ao coro'`, `back_to_chorus_and_finish: 'Voltar ao coro e finalizar'`.
- `separadorDaLinha(text: string): '' | ' '` exportado — `''` se `text` começa com `, . ; : ! ? ) ]`.
- Item de tipo desconhecido (vindo de um documento futuro) renderiza como texto livre.

- [ ] **Step 1: Escrever o teste**

`web/src/components/gestures/__tests__/GestureDocumentView.test.tsx`:

```tsx
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { GestureDocument } from '../../../lib/gestures/schema';
import { indexar } from '../../../lib/gestures/dictionary';
import { GestureDocumentView, separadorDaLinha } from '../GestureDocumentView';

const FIXTURES = resolve(__dirname, '..', '..', '..', '..', '..', 'api', 'src', 'gestures', '__fixtures__');
const exemplo = JSON.parse(readFileSync(resolve(FIXTURES, 'valido-exemplo.json'), 'utf8')) as GestureDocument;

const indice = indexar({
  schema: 'coldigom.gesture-dictionary/1',
  version: 1,
  generatedAt: 't',
  gestures: [
    { id: 'c687580e7682', name: 'Quero', description: '', exampleTriggers: [], image: 'assets/cia/gestures/c687580e7682.png', gif: null, status: 'active', replacedBy: null, updatedAt: 't' },
    { id: 'deadbeef0005', name: 'Amém velho', description: '', exampleTriggers: [], image: 'assets/cia/gestures/deadbeef0005.png', gif: null, status: 'deprecated', replacedBy: 'c687580e7682', updatedAt: 't' },
  ],
});

describe('GestureDocumentView — o exemplo da spec', () => {
  it('desenha o CORO com chave tracejada sobre os 5 primeiros cartões', () => {
    const { container } = render(<GestureDocumentView doc={exemplo} indice={indice} />);
    const coro = container.querySelector('.gv-coro')!;
    expect(coro.querySelector('.gv-rotulo')?.textContent).toBe('CORO');
    expect(coro.querySelectorAll(':scope > .gv-filhos > .gv-gesto')).toHaveLength(5);
    expect(coro.querySelector('.gv-chave--tracejada')).not.toBeNull();
  });

  it('gatilho em negrito vermelho por classe, leitura ao lado, sem espaço antes de vírgula', () => {
    const { container } = render(<GestureDocumentView doc={exemplo} indice={indice} />);
    const linhas = container.querySelectorAll('.gv-coro .gv-gesto')[1].querySelectorAll('.gv-linha');
    expect(linhas[0].querySelector('.gv-gatilho')?.textContent).toBe('viver');
    expect(linhas[0].textContent).toBe('viver, viver com Ele');
    const primeiro = container.querySelector('.gv-coro .gv-gesto .gv-linha')!;
    expect(primeiro.textContent).toBe('Quero viver pra sempre com Jesus');
  });

  it('linha de continuação (trigger vazio) sai só com a leitura', () => {
    const { container } = render(<GestureDocumentView doc={exemplo} indice={indice} />);
    const terceiro = container.querySelectorAll('.gv-coro .gv-gesto')[2];
    const linhas = terceiro.querySelectorAll('.gv-linha');
    expect(linhas).toHaveLength(2);
    expect(linhas[1].querySelector('.gv-gatilho')).toBeNull();
    expect(linhas[1].textContent).toBe('e na terra também');
  });

  it('repetição com Nx, link com conector, FINAL com divisor, duas instruções e o texto livre', () => {
    const { container } = render(<GestureDocumentView doc={exemplo} indice={indice} />);
    expect(container.querySelector('.gv-repeat .gv-vezes')?.textContent).toBe('2x');
    expect(container.querySelector('.gv-repeat .gv-link .gv-conector')).not.toBeNull();
    expect(container.querySelector('.gv-final .gv-divisor')?.textContent).toBe('FINAL');
    expect(screen.getByText('Voltar ao coro')).toHaveClass('gv-instrucao');
    expect(screen.getByText('Voltar ao coro e finalizar')).toHaveClass('gv-instrucao');
    expect(screen.getByText('(pausa para os instrumentos)')).toHaveClass('gv-texto');
  });

  it('título em caixa alta no topo', () => {
    render(<GestureDocumentView doc={exemplo} indice={indice} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('182 - QUERO VIVER PRA SEMPRE COM JESUS');
  });

  it('figura do dicionário quando existe; placeholder de gesto ausente quando não; alias usa a figura do substituto', () => {
    const { container } = render(<GestureDocumentView doc={exemplo} indice={indice} />);
    const figuras = container.querySelectorAll('.gv-gesto');
    expect(figuras[0].querySelector('img')?.getAttribute('src')).toContain('assets/cia/gestures/c687580e7682.png');
    expect(figuras[1].querySelector('.gv-figura--ausente')).not.toBeNull();
    const amem = container.querySelector('.gv-final .gv-gesto')!;
    expect(amem.querySelector('img')?.getAttribute('src')).toContain('c687580e7682.png');
    expect(amem.querySelector('img')).toHaveClass('gv-figura--alias');
  });

  it('sem dicionário, todo gesto é placeholder — e o documento ainda renderiza', () => {
    const { container } = render(<GestureDocumentView doc={exemplo} indice={null} />);
    expect(container.querySelectorAll('.gv-figura--ausente')).toHaveLength(9);
  });

  it('tamanho da figura: 96 por padrão, 64 no editor', () => {
    const a = render(<GestureDocumentView doc={exemplo} indice={indice} />);
    expect(a.container.querySelector('.gv-gesto img')).toHaveAttribute('width', '96');
    a.unmount();
    const b = render(<GestureDocumentView doc={exemplo} indice={indice} tamanhoDaFigura={64} />);
    expect(b.container.querySelector('.gv-gesto img')).toHaveAttribute('width', '64');
  });

  it('cada cartão carrega data-caminho, o em foco ganha classe, e clicar avisa', () => {
    const cliques: string[] = [];
    const { container } = render(
      <GestureDocumentView doc={exemplo} indice={indice} emFoco="items[1].children[1].children[0]" onClicarCartao={(c) => cliques.push(c)} />
    );
    const alvo = container.querySelector('[data-caminho="items[1].children[1].children[0]"]')!;
    expect(alvo).toHaveClass('is-foco');
    (alvo as HTMLElement).click();
    expect(cliques).toEqual(['items[1].children[1].children[0]']);
  });

  it('tipo desconhecido renderiza como texto livre', () => {
    const doc = { ...exemplo, items: [...exemplo.items, { type: 'novo', text: 'do futuro' }] } as unknown as GestureDocument;
    render(<GestureDocumentView doc={doc} indice={indice} />);
    expect(screen.getByText('do futuro')).toHaveClass('gv-texto');
  });
});

describe('separadorDaLinha', () => {
  it('sem espaço antes de , . ; : ! ? ) ]', () => {
    for (const ch of [',', '.', ';', ':', '!', '?', ')', ']']) expect(separadorDaLinha(`${ch}x`)).toBe('');
    expect(separadorDaLinha('viver')).toBe(' ');
    expect(separadorDaLinha('')).toBe('');
  });
});

describe('regras.css — as cores da spec, verbatim', () => {
  it('cada cor está declarada como custom property com o tom exato', () => {
    const css = readFileSync(resolve(__dirname, '..', 'regras.css'), 'utf8');
    for (const [prop, cor] of [
      ['--gesto-papel', '#FFFFFF'], ['--gesto-gatilho', '#D32F2F'], ['--gesto-leitura', '#1A1A1A'],
      ['--gesto-bloco', '#1E63C8'], ['--gesto-conector-link', '#E08A1E'], ['--gesto-final', '#6A2F2F'],
      ['--gesto-instrucao-fundo', '#F3F4F6'], ['--gesto-instrucao-texto', '#374151'], ['--gesto-instrucao-borda', '#D1D5DB'],
      ['--gesto-ausente-fundo', '#FFF7E6'], ['--gesto-ausente-borda', '#E0B45C'], ['--gesto-texto-livre', '#6B7280'],
    ]) {
      expect(css, prop).toMatch(new RegExp(`${prop}:\\s*${cor};`, 'i'));
    }
    expect(css).toMatch(/max-width:\s*720px/);
    expect(css).toMatch(/\.gv-gatilho\s*{[^}]*white-space:\s*nowrap/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd web && npx vitest run src/components/gestures/__tests__/GestureDocumentView.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Escrever `regras.css`**

```css
/*
 * Regras de desenho do documento de gestos — seção 4 da spec, verbatim.
 * As cores são custom properties nomeadas pela FUNÇÃO, não pelo tom. O app
 * Flutter desenha o mesmo documento com esta mesma tabela; mudar um valor aqui
 * é mudar a spec, e a spec manda parar e avisar.
 */
.gv-papel {
  --gesto-papel: #FFFFFF;
  --gesto-gatilho: #D32F2F;
  --gesto-leitura: #1A1A1A;
  --gesto-bloco: #1E63C8;
  --gesto-conector-link: #E08A1E;
  --gesto-final: #6A2F2F;
  --gesto-instrucao-fundo: #F3F4F6;
  --gesto-instrucao-texto: #374151;
  --gesto-instrucao-borda: #D1D5DB;
  --gesto-ausente-fundo: #FFF7E6;
  --gesto-ausente-borda: #E0B45C;
  --gesto-texto-livre: #6B7280;

  background: var(--gesto-papel);
  color: var(--gesto-leitura);
  max-width: 720px;
  margin: 0 auto;
  padding: 24px 20px 40px;
  font-family: Georgia, 'Times New Roman', serif;
  line-height: 1.35;
}
.gv-titulo {
  margin: 0 0 16px;
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

/* cartão de gesto: figura quadrada à esquerda, letras à direita, alinhados ao topo */
.gv-gesto {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 6px 4px;
  border-radius: 4px;
  cursor: default;
}
.gv-gesto.is-foco,
.gv-instrucao.is-foco,
.gv-texto.is-foco,
.gv-bloco.is-foco > .gv-filhos {
  outline: 2px solid var(--gesto-bloco);
  outline-offset: 2px;
}
.gv-figura {
  flex: 0 0 auto;
  object-fit: contain;
  background: var(--gesto-papel);
}
.gv-figura--ausente {
  display: grid;
  place-items: center;
  background: var(--gesto-ausente-fundo);
  border: 2px dashed var(--gesto-ausente-borda);
  border-radius: 4px;
  color: var(--gesto-ausente-borda);
  font-weight: 700;
}
.gv-figura--alias { outline: 1px dotted var(--gesto-bloco); }
.gv-letras { flex: 1 1 auto; min-width: 0; padding-top: 2px; }
.gv-linha { margin: 0; }
.gv-gatilho {
  color: var(--gesto-gatilho);
  font-weight: 700;
  white-space: nowrap;
}
.gv-leitura { color: var(--gesto-leitura); }

/* blocos */
.gv-bloco { position: relative; margin: 6px 0; }
.gv-filhos { display: flex; flex-direction: column; gap: 2px; }
.gv-filhos--colados { gap: 0; }
.gv-repeat > .gv-filhos,
.gv-coro > .gv-filhos {
  padding-right: 44px;
}
.gv-chave {
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  width: 36px;
  border-right: 3px solid var(--gesto-bloco);
  border-top: 3px solid var(--gesto-bloco);
  border-bottom: 3px solid var(--gesto-bloco);
  border-radius: 0 8px 8px 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}
.gv-chave--tracejada { border-style: dashed; }
.gv-vezes {
  color: var(--gesto-bloco);
  font-weight: 700;
  background: var(--gesto-papel);
  padding: 0 4px;
  transform: translateX(50%);
}
.gv-coro > .gv-rotulo {
  color: var(--gesto-bloco);
  font-weight: 700;
  letter-spacing: 0.06em;
  margin-bottom: 4px;
}
.gv-link { display: flex; gap: 8px; }
.gv-link > .gv-conector {
  flex: 0 0 auto;
  width: 14px;
  border-left: 3px solid var(--gesto-conector-link);
  color: var(--gesto-conector-link);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  font-weight: 700;
  transform: translateX(-2px);
}
.gv-link > .gv-filhos { flex: 1 1 auto; }
.gv-final > .gv-divisor {
  color: var(--gesto-final);
  font-weight: 700;
  border-top: 2px dashed var(--gesto-final);
  border-image: repeating-linear-gradient(90deg, var(--gesto-final) 0 10px, transparent 10px 14px, var(--gesto-final) 14px 16px, transparent 16px 22px) 2;
  padding-top: 4px;
  margin: 10px 0 6px;
  letter-spacing: 0.06em;
}

/* instrução e texto livre */
.gv-instrucao {
  background: var(--gesto-instrucao-fundo);
  color: var(--gesto-instrucao-texto);
  border: 1px solid var(--gesto-instrucao-borda);
  border-radius: 6px;
  padding: 8px 12px;
  margin: 8px 0;
  font-weight: 600;
}
.gv-texto {
  color: var(--gesto-texto-livre);
  font-style: italic;
  margin: 6px 4px;
}
```

- [ ] **Step 4: Escrever `GestureThumb.tsx`**

```tsx
import { resolver, type Indice } from '../../lib/gestures/dictionary';
import { getAssetUrl } from '../../services/api';

type Props = { id: string; indice: Indice | null; tamanho: 64 | 96 };

/**
 * Figura do gesto. Sem dicionário ou sem o id nele, o placeholder de gesto
 * ausente — é assim que o revisor descobre que o documento aponta para um gesto
 * que não existe, já que o PUT não confere isso de propósito.
 */
export function GestureThumb({ id, indice, tamanho }: Props) {
  const r = indice ? resolver(indice, id) : null;
  if (!r || !r.ok) {
    const motivo =
      !r ? 'Dicionário indisponível' : r.motivo === 'ausente' ? 'Gesto não encontrado no dicionário' : 'Cadeia de substituição inválida';
    return (
      <div
        className="gv-figura gv-figura--ausente"
        role="img"
        aria-label={motivo}
        title={`${motivo} (${id})`}
        style={{ width: tamanho, height: tamanho }}
      >
        ?
      </div>
    );
  }
  return (
    <img
      className={`gv-figura${r.viaAlias ? ' gv-figura--alias' : ''}`}
      src={getAssetUrl(r.entrada.image)}
      alt={r.entrada.name}
      title={r.viaAlias ? `${r.entrada.name} (substituiu ${id})` : r.entrada.name}
      width={tamanho}
      height={tamanho}
      loading="lazy"
    />
  );
}
```

- [ ] **Step 5: Escrever `GestureDocumentView.tsx`**

```tsx
import type { GestureDocument, InstructionKind, Item } from '../../lib/gestures/schema';
import type { Indice } from '../../lib/gestures/dictionary';
import { chaveDoCaminho, type Caminho } from '../../lib/gestures/flatten';
import { GestureThumb } from './GestureThumb';

export const ROTULOS_DE_INSTRUCAO: Record<InstructionKind, string> = {
  instruments: 'Instrumentos',
  repeat_praise: 'Repetir o louvor',
  back_to_chorus: 'Voltar ao coro',
  back_to_chorus_and_finish: 'Voltar ao coro e finalizar',
};

/** Sem espaço quando a leitura começa com pontuação que gruda na palavra anterior. */
export function separadorDaLinha(text: string): '' | ' ' {
  if (!text) return '';
  return /^[,.;:!?)\]]/.test(text) ? '' : ' ';
}

type Props = {
  doc: GestureDocument;
  indice: Indice | null;
  /** 64 no editor, 96 no visualizador — a única diferença que a spec admite. */
  tamanhoDaFigura?: 64 | 96;
  /** Chave do caminho (chaveDoCaminho) do cartão em foco. */
  emFoco?: string;
  onClicarCartao?: (chave: string) => void;
};

/**
 * O renderizador do documento de gestos — o MESMO na pré-visualização do editor e
 * em qualquer outro lugar. As regras de desenho moram em regras.css.
 */
export function GestureDocumentView({ doc, indice, tamanhoDaFigura = 96, emFoco, onClicarCartao }: Props) {
  const props = (caminho: Caminho, classe: string) => {
    const chave = chaveDoCaminho(caminho);
    return {
      'data-caminho': chave,
      className: `${classe}${emFoco === chave ? ' is-foco' : ''}`,
      onClick: onClicarCartao
        ? (e: React.MouseEvent) => {
            e.stopPropagation();
            onClicarCartao(chave);
          }
        : undefined,
    };
  };

  const filhos = (itens: Item[], caminho: Caminho, colados = false) => (
    <div className={`gv-filhos${colados ? ' gv-filhos--colados' : ''}`}>
      {itens.map((f, i) => renderItem(f, [...caminho, i]))}
    </div>
  );

  const renderItem = (item: Item, caminho: Caminho): React.ReactNode => {
    const chave = chaveDoCaminho(caminho);
    switch (item.type) {
      case 'gesture':
        return (
          <div key={chave} {...props(caminho, 'gv-gesto')}>
            <GestureThumb id={item.gestureId} indice={indice} tamanho={tamanhoDaFigura} />
            <div className="gv-letras">
              {item.lyrics.map((l, n) => (
                <p key={n} className="gv-linha">
                  {l.trigger ? <span className="gv-gatilho">{l.trigger}</span> : null}
                  {l.trigger ? separadorDaLinha(l.text) : ''}
                  <span className="gv-leitura">{l.text}</span>
                </p>
              ))}
            </div>
          </div>
        );
      case 'repeat':
        return (
          <div key={chave} {...props(caminho, 'gv-bloco gv-repeat')}>
            {filhos(item.children, caminho)}
            <div className="gv-chave" aria-hidden="true">
              <span className="gv-vezes">{item.count}x</span>
            </div>
          </div>
        );
      case 'coro':
        return (
          <div key={chave} {...props(caminho, 'gv-bloco gv-coro')}>
            <div className="gv-rotulo">CORO</div>
            {filhos(item.children, caminho)}
            <div className="gv-chave gv-chave--tracejada" aria-hidden="true" />
          </div>
        );
      case 'link':
        return (
          <div key={chave} {...props(caminho, 'gv-bloco gv-link')}>
            <div className="gv-conector" aria-hidden="true">↓</div>
            {filhos(item.children, caminho, true)}
          </div>
        );
      case 'final':
        return (
          <div key={chave} {...props(caminho, 'gv-bloco gv-final')}>
            <div className="gv-divisor">FINAL</div>
            {filhos(item.children, caminho)}
          </div>
        );
      case 'instruction':
        return (
          <div key={chave} {...props(caminho, 'gv-instrucao')}>
            {ROTULOS_DE_INSTRUCAO[item.kind] ?? item.kind}
          </div>
        );
      case 'text':
        return (
          <div key={chave} {...props(caminho, 'gv-texto')}>
            {item.text}
          </div>
        );
      default: {
        // Tipo de um documento futuro: mostra como texto para não sumir com nada.
        const desconhecido = item as { text?: string; type?: string };
        return (
          <div key={chave} {...props(caminho, 'gv-texto')}>
            {desconhecido.text ?? `[${desconhecido.type}]`}
          </div>
        );
      }
    }
  };

  return (
    <article className="gv-papel">
      <h1 className="gv-titulo">{doc.title}</h1>
      {doc.items.map((item, i) => renderItem(item, [i]))}
    </article>
  );
}
```

E em `web/src/styles/global.css`, logo depois de `@import './design-system.css';`:

```css
@import '../components/gestures/regras.css';
```

- [ ] **Step 6: Rodar**

Run: `cd web && npx vitest run src/components/gestures/__tests__/GestureDocumentView.test.tsx && npm run typecheck`
Expected: PASS; typecheck limpo (`React.MouseEvent`/`React.ReactNode` são globais com o JSX runtime do projeto — se o typecheck reclamar, `import type { MouseEvent, ReactNode } from 'react'`).

- [ ] **Step 7: Commit e fechar a fatia (d)**

```bash
git add web/src/components/gestures/regras.css web/src/components/gestures/GestureThumb.tsx web/src/components/gestures/GestureDocumentView.tsx web/src/components/gestures/__tests__/GestureDocumentView.test.tsx web/src/styles/global.css
git commit -m "feat(gestos/web): GestureDocumentView — o renderizador das regras da spec, com as cores em regras.css"
```

Na raiz: `npm run verify`. Cole a saída no relatório da fatia (d).

---

### Task 6: Serviço da API para gestos e o `ETag` no `useMaterialContent`

**Files:**
- Modify: `web/src/services/api.ts` (funções novas; `createMaterial` aceita `source_material_id`)
- Modify: `web/src/hooks/useMaterialContent.ts` (`ready` ganha `etag`)
- Modify: `web/src/hooks/__tests__/useMaterialContent.test.ts` (o `toEqual` do `ready` ganha `etag: null`)
- Test: `web/src/__tests__/gesturesApi.test.ts` (novo)

**Interfaces (tudo exportado de `services/api.ts`):**
- `type GestureUsage = { material_id: string; praise_id: string; praise_name: string; praise_number: string | null; count: number }`
- `getGestureDictionary(): Promise<GestureDictionary>` (tipo de `lib/gestures/dictionary`)
- `getGesture(id): Promise<GestureEntry & { usages: GestureUsage[] }>`
- `getGestureUsageCounts(): Promise<{ gesture_id: string; materials: number }[]>`
- `getGestureUsage(gestureId): Promise<GestureUsage[]>`
- `createGesture(input: { name: string; description?: string; exampleTriggers?: string[]; id?: string; image: File }): Promise<GestureEntry>` — multipart
- `updateGesture(id, updates: { name?: string; description?: string; exampleTriggers?: string[]; status?: 'active' | 'deprecated' }): Promise<GestureEntry>`
- `uploadGestureImage(id, file: File)`, `uploadGestureGif(id, file: File)`: `Promise<GestureEntry>`
- `replaceGesture(id, targetId, rewriteDocuments: boolean): Promise<{ ok: true; reescritos: number; falhas: { materialId: string; motivo: string }[] }>`
- `class ConflitoDeGravacao extends Error` — 409 `stale_write` e 412.
- `class DocumentoRecusado extends Error { code: string; path: string }` — 400 com `code`.
- `putGesturesContent(materialId, doc: GestureDocument, etag: string | null): Promise<{ etag: string | null }>` — manda `If-Match: <etag>` quando há etag; devolve o `ETag` da resposta.
- `ContentState` do hook: `{ status: 'ready'; source: string; etag: string | null }`.

- [ ] **Step 1: Escrever o teste do serviço**

`web/src/__tests__/gesturesApi.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ConflitoDeGravacao, DocumentoRecusado, createGesture, createMaterial, getGestureDictionary, putGesturesContent, replaceGesture, updateGesture,
} from '../services/api';
import type { GestureDocument } from '../lib/gestures/schema';

const mockFetch = vi.fn();
const DOC: GestureDocument = {
  schema: 'coldigom.gestures/1', title: 'X', dictionaryVersion: 1,
  items: [{ type: 'gesture', gestureId: '000000000001', lyrics: [{ trigger: 'a', text: '' }] }],
};

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

const resposta = (status: number, corpo: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json', ...headers } });

describe('putGesturesContent', () => {
  it('manda o documento como JSON com If-Match e devolve o ETag novo', async () => {
    mockFetch.mockResolvedValueOnce(resposta(200, { ok: true }, { ETag: '"v2"' }));
    const r = await putGesturesContent('m1', DOC, '"v1"');
    expect(r).toEqual({ etag: '"v2"' });
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/materials\/m1\/content$/);
    expect(init.method).toBe('PUT');
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
    expect((init.headers as Record<string, string>)['If-Match']).toBe('"v1"');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body as string)).toEqual(DOC);
  });

  it('sem etag (documento novo) não manda If-Match', async () => {
    mockFetch.mockResolvedValueOnce(resposta(200, { ok: true }));
    await putGesturesContent('m1', DOC, null);
    const init = mockFetch.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['If-Match']).toBeUndefined();
  });

  it('409 stale_write e 412 viram ConflitoDeGravacao', async () => {
    mockFetch.mockResolvedValueOnce(resposta(409, { error: 'mudou', code: 'stale_write' }));
    await expect(putGesturesContent('m1', DOC, '"v1"')).rejects.toBeInstanceOf(ConflitoDeGravacao);
    mockFetch.mockResolvedValueOnce(new Response('', { status: 412 }));
    await expect(putGesturesContent('m1', DOC, '"v1"')).rejects.toBeInstanceOf(ConflitoDeGravacao);
  });

  it('400 com code e path vira DocumentoRecusado, com a frase do servidor', async () => {
    mockFetch.mockResolvedValueOnce(resposta(400, { error: 'Tipo de item desconhecido neste ponto do documento.', code: 'tipo_desconhecido', path: 'items[2]' }));
    const erro = await putGesturesContent('m1', DOC, null).catch((e) => e);
    expect(erro).toBeInstanceOf(DocumentoRecusado);
    expect(erro.code).toBe('tipo_desconhecido');
    expect(erro.path).toBe('items[2]');
    expect(erro.message).toBe('Tipo de item desconhecido neste ponto do documento.');
  });

  it('401 renova a sessão e repete uma vez', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(resposta(200, { accessToken: 'a', refreshToken: 'r' }))
      .mockResolvedValueOnce(resposta(200, { ok: true }, { ETag: '"v9"' }));
    const r = await putGesturesContent('m1', DOC, null);
    expect(r.etag).toBe('"v9"');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('outros erros viram Error com a mensagem traduzida', async () => {
    mockFetch.mockResolvedValueOnce(resposta(404, { error: 'Material not found' }));
    await expect(putGesturesContent('m1', DOC, null)).rejects.toThrow(/não existe mais/);
  });
});

describe('dicionário', () => {
  it('getGestureDictionary devolve o corpo inteiro', async () => {
    const dic = { schema: 'coldigom.gesture-dictionary/1', version: 3, generatedAt: 't', gestures: [] };
    mockFetch.mockResolvedValueOnce(resposta(200, dic));
    expect(await getGestureDictionary()).toEqual(dic);
    expect(String(mockFetch.mock.calls[0][0])).toMatch(/\/api\/gestures\/dictionary$/);
  });

  it('createGesture manda multipart com os campos e a figura', async () => {
    mockFetch.mockResolvedValueOnce(resposta(201, { data: { id: 'abcdefabcdef' } }));
    const png = new File(['x'], 'g.png', { type: 'image/png' });
    const r = await createGesture({ name: 'Quero', exampleTriggers: ['Quero'], image: png });
    expect(r.id).toBe('abcdefabcdef');
    const init = mockFetch.mock.calls[0][1] as RequestInit;
    const form = init.body as FormData;
    expect(form.get('name')).toBe('Quero');
    expect(form.get('exampleTriggers')).toBe('["Quero"]');
    expect(form.get('image')).toBe(png);
    expect((init.headers as Record<string, string>)['content-type']).toBeUndefined();
  });

  it('updateGesture faz PATCH em JSON e replaceGesture manda targetId e rewriteDocuments', async () => {
    mockFetch.mockResolvedValueOnce(resposta(200, { data: { id: 'a' } }));
    await updateGesture('a', { name: 'Novo' });
    expect((mockFetch.mock.calls[0][1] as RequestInit).method).toBe('PATCH');
    mockFetch.mockResolvedValueOnce(resposta(200, { ok: true, reescritos: 2, falhas: [] }));
    const r = await replaceGesture('a', 'b', true);
    expect(r.reescritos).toBe(2);
    expect(JSON.parse((mockFetch.mock.calls[1][1] as RequestInit).body as string)).toEqual({ targetId: 'b', rewriteDocuments: true });
  });
});

describe('createMaterial com source_material_id', () => {
  it('repassa source_material_id no corpo', async () => {
    mockFetch.mockResolvedValueOnce(resposta(200, { data: { id: 'p1', materials: [] } }));
    await createMaterial('p1', { material_kind: 'k', type: 'gestures', source_material_id: 'pdf-1' });
    expect(JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)).toEqual({ material_kind: 'k', type: 'gestures', source_material_id: 'pdf-1' });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd web && npx vitest run src/__tests__/gesturesApi.test.ts`
Expected: FAIL — exports inexistentes.

- [ ] **Step 3: Acrescentar ao `services/api.ts`**

No topo, junto dos imports:

```ts
import type { GestureDictionary, GestureEntry } from '../lib/gestures/dictionary';
import type { GestureDocument } from '../lib/gestures/schema';
```

Em `createMaterial`, o parâmetro ganha `source_material_id?: string`:

```ts
export async function createMaterial(praiseId: string, material: {
  material_kind: string;
  type: string;
  url?: string;
  source_material_id?: string;
}): Promise<PraiseDetail> {
```

E, ao fim do arquivo (antes de `getAssetUrl`):

```ts
// ---------- gestos CIAs ----------

export type GestureUsage = {
  material_id: string;
  praise_id: string;
  praise_name: string;
  praise_number: string | null;
  count: number;
};

export async function getGestureDictionary(): Promise<GestureDictionary> {
  return fetchJson<GestureDictionary>(`${API_BASE_URL}/api/gestures/dictionary`);
}

export async function getGesture(id: string): Promise<GestureEntry & { usages: GestureUsage[] }> {
  const r = await fetchJson<ApiResponse<GestureEntry & { usages: GestureUsage[] }>>(`${API_BASE_URL}/api/gestures/dictionary/${id}`);
  return r.data;
}

export async function getGestureUsageCounts(): Promise<{ gesture_id: string; materials: number }[]> {
  const r = await fetchJson<ApiResponse<{ gesture_id: string; materials: number }[]>>(`${API_BASE_URL}/api/gestures/usage`);
  return r.data;
}

export async function getGestureUsage(gestureId: string): Promise<GestureUsage[]> {
  const r = await fetchJson<ApiResponse<GestureUsage[]>>(`${API_BASE_URL}/api/gestures/usage?gestureId=${encodeURIComponent(gestureId)}`);
  return r.data;
}

export async function createGesture(input: {
  name: string;
  description?: string;
  exampleTriggers?: string[];
  id?: string;
  image: File;
}): Promise<GestureEntry> {
  const form = new FormData();
  form.set('name', input.name);
  if (input.description !== undefined) form.set('description', input.description);
  if (input.exampleTriggers) form.set('exampleTriggers', JSON.stringify(input.exampleTriggers));
  if (input.id) form.set('id', input.id);
  form.set('image', input.image);
  // Sem content-type: o navegador põe o boundary do multipart.
  const r = await fetchJson<ApiResponse<GestureEntry>>(`${API_BASE_URL}/api/gestures/dictionary`, { method: 'POST', body: form });
  return r.data;
}

export async function updateGesture(
  id: string,
  updates: { name?: string; description?: string; exampleTriggers?: string[]; status?: 'active' | 'deprecated' }
): Promise<GestureEntry> {
  const r = await fetchJson<ApiResponse<GestureEntry>>(`${API_BASE_URL}/api/gestures/dictionary/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(updates),
  });
  return r.data;
}

async function subirFiguraDoGesto(id: string, sufixo: 'image' | 'gif', file: File): Promise<GestureEntry> {
  const form = new FormData();
  form.set('file', file);
  const r = await fetchJson<ApiResponse<GestureEntry>>(`${API_BASE_URL}/api/gestures/dictionary/${id}/${sufixo}`, { method: 'POST', body: form });
  return r.data;
}
export const uploadGestureImage = (id: string, file: File) => subirFiguraDoGesto(id, 'image', file);
export const uploadGestureGif = (id: string, file: File) => subirFiguraDoGesto(id, 'gif', file);

export async function replaceGesture(
  id: string,
  targetId: string,
  rewriteDocuments: boolean
): Promise<{ ok: true; reescritos: number; falhas: { materialId: string; motivo: string }[] }> {
  return fetchJson(`${API_BASE_URL}/api/gestures/dictionary/${id}/replace-with`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ targetId, rewriteDocuments }),
  });
}

/** 409 stale_write ou 412: alguém gravou antes. A tela oferece recarregar, nunca sobrescreve. */
export class ConflitoDeGravacao extends Error {
  constructor() {
    super('O documento foi alterado por outra pessoa. Recarregue antes de salvar.');
    this.name = 'ConflitoDeGravacao';
  }
}

/** 400 com `code` e `path`: o servidor recusou o documento e diz em qual cartão. */
export class DocumentoRecusado extends Error {
  constructor(message: string, public readonly code: string, public readonly path: string) {
    super(message);
    this.name = 'DocumentoRecusado';
  }
}

/**
 * Grava o documento de gestos com If-Match. Não passa por fetchJson porque
 * precisa do status e do corpo do erro (code, path) e do ETag da resposta —
 * mas repete o essencial dela: credenciais, Bearer e renovação no 401.
 */
export async function putGesturesContent(
  materialId: string,
  doc: GestureDocument,
  etag: string | null,
  isAfterRefresh = false
): Promise<{ etag: string | null }> {
  const headers: Record<string, string> = { ...authHeaders(), 'content-type': 'application/json' };
  if (etag) headers['If-Match'] = etag;
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/materials/${materialId}/content`, {
      method: 'PUT',
      credentials: 'include',
      headers,
      body: JSON.stringify(doc),
    });
  } catch {
    throw new Error(mensagemDeRede());
  }
  if (response.status === 401 && !isAfterRefresh && (await refreshSession())) {
    return putGesturesContent(materialId, doc, etag, true);
  }
  if (response.status === 409 || response.status === 412) throw new ConflitoDeGravacao();
  if (!response.ok) {
    const corpo = (await response.json().catch(() => ({}))) as { error?: string; code?: string; path?: string };
    if (response.status === 400 && corpo.code) {
      throw new DocumentoRecusado(corpo.error ?? 'Documento recusado.', corpo.code, corpo.path ?? '');
    }
    const bruta = corpo.error || `HTTP ${response.status}`;
    console.error('[api]', response.status, 'PUT gestures', bruta);
    throw new Error(mensagemAmigavel(bruta));
  }
  return { etag: response.headers.get('ETag') };
}
```

- [ ] **Step 4: O `ETag` no hook**

Em `useMaterialContent.ts`, o tipo e a linha do `ready`:

```ts
export type ContentState =
  | { status: 'loading' }
  | { status: 'ready'; source: string; etag: string | null }
  | { status: 'absent' }
  | { status: 'error'; message: string };
…
        settle({ status: 'ready', source: await response.text(), etag: response.headers.get('ETag') });
```

E no teste `useMaterialContent.test.ts`, o `toEqual` do primeiro caso:

```ts
    expect(result.current.content).toEqual({ status: 'ready', source: '{title: X}\n[C]letra', etag: null });
```

mais um caso novo, depois dele:

```ts
  it('guarda o ETag da resposta — é o token do If-Match do editor de gestos', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Response('{}', { status: 200, headers: { ETag: '"abc"' } })));
    const { result } = renderHook(() => useMaterialContent(KEY));
    await waitFor(() => expect(result.current.content.status).toBe('ready'));
    expect(result.current.content).toMatchObject({ etag: '"abc"' });
  });
```

- [ ] **Step 5: Rodar**

Run: `cd web && npx vitest run src/__tests__/gesturesApi.test.ts src/hooks/__tests__/useMaterialContent.test.ts src/__tests__/api.test.ts src/pages/__tests__/ChordProPage.test.tsx && npm run typecheck`
Expected: PASS em todos; a `ChordProPage` ignora o campo novo.

- [ ] **Step 6: Commit**

```bash
git add web/src/services/api.ts web/src/hooks/useMaterialContent.ts web/src/hooks/__tests__/useMaterialContent.test.ts web/src/__tests__/gesturesApi.test.ts
git commit -m "feat(gestos/web): serviço do dicionário, gravação com If-Match e o ETag no useMaterialContent"
```

---

### Task 7: Extrair `ReviewSwitch` para um componente próprio

**Files:**
- Create: `web/src/components/ReviewSwitch.tsx`
- Modify: `web/src/pages/ChordProPage.tsx:57-127` (remover a função local; importar a nova)
- Test: `web/src/pages/__tests__/ChordProPage.test.tsx` (continua verde, sem mudança)

**Interfaces:**
- `ReviewSwitch({ material, onToggle }: { material: Material; onToggle: (next: boolean) => Promise<void> })` — comportamento e classes `cp-review-*` idênticos aos de hoje.

- [ ] **Step 1: Mover o código**

Crie `web/src/components/ReviewSwitch.tsx` com o conteúdo **exato** da função `ReviewSwitch` que está em `ChordProPage.tsx` (linhas 57–127, incluindo o comentário de doc), precedido de:

```tsx
import { useState } from 'react';
import { useAuth } from '../context/useAuth';
import type { Material } from '../types';
```

e com `export function ReviewSwitch(`. Em `ChordProPage.tsx`, apague a função local e acrescente `import { ReviewSwitch } from '../components/ReviewSwitch';`. Se `useState` ou `useAuth` ficarem sem uso na página depois disso, remova o import — o `lint` do `verify:strict` reclama de import morto.

- [ ] **Step 2: Rodar**

Run: `cd web && npx vitest run src/pages/__tests__/ChordProPage.test.tsx && npm run typecheck && npm run lint`
Expected: PASS, sem novos avisos.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/ReviewSwitch.tsx web/src/pages/ChordProPage.tsx
git commit -m "refactor(web): ReviewSwitch vira componente próprio para o editor de gestos reaproveitar"
```

---

### Task 8: `GesturePicker` e `GesturesEditor`

**Files:**
- Create: `web/src/components/gestures/GesturePicker.tsx`
- Create: `web/src/components/gestures/GesturesEditor.tsx`
- Modify: `web/src/styles/global.css` (classes `ge-*`, no fim do arquivo)
- Test: `web/src/components/gestures/__tests__/GesturePicker.test.tsx`
- Test: `web/src/components/gestures/__tests__/GesturesEditor.test.tsx`

**Interfaces:**
- `GesturePicker({ indice, aberto, onEscolher, onFechar }: { indice: Indice | null; aberto: boolean; onEscolher: (id: string) => void; onFechar: () => void })` — `role="dialog"`, campo de busca com foco automático, lista de botões (figura 64 + nome + exemplos); `Enter` escolhe o primeiro; `Escape` fecha.
- `GesturesEditor({ doc, indice, foco, onFoco, onMudar, erroNoCaminho })`:
  - `foco: Caminho | null` (controlado pela página) e `onFoco: (c: Caminho | null) => void`;
  - `onMudar: (r: Resultado) => void` — a página empilha o histórico e aplica `r.foco`;
  - `erroNoCaminho?: string | null` — chave do `path` devolvido pelo servidor; o cartão ganha `is-erro`;
  - seleção contígua é estado interno: clique = foco + seleção única; `Shift`+clique estende do foco ao clicado quando são irmãos contíguos.
  - Cada cartão tem `data-cartao={chaveDoCaminho(caminho)}` (não `data-caminho`, que é do `GestureDocumentView` ao lado).
  - Barra de ações (rótulos exatos, são o que os testes procuram): `Adicionar gesto`, `Adicionar instrução`, `Adicionar texto`, `Repetir {N}x` (com `<input type="number" aria-label="Vezes">`), `Coro`, `Link`, `Final`, `Desagrupar`, `Mover para cima`, `Mover para baixo`, `Remover`. Botão de envolver desabilitado com `title={motivo}` quando `podeEnvolver` recusa.
  - No cartão de gesto: figura clicável (`aria-label="Trocar gesto"`), para cada linha `<input aria-label="Gatilho">` e `<input aria-label="Leitura">`, botões `+ linha` / `− linha`; em `repeat`, `<input type="number" aria-label="Repetições">`; em `instruction`, `<select aria-label="Instrução">`; em `text`, `<input aria-label="Texto">`.

- [ ] **Step 1: Escrever os testes**

`web/src/components/gestures/__tests__/GesturePicker.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { indexar } from '../../../lib/gestures/dictionary';
import { GesturePicker } from '../GesturePicker';

const indice = indexar({
  schema: 'coldigom.gesture-dictionary/1', version: 1, generatedAt: 't',
  gestures: [
    { id: 'aaaaaaaaaaaa', name: 'Quero', description: '', exampleTriggers: ['Quero'], image: 'a.png', gif: null, status: 'active', replacedBy: null, updatedAt: 't' },
    { id: 'bbbbbbbbbbbb', name: 'Viver', description: '', exampleTriggers: ['viver'], image: 'b.png', gif: null, status: 'active', replacedBy: null, updatedAt: 't' },
  ],
});

describe('GesturePicker', () => {
  it('filtra pela busca e escolhe ao clicar', async () => {
    const user = userEvent.setup();
    const onEscolher = vi.fn();
    render(<GesturePicker indice={indice} aberto onEscolher={onEscolher} onFechar={() => {}} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox'), 'viv');
    expect(screen.queryByRole('button', { name: /Quero/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: /Viver/ }));
    expect(onEscolher).toHaveBeenCalledWith('bbbbbbbbbbbb');
  });

  it('Enter escolhe o primeiro resultado; Escape fecha', async () => {
    const user = userEvent.setup();
    const onEscolher = vi.fn();
    const onFechar = vi.fn();
    render(<GesturePicker indice={indice} aberto onEscolher={onEscolher} onFechar={onFechar} />);
    await user.type(screen.getByRole('searchbox'), 'que{Enter}');
    expect(onEscolher).toHaveBeenCalledWith('aaaaaaaaaaaa');
    await user.keyboard('{Escape}');
    expect(onFechar).toHaveBeenCalled();
  });

  it('fechado não renderiza nada; sem dicionário avisa', () => {
    const { container, rerender } = render(<GesturePicker indice={indice} aberto={false} onEscolher={() => {}} onFechar={() => {}} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<GesturePicker indice={null} aberto onEscolher={() => {}} onFechar={() => {}} />);
    expect(screen.getByText(/dicionário não carregou/i)).toBeInTheDocument();
  });
});
```

`web/src/components/gestures/__tests__/GesturesEditor.test.tsx`:

```tsx
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { GestureDocument, Item } from '../../../lib/gestures/schema';
import { itemEm, type Caminho } from '../../../lib/gestures/flatten';
import type { Indice } from '../../../lib/gestures/dictionary';
import type { Resultado } from '../../../lib/gestures/edit';
import { GesturesEditor } from '../GesturesEditor';

const FIXTURES = resolve(__dirname, '..', '..', '..', '..', '..', 'api', 'src', 'gestures', '__fixtures__');
const exemplo = JSON.parse(readFileSync(resolve(FIXTURES, 'valido-exemplo.json'), 'utf8')) as GestureDocument;

/** A página real guarda doc e foco em estado e aplica cada Resultado; o harness faz o mesmo. */
function Harness({ inicial, focoInicial, onMudar, indice = null, erroNoCaminho }: {
  inicial: GestureDocument; focoInicial: Caminho | null; onMudar: (r: Resultado) => void; indice?: Indice | null; erroNoCaminho?: string | null;
}) {
  const [doc, setDoc] = useState(inicial);
  const [foco, setFoco] = useState<Caminho | null>(focoInicial);
  return (
    <GesturesEditor
      doc={doc}
      indice={indice}
      foco={foco}
      onFoco={setFoco}
      onMudar={(r) => { onMudar(r); setDoc(r.doc); setFoco(r.foco); }}
      erroNoCaminho={erroNoCaminho}
    />
  );
}

function montar(foco: Caminho | null = null, extras: { indice?: Indice | null; erroNoCaminho?: string | null } = {}) {
  const onMudar = vi.fn<(r: Resultado) => void>();
  const utils = render(<Harness inicial={exemplo} focoInicial={foco} onMudar={onMudar} {...extras} />);
  const cartao = (chave: string) => utils.container.querySelector(`[data-cartao="${chave}"]`) as HTMLElement;
  const ultimo = () => onMudar.mock.calls.at(-1)![0];
  return { ...utils, onMudar, cartao, ultimo };
}

describe('GesturesEditor — seleção e envolver', () => {
  it('três cartões vizinhos em "Repetir 2x" viram um repeat de count 2', async () => {
    const user = userEvent.setup();
    const { onMudar, cartao } = montar();
    await user.click(cartao('items[0].children[0]'));
    await user.keyboard('{Shift>}');
    await user.click(cartao('items[0].children[2]'));
    await user.keyboard('{/Shift}');
    await user.click(screen.getByRole('button', { name: 'Repetir 2x' }));

    expect(onMudar).toHaveBeenCalledTimes(1);
    const { doc, foco } = onMudar.mock.calls[0][0];
    const bloco = itemEm(doc, [0, 0]) as { type: string; count: number; children: Item[] };
    expect(bloco).toMatchObject({ type: 'repeat', count: 2 });
    expect(bloco.children).toHaveLength(3);
    expect((itemEm(doc, [0]) as { children: Item[] }).children).toHaveLength(3);
    expect(foco).toEqual([0, 0]);
    // o cartão novo aparece na lista, em foco
    expect(cartao('items[0].children[0]')).toHaveClass('is-foco');
    expect(cartao('items[0].children[0]')).toHaveClass('ge-cartao--repeat');
  });

  it('o número de vezes vem do campo ao lado do botão', async () => {
    const user = userEvent.setup();
    const { ultimo } = montar([0, 0]);
    const vezes = screen.getByRole('spinbutton', { name: 'Vezes' });
    await user.tripleClick(vezes);
    await user.keyboard('3');
    await user.click(screen.getByRole('button', { name: 'Repetir 3x' }));
    expect(itemEm(ultimo().doc, [0, 0])).toMatchObject({ type: 'repeat', count: 3 });
  });

  it('Link desabilitado com motivo quando só há um selecionado', () => {
    montar([0, 0]);
    const link = screen.getByRole('button', { name: 'Link' });
    expect(link).toBeDisabled();
    expect(link).toHaveAttribute('title', 'Um link liga 2 ou 3 cartões.');
  });

  it('Desagrupar no coro sobe os filhos', async () => {
    const user = userEvent.setup();
    const { ultimo } = montar([0]);
    await user.click(screen.getByRole('button', { name: 'Desagrupar' }));
    expect(ultimo().doc.items.slice(0, 5).every((i) => i.type === 'gesture')).toBe(true);
  });
});

describe('GesturesEditor — edição do cartão', () => {
  it('editar o gatilho chama onMudar com a linha nova', async () => {
    const user = userEvent.setup();
    const { ultimo, cartao } = montar([0, 0]);
    const gatilho = within(cartao('items[0].children[0]')).getAllByRole('textbox', { name: 'Gatilho' })[0];
    await user.type(gatilho, '!');
    expect(itemEm(ultimo().doc, [0, 0])).toMatchObject({ lyrics: [{ trigger: 'Quero!' }] });
  });

  it('+ linha, repetições, instrução e texto', async () => {
    const user = userEvent.setup();
    const { ultimo, cartao } = montar([0, 0]);
    await user.click(within(cartao('items[0].children[0]')).getByRole('button', { name: '+ linha' }));
    expect((itemEm(ultimo().doc, [0, 0]) as { lyrics: unknown[] }).lyrics).toHaveLength(2);

    const rep = within(cartao('items[1]')).getByRole('spinbutton', { name: 'Repetições' });
    await user.tripleClick(rep);
    await user.keyboard('4');
    expect(itemEm(ultimo().doc, [1])).toMatchObject({ count: 4 });

    await user.selectOptions(within(cartao('items[4]')).getByRole('combobox', { name: 'Instrução' }), 'instruments');
    expect(itemEm(ultimo().doc, [4])).toMatchObject({ kind: 'instruments' });

    await user.type(within(cartao('items[2]')).getByRole('textbox', { name: 'Texto' }), 'x');
    expect(itemEm(ultimo().doc, [2])).toMatchObject({ text: '(pausa para os instrumentos)x' });
  });

  it('Mover para baixo e Remover usam o foco', async () => {
    const user = userEvent.setup();
    const { onMudar } = montar([0, 0]);
    await user.click(screen.getByRole('button', { name: 'Mover para baixo' }));
    expect(onMudar.mock.calls[0][0].foco).toEqual([0, 1]);
    await user.click(screen.getByRole('button', { name: 'Remover' }));
    expect((itemEm(onMudar.mock.calls[1][0].doc, [0]) as { children: unknown[] }).children).toHaveLength(4);
  });

  it('Adicionar gesto abre o seletor e insere depois do foco', async () => {
    const user = userEvent.setup();
    const indice: Indice = {
      version: 1, porId: new Map(),
      ativos: [{ id: 'aaaaaaaaaaaa', name: 'Quero', description: '', exampleTriggers: [], image: 'a.png', gif: null, status: 'active', replacedBy: null, updatedAt: 't' }],
    };
    const { ultimo } = montar([0, 1], { indice });
    await user.click(screen.getByRole('button', { name: 'Adicionar gesto' }));
    await user.click(screen.getByRole('button', { name: /Quero/ }));
    expect(ultimo().foco).toEqual([0, 2]);
    expect(itemEm(ultimo().doc, [0, 2])).toMatchObject({ gestureId: 'aaaaaaaaaaaa' });
  });

  it('o cartão do erro do servidor fica marcado', () => {
    const { cartao } = montar(null, { erroNoCaminho: 'items[1].children[1].children[0]' });
    expect(cartao('items[1].children[1].children[0]')).toHaveClass('is-erro');
    expect(cartao('items[0]')).not.toHaveClass('is-erro');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd web && npx vitest run src/components/gestures/__tests__/GesturePicker.test.tsx src/components/gestures/__tests__/GesturesEditor.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Escrever `GesturePicker.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { buscar, type Indice } from '../../lib/gestures/dictionary';
import { GestureThumb } from './GestureThumb';

type Props = {
  indice: Indice | null;
  aberto: boolean;
  onEscolher: (id: string) => void;
  onFechar: () => void;
};

/** Busca no dicionário. Enter escolhe o primeiro; Escape fecha. */
export function GesturePicker({ indice, aberto, onEscolher, onFechar }: Props) {
  const [termo, setTermo] = useState('');
  useEffect(() => {
    if (aberto) setTermo('');
  }, [aberto]);
  const resultados = useMemo(() => (indice ? buscar(indice, termo, 30) : []), [indice, termo]);

  if (!aberto) return null;

  return (
    <div
      className="ge-picker"
      role="dialog"
      aria-label="Escolher gesto"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onFechar();
        }
      }}
    >
      <div className="ge-picker-topo">
        <input
          type="search"
          className="ge-picker-busca"
          placeholder="Buscar por nome ou gatilho"
          value={termo}
          autoFocus
          onChange={(e) => setTermo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && resultados[0]) {
              e.preventDefault();
              onEscolher(resultados[0].id);
            }
          }}
        />
        <button type="button" className="ge-btn" onClick={onFechar}>
          Fechar
        </button>
      </div>
      {!indice ? (
        <p className="ge-picker-aviso">O dicionário não carregou. Tente recarregar a página.</p>
      ) : resultados.length === 0 ? (
        <p className="ge-picker-aviso">Nenhum gesto encontrado.</p>
      ) : (
        <ul className="ge-picker-lista">
          {resultados.map((g) => (
            <li key={g.id}>
              <button type="button" className="ge-picker-item" onClick={() => onEscolher(g.id)}>
                <GestureThumb id={g.id} indice={indice} tamanho={64} />
                <span className="ge-picker-nome">{g.name}</span>
                {g.exampleTriggers.length ? (
                  <span className="ge-picker-exemplos">{g.exampleTriggers.join(', ')}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Escrever `GesturesEditor.tsx`**

```tsx
import { useMemo, useState } from 'react';
import type { GestureDocument, InstructionKind, Item } from '../../lib/gestures/schema';
import { INSTRUCTION_KINDS } from '../../lib/gestures/schema';
import type { Indice } from '../../lib/gestures/dictionary';
import { achatar, chaveDoCaminho, irmaosContiguos, itemEm, ordenar, pai, type Caminho, type Cartao } from '../../lib/gestures/flatten';
import {
  adicionarLinha, definirInstrucao, definirRepeticoes, desagrupar, editarLinha, editarTexto, envolver, inserirApos, mover,
  novoGesto, podeDesagrupar, podeEnvolver, remover, removerLinha, trocarGesto, type EspecDeBloco, type Resultado,
} from '../../lib/gestures/edit';
import { ROTULOS_DE_INSTRUCAO } from './GestureDocumentView';
import { GesturePicker } from './GesturePicker';
import { GestureThumb } from './GestureThumb';

type Props = {
  doc: GestureDocument;
  indice: Indice | null;
  foco: Caminho | null;
  onFoco: (caminho: Caminho | null) => void;
  onMudar: (r: Resultado) => void;
  /** Chave do `path` que o servidor devolveu num 400. */
  erroNoCaminho?: string | null;
};

const ROTULO_DO_TIPO: Record<string, string> = {
  gesture: 'Gesto', repeat: 'Repetir', coro: 'Coro', link: 'Link', final: 'Final', instruction: 'Instrução', text: 'Texto',
};

const mesmoCaminho = (a: Caminho | null, b: Caminho | null) => JSON.stringify(a) === JSON.stringify(b);

/**
 * A lista de cartões. O que se edita é a árvore (por caminho); a lista é só a
 * projeção de `achatar`. Seleção contígua entre irmãos é estado daqui; o foco é
 * da página, porque a pré-visualização ao lado o acompanha.
 */
export function GesturesEditor({ doc, indice, foco, onFoco, onMudar, erroNoCaminho }: Props) {
  const cartoes = useMemo(() => achatar(doc), [doc]);
  const [selecao, setSelecao] = useState<Caminho[]>([]);
  const [vezes, setVezes] = useState(2);
  const [picker, setPicker] = useState<{ modo: 'inserir' | 'trocar'; caminho: Caminho | null } | null>(null);

  // A seleção efetiva sempre inclui o foco; seleção velha de outro pai cai fora.
  const selecionados = useMemo<Caminho[]>(() => {
    if (!foco) return [];
    const comFoco = selecao.some((c) => mesmoCaminho(c, foco)) ? selecao : [foco];
    return irmaosContiguos(comFoco) ? ordenar(comFoco) : [foco];
  }, [selecao, foco]);

  const clicarCartao = (caminho: Caminho, shift: boolean) => {
    if (shift && foco && mesmoCaminho(pai(foco), pai(caminho))) {
      const p = pai(caminho) ?? [];
      const a = foco[foco.length - 1];
      const b = caminho[caminho.length - 1];
      const faixa: Caminho[] = [];
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) faixa.push([...p, i]);
      setSelecao(faixa);
      return;
    }
    setSelecao([caminho]);
    onFoco(caminho);
  };

  const aplicar = (r: Resultado) => {
    setSelecao(r.foco ? [r.foco] : []);
    onMudar(r);
  };

  const envolverEm = (espec: EspecDeBloco) => aplicar(envolver(doc, selecionados, espec));
  const motivoEnvolver = (espec: EspecDeBloco) => (selecionados.length ? podeEnvolver(doc, selecionados, espec) : 'Selecione um cartão.');
  const motivoDesagrupar = foco ? podeDesagrupar(doc, foco) : 'Selecione um bloco.';

  const inserir = (item: Item) => aplicar(inserirApos(doc, foco, item));

  const renderCartao = (c: Cartao) => {
    const chave = chaveDoCaminho(c.caminho);
    const emFoco = mesmoCaminho(foco, c.caminho);
    const selecionado = selecionados.some((s) => mesmoCaminho(s, c.caminho));
    const classes = ['ge-cartao', `ge-cartao--${c.item.type}`, emFoco ? 'is-foco' : '', selecionado ? 'is-selecionado' : '', erroNoCaminho === chave ? 'is-erro' : '']
      .filter(Boolean)
      .join(' ');
    return (
      <div
        key={chave}
        data-cartao={chave}
        className={classes}
        style={{ marginLeft: c.profundidade * 16 }}
        onClick={(e) => clicarCartao(c.caminho, e.shiftKey)}
      >
        <div className="ge-cartao-tipo">{ROTULO_DO_TIPO[c.item.type] ?? c.item.type}</div>
        {renderCorpo(c.item, c.caminho)}
      </div>
    );
  };

  const renderCorpo = (item: Item, caminho: Caminho) => {
    switch (item.type) {
      case 'gesture':
        return (
          <div className="ge-gesto">
            <button
              type="button"
              className="ge-figura-btn"
              aria-label="Trocar gesto"
              onClick={(e) => {
                e.stopPropagation();
                setPicker({ modo: 'trocar', caminho });
              }}
            >
              <GestureThumb id={item.gestureId} indice={indice} tamanho={64} />
            </button>
            <div className="ge-linhas">
              {item.lyrics.map((l, n) => (
                <div key={n} className="ge-linha">
                  <input
                    aria-label="Gatilho"
                    className="ge-input ge-input--gatilho"
                    value={l.trigger}
                    placeholder="gatilho"
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onMudar(editarLinha(doc, caminho, n, { trigger: e.target.value }))}
                  />
                  <input
                    aria-label="Leitura"
                    className="ge-input ge-input--leitura"
                    value={l.text}
                    placeholder="leitura"
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onMudar(editarLinha(doc, caminho, n, { text: e.target.value }))}
                  />
                </div>
              ))}
              <div className="ge-linha-acoes">
                <button type="button" className="ge-btn ge-btn--mini" disabled={item.lyrics.length >= 3} onClick={(e) => { e.stopPropagation(); onMudar(adicionarLinha(doc, caminho)); }}>
                  + linha
                </button>
                <button type="button" className="ge-btn ge-btn--mini" disabled={item.lyrics.length <= 1} onClick={(e) => { e.stopPropagation(); onMudar(removerLinha(doc, caminho, item.lyrics.length - 1)); }}>
                  − linha
                </button>
                <code className="ge-id">{item.gestureId}</code>
              </div>
            </div>
          </div>
        );
      case 'repeat':
        return (
          <label className="ge-campo" onClick={(e) => e.stopPropagation()}>
            Repetições
            <input
              type="number"
              min={2}
              aria-label="Repetições"
              className="ge-input ge-input--n"
              value={item.count}
              onChange={(e) => onMudar(definirRepeticoes(doc, caminho, Number(e.target.value)))}
            />
          </label>
        );
      case 'instruction':
        return (
          <select
            aria-label="Instrução"
            className="ge-input"
            value={item.kind}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onMudar(definirInstrucao(doc, caminho, e.target.value as InstructionKind))}
          >
            {INSTRUCTION_KINDS.map((k) => (
              <option key={k} value={k}>
                {ROTULOS_DE_INSTRUCAO[k]}
              </option>
            ))}
          </select>
        );
      case 'text':
        return (
          <input
            aria-label="Texto"
            className="ge-input"
            value={item.text}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onMudar(editarTexto(doc, caminho, e.target.value))}
          />
        );
      default:
        return <div className="ge-cartao-meta">{'children' in item ? `${item.children.length} filho(s)` : null}</div>;
    }
  };

  return (
    <div className="ge-editor">
      <div className="ge-barra" role="toolbar" aria-label="Ações do editor">
        <button type="button" className="ge-btn" onClick={() => setPicker({ modo: 'inserir', caminho: foco })}>Adicionar gesto</button>
        <button type="button" className="ge-btn" onClick={() => inserir({ type: 'instruction', kind: 'instruments' })}>Adicionar instrução</button>
        <button type="button" className="ge-btn" onClick={() => inserir({ type: 'text', text: '' })}>Adicionar texto</button>
        <span className="ge-barra-sep" />
        <input type="number" min={2} aria-label="Vezes" className="ge-input ge-input--n" value={vezes} onChange={(e) => setVezes(Math.max(2, Number(e.target.value) || 2))} />
        {(
          [
            [`Repetir ${vezes}x`, { type: 'repeat', count: vezes }],
            ['Coro', { type: 'coro' }],
            ['Link', { type: 'link' }],
            ['Final', { type: 'final' }],
          ] as [string, EspecDeBloco][]
        ).map(([rotulo, espec]) => {
          const motivo = motivoEnvolver(espec);
          return (
            <button key={rotulo} type="button" className="ge-btn" disabled={!!motivo} title={motivo ?? undefined} onClick={() => envolverEm(espec)}>
              {rotulo}
            </button>
          );
        })}
        <button type="button" className="ge-btn" disabled={!!motivoDesagrupar} title={motivoDesagrupar ?? undefined} onClick={() => foco && aplicar(desagrupar(doc, foco))}>Desagrupar</button>
        <span className="ge-barra-sep" />
        <button type="button" className="ge-btn" disabled={!foco} onClick={() => foco && aplicar(mover(doc, foco, -1))}>Mover para cima</button>
        <button type="button" className="ge-btn" disabled={!foco} onClick={() => foco && aplicar(mover(doc, foco, 1))}>Mover para baixo</button>
        <button type="button" className="ge-btn ge-btn--perigo" disabled={!foco} onClick={() => foco && aplicar(remover(doc, foco))}>Remover</button>
      </div>

      <div className="ge-lista">
        {cartoes.length === 0 ? <p className="ge-vazio">Documento vazio. Comece por "Adicionar gesto".</p> : cartoes.map(renderCartao)}
      </div>

      <GesturePicker
        indice={indice}
        aberto={picker !== null}
        onFechar={() => setPicker(null)}
        onEscolher={(id) => {
          if (!picker) return;
          if (picker.modo === 'trocar' && picker.caminho) onMudar(trocarGesto(doc, picker.caminho, id));
          else aplicar(inserirApos(doc, picker.caminho, novoGesto(id)));
          setPicker(null);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 5: CSS das telas (`ge-*`) no fim de `global.css`**

```css
/* ---------- editor de gestos ---------- */
.ge-editor { display: flex; flex-direction: column; gap: 10px; }
.ge-barra { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; position: sticky; top: 0; background: var(--bg, #fff); padding: 6px 0; z-index: 2; }
.ge-barra-sep { width: 1px; height: 22px; background: #d1d5db; margin: 0 4px; }
.ge-btn { font: inherit; font-size: 0.85rem; padding: 4px 10px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; cursor: pointer; }
.ge-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.ge-btn--mini { padding: 2px 8px; font-size: 0.78rem; }
.ge-btn--perigo { border-color: #fca5a5; color: #b91c1c; }
.ge-lista { display: flex; flex-direction: column; gap: 4px; }
.ge-cartao { border: 1px solid #e5e7eb; border-radius: 6px; padding: 6px 8px; background: #fff; cursor: pointer; }
.ge-cartao.is-selecionado { background: #eff6ff; border-color: #93c5fd; }
.ge-cartao.is-foco { border-color: #1E63C8; box-shadow: 0 0 0 2px rgba(30, 99, 200, 0.25); }
.ge-cartao.is-erro { border-color: #D32F2F; box-shadow: 0 0 0 2px rgba(211, 47, 47, 0.25); }
.ge-cartao-tipo { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; margin-bottom: 4px; }
.ge-gesto { display: flex; gap: 10px; align-items: flex-start; }
.ge-figura-btn { padding: 0; border: 0; background: none; cursor: pointer; }
.ge-linhas { flex: 1 1 auto; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.ge-linha { display: grid; grid-template-columns: 1fr 2fr; gap: 6px; }
.ge-input { font: inherit; font-size: 0.9rem; padding: 4px 6px; border: 1px solid #d1d5db; border-radius: 4px; min-width: 0; }
.ge-input--gatilho { color: #D32F2F; font-weight: 700; }
.ge-input--n { width: 64px; }
.ge-linha-acoes { display: flex; gap: 6px; align-items: center; }
.ge-id { font-size: 0.72rem; color: #9ca3af; margin-left: auto; }
.ge-campo { display: inline-flex; gap: 8px; align-items: center; font-size: 0.85rem; }
.ge-vazio { color: #6b7280; font-style: italic; }
.ge-picker { position: fixed; inset: 10% 15%; background: #fff; border: 1px solid #cbd5e1; border-radius: 10px; box-shadow: 0 20px 60px rgba(0,0,0,0.25); z-index: 20; display: flex; flex-direction: column; overflow: hidden; }
.ge-picker-topo { display: flex; gap: 8px; padding: 10px; border-bottom: 1px solid #e5e7eb; }
.ge-picker-busca { flex: 1 1 auto; font: inherit; padding: 6px 10px; border: 1px solid #d1d5db; border-radius: 6px; }
.ge-picker-lista { list-style: none; margin: 0; padding: 8px; overflow: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 6px; }
.ge-picker-item { display: flex; gap: 10px; align-items: center; width: 100%; text-align: left; font: inherit; padding: 6px; border: 1px solid #e5e7eb; border-radius: 6px; background: #fff; cursor: pointer; }
.ge-picker-item:hover { background: #eff6ff; }
.ge-picker-nome { font-weight: 600; }
.ge-picker-exemplos { color: #6b7280; font-size: 0.8rem; }
.ge-picker-aviso { padding: 16px; color: #6b7280; }
```

- [ ] **Step 6: Rodar**

Run: `cd web && npx vitest run src/components/gestures && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/gestures/GesturePicker.tsx web/src/components/gestures/GesturesEditor.tsx web/src/components/gestures/__tests__/GesturePicker.test.tsx web/src/components/gestures/__tests__/GesturesEditor.test.tsx web/src/styles/global.css
git commit -m "feat(gestos/web): GesturesEditor e GesturePicker — cartões, seleção entre irmãos e a barra de ações"
```

---

### Task 9: `GesturesEditorPage` e a rota

**Files:**
- Create: `web/src/pages/GesturesEditorPage.tsx`
- Modify: `web/src/App.tsx` (rota `/praise/:praiseId/gestos/:materialId`)
- Modify: `web/src/components/gestures/GesturesEditor.tsx` (prop `abrirSeletor?: number` — contador; quando muda, abre o seletor em modo inserir — é o `Ctrl+Enter` da página)
- Modify: `web/src/styles/global.css` (classes `ge-page`, `ge-layout`, `ge-abas`)
- Test: `web/src/pages/__tests__/GesturesEditorPage.test.tsx`

**Interfaces:**
- Página em `/praise/:praiseId/gestos/:materialId`. Estados: carregando; erro do louvor; material não é de gestos; documento inválido no servidor (mostra `code` e `path`); pronto.
- Documento novo (asset 404): `{ schema, title: "<número> - <NOME EM CAIXA ALTA>", dictionaryVersion: <versão do dicionário ou 0>, items: [] }`, `etag: null`.
- Salvar: `validarDocumento(rascunho)`; inválido → mensagem da tabela + cartão marcado, sem rede; válido → `putGesturesContent(material.id, { ...rascunho, dictionaryVersion: indice.version }, etag)`. `ConflitoDeGravacao` → cartão de conflito com botão `Recarregar` (chama `retry` do hook, descarta o rascunho) e `<textarea readonly aria-label="Seu documento">` com o JSON para copiar. `DocumentoRecusado` → mensagem + `erroNoCaminho`.
- Rótulos fixos (os testes procuram por eles): botão `Salvar`, `Desfazer`, `Refazer`, `Recarregar`, link `Abrir PDF de gestos`, status `Salvo.` depois de gravar, aviso `Documento vazio` no editor novo, abas `Editor` / `Pré-visualização`.
- Teclado (no `keydown` da página): `Ctrl/⌘+S` salvar, `Ctrl/⌘+Z` desfazer, `Ctrl/⌘+Shift+Z` refazer, `Ctrl/⌘+Enter` abrir o seletor para inserir depois do foco.
- Histórico: pilhas `passado`/`futuro` de documentos inteiros, teto 50.

- [ ] **Step 1: Escrever o teste**

`web/src/pages/__tests__/GesturesEditorPage.test.tsx`:

```tsx
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GesturesEditorPage } from '../GesturesEditorPage';
import { AuthProvider } from '../../context/AuthContext';
import * as api from '../../services/api';
import type { PraiseDetail } from '../../types';

const FIXTURES = resolve(__dirname, '..', '..', '..', '..', 'api', 'src', 'gestures', '__fixtures__');
const EXEMPLO = readFileSync(resolve(FIXTURES, 'valido-exemplo.json'), 'utf8');

const praise = {
  id: 'p1', name: 'Quero viver pra sempre com Jesus', number: '182', author: '', rhythm: '', tonality: '', category: '', lyrics: '',
  group_id: null, tag_ids: null, tag_names: null, tags: [], group_members: [],
  materials: [
    { id: 'g1', praise_id: 'p1', material_kind: 'k1', material_kind_name: 'Gestos', type: 'gestures', r2_key: 'assets/praises/p1/g1.gestures', file_path_legacy: '', source_material_id: 'pdf1', is_reviewed: false },
    { id: 'pdf1', praise_id: 'p1', material_kind: 'k2', material_kind_name: 'Gestos PDF', type: 'pdf', r2_key: 'assets/praises/p1/pdf1.pdf', file_path_legacy: '', source_material_id: null },
  ],
} as unknown as PraiseDetail;

const dicionario = {
  schema: 'coldigom.gesture-dictionary/1' as const, version: 3, generatedAt: 't',
  gestures: [{ id: 'c687580e7682', name: 'Quero', description: '', exampleTriggers: ['Quero'], image: 'assets/cia/gestures/c687580e7682.png', gif: null, status: 'active' as const, replacedBy: null, updatedAt: 't' }],
};

function montar({ asset = EXEMPLO, status = 200, etag = '"v1"', autenticado = true }: { asset?: string; status?: number; etag?: string; autenticado?: boolean } = {}) {
  vi.spyOn(api, 'getMe').mockResolvedValue(autenticado ? ({ sub: 'u1', name: 'Revisor' } as never) : null);
  vi.spyOn(api, 'getPraise').mockResolvedValue(praise);
  vi.spyOn(api, 'getGestureDictionary').mockResolvedValue(dicionario);
  vi.stubGlobal('fetch', vi.fn(() => new Response(status === 200 ? asset : '', { status, headers: status === 200 ? { ETag: etag } : {} })));
  const put = vi.spyOn(api, 'putGesturesContent');
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/praise/p1/gestos/g1']}>
        <Routes>
          <Route path="/praise/:praiseId/gestos/:materialId" element={<GesturesEditorPage />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
  return { put };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('GesturesEditorPage', () => {
  it('abre o exemplo da spec: CORO com chave tracejada sobre 5 cartões, gatilhos vermelhos, duas instruções', async () => {
    montar();
    await waitFor(() => expect(document.querySelector('.gv-coro')).not.toBeNull());
    const coro = document.querySelector('.gv-coro')!;
    expect(coro.querySelectorAll(':scope > .gv-filhos > .gv-gesto')).toHaveLength(5);
    expect(coro.querySelector('.gv-chave--tracejada')).not.toBeNull();
    expect(document.querySelectorAll('.gv-papel .gv-gatilho').length).toBeGreaterThan(5);
    expect(document.querySelectorAll('.gv-papel .gv-instrucao')).toHaveLength(2);
    // editor à esquerda com os mesmos cartões
    expect(document.querySelectorAll('[data-cartao]').length).toBe(16);
    expect(screen.getByRole('link', { name: 'Abrir PDF de gestos' })).toHaveAttribute('target', '_blank');
  });

  it('asset 404 é documento novo: título padrão, editor vazio, Salvar desabilitado', async () => {
    montar({ status: 404 });
    await waitFor(() => expect(screen.getByText(/Documento vazio/)).toBeInTheDocument());
    // o cabeçalho da página e o papel da pré-visualização mostram o mesmo título
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toContain('182 - QUERO VIVER PRA SEMPRE COM JESUS');
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
  });

  it('salva com o ETag do GET e mostra "Salvo."', async () => {
    const user = userEvent.setup();
    const { put } = montar({ etag: '"v7"' });
    put.mockResolvedValue({ etag: '"v8"' });
    await waitFor(() => expect(document.querySelector('.gv-coro')).not.toBeNull());
    await user.type(within(document.querySelector('[data-cartao="items[0].children[0]"]') as HTMLElement).getAllByRole('textbox', { name: 'Gatilho' })[0], '!');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(screen.getByText('Salvo.')).toBeInTheDocument());
    expect(put).toHaveBeenCalledTimes(1);
    const [id, doc, etag] = put.mock.calls[0];
    expect(id).toBe('g1');
    expect(etag).toBe('"v7"');
    expect(doc.dictionaryVersion).toBe(3);
    expect(JSON.stringify(doc)).toContain('Quero!');
    // a segunda gravação usa o ETag novo
    await user.type(within(document.querySelector('[data-cartao="items[0].children[0]"]') as HTMLElement).getAllByRole('textbox', { name: 'Gatilho' })[0], '?');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    expect(put.mock.calls[1][2]).toBe('"v8"');
  });

  it('Ctrl+S salva; Ctrl+Z desfaz e Ctrl+Shift+Z refaz', async () => {
    const user = userEvent.setup();
    const { put } = montar();
    put.mockResolvedValue({ etag: '"v2"' });
    await waitFor(() => expect(document.querySelector('.gv-coro')).not.toBeNull());
    const gatilho = () => within(document.querySelector('[data-cartao="items[0].children[0]"]') as HTMLElement).getAllByRole('textbox', { name: 'Gatilho' })[0];
    await user.type(gatilho(), '!');
    expect(gatilho()).toHaveValue('Quero!');
    await user.keyboard('{Control>}z{/Control}');
    expect(gatilho()).toHaveValue('Quero');
    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    expect(gatilho()).toHaveValue('Quero!');
    await user.keyboard('{Control>}s{/Control}');
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
  });

  it('409 vira cartão de conflito com Recarregar e o JSON para copiar; o rascunho fica na tela', async () => {
    const user = userEvent.setup();
    const { put } = montar();
    put.mockRejectedValue(new api.ConflitoDeGravacao());
    await waitFor(() => expect(document.querySelector('.gv-coro')).not.toBeNull());
    await user.type(within(document.querySelector('[data-cartao="items[0].children[0]"]') as HTMLElement).getAllByRole('textbox', { name: 'Gatilho' })[0], '!');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(screen.getByText(/alterado por outra pessoa/)).toBeInTheDocument());
    expect((screen.getByRole('textbox', { name: 'Seu documento' }) as HTMLTextAreaElement).value).toContain('Quero!');
    expect(screen.getByRole('button', { name: 'Recarregar' })).toBeInTheDocument();
    // o editor continua com o texto digitado
    expect(within(document.querySelector('[data-cartao="items[0].children[0]"]') as HTMLElement).getAllByRole('textbox', { name: 'Gatilho' })[0]).toHaveValue('Quero!');
  });

  it('400 com path marca o cartão e mostra a frase do servidor', async () => {
    const user = userEvent.setup();
    const { put } = montar();
    put.mockRejectedValue(new api.DocumentoRecusado('Tipo de item desconhecido neste ponto do documento.', 'tipo_desconhecido', 'items[1].children[1].children[0]'));
    await waitFor(() => expect(document.querySelector('.gv-coro')).not.toBeNull());
    await user.type(within(document.querySelector('[data-cartao="items[0].children[0]"]') as HTMLElement).getAllByRole('textbox', { name: 'Gatilho' })[0], '!');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(screen.getByText('Tipo de item desconhecido neste ponto do documento.')).toBeInTheDocument());
    expect(document.querySelector('[data-cartao="items[1].children[1].children[0]"]')).toHaveClass('is-erro');
  });

  it('rascunho inválido não vai à rede: remove o último gesto do mínimo e Salvar explica', async () => {
    const user = userEvent.setup();
    const { put } = montar({ asset: readFileSync(resolve(FIXTURES, 'valido-minimo.json'), 'utf8') });
    await waitFor(() => expect(document.querySelector('[data-cartao="items[0]"]')).not.toBeNull());
    await user.click(document.querySelector('[data-cartao="items[0]"]') as HTMLElement);
    await user.click(screen.getByRole('button', { name: 'Remover' }));
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    expect(screen.getByText(/ao menos um item/)).toBeInTheDocument();
    expect(put).not.toHaveBeenCalled();
  });

  it('documento inválido no servidor mostra código e caminho em vez de abrir o editor', async () => {
    montar({ asset: JSON.stringify({ schema: 'coldigom.gestures/1', title: 'x', dictionaryVersion: 0, items: [{ type: 'x' }] }) });
    await waitFor(() => expect(screen.getByText(/tipo_desconhecido/)).toBeInTheDocument());
    expect(screen.getByText(/items\[0\]/)).toBeInTheDocument();
    expect(document.querySelector('[data-cartao]')).toBeNull();
  });

  it('sem sessão o switch de revisão vira selo e o editor fica só leitura', async () => {
    montar({ autenticado: false });
    await waitFor(() => expect(document.querySelector('.gv-coro')).not.toBeNull());
    expect(screen.getByText(/não revisada/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd web && npx vitest run src/pages/__tests__/GesturesEditorPage.test.tsx`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: O `abrirSeletor` no `GesturesEditor`**

Em `GesturesEditor.tsx`, acrescente a prop e o efeito:

```tsx
type Props = {
  …
  /** Contador: quando muda, abre o seletor em modo inserir (Ctrl+Enter da página). */
  abrirSeletor?: number;
};
…
  useEffect(() => {
    if (abrirSeletor) setPicker({ modo: 'inserir', caminho: foco });
    // só quando o contador muda; o foco do momento é o que vale
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abrirSeletor]);
```

(`useEffect` entra no import de `react`.)

- [ ] **Step 4: Escrever `GesturesEditorPage.tsx`**

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { GestureDocumentView } from '../components/gestures/GestureDocumentView';
import { GesturesEditor } from '../components/gestures/GesturesEditor';
import { ReviewSwitch } from '../components/ReviewSwitch';
import { useAuth } from '../context/useAuth';
import { useMaterialContent } from '../hooks/useMaterialContent';
import { indexar, type Indice } from '../lib/gestures/dictionary';
import type { Resultado } from '../lib/gestures/edit';
import { chaveDoCaminho, type Caminho } from '../lib/gestures/flatten';
import { GESTURE_SCHEMA, MENSAGENS, validarDocumento, type GestureDocument } from '../lib/gestures/schema';
import {
  ConflitoDeGravacao, DocumentoRecusado, getAssetUrl, getGestureDictionary, getPraise, putGesturesContent, updateMaterial,
} from '../services/api';
import type { PraiseDetail } from '../types';

const TETO_DO_HISTORICO = 50;

function tituloPadrao(praise: PraiseDetail): string {
  const nome = praise.name.toUpperCase();
  return praise.number ? `${praise.number} - ${nome}` : nome;
}

type Servidor =
  | { status: 'novo'; etag: null }
  | { status: 'ok'; doc: GestureDocument; etag: string | null }
  | { status: 'invalido'; codigo: string; caminho: string };

/**
 * O editor de gestos de um material. O rascunho é a própria árvore; salvar manda
 * If-Match, e 409/412 nunca sobrescrevem — viram o cartão de conflito.
 */
export function GesturesEditorPage() {
  const { praiseId, materialId } = useParams<{ praiseId: string; materialId: string }>();
  const { isAuthenticated } = useAuth();
  const [praise, setPraise] = useState<PraiseDetail | null>(null);
  const [erroDoLouvor, setErroDoLouvor] = useState<string | null>(null);
  const [indice, setIndice] = useState<Indice | null>(null);

  useEffect(() => {
    if (!praiseId) return;
    let cancelado = false;
    getPraise(praiseId)
      .then((p) => !cancelado && setPraise(p))
      .catch((e) => !cancelado && setErroDoLouvor(e instanceof Error ? e.message : 'Falha ao carregar'));
    // Dicionário indisponível não impede editar: os gestos viram placeholder.
    getGestureDictionary()
      .then((d) => !cancelado && setIndice(indexar(d)))
      .catch(() => !cancelado && setIndice(null));
    return () => {
      cancelado = true;
    };
  }, [praiseId]);

  const material = praise?.materials.find((m) => m.id === materialId) ?? null;
  const pdfDeOrigem = praise?.materials.find((m) => m.id === material?.source_material_id) ?? null;
  const { content, retry } = useMaterialContent(material?.r2_key ?? null);

  // O que o servidor tem, até onde sabemos: o GET, ou a nossa última gravação.
  // As dependências são os PRIMITIVOS do hook (status, texto, etag), não o objeto
  // `content`: ele é recriado a cada render, e um memo preso a ele devolveria um
  // documento novo por render — e o efeito abaixo zeraria o rascunho a cada tecla.
  const [gravado, setGravado] = useState<{ key: string; doc: GestureDocument; etag: string | null } | null>(null);
  const fonte = content.status === 'ready' ? content.source : null;
  const etagDoGet = content.status === 'ready' ? content.etag : null;
  const servidor = useMemo<Servidor | null>(() => {
    if (!material?.r2_key) return null;
    if (gravado && gravado.key === material.r2_key) return { status: 'ok', doc: gravado.doc, etag: gravado.etag };
    if (content.status === 'absent') return { status: 'novo', etag: null };
    if (fonte === null) return null;
    let lido: unknown;
    try {
      lido = JSON.parse(fonte);
    } catch {
      return { status: 'invalido', codigo: 'json_invalido', caminho: '' };
    }
    const r = validarDocumento(lido);
    if (!r.ok) return { status: 'invalido', codigo: r.erro.codigo, caminho: r.erro.caminho };
    return { status: 'ok', doc: r.doc, etag: etagDoGet };
  }, [material?.r2_key, content.status, fonte, etagDoGet, gravado]);

  // Título e versão são primitivos de propósito: trocar a marca de revisão devolve
  // um `praise` novo, e um documento novo memoizado nele perderia o rascunho.
  const tituloBase = praise ? tituloPadrao(praise) : '';
  const base = useMemo<GestureDocument | null>(() => {
    if (!servidor || !tituloBase) return null;
    if (servidor.status === 'ok') return servidor.doc;
    if (servidor.status === 'novo') {
      return { schema: GESTURE_SCHEMA, title: tituloBase, dictionaryVersion: indice?.version ?? 0, items: [] };
    }
    return null;
  }, [servidor, tituloBase, indice?.version]);

  // rascunho + histórico
  const [rascunho, setRascunho] = useState<GestureDocument | null>(null);
  const [passado, setPassado] = useState<GestureDocument[]>([]);
  const [futuro, setFuturo] = useState<GestureDocument[]>([]);
  const [foco, setFoco] = useState<Caminho | null>(null);
  const [erroNoCaminho, setErroNoCaminho] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [conflito, setConflito] = useState<string | null>(null);
  const [abrirSeletor, setAbrirSeletor] = useState(0);
  const [aba, setAba] = useState<'editor' | 'preview'>('editor');

  // Trocar de material ou receber a base pela primeira vez zera o rascunho.
  useEffect(() => {
    setRascunho(base);
    setPassado([]);
    setFuturo([]);
    setFoco(null);
    setErroNoCaminho(null);
    setConflito(null);
  }, [base]);

  const sujo = rascunho !== null && base !== null && rascunho !== base;
  useEffect(() => {
    if (!sujo) return;
    const aoSair = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', aoSair);
    return () => window.removeEventListener('beforeunload', aoSair);
  }, [sujo]);

  const validacao = useMemo(() => (rascunho ? validarDocumento(rascunho) : null), [rascunho]);

  const aplicar = useCallback((r: Resultado) => {
    setRascunho((atual) => {
      if (atual) setPassado((p) => [...p.slice(-(TETO_DO_HISTORICO - 1)), atual]);
      return r.doc;
    });
    setFuturo([]);
    setFoco(r.foco);
    setErroNoCaminho(null);
    setMensagem(null);
  }, []);

  const desfazer = useCallback(() => {
    setPassado((p) => {
      const anterior = p[p.length - 1];
      if (!anterior) return p;
      setRascunho((atual) => {
        if (atual) setFuturo((f) => [...f, atual]);
        return anterior;
      });
      return p.slice(0, -1);
    });
  }, []);

  const refazer = useCallback(() => {
    setFuturo((f) => {
      const proximo = f[f.length - 1];
      if (!proximo) return f;
      setRascunho((atual) => {
        if (atual) setPassado((p) => [...p, atual]);
        return proximo;
      });
      return f.slice(0, -1);
    });
  }, []);

  const rascunhoRef = useRef(rascunho);
  rascunhoRef.current = rascunho;

  const salvar = useCallback(async () => {
    const doc = rascunhoRef.current;
    if (!doc || !material?.r2_key || !servidor || servidor.status === 'invalido') return;
    const v = validarDocumento(doc);
    if (!v.ok) {
      setMensagem(MENSAGENS[v.erro.codigo]);
      setErroNoCaminho(v.erro.caminho.replace(/\.(lyrics|count|kind|text)\b.*$/, '') || null);
      return;
    }
    setSalvando(true);
    setMensagem(null);
    setConflito(null);
    try {
      const paraGravar: GestureDocument = { ...doc, dictionaryVersion: indice?.version ?? doc.dictionaryVersion };
      const { etag } = await putGesturesContent(material.id, paraGravar, servidor.etag);
      setGravado({ key: material.r2_key, doc: paraGravar, etag });
      // A base muda → o efeito acima zera o rascunho para a base nova, que é o que gravamos.
      setMensagem('Salvo.');
    } catch (e) {
      if (e instanceof ConflitoDeGravacao) {
        setConflito(JSON.stringify(doc, null, 2));
        setMensagem(e.message);
      } else if (e instanceof DocumentoRecusado) {
        setMensagem(e.message);
        setErroNoCaminho(e.path.replace(/\.(lyrics|count|kind|text)\b.*$/, '') || null);
      } else {
        setMensagem(e instanceof Error ? e.message : 'Falha ao salvar');
      }
    } finally {
      setSalvando(false);
    }
  }, [material, servidor, indice?.version]);

  // teclado
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || !isAuthenticated) return;
      const k = e.key.toLowerCase();
      if (k === 's') {
        e.preventDefault();
        void salvar();
      } else if (k === 'z' && e.shiftKey) {
        e.preventDefault();
        refazer();
      } else if (k === 'z') {
        e.preventDefault();
        desfazer();
      } else if (k === 'enter') {
        e.preventDefault();
        setAbrirSeletor((n) => n + 1);
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [salvar, desfazer, refazer, isAuthenticated]);

  // a pré-visualização acompanha o cartão em foco
  const chaveDoFoco = foco ? chaveDoCaminho(foco) : undefined;
  useEffect(() => {
    if (!chaveDoFoco) return;
    const alvo = document.querySelector(`.gv-papel [data-caminho="${chaveDoFoco}"]`);
    (alvo as HTMLElement | null)?.scrollIntoView?.({ block: 'nearest' });
  }, [chaveDoFoco]);

  const toggleReviewed = async (next: boolean) => {
    if (!material) return;
    setPraise(await updateMaterial(material.id, { is_reviewed: next }));
  };

  if (erroDoLouvor || (praise && !material)) {
    return (
      <main className="page-container ge-page">
        <div className="error-state">
          <div className="error-state-icon">⚠</div>
          <div className="error-state-title">Erro ao carregar</div>
          <div className="error-state-desc">{erroDoLouvor ?? 'Material não encontrado'}</div>
        </div>
      </main>
    );
  }
  if (!praise || !material) {
    return (
      <main className="page-container ge-page">
        <div className="loading-state"><div className="loading-spinner" /><div className="loading-text">Carregando gestos...</div></div>
      </main>
    );
  }
  if (material.type !== 'gestures') {
    return (
      <main className="page-container ge-page">
        <div className="error-state"><div className="error-state-title">Este material não é de gestos.</div></div>
      </main>
    );
  }

  return (
    <main className="page-container ge-page">
      <Link to={`/praise/${praise.id}`} className="cp-back">← {praise.name}</Link>
      <header className="cp-header">
        <div className="cp-header-main">
          <h1 className="cp-title">{rascunho?.title ?? tituloPadrao(praise)}</h1>
          <div className="cp-number">{material.material_kind_name ?? 'Gestos CIAs'}</div>
        </div>
        <div className="cp-header-actions">
          {pdfDeOrigem?.r2_key ? (
            <a className="cp-source-link" href={getAssetUrl(pdfDeOrigem.r2_key)} target="_blank" rel="noopener noreferrer">
              Abrir PDF de gestos
            </a>
          ) : null}
          <ReviewSwitch material={material} onToggle={toggleReviewed} />
        </div>
      </header>

      {content.status === 'error' ? (
        <div className="cp-state cp-state--error">
          <div className="cp-state-title">Falha ao carregar o documento.</div>
          <div className="cp-state-desc">{content.message}</div>
          <button type="button" className="cp-retry" onClick={retry}>Tentar de novo</button>
        </div>
      ) : null}

      {servidor?.status === 'invalido' ? (
        <div className="cp-state cp-state--error">
          <div className="cp-state-title">O documento gravado no servidor é inválido.</div>
          <div className="cp-state-desc">
            <code>{servidor.codigo}</code> em <code>{servidor.caminho || '(raiz)'}</code> — {MENSAGENS[servidor.codigo as keyof typeof MENSAGENS] ?? ''}
          </div>
        </div>
      ) : null}

      {rascunho && servidor && servidor.status !== 'invalido' ? (
        <>
          {isAuthenticated ? (
            <div className="cp-edit-actions">
              <button type="button" className="cp-edit-save" disabled={salvando || !sujo || !validacao?.ok} onClick={() => void salvar()}>
                Salvar
              </button>
              <button type="button" className="ge-btn" disabled={passado.length === 0} onClick={desfazer}>Desfazer</button>
              <button type="button" className="ge-btn" disabled={futuro.length === 0} onClick={refazer}>Refazer</button>
              {validacao && !validacao.ok ? (
                <span className="cp-edit-issues" role="status">{MENSAGENS[validacao.erro.codigo]}</span>
              ) : null}
              {mensagem ? <span className="cp-edit-issues" role="status" aria-live="polite">{mensagem}</span> : null}
            </div>
          ) : null}

          {conflito ? (
            <div className="cp-conflito">
              <p>Copie o seu documento abaixo antes de recarregar, se quiser aproveitá-lo.</p>
              <textarea readOnly aria-label="Seu documento" value={conflito} rows={8} />
              <button type="button" className="ge-btn" onClick={() => { setGravado(null); setConflito(null); retry(); }}>
                Recarregar
              </button>
            </div>
          ) : null}

          <div className="ge-abas" role="tablist">
            <button type="button" role="tab" aria-selected={aba === 'editor'} className="ge-btn" onClick={() => setAba('editor')}>Editor</button>
            <button type="button" role="tab" aria-selected={aba === 'preview'} className="ge-btn" onClick={() => setAba('preview')}>Pré-visualização</button>
          </div>

          <div className={`ge-layout is-aba-${aba}`}>
            <section className="ge-coluna ge-coluna--editor" aria-label="Editor">
              {isAuthenticated ? (
                <GesturesEditor
                  doc={rascunho}
                  indice={indice}
                  foco={foco}
                  onFoco={setFoco}
                  onMudar={aplicar}
                  erroNoCaminho={erroNoCaminho}
                  abrirSeletor={abrirSeletor}
                />
              ) : (
                <p className="ge-vazio">Entre com o Google para editar.</p>
              )}
            </section>
            <section className="ge-coluna ge-coluna--preview" aria-label="Pré-visualização">
              <GestureDocumentView doc={rascunho} indice={indice} tamanhoDaFigura={64} emFoco={chaveDoFoco} onClicarCartao={(chave) => {
                const c = chave.match(/\d+/g)?.map(Number) ?? null;
                setFoco(c);
              }} />
            </section>
          </div>
        </>
      ) : null}
    </main>
  );
}
```

- [ ] **Step 5: Rota e CSS**

Em `App.tsx`:

```tsx
import { GesturesEditorPage } from './pages/GesturesEditorPage';
…
            <Route path="/praise/:praiseId/gestos/:materialId" element={<GesturesEditorPage />} />
```

(antes de `/praise/:id`). No fim de `global.css`:

```css
.ge-page { max-width: 1400px; }
.ge-abas { display: none; gap: 6px; margin: 8px 0; }
.ge-abas [aria-selected='true'] { background: #1E63C8; color: #fff; border-color: #1E63C8; }
.ge-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: start; }
.ge-coluna--preview { position: sticky; top: 8px; max-height: calc(100vh - 16px); overflow: auto; border: 1px solid #e5e7eb; border-radius: 8px; }
@media (max-width: 900px) {
  .ge-abas { display: flex; }
  .ge-layout { grid-template-columns: minmax(0, 1fr); }
  .ge-layout.is-aba-editor .ge-coluna--preview { display: none; }
  .ge-layout.is-aba-preview .ge-coluna--editor { display: none; }
  .ge-coluna--preview { position: static; max-height: none; }
}
```

- [ ] **Step 6: Rodar**

Run: `cd web && npx vitest run src/pages/__tests__/GesturesEditorPage.test.tsx && npm run typecheck && npm run lint`
Expected: PASS. Se o teste de `Ctrl+Z` falhar porque cada tecla digitada virou um passo do histórico, está correto: um `Ctrl+Z` desfaz o `!` inteiro porque foi UM `onChange`.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/GesturesEditorPage.tsx web/src/pages/__tests__/GesturesEditorPage.test.tsx web/src/components/gestures/GesturesEditor.tsx web/src/App.tsx web/src/styles/global.css
git commit -m "feat(gestos/web): GesturesEditorPage — duas colunas, If-Match, conflito, histórico e teclado"
```

---

### Task 10: `SecaoGestos` na tela do louvor, e `gestures` como tipo conhecido

**Files:**
- Modify: `web/src/types/index.ts:18` (`KnownMaterialType` ganha `'gestures'`)
- Modify: `web/src/lib/materials.ts` (`TYPE_ORDER` e `TYPE_LABELS`)
- Create: `web/src/components/gestures/SecaoGestos.tsx`
- Modify: `web/src/pages/PraiseDetailPage.tsx:44` (`TIPOS_COM_SECAO_PROPRIA` ganha `'gestures'`) e o JSX depois da seção "Acordes" (linha ~2268)
- Test: `web/src/components/gestures/__tests__/SecaoGestos.test.tsx`
- Test: `web/src/__tests__/materials.test.ts` (um `it` novo)

**Interfaces:**
- `SecaoGestos({ praiseId, materiais, categorias, podeEditar, onAtualizar }: { praiseId: string; materiais: Material[]; categorias: MaterialKind[]; podeEditar: boolean; onAtualizar: (p: PraiseDetail) => void })`.
  - Lista os `type === 'gestures'` como links para `/praise/{praiseId}/gestos/{id}`, com meta `Sem conteúdo` (quando `has_content === false`) ou `Documento`, e o selo `✓ revisado` quando `is_reviewed`.
  - Com `podeEditar`: botão `Novo documento de gestos` abre um formulário com `<select aria-label="Categoria">` (as `categorias`), `<select aria-label="PDF de origem">` (opcional; os materiais `pdf` do louvor) e botão `Criar` → `createMaterial(praiseId, { material_kind, type: 'gestures', source_material_id? })` → `onAtualizar(resposta)`.
  - Não renderiza nada quando não há materiais de gestos e `podeEditar` é falso.
- `TYPE_LABELS.gestures === 'Gestos CIAs'`; `TYPE_ORDER` termina em `'gestures'`.

- [ ] **Step 1: Escrever os testes**

Em `web/src/__tests__/materials.test.ts`, dentro do `describe` de `groupMaterialsByType`:

```ts
  it('gestures é tipo conhecido, com rótulo próprio e depois de chord', () => {
    const groups = groupMaterialsByType([mat('g1', 'gestures', 'Gestos'), mat('c1', 'chord', 'Cifra')]);
    expect(groups.map((g) => [g.type, g.label])).toEqual([['chord', 'Cifra'], ['gestures', 'Gestos CIAs']]);
  });
```

`web/src/components/gestures/__tests__/SecaoGestos.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as api from '../../../services/api';
import type { Material, MaterialKind, PraiseDetail } from '../../../types';
import { SecaoGestos } from '../SecaoGestos';

const gestos = (extra: Partial<Material> = {}): Material => ({
  id: 'g1', praise_id: 'p1', material_kind: 'k1', material_kind_name: 'Gestos', type: 'gestures',
  r2_key: 'assets/praises/p1/g1.gestures', file_path_legacy: '', source_material_id: null, ...extra,
});
const pdf: Material = { id: 'pdf1', praise_id: 'p1', material_kind: 'k2', material_kind_name: 'Gestos PDF', type: 'pdf', r2_key: 'assets/praises/p1/pdf1.pdf', file_path_legacy: '', source_material_id: null };
const categorias: MaterialKind[] = [{ id: 'k1', name: 'Gestos' }, { id: 'k2', name: 'Gestos PDF' }];

function montar(props: Partial<Parameters<typeof SecaoGestos>[0]> = {}) {
  const onAtualizar = vi.fn();
  render(
    <MemoryRouter>
      <SecaoGestos praiseId="p1" materiais={[gestos(), pdf]} categorias={categorias} podeEditar={false} onAtualizar={onAtualizar} {...props} />
    </MemoryRouter>
  );
  return { onAtualizar };
}

afterEach(() => vi.restoreAllMocks());

describe('SecaoGestos', () => {
  it('lista os materiais de gestos como links para o editor, com estado e selo', () => {
    montar({ materiais: [gestos({ has_content: false }), gestos({ id: 'g2', material_kind_name: 'Gestos II', has_content: true, is_reviewed: true }), pdf] });
    expect(screen.getByRole('heading', { name: /Gestos CIAs/ })).toBeInTheDocument();
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/praise/p1/gestos/g1', '/praise/p1/gestos/g2']);
    expect(links[0]).toHaveTextContent('Sem conteúdo');
    expect(links[1]).toHaveTextContent('Documento');
    expect(links[1]).toHaveTextContent('revisado');
  });

  it('sem materiais e sem edição, não renderiza nada', () => {
    const { container } = render(<MemoryRouter><SecaoGestos praiseId="p1" materiais={[pdf]} categorias={categorias} podeEditar={false} onAtualizar={() => {}} /></MemoryRouter>);
    expect(container).toBeEmptyDOMElement();
  });

  it('com edição cria o material com categoria e PDF de origem, e devolve o louvor atualizado', async () => {
    const user = userEvent.setup();
    const atualizado = { id: 'p1', materials: [] } as unknown as PraiseDetail;
    const criar = vi.spyOn(api, 'createMaterial').mockResolvedValue(atualizado);
    const { onAtualizar } = montar({ podeEditar: true, materiais: [pdf] });
    await user.click(screen.getByRole('button', { name: 'Novo documento de gestos' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Categoria' }), 'k1');
    await user.selectOptions(screen.getByRole('combobox', { name: 'PDF de origem' }), 'pdf1');
    await user.click(screen.getByRole('button', { name: 'Criar' }));
    expect(criar).toHaveBeenCalledWith('p1', { material_kind: 'k1', type: 'gestures', source_material_id: 'pdf1' });
    expect(onAtualizar).toHaveBeenCalledWith(atualizado);
  });

  it('erro na criação aparece na seção e o formulário continua aberto', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'createMaterial').mockRejectedValue(new Error('Este louvor não existe mais.'));
    montar({ podeEditar: true });
    await user.click(screen.getByRole('button', { name: 'Novo documento de gestos' }));
    await user.click(screen.getByRole('button', { name: 'Criar' }));
    expect(await screen.findByText('Este louvor não existe mais.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Criar' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd web && npx vitest run src/__tests__/materials.test.ts src/components/gestures/__tests__/SecaoGestos.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Tipo e rótulo**

`web/src/types/index.ts`:

```ts
export type KnownMaterialType = 'pdf' | 'mp3' | 'chord' | 'youtube' | 'gestures';
```

`web/src/lib/materials.ts`:

```ts
const TYPE_ORDER: KnownMaterialType[] = ['youtube', 'pdf', 'mp3', 'chord', 'gestures'];

const TYPE_LABELS: Record<KnownMaterialType, string> = {
  youtube: 'YouTube',
  pdf: 'PDF',
  mp3: 'MP3',
  chord: 'Cifra',
  gestures: 'Gestos CIAs',
};
```

Se o `typecheck` apontar outro `Record<KnownMaterialType, …>` no web, acrescente a chave `gestures` nele também.

- [ ] **Step 4: Escrever `SecaoGestos.tsx`**

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { createMaterial } from '../../services/api';
import type { Material, MaterialKind, PraiseDetail } from '../../types';

type Props = {
  praiseId: string;
  materiais: Material[];
  categorias: MaterialKind[];
  podeEditar: boolean;
  onAtualizar: (p: PraiseDetail) => void;
};

/**
 * A seção "Gestos CIAs" da tela do louvor. Componente próprio porque a
 * PraiseDetailPage já passa de 2.300 linhas; a página só importa e posiciona.
 */
export function SecaoGestos({ praiseId, materiais, categorias, podeEditar, onAtualizar }: Props) {
  const gestos = materiais.filter((m) => m.type === 'gestures');
  const pdfs = materiais.filter((m) => m.type === 'pdf');
  const [aberto, setAberto] = useState(false);
  const [categoria, setCategoria] = useState('');
  const [origem, setOrigem] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (gestos.length === 0 && !podeEditar) return null;
  const categoriaEscolhida = categoria || categorias[0]?.id || '';

  const criar = async () => {
    if (!categoriaEscolhida) return;
    setSalvando(true);
    setErro(null);
    try {
      const atualizado = await createMaterial(praiseId, {
        material_kind: categoriaEscolhida,
        type: 'gestures',
        ...(origem ? { source_material_id: origem } : {}),
      });
      onAtualizar(atualizado);
      setAberto(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao criar o material');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <section className="detail-section animate-fade-in-up">
      <h2 className="detail-section-title">
        <span className="detail-section-icon">🤲</span>
        Gestos CIAs
      </h2>
      {gestos.length > 0 ? (
        <div className="material-grid">
          {gestos.map((m) => (
            <div key={m.id} className="material-card-wrap">
              <Link to={`/praise/${praiseId}/gestos/${m.id}`} className={`material-link${m.has_content === false ? ' material-link--empty' : ''}`}>
                <span className="material-link-icon">🤲</span>
                <div>
                  <div className="material-link-text">{m.material_kind_name || 'Gestos'}</div>
                  <div className="material-link-meta">
                    {m.has_content === false ? 'Sem conteúdo' : 'Documento'}
                    {m.is_reviewed ? ' · ✓ revisado' : ''}
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <p className="materials-placeholder">Nenhum documento de gestos ainda.</p>
      )}
      {podeEditar ? (
        aberto ? (
          <div className="edit-grid ge-novo">
            <div className="edit-field">
              <label htmlFor="ge-novo-categoria">Categoria</label>
              <select id="ge-novo-categoria" aria-label="Categoria" value={categoriaEscolhida} onChange={(e) => setCategoria(e.target.value)}>
                {categorias.map((k) => (
                  <option key={k.id} value={k.id}>{k.name}</option>
                ))}
              </select>
            </div>
            <div className="edit-field">
              <label htmlFor="ge-novo-origem">PDF de origem</label>
              <select id="ge-novo-origem" aria-label="PDF de origem" value={origem} onChange={(e) => setOrigem(e.target.value)}>
                <option value="">(nenhum)</option>
                {pdfs.map((p) => (
                  <option key={p.id} value={p.id}>{p.material_kind_name || p.id}</option>
                ))}
              </select>
            </div>
            <div className="edit-actions">
              <button type="button" className="auth-btn" disabled={salvando || !categoriaEscolhida} onClick={() => void criar()}>Criar</button>
              <button type="button" className="ge-btn" onClick={() => setAberto(false)}>Cancelar</button>
              {erro ? <span className="cp-review-error" role="status">{erro}</span> : null}
            </div>
          </div>
        ) : (
          <button type="button" className="ge-btn" onClick={() => setAberto(true)}>Novo documento de gestos</button>
        )
      ) : null}
    </section>
  );
}
```

- [ ] **Step 5: Encaixar na `PraiseDetailPage`**

Na linha 44:

```ts
const TIPOS_COM_SECAO_PROPRIA = new Set(['youtube', 'mp3', 'pdf', 'chord', 'gestures', ...AUDIO_MATERIAL_TYPES]);
```

Import:

```ts
import { SecaoGestos } from '../components/gestures/SecaoGestos';
```

E logo **depois** do bloco `{chordMaterials.length > 0 && ( <section …>Acordes… )}` e **antes** de `{outrosGrupos.length > 0 && (`:

```tsx
      {praise ? (
        <SecaoGestos
          praiseId={praise.id}
          materiais={praise.materials}
          categorias={materialKinds}
          podeEditar={Boolean(userName) && !isCreate}
          onAtualizar={setPraise}
        />
      ) : null}
```

- [ ] **Step 6: Rodar**

Run: `cd web && npx vitest run src/__tests__/materials.test.ts src/components/gestures/__tests__/SecaoGestos.test.tsx src/__tests__/PraiseDetailPage.test.tsx && npm run typecheck && npm run lint`
Expected: PASS. Se `PraiseDetailPage.test.tsx` contar seções ou títulos `h2`, ajuste a contagem — a seção nova só aparece com material de gestos ou sessão.

- [ ] **Step 7: Commit e fechar a fatia (e)**

```bash
git add web/src/types/index.ts web/src/lib/materials.ts web/src/components/gestures/SecaoGestos.tsx web/src/components/gestures/__tests__/SecaoGestos.test.tsx web/src/__tests__/materials.test.ts web/src/pages/PraiseDetailPage.tsx
git commit -m "feat(gestos/web): seção Gestos CIAs na tela do louvor, com criação do documento"
```

Na raiz: `npm run verify`. Cole a saída no relatório da fatia (e).

---

### Task 11: Páginas do dicionário

**Files:**
- Create: `web/src/pages/GestureDictionaryPage.tsx`
- Create: `web/src/pages/GestureDetailPage.tsx`
- Modify: `web/src/App.tsx` (rotas `/gestos/dicionario` e `/gestos/dicionario/:id`)
- Modify: `web/src/styles/global.css` (classes `gd-*`)
- Test: `web/src/pages/__tests__/GestureDictionaryPage.test.tsx`
- Test: `web/src/pages/__tests__/GestureDetailPage.test.tsx`

**Interfaces:**
- `GestureDictionaryPage`: carrega `getGestureDictionary()` e `getGestureUsageCounts()`; tabela densa (figura 64, nome, id, gatilhos de exemplo, status, `usado em N materiais`), campo `<input type="search" aria-label="Buscar">` (usa `buscar` do índice — mas aqui **inclui** depreciados, com o filtro `<label><input type="checkbox"> Mostrar substituídos</label>`), cada linha é link para `/gestos/dicionario/{id}`. Com sessão: formulário `Novo gesto` (`Nome`, `Descrição`, `Gatilhos de exemplo` separados por vírgula, `Figura PNG` via `<input type="file" aria-label="Figura PNG">`, botão `Criar gesto`) → `createGesture` → recarrega.
- `GestureDetailPage`: `getGesture(id)`; mostra figura (96), GIF se houver, campos editáveis com sessão (`Nome`, `Descrição`, `Gatilhos de exemplo`, botão `Salvar alterações` → `updateGesture`), `Trocar figura` / `Enviar GIF` (`<input type="file">` + `uploadGestureImage`/`uploadGestureGif`), lista `Usado em` com links para o editor (`/praise/{praise_id}/gestos/{material_id}`), e o bloco `Substituir por outro gesto`: `<select aria-label="Gesto substituto">` (ativos, exceto ele), `<label><input type="checkbox"> Reescrever os documentos agora</label>`, botão `Substituir` → `replaceGesture` → mostra `{reescritos} documento(s) reescrito(s)` e as falhas, e recarrega. Depreciado mostra `Substituído por <link>`.

- [ ] **Step 1: Escrever os testes**

`web/src/pages/__tests__/GestureDictionaryPage.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider } from '../../context/AuthContext';
import * as api from '../../services/api';
import { GestureDictionaryPage } from '../GestureDictionaryPage';

const dic = {
  schema: 'coldigom.gesture-dictionary/1' as const, version: 2, generatedAt: 't',
  gestures: [
    { id: 'aaaaaaaaaaaa', name: 'Quero', description: '', exampleTriggers: ['Quero'], image: 'assets/cia/gestures/aaaaaaaaaaaa.png', gif: null, status: 'active' as const, replacedBy: null, updatedAt: 't' },
    { id: 'bbbbbbbbbbbb', name: 'Viver', description: '', exampleTriggers: ['viver'], image: 'assets/cia/gestures/bbbbbbbbbbbb.png', gif: null, status: 'active' as const, replacedBy: null, updatedAt: 't' },
    { id: '111111111111', name: 'Velho', description: '', exampleTriggers: [], image: 'assets/cia/gestures/111111111111.png', gif: null, status: 'deprecated' as const, replacedBy: 'aaaaaaaaaaaa', updatedAt: 't' },
  ],
};

function montar(autenticado = false) {
  vi.spyOn(api, 'getMe').mockResolvedValue(autenticado ? ({ sub: 'u1', name: 'Revisor' } as never) : null);
  vi.spyOn(api, 'getGestureDictionary').mockResolvedValue(dic);
  vi.spyOn(api, 'getGestureUsageCounts').mockResolvedValue([{ gesture_id: 'aaaaaaaaaaaa', materials: 12 }]);
  render(<AuthProvider><MemoryRouter><GestureDictionaryPage /></MemoryRouter></AuthProvider>);
}

afterEach(() => vi.restoreAllMocks());

describe('GestureDictionaryPage', () => {
  it('lista os ativos com figura e contagem de uso; depreciados só com o filtro', async () => {
    const user = userEvent.setup();
    montar();
    await waitFor(() => expect(screen.getByRole('link', { name: /Quero/ })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /Quero/ })).toHaveAttribute('href', '/gestos/dicionario/aaaaaaaaaaaa');
    expect(screen.getByText('usado em 12 materiais')).toBeInTheDocument();
    expect(screen.getByText('usado em 0 materiais')).toBeInTheDocument();
    expect(document.querySelectorAll('img')).toHaveLength(2);
    expect(screen.queryByText('Velho')).toBeNull();
    await user.click(screen.getByRole('checkbox', { name: /Mostrar substituídos/ }));
    expect(screen.getByText('Velho')).toBeInTheDocument();
  });

  it('a busca filtra sem acento', async () => {
    const user = userEvent.setup();
    montar();
    await waitFor(() => expect(screen.getByText('Viver')).toBeInTheDocument());
    await user.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'VIV');
    expect(screen.queryByText('Quero')).toBeNull();
    expect(screen.getByText('Viver')).toBeInTheDocument();
  });

  it('com sessão cria um gesto novo e recarrega', async () => {
    const user = userEvent.setup();
    montar(true);
    const criar = vi.spyOn(api, 'createGesture').mockResolvedValue(dic.gestures[0]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Criar gesto' })).toBeInTheDocument());
    await user.type(screen.getByRole('textbox', { name: 'Nome' }), 'Novo');
    await user.type(screen.getByRole('textbox', { name: 'Gatilhos de exemplo' }), 'a, b');
    const png = new File(['x'], 'g.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Figura PNG'), png);
    await user.click(screen.getByRole('button', { name: 'Criar gesto' }));
    await waitFor(() => expect(criar).toHaveBeenCalledWith({ name: 'Novo', description: '', exampleTriggers: ['a', 'b'], image: png }));
    expect(api.getGestureDictionary).toHaveBeenCalledTimes(2);
  });

  it('sem sessão não há formulário', async () => {
    montar(false);
    await waitFor(() => expect(screen.getByText('Viver')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Criar gesto' })).toBeNull();
  });
});
```

`web/src/pages/__tests__/GestureDetailPage.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider } from '../../context/AuthContext';
import * as api from '../../services/api';
import { GestureDetailPage } from '../GestureDetailPage';

const base = {
  id: 'aaaaaaaaaaaa', name: 'Quero', description: 'Mãos ao peito', exampleTriggers: ['Quero'], image: 'assets/cia/gestures/aaaaaaaaaaaa.png', gif: null,
  status: 'active' as const, replacedBy: null, updatedAt: 't',
};
const entrada = {
  ...base,
  usages: [{ material_id: 'g1', praise_id: 'p1', praise_name: 'Quero viver', praise_number: '182', count: 2 }],
};
const dic = {
  schema: 'coldigom.gesture-dictionary/1' as const, version: 2, generatedAt: 't',
  gestures: [
    base,
    { id: 'bbbbbbbbbbbb', name: 'Viver', description: '', exampleTriggers: [], image: 'b.png', gif: null, status: 'active' as const, replacedBy: null, updatedAt: 't' },
  ],
};

function montar(autenticado = true, dados = entrada) {
  vi.spyOn(api, 'getMe').mockResolvedValue(autenticado ? ({ sub: 'u1', name: 'Revisor' } as never) : null);
  vi.spyOn(api, 'getGesture').mockResolvedValue(dados);
  vi.spyOn(api, 'getGestureDictionary').mockResolvedValue(dic);
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/gestos/dicionario/aaaaaaaaaaaa']}>
        <Routes><Route path="/gestos/dicionario/:id" element={<GestureDetailPage />} /></Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

afterEach(() => vi.restoreAllMocks());

describe('GestureDetailPage', () => {
  it('mostra a entrada, a figura e onde é usada, com link para o editor', async () => {
    montar(false);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Quero' })).toBeInTheDocument());
    expect(document.querySelector('img')?.getAttribute('src')).toContain('aaaaaaaaaaaa.png');
    expect(screen.getByRole('link', { name: /182/ })).toHaveAttribute('href', '/praise/p1/gestos/g1');
    expect(screen.getAllByText(/2 vez/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Salvar alterações' })).toBeNull();
  });

  it('com sessão salva as alterações dos campos', async () => {
    const user = userEvent.setup();
    montar();
    const atualizar = vi.spyOn(api, 'updateGesture').mockResolvedValue({ ...entrada, name: 'Quero!' });
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Nome' })).toBeInTheDocument());
    await user.type(screen.getByRole('textbox', { name: 'Nome' }), '!');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(atualizar).toHaveBeenCalledWith('aaaaaaaaaaaa', { name: 'Quero!', description: 'Mãos ao peito', exampleTriggers: ['Quero'] }));
  });

  it('substituir por outro gesto chama replaceGesture e mostra o resultado', async () => {
    const user = userEvent.setup();
    montar();
    const substituir = vi.spyOn(api, 'replaceGesture').mockResolvedValue({ ok: true, reescritos: 1, falhas: [{ materialId: 'g9', motivo: 'objeto não existe no R2' }] });
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Gesto substituto' })).toBeInTheDocument());
    await user.selectOptions(screen.getByRole('combobox', { name: 'Gesto substituto' }), 'bbbbbbbbbbbb');
    await user.click(screen.getByRole('checkbox', { name: /Reescrever os documentos agora/ }));
    await user.click(screen.getByRole('button', { name: 'Substituir' }));
    await waitFor(() => expect(substituir).toHaveBeenCalledWith('aaaaaaaaaaaa', 'bbbbbbbbbbbb', true));
    expect(await screen.findByText(/1 documento\(s\) reescrito\(s\)/)).toBeInTheDocument();
    expect(screen.getByText(/g9/)).toBeInTheDocument();
    expect(api.getGesture).toHaveBeenCalledTimes(2);
  });

  it('gesto depreciado mostra o substituto e não oferece substituir de novo', async () => {
    montar(true, { ...entrada, status: 'deprecated', replacedBy: 'bbbbbbbbbbbb' });
    await waitFor(() => expect(screen.getByText(/Substituído por/)).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /Viver/ })).toHaveAttribute('href', '/gestos/dicionario/bbbbbbbbbbbb');
    expect(screen.queryByRole('button', { name: 'Substituir' })).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd web && npx vitest run src/pages/__tests__/GestureDictionaryPage.test.tsx src/pages/__tests__/GestureDetailPage.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Escrever `GestureDictionaryPage.tsx`**

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { GestureThumb } from '../components/gestures/GestureThumb';
import { useAuth } from '../context/useAuth';
import { indexar, normalizar, type GestureEntry, type Indice } from '../lib/gestures/dictionary';
import { createGesture, getGestureDictionary, getGestureUsageCounts } from '../services/api';

/** Lista densa do dicionário: figura, nome, id, gatilhos, status e uso. Gestão, não leitura. */
export function GestureDictionaryPage() {
  const { isAuthenticated } = useAuth();
  const [indice, setIndice] = useState<Indice | null>(null);
  const [usos, setUsos] = useState<Map<string, number>>(new Map());
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [mostrarSubstituidos, setMostrarSubstituidos] = useState(false);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const [dic, contagens] = await Promise.all([getGestureDictionary(), getGestureUsageCounts().catch(() => [])]);
      setIndice(indexar(dic));
      setUsos(new Map(contagens.map((c) => [c.gesture_id, c.materials])));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao carregar o dicionário');
    }
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const linhas = useMemo(() => {
    if (!indice) return [];
    const t = normalizar(busca);
    const casa = (texto: string) => normalizar(texto).split(/\s+/).some((p) => p.startsWith(t));
    return [...indice.porId.values()]
      .filter((g) => mostrarSubstituidos || g.status === 'active')
      .filter((g) => !t || casa(g.name) || g.exampleTriggers.some(casa) || g.id.startsWith(t))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
  }, [indice, busca, mostrarSubstituidos]);

  // formulário de gesto novo
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [gatilhos, setGatilhos] = useState('');
  const [figura, setFigura] = useState<File | null>(null);
  const [criando, setCriando] = useState(false);
  const [erroDoForm, setErroDoForm] = useState<string | null>(null);

  const criar = async () => {
    if (!nome.trim() || !figura) return;
    setCriando(true);
    setErroDoForm(null);
    try {
      await createGesture({
        name: nome.trim(),
        description: descricao.trim(),
        exampleTriggers: gatilhos.split(',').map((s) => s.trim()).filter(Boolean),
        image: figura,
      });
      setNome('');
      setDescricao('');
      setGatilhos('');
      setFigura(null);
      await carregar();
    } catch (e) {
      setErroDoForm(e instanceof Error ? e.message : 'Falha ao criar o gesto');
    } finally {
      setCriando(false);
    }
  };

  return (
    <main className="page-container gd-page">
      <Link to="/" className="cp-back">← Início</Link>
      <header className="cp-header">
        <div className="cp-header-main">
          <h1 className="cp-title">Dicionário de gestos</h1>
          {indice ? <div className="cp-number">versão {indice.version} · {indice.porId.size} gestos</div> : null}
        </div>
      </header>

      {erro ? <div className="cp-state cp-state--error"><div className="cp-state-title">{erro}</div><button type="button" className="cp-retry" onClick={() => void carregar()}>Tentar de novo</button></div> : null}

      <div className="gd-filtros">
        <input type="search" aria-label="Buscar" placeholder="Nome, gatilho ou id" value={busca} onChange={(e) => setBusca(e.target.value)} className="ge-picker-busca" />
        <label className="gd-check">
          <input type="checkbox" checked={mostrarSubstituidos} onChange={(e) => setMostrarSubstituidos(e.target.checked)} /> Mostrar substituídos
        </label>
      </div>

      {isAuthenticated ? (
        <details className="gd-novo" open>
          <summary>Novo gesto</summary>
          <div className="edit-grid">
            <div className="edit-field"><label htmlFor="gd-nome">Nome</label><input id="gd-nome" value={nome} onChange={(e) => setNome(e.target.value)} /></div>
            <div className="edit-field"><label htmlFor="gd-desc">Descrição</label><input id="gd-desc" value={descricao} onChange={(e) => setDescricao(e.target.value)} /></div>
            <div className="edit-field"><label htmlFor="gd-gat">Gatilhos de exemplo</label><input id="gd-gat" placeholder="separados por vírgula" value={gatilhos} onChange={(e) => setGatilhos(e.target.value)} /></div>
            <div className="edit-field"><label htmlFor="gd-png">Figura PNG</label><input id="gd-png" type="file" accept="image/png,.png" onChange={(e) => setFigura(e.target.files?.[0] ?? null)} /></div>
            <div className="edit-actions">
              <button type="button" className="auth-btn" disabled={criando || !nome.trim() || !figura} onClick={() => void criar()}>Criar gesto</button>
              {erroDoForm ? <span className="cp-review-error" role="status">{erroDoForm}</span> : null}
            </div>
          </div>
        </details>
      ) : null}

      <table className="gd-tabela">
        <thead>
          <tr><th>Figura</th><th>Nome</th><th>Id</th><th>Gatilhos</th><th>Status</th><th>Uso</th></tr>
        </thead>
        <tbody>
          {linhas.map((g: GestureEntry) => (
            <tr key={g.id} className={g.status === 'deprecated' ? 'is-depreciado' : ''}>
              <td><GestureThumb id={g.id} indice={indice} tamanho={64} /></td>
              <td><Link to={`/gestos/dicionario/${g.id}`}>{g.name}</Link></td>
              <td><code>{g.id}</code></td>
              <td>{g.exampleTriggers.join(', ')}</td>
              <td>{g.status === 'active' ? 'ativo' : `substituído por ${g.replacedBy ?? '?'}`}</td>
              <td>{`usado em ${usos.get(g.id) ?? 0} materiais`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
```

- [ ] **Step 4: Escrever `GestureDetailPage.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useAuth } from '../context/useAuth';
import { indexar, type Indice } from '../lib/gestures/dictionary';
import {
  getAssetUrl, getGesture, getGestureDictionary, replaceGesture, updateGesture, uploadGestureGif, uploadGestureImage, type GestureUsage,
} from '../services/api';
import type { GestureEntry } from '../lib/gestures/dictionary';

type Entrada = GestureEntry & { usages: GestureUsage[] };

export function GestureDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated } = useAuth();
  const [entrada, setEntrada] = useState<Entrada | null>(null);
  const [indice, setIndice] = useState<Indice | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [gatilhos, setGatilhos] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [substituto, setSubstituto] = useState('');
  const [reescrever, setReescrever] = useState(false);
  const [resultado, setResultado] = useState<{ reescritos: number; falhas: { materialId: string; motivo: string }[] } | null>(null);

  const carregar = useCallback(async () => {
    if (!id) return;
    setErro(null);
    try {
      const e = await getGesture(id);
      setEntrada(e);
      setNome(e.name);
      setDescricao(e.description);
      setGatilhos(e.exampleTriggers.join(', '));
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha ao carregar o gesto');
    }
  }, [id]);
  useEffect(() => {
    void carregar();
    getGestureDictionary().then((d) => setIndice(indexar(d))).catch(() => setIndice(null));
  }, [carregar]);

  const executar = async (acao: () => Promise<unknown>, ok: string) => {
    setOcupado(true);
    setAviso(null);
    try {
      await acao();
      setAviso(ok);
      await carregar();
    } catch (err) {
      setAviso(err instanceof Error ? err.message : 'Falha');
    } finally {
      setOcupado(false);
    }
  };

  if (erro) return <main className="page-container gd-page"><div className="error-state"><div className="error-state-title">{erro}</div></div></main>;
  if (!entrada || !id) return <main className="page-container gd-page"><div className="loading-state"><div className="loading-spinner" /></div></main>;

  const substituidoPor = entrada.replacedBy ? indice?.porId.get(entrada.replacedBy) : null;
  const candidatos = (indice?.ativos ?? []).filter((g) => g.id !== id);
  const totalDeVezes = entrada.usages.reduce((n, u) => n + u.count, 0);

  return (
    <main className="page-container gd-page">
      <Link to="/gestos/dicionario" className="cp-back">← Dicionário</Link>
      <header className="cp-header">
        <div className="cp-header-main">
          <h1 className="cp-title">{entrada.name}</h1>
          <div className="cp-number"><code>{entrada.id}</code> · {entrada.status === 'active' ? 'ativo' : 'substituído'}</div>
          {entrada.status === 'deprecated' ? (
            <div className="cp-artist">
              Substituído por {substituidoPor ? <Link to={`/gestos/dicionario/${substituidoPor.id}`}>{substituidoPor.name}</Link> : <code>{entrada.replacedBy}</code>}
            </div>
          ) : null}
        </div>
      </header>

      <section className="gd-figuras">
        <img src={getAssetUrl(entrada.image)} alt={entrada.name} width={96} height={96} className="gv-figura" />
        {entrada.gif ? <img src={getAssetUrl(entrada.gif)} alt={`${entrada.name} (animação)`} width={96} height={96} className="gv-figura" /> : <span className="materials-placeholder">Sem GIF</span>}
        {isAuthenticated ? (
          <div className="gd-figuras-acoes">
            <label className="ge-btn">Trocar figura<input type="file" accept="image/png,.png" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void executar(() => uploadGestureImage(id, f), 'Figura trocada.'); }} /></label>
            <label className="ge-btn">Enviar GIF<input type="file" accept="image/gif,.gif" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void executar(() => uploadGestureGif(id, f), 'GIF enviado.'); }} /></label>
          </div>
        ) : null}
      </section>

      <section className="cp-panel">
        <h2 className="cp-panel-title">Dados</h2>
        {isAuthenticated ? (
          <div className="edit-grid">
            <div className="edit-field"><label htmlFor="gd-nome">Nome</label><input id="gd-nome" value={nome} onChange={(e) => setNome(e.target.value)} /></div>
            <div className="edit-field"><label htmlFor="gd-desc">Descrição</label><input id="gd-desc" value={descricao} onChange={(e) => setDescricao(e.target.value)} /></div>
            <div className="edit-field"><label htmlFor="gd-gat">Gatilhos de exemplo</label><input id="gd-gat" value={gatilhos} onChange={(e) => setGatilhos(e.target.value)} /></div>
            <div className="edit-actions">
              <button
                type="button"
                className="auth-btn"
                disabled={ocupado || !nome.trim()}
                onClick={() => void executar(
                  () => updateGesture(id, { name: nome.trim(), description: descricao.trim(), exampleTriggers: gatilhos.split(',').map((s) => s.trim()).filter(Boolean) }),
                  'Alterações salvas.'
                )}
              >
                Salvar alterações
              </button>
              {aviso ? <span className="cp-edit-issues" role="status" aria-live="polite">{aviso}</span> : null}
            </div>
          </div>
        ) : (
          <dl className="cp-panel-col">
            <div className="cp-panel-row"><dt>Descrição</dt><dd>{entrada.description || '—'}</dd></div>
            <div className="cp-panel-row"><dt>Gatilhos</dt><dd>{entrada.exampleTriggers.join(', ') || '—'}</dd></div>
          </dl>
        )}
      </section>

      <section className="cp-panel">
        <h2 className="cp-panel-title">Usado em</h2>
        {entrada.usages.length === 0 ? (
          <p className="materials-placeholder">Nenhum documento usa este gesto.</p>
        ) : (
          <>
            <p className="cp-number">{entrada.usages.length} material(is), {totalDeVezes} vez(es) no total</p>
            <ul className="gd-usos">
              {entrada.usages.map((u) => (
                <li key={u.material_id}>
                  <Link to={`/praise/${u.praise_id}/gestos/${u.material_id}`}>{u.praise_number ? `${u.praise_number} - ` : ''}{u.praise_name}</Link>
                  <span className="cp-number"> · {u.count} vez(es)</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {isAuthenticated && entrada.status === 'active' ? (
        <section className="cp-panel">
          <h2 className="cp-panel-title">Substituir por outro gesto</h2>
          <p className="cp-number">Este gesto vira "substituído" e passa a apontar para o escolhido. Os documentos continuam válidos: o app resolve o substituto ao desenhar.</p>
          <div className="edit-grid">
            <div className="edit-field">
              <label htmlFor="gd-sub">Gesto substituto</label>
              <select id="gd-sub" value={substituto} onChange={(e) => setSubstituto(e.target.value)}>
                <option value="">(escolha)</option>
                {candidatos.map((g) => <option key={g.id} value={g.id}>{g.name} · {g.id}</option>)}
              </select>
            </div>
            <label className="gd-check"><input type="checkbox" checked={reescrever} onChange={(e) => setReescrever(e.target.checked)} /> Reescrever os documentos agora</label>
            <div className="edit-actions">
              <button
                type="button"
                className="auth-btn"
                disabled={ocupado || !substituto}
                onClick={() => void executar(async () => { setResultado(await replaceGesture(id, substituto, reescrever)); }, 'Gesto substituído.')}
              >
                Substituir
              </button>
            </div>
          </div>
          {resultado ? (
            <div className="cp-state">
              <div>{resultado.reescritos} documento(s) reescrito(s).</div>
              {resultado.falhas.length ? (
                <ul>{resultado.falhas.map((f) => <li key={f.materialId}><code>{f.materialId}</code>: {f.motivo}</li>)}</ul>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
```

- [ ] **Step 5: Rotas e CSS**

Em `App.tsx`:

```tsx
import { GestureDictionaryPage } from './pages/GestureDictionaryPage';
import { GestureDetailPage } from './pages/GestureDetailPage';
…
            <Route path="/gestos/dicionario" element={<GestureDictionaryPage />} />
            <Route path="/gestos/dicionario/:id" element={<GestureDetailPage />} />
```

No fim de `global.css`:

```css
/* ---------- dicionário de gestos ---------- */
.gd-page { max-width: 1100px; }
.gd-filtros { display: flex; gap: 12px; align-items: center; margin: 12px 0; }
.gd-check { display: inline-flex; gap: 6px; align-items: center; font-size: 0.9rem; }
.gd-novo { margin: 8px 0 16px; }
.gd-tabela { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
.gd-tabela th, .gd-tabela td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: middle; }
.gd-tabela tr.is-depreciado { opacity: 0.6; }
.gd-figuras { display: flex; gap: 16px; align-items: center; margin: 12px 0; }
.gd-figuras-acoes { display: flex; gap: 8px; }
.gd-usos { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; }
```

- [ ] **Step 6: Rodar**

Run: `cd web && npx vitest run src/pages/__tests__/GestureDictionaryPage.test.tsx src/pages/__tests__/GestureDetailPage.test.tsx && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit e fechar a fatia (f)**

```bash
git add web/src/pages/GestureDictionaryPage.tsx web/src/pages/GestureDetailPage.tsx web/src/pages/__tests__/GestureDictionaryPage.test.tsx web/src/pages/__tests__/GestureDetailPage.test.tsx web/src/App.tsx web/src/styles/global.css
git commit -m "feat(gestos/web): páginas do dicionário — lista com uso, detalhe com edição, figuras e substituição"
```

Na raiz: `npm run verify`. Cole a saída no relatório da fatia (f).

---

### Task 12: Catraca de cobertura do web

**Files:**
- Modify: `web/vitest.config.ts`

- [ ] **Step 1: Medir**

Run: `cd web && npm run test:coverage 2>&1 | grep -E "^All files"`

- [ ] **Step 2: Subir os thresholds**

Acrescente a linha de histórico e troque os quatro valores pelo **piso** de cada medido — nunca abaixo de 79 / 72 / 76 / 81. Se algum medido ficou abaixo, é bug do plano: pare e avise.

```ts
      // Gestos (2026-09-XX): editor de gestos — <medidos>
      thresholds: {
        statements: <piso>,
        branches: <piso>,
        functions: <piso>,
        lines: <piso>,
      },
```

- [ ] **Step 3: Verificar e commitar**

Run: `npm run verify` (na raiz) — verde.

```bash
git add web/vitest.config.ts
git commit -m "chore(web): catraca de cobertura sobe com os gestos"
```
