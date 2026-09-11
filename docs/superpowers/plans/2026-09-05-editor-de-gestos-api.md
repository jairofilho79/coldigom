# Editor de gestos CIAs — plano da API

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A API do coldigom passa a validar, gravar e servir documentos de gestos por louvor, manter o dicionário de gestos com versão monotônica servindo de ETag, e importar a carga inicial do pdf_extractor.

**Architecture:** Validador puro e espelhado (`api/src/gestures/schema.ts`), contador de usos puro (`usage.ts`), migração `018` com três tabelas, módulo de rotas novo (`routes/gestures.ts`) cuja única porta de escrita no dicionário (`escreverNoDicionario`) sobe a versão no mesmo `DB.batch()`, o `PUT /content` despachando por tipo, e um importador em etapas no molde do `ingest.ts`.

**Tech Stack:** Hono 4 em Cloudflare Workers, D1 (SQLite), R2, vitest 4, tsx para scripts, `@aws-sdk/client-s3` para o R2 fora do Worker.

**Spec:** `docs/superpowers/specs/2026-09-05-editor-de-gestos-design.md` — o plano argumenta a partir dela; leia as duas.

## Global Constraints

- Testes, comentários e mensagens de erro em **português**. Nomes de função e variável em português, como o resto de `api/src/routes/`.
- `routes.inventory.test.ts` é atualizado **no mesmo commit** que muda uma rota; a lista é sequencial, na ordem de registro; rotas com `requireAuth` aparecem duas vezes.
- A catraca de cobertura (`api/vitest.config.ts`) nunca desce: hoje `statements: 70, branches: 66, functions: 72, lines: 72`.
- `wrangler` sempre global (`execFileSync('wrangler', …)`), **nunca** `npx wrangler`.
- Sem zod nem dependência nova no Worker.
- O contrato de dados (`GestureDocument`, `GestureDictionary`) e os códigos de erro são os da spec, **verbatim**. Não os altere; se achar um problema real neles, pare e avise.
- `gestureId` **não** é conferido contra o dicionário no `PUT`.
- Teto do documento: `256 * 1024` bytes (reaproveita `MAX_CHORD_CONTENT_BYTES`).
- Chaves do R2: documento em `assets/praises/{praiseId}/{materialId}.gestures`; figuras em `assets/cia/gestures/{id}.png` e `.gif`; sempre gravadas via `storageKeyFor()` (prefixo `storage/`).
- Antes de dar uma fatia por pronta: `npm run verify` na raiz, verde, com o resultado colado no relatório.
- Commits terminam com `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `api/src/gestures/schema.ts` (novo) | tipos do contrato, `validarDocumento`, `MENSAGENS` — espelhado no web |
| `api/src/gestures/__fixtures__/*.json` (novo) | corpo de casos válidos/inválidos, lido pelos testes da API **e** do web |
| `api/src/gestures/usage.ts` (novo) | `contarUsos(doc)` e `substituirGesto(doc, de, para)` |
| `api/src/gestures/dicionario.ts` (novo) | leitura de linhas → `GestureEntry`, `escreverNoDicionario`, `chaveDaFigura`, `gerarIdDeGesto` |
| `api/src/routes/gestures.ts` (novo) | `registerGesturesRoutes` — as 8 rotas |
| `api/src/routes/materials.ts` | `PUT /content` despacha por tipo; `DELETE` limpa `gesture_usage` |
| `api/src/routes/praises.ts` | `POST /:id/materials` cria `gestures` com `r2_key`; `has_content` também para `gestures` |
| `api/src/routes/assets.ts` | três content-types |
| `api/src/index.ts` | CORS expõe `ETag` e aceita `If-Match`/`If-None-Match`; registra `registerGesturesRoutes` |
| `api/migrations/018_gestures.sql` (novo) + `api/schema.sql` | as três tabelas |
| `api/scripts/import_gestures.ts` (novo) + `api/scripts/__fixtures__/gestures-export/` (novo) | importador em etapas |

Fatia (a) = Tasks 1–4. Fatia (b) = Tasks 5–9. Fatia (c) = Task 10. Task 11 fecha a catraca.

---

### Task 1: `schema.ts` — tipos, validador e fixtures compartilhadas

**Files:**
- Create: `api/src/gestures/schema.ts`
- Create: `api/src/gestures/__fixtures__/valido-exemplo.json`
- Create: `api/src/gestures/__fixtures__/valido-minimo.json`
- Create: `api/src/gestures/__fixtures__/invalidos.json`
- Test: `api/src/__tests__/gesturesSchema.test.ts`

**Interfaces:**
- Produces: `validarDocumento(valor: unknown): ResultadoDaValidacao`, `MENSAGENS: Record<CodigoDeErro, string>`, `MAX_GESTURES_DOCUMENT_BYTES`, `GESTURE_ID_RE`, `INSTRUCTION_KINDS`, e os tipos `GestureDocument`, `Item`, `BlockChild`, `GestureItem`, `LyricLine`, `RepeatBlock`, `ChorusBlock`, `LinkBlock`, `FinalBlock`, `InstructionItem`, `InstructionKind`, `TextItem`, `CodigoDeErro`, `ErroDeValidacao`, `ResultadoDaValidacao`.
- O web copia este arquivo inteiro para `web/src/lib/gestures/schema.ts` (plano do web, Task 1). Qualquer mudança aqui exige a mesma mudança lá.

- [ ] **Step 1: Escrever as fixtures**

`api/src/gestures/__fixtures__/valido-exemplo.json` — é o documento de exemplo da spec de origem (coro de 5 gestos, repetição, link, final e duas instruções). Os `gestureId` são inventados mas válidos:

```json
{
  "schema": "coldigom.gestures/1",
  "title": "182 - QUERO VIVER PRA SEMPRE COM JESUS",
  "dictionaryVersion": 3,
  "items": [
    {
      "type": "coro",
      "children": [
        { "type": "gesture", "gestureId": "c687580e7682", "lyrics": [{ "trigger": "Quero", "text": "viver pra sempre com Jesus" }] },
        { "type": "gesture", "gestureId": "a1b2c3d4e5f6", "lyrics": [{ "trigger": "viver", "text": ", viver com Ele" }] },
        { "type": "gesture", "gestureId": "0f0f0f0f0f0f", "lyrics": [{ "trigger": "pra sempre", "text": "no céu" }, { "trigger": "", "text": "e na terra também" }] },
        { "type": "gesture", "gestureId": "123456789abc", "lyrics": [{ "trigger": "com", "text": "todos os irmãos" }] },
        { "type": "gesture", "gestureId": "deadbeef0001", "lyrics": [{ "trigger": "Jesus", "text": "é o meu Senhor" }] }
      ]
    },
    {
      "type": "repeat",
      "count": 2,
      "children": [
        { "type": "gesture", "gestureId": "deadbeef0002", "lyrics": [{ "trigger": "Ele", "text": "me ama" }] },
        {
          "type": "link",
          "children": [
            { "type": "gesture", "gestureId": "deadbeef0003", "lyrics": [{ "trigger": "e", "text": "me guarda" }] },
            { "type": "gesture", "gestureId": "deadbeef0004", "lyrics": [{ "trigger": "todo", "text": "dia" }] }
          ]
        }
      ]
    },
    { "type": "text", "text": "(pausa para os instrumentos)" },
    {
      "type": "final",
      "children": [
        { "type": "gesture", "gestureId": "deadbeef0005", "lyrics": [{ "trigger": "Amém", "text": "!" }] }
      ]
    },
    { "type": "instruction", "kind": "back_to_chorus" },
    { "type": "instruction", "kind": "back_to_chorus_and_finish" }
  ]
}
```

`api/src/gestures/__fixtures__/valido-minimo.json`:

```json
{
  "schema": "coldigom.gestures/1",
  "title": "1 - MÍNIMO",
  "dictionaryVersion": 0,
  "items": [
    { "type": "gesture", "gestureId": "000000000001", "lyrics": [{ "trigger": "", "text": "só leitura" }] }
  ]
}
```

`api/src/gestures/__fixtures__/invalidos.json` — cada caso traz o documento, o `codigo` e o `caminho` esperados. O campo `nome` é só para a mensagem do teste. Use `"BASE"` no lugar de um item de gesto válido para não repetir:

```json
[
  { "nome": "não é objeto", "doc": 42, "codigo": "schema_desconhecido", "caminho": "" },
  { "nome": "schema errado", "doc": { "schema": "outro/1", "title": "x", "dictionaryVersion": 0, "items": ["BASE"] }, "codigo": "schema_desconhecido", "caminho": "schema" },
  { "nome": "título vazio", "doc": { "schema": "coldigom.gestures/1", "title": "   ", "dictionaryVersion": 0, "items": ["BASE"] }, "codigo": "titulo_invalido", "caminho": "title" },
  { "nome": "versão negativa", "doc": { "schema": "coldigom.gestures/1", "title": "x", "dictionaryVersion": -1, "items": ["BASE"] }, "codigo": "versao_dicionario_invalida", "caminho": "dictionaryVersion" },
  { "nome": "versão fracionária", "doc": { "schema": "coldigom.gestures/1", "title": "x", "dictionaryVersion": 1.5, "items": ["BASE"] }, "codigo": "versao_dicionario_invalida", "caminho": "dictionaryVersion" },
  { "nome": "items vazio", "doc": { "schema": "coldigom.gestures/1", "title": "x", "dictionaryVersion": 0, "items": [] }, "codigo": "itens_vazios", "caminho": "items" },
  { "nome": "items não é array", "doc": { "schema": "coldigom.gestures/1", "title": "x", "dictionaryVersion": 0, "items": "BASE" }, "codigo": "itens_vazios", "caminho": "items" },
  { "nome": "só instrução, sem gesto", "doc": { "schema": "coldigom.gestures/1", "title": "x", "dictionaryVersion": 0, "items": [{ "type": "instruction", "kind": "instruments" }] }, "codigo": "sem_gesto", "caminho": "items" },
  { "nome": "tipo desconhecido na raiz", "doc": { "schema": "coldigom.gestures/1", "title": "x", "dictionaryVersion": 0, "items": ["BASE", { "type": "dança" }] }, "codigo": "tipo_desconhecido", "caminho": "items[1]" },
  { "nome": "tipo desconhecido aninhado", "doc": { "schema": "coldigom.gestures/1", "title": "x", "dictionaryVersion": 0, "items": [{ "type": "coro", "children": ["BASE", { "type": "x" }] }] }, "codigo": "tipo_desconhecido", "caminho": "items[0].children[1]" },
  { "nome": "texto dentro de bloco", "doc": { "schema": "coldigom.gestures/1", "title": "x", "dictionaryVersion": 0, "items": [{ "type": "coro", "children": ["BASE", { "type": "text", "text": "x" }] }] }, "codigo": "tipo_desconhecido", "caminho": "items[0].children[1]" },
  { "nome": "item sem type", "doc": { "schema": "coldigom.gestures/1", "title": "x", "dictionaryVersion": 0, "items": [{ "gestureId": "000000000001" }] }, "codigo": "tipo_desconhecido", "caminho": "items[0]" },
  { "nome": "gestureId curto", "doc": { "schema": "coldigom.gestures/1", "title": "x", "dictionaryVersion": 0, "items": [{ "type": "gesture", "gestureId": "abc", "lyrics": [{ "trigger": "a", "text": "" }] }] }, "codigo": "gesture_id_invalido", "caminho": "items[0].gestureId" },
  { "nome": "gestureId maiúsculo", "doc": { "schema": "coldigom.gestures/1", "title": "x", "dictionaryVersion": 0, "items": [{ "type": "gesture", "gestureId": "ABCDEF012345", "lyrics": [{ "trigger": "a", "text": "" }] }] }, "codigo": "gesture_id_invalido", "caminho": "items[0].gestureId" },
  { "nome": "lyrics vazio", "doc": { "schema": "coldigom.gestures/1", "title": "x", "dictionaryVersion": 0, "items": [{ "type": "gesture", "gestureId": "000000000001", "lyrics": [] }] }, "codigo": "letras_fora_do_limite", "caminho": "items[0].lyrics" },
  { "nome": "lyrics com 4 linhas", "doc": { "schema": "coldigom.gestures/1", "title": "x", "dictionaryVersion": 0, "items": [{ "type": "gesture", "gestureId": "000000000001", "lyrics": [{ "trigger": "a", "text": "" }, { "trigger": "", "text": "b" }, { "trigger": "", "text": "c" }, { "trigger": "", "text": "d" }] }] }, "codigo": "letras_fora_do_limite", "caminho": "items[0].lyrics" },
  { "nome": "linha sem text", "doc": { "schema": "coldigom.gestures/1", "title": "x", "dictionaryVersion": 0, "items": [{ "type": "gesture", "gestureId": "000000000001", "lyrics": [{ "trigger": "a" }] }] }, "codigo": "linha_invalida", "caminho": "items[0].lyrics[0]" },
  { "nome": "linha com trigger numérico", "doc": { "schema": "coldigom.gestures/1", "title": "x", "dictionaryVersion": 0, "items": [{ "type": "gesture", "gestureId": "000000000001", "lyrics": [{ "trigger": "a", "text": "" }, { "trigger": 1, "text": "b" }] }] }, "codigo": "linha_invalida", "caminho": "items[0].lyrics[1]" },
  { "nome": "primeira linha vazia", "doc": { "schema": "coldigom.gestures/1", "title": "x", "dictionaryVersion": 0, "items": [{ "type": "gesture", "gestureId": "000000000001", "lyrics": [{ "trigger": " ", "text": "" }] }] }, "codigo": "primeira_linha_vazia", "caminho": "items[0].lyrics[0]" },
  { "nome": "repeat com count 1", "doc": { "schema": "coldigom.gestures/1", "title": "x", "dictionaryVersion": 0, "items": [{ "type": "repeat", "count": 1, "children": ["BASE"] }] }, "codigo": "repeticao_invalida", "caminho": "items[0].count" },
  { "nome": "repeat com count fracionário", "doc": { "schema": "coldigom.gestures/1", "title": "x", "dictionaryVersion": 0, "items": [{ "type": "repeat", "count": 2.5, "children": ["BASE"] }] }, "codigo": "repeticao_invalida", "caminho": "items[0].count" },
  { "nome": "repeat vazio", "doc": { "schema": "coldigom.gestures/1", "title": "x", "dictionaryVersion": 0, "items": ["BASE", { "type": "repeat", "count": 2, "children": [] }] }, "codigo": "bloco_vazio", "caminho": "items[1].children" },
  { "nome": "coro sem children", "doc": { "schema": "coldigom.gestures/1", "title": "x", "dictionaryVersion": 0, "items": ["BASE", { "type": "coro" }] }, "codigo": "bloco_vazio", "caminho": "items[1].children" },
  { "nome": "final vazio", "doc": { "schema": "coldigom.gestures/1", "title": "x", "dictionaryVersion": 0, "items": ["BASE", { "type": "final", "children": [] }] }, "codigo": "bloco_vazio", "caminho": "items[1].children" },
  { "nome": "link com 1 filho", "doc": { "schema": "coldigom.gestures/1", "title": "x", "dictionaryVersion": 0, "items": [{ "type": "link", "children": ["BASE"] }] }, "codigo": "link_com_filhos_invalidos", "caminho": "items[0].children" },
  { "nome": "link com 4 filhos", "doc": { "schema": "coldigom.gestures/1", "title": "x", "dictionaryVersion": 0, "items": [{ "type": "link", "children": ["BASE", "BASE", "BASE", "BASE"] }] }, "codigo": "link_com_filhos_invalidos", "caminho": "items[0].children" },
  { "nome": "final dentro de coro", "doc": { "schema": "coldigom.gestures/1", "title": "x", "dictionaryVersion": 0, "items": [{ "type": "coro", "children": ["BASE", { "type": "final", "children": ["BASE"] }] }] }, "codigo": "final_fora_da_raiz", "caminho": "items[0].children[1]" },
  { "nome": "dois finais", "doc": { "schema": "coldigom.gestures/1", "title": "x", "dictionaryVersion": 0, "items": [{ "type": "final", "children": ["BASE"] }, { "type": "final", "children": ["BASE"] }] }, "codigo": "final_duplicado", "caminho": "items[1]" },
  { "nome": "gesto depois do final", "doc": { "schema": "coldigom.gestures/1", "title": "x", "dictionaryVersion": 0, "items": [{ "type": "final", "children": ["BASE"] }, "BASE"] }, "codigo": "item_depois_do_final", "caminho": "items[1]" },
  { "nome": "instrução dentro de repeat", "doc": { "schema": "coldigom.gestures/1", "title": "x", "dictionaryVersion": 0, "items": [{ "type": "repeat", "count": 2, "children": ["BASE", { "type": "instruction", "kind": "instruments" }] }] }, "codigo": "instrucao_fora_da_raiz", "caminho": "items[0].children[1]" },
  { "nome": "instrução desconhecida", "doc": { "schema": "coldigom.gestures/1", "title": "x", "dictionaryVersion": 0, "items": ["BASE", { "type": "instruction", "kind": "dance" }] }, "codigo": "instrucao_desconhecida", "caminho": "items[1].kind" },
  { "nome": "texto sem text", "doc": { "schema": "coldigom.gestures/1", "title": "x", "dictionaryVersion": 0, "items": ["BASE", { "type": "text" }] }, "codigo": "texto_invalido", "caminho": "items[1].text" }
]
```

- [ ] **Step 2: Escrever o teste que varre as fixtures**

`api/src/__tests__/gesturesSchema.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MENSAGENS, validarDocumento, type CodigoDeErro } from '../gestures/schema';

/**
 * O validador é espelhado em web/src/lib/gestures/schema.ts, e o teste de lá lê
 * ESTA mesma pasta de fixtures. Provar comportamento igual sobre o mesmo corpo de
 * casos é o que segura o espelho — não a comparação de texto dos dois arquivos.
 */
const FIXTURES = resolve(__dirname, '..', 'gestures', '__fixtures__');
const ler = (nome: string) => JSON.parse(readFileSync(resolve(FIXTURES, nome), 'utf8'));

/** Item de gesto válido que as fixtures inválidas abreviam como "BASE". */
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

describe('validarDocumento — fixtures compartilhadas', () => {
  it('aceita o exemplo da spec', () => {
    const r = validarDocumento(ler('valido-exemplo.json'));
    expect(r.ok).toBe(true);
  });

  it('aceita o documento mínimo', () => {
    expect(validarDocumento(ler('valido-minimo.json')).ok).toBe(true);
  });

  it('devolve o próprio documento tipado quando aceita', () => {
    const doc = ler('valido-minimo.json');
    const r = validarDocumento(doc);
    if (!r.ok) throw new Error('deveria aceitar');
    expect(r.doc).toBe(doc);
  });

  const invalidos = ler('invalidos.json') as CasoInvalido[];
  for (const caso of invalidos) {
    it(`recusa: ${caso.nome} → ${caso.codigo} em "${caso.caminho}"`, () => {
      const r = validarDocumento(expandir(caso.doc));
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.erro.codigo).toBe(caso.codigo);
      expect(r.erro.caminho).toBe(caso.caminho);
    });
  }

  it('toda fixture inválida usa um código que tem frase', () => {
    for (const caso of invalidos) expect(MENSAGENS[caso.codigo]).toBeTruthy();
  });

  it('a tabela tem os 21 códigos da spec, todos com frase em português', () => {
    expect(Object.keys(MENSAGENS).sort()).toEqual([
      'bloco_vazio', 'documento_grande', 'final_duplicado', 'final_fora_da_raiz',
      'gesture_id_invalido', 'instrucao_desconhecida', 'instrucao_fora_da_raiz',
      'item_depois_do_final', 'itens_vazios', 'json_invalido', 'letras_fora_do_limite',
      'linha_invalida', 'link_com_filhos_invalidos', 'primeira_linha_vazia',
      'repeticao_invalida', 'schema_desconhecido', 'sem_gesto', 'texto_invalido',
      'tipo_desconhecido', 'titulo_invalido', 'versao_dicionario_invalida',
    ]);
    for (const frase of Object.values(MENSAGENS)) expect(frase.length).toBeGreaterThan(10);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd api && npx vitest run src/__tests__/gesturesSchema.test.ts`
Expected: FAIL — `Cannot find module '../gestures/schema'`.

- [ ] **Step 4: Escrever `api/src/gestures/schema.ts`**

```ts
/**
 * Contrato do documento de gestos CIAs — `coldigom.gestures/1`.
 *
 * ESPELHADO em web/src/lib/gestures/schema.ts. Os dois arquivos são cópias um do
 * outro, no padrão de uploadLimits.ts: o servidor manda, e a cópia do web existe
 * para o revisor ver a recusa ANTES de gastar rede — com a mesma frase. Toda
 * mudança aqui é a mesma mudança lá; os testes dos dois lados leem a mesma pasta
 * __fixtures__ e é isso que segura a equivalência.
 *
 * O que este validador NÃO faz, de propósito: conferir gestureId contra o
 * dicionário. O importador pode chegar antes do dicionário, e recusar a gravação
 * por isso seria dado perdido. Quem avisa é o editor, visualmente.
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
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd api && npx vitest run src/__tests__/gesturesSchema.test.ts`
Expected: PASS, 30+ testes (3 válidos + 32 inválidos + 2 da tabela).

- [ ] **Step 6: Commit**

```bash
git add api/src/gestures/schema.ts api/src/gestures/__fixtures__ api/src/__tests__/gesturesSchema.test.ts
git commit -m "feat(gestos): contrato, validador e fixtures compartilhadas do documento de gestos"
```

---

### Task 2: `usage.ts` — contar e substituir gestos na árvore

**Files:**
- Create: `api/src/gestures/usage.ts`
- Test: `api/src/__tests__/gesturesUsage.test.ts`

**Interfaces:**
- Consumes: `GestureDocument`, `Item` de `./schema`.
- Produces: `contarUsos(doc: GestureDocument): Map<string, number>`; `substituirGesto(doc: GestureDocument, de: string, para: string): { doc: GestureDocument; trocados: number }` (imutável — devolve documento novo).

- [ ] **Step 1: Escrever o teste**

`api/src/__tests__/gesturesUsage.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { GestureDocument } from '../gestures/schema';
import { contarUsos, substituirGesto } from '../gestures/usage';

const exemplo = JSON.parse(
  readFileSync(resolve(__dirname, '..', 'gestures', '__fixtures__', 'valido-exemplo.json'), 'utf8')
) as GestureDocument;

describe('contarUsos', () => {
  it('conta gestos em qualquer profundidade', () => {
    const usos = contarUsos(exemplo);
    // 5 no coro + 1 no repeat + 2 no link dentro do repeat + 1 no final = 9 ids distintos
    expect(usos.size).toBe(9);
    expect(usos.get('c687580e7682')).toBe(1);
    expect(usos.get('deadbeef0004')).toBe(1);
  });

  it('soma repetições do mesmo id', () => {
    const doc: GestureDocument = {
      schema: 'coldigom.gestures/1',
      title: 'x',
      dictionaryVersion: 0,
      items: [
        { type: 'gesture', gestureId: '000000000001', lyrics: [{ trigger: 'a', text: '' }] },
        {
          type: 'coro',
          children: [{ type: 'gesture', gestureId: '000000000001', lyrics: [{ trigger: 'b', text: '' }] }],
        },
      ],
    };
    expect(contarUsos(doc).get('000000000001')).toBe(2);
  });

  it('ignora instruções e texto livre', () => {
    const doc: GestureDocument = {
      schema: 'coldigom.gestures/1',
      title: 'x',
      dictionaryVersion: 0,
      items: [
        { type: 'gesture', gestureId: '000000000001', lyrics: [{ trigger: 'a', text: '' }] },
        { type: 'text', text: 'livre' },
        { type: 'instruction', kind: 'instruments' },
      ],
    };
    expect([...contarUsos(doc).keys()]).toEqual(['000000000001']);
  });
});

describe('substituirGesto', () => {
  it('troca o id em qualquer profundidade e devolve documento novo', () => {
    const { doc, trocados } = substituirGesto(exemplo, 'deadbeef0004', 'ffffffffffff');
    expect(trocados).toBe(1);
    expect(doc).not.toBe(exemplo);
    expect(contarUsos(doc).get('ffffffffffff')).toBe(1);
    expect(contarUsos(doc).has('deadbeef0004')).toBe(false);
    // o original não foi tocado
    expect(contarUsos(exemplo).has('deadbeef0004')).toBe(true);
  });

  it('sem ocorrência: zero trocados e o mesmo conteúdo', () => {
    const { doc, trocados } = substituirGesto(exemplo, 'nao-existe-00', 'ffffffffffff');
    expect(trocados).toBe(0);
    expect(doc).toEqual(exemplo);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd api && npx vitest run src/__tests__/gesturesUsage.test.ts`
Expected: FAIL — módulo `../gestures/usage` não existe.

- [ ] **Step 3: Escrever `api/src/gestures/usage.ts`**

```ts
import type { GestureDocument, Item } from './schema';

/**
 * A única coisa que sabe traduzir documento em linhas de gesture_usage. Serve ao
 * PUT /content e ao importador; se os dois contassem por conta própria, um dia
 * divergiriam e a página do dicionário mentiria o uso.
 */
export function contarUsos(doc: GestureDocument): Map<string, number> {
  const usos = new Map<string, number>();
  const visitar = (item: Item): void => {
    if (item.type === 'gesture') {
      usos.set(item.gestureId, (usos.get(item.gestureId) ?? 0) + 1);
      return;
    }
    if ('children' in item) item.children.forEach(visitar);
  };
  doc.items.forEach(visitar);
  return usos;
}

/** Reescrita usada pelo replace-with: imutável, devolve o documento novo e quantos ids trocou. */
export function substituirGesto(
  doc: GestureDocument,
  de: string,
  para: string
): { doc: GestureDocument; trocados: number } {
  let trocados = 0;
  const mapear = <T extends Item>(item: T): T => {
    if (item.type === 'gesture') {
      if (item.gestureId !== de) return item;
      trocados += 1;
      return { ...item, gestureId: para };
    }
    if ('children' in item) {
      return { ...item, children: item.children.map(mapear) };
    }
    return item;
  };
  return { doc: { ...doc, items: doc.items.map(mapear) }, trocados };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd api && npx vitest run src/__tests__/gesturesUsage.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add api/src/gestures/usage.ts api/src/__tests__/gesturesUsage.test.ts
git commit -m "feat(gestos): contagem e substituição de gestos na árvore do documento"
```

---

### Task 3: `PUT /api/materials/:materialId/content` despacha por tipo

**Files:**
- Modify: `api/src/routes/materials.ts:83-191` (o handler do PUT)
- Test: `api/src/__tests__/gesturesContentWrite.test.ts` (novo)
- Test: `api/src/__tests__/materialContentWrite.test.ts` (continua verde sem mudança)

**Interfaces:**
- Consumes: `validarDocumento`, `MENSAGENS`, `MAX_GESTURES_DOCUMENT_BYTES` de `../gestures/schema`; `contarUsos` de `../gestures/usage`.
- Produces: no ramo `gestures`, `400 { error, code, path }`, `409 { error, code: 'stale_write' }`, `413 { error, code: 'documento_grande', path: '' }`, `200 { ok, material_id, praise_id, r2_key }` com `ETag`. Um único `DB.batch()` com `DELETE FROM gesture_usage`, os `INSERT INTO gesture_usage` e o `UPDATE praise_materials SET is_reviewed = 0`.

- [ ] **Step 1: Escrever o teste**

`api/src/__tests__/gesturesContentWrite.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { app } from '../index';
import { MENSAGENS } from '../gestures/schema';

const SEGREDO = '0123456789abcdef0123456789abcdef';
const ORIGEM = 'https://web.example';
const TOKEN = 'token-do-review-app';
const CHAVE = 'assets/praises/praise-1/mat-1.gestures';

const EXEMPLO = readFileSync(
  resolve(__dirname, '..', 'gestures', '__fixtures__', 'valido-exemplo.json'),
  'utf8'
);

type Gravacao = { key: string; body: unknown; options: R2PutOptions | undefined };

/**
 * Mesmo banco falso de materialContentWrite.test.ts, mais `batch`: o ramo de
 * gestos grava uso e marca de revisão num lote só, e é isso que se quer ver.
 */
function ambiente(opcoes: { etag?: string; type?: string } = {}) {
  const gravacoes: Gravacao[] = [];
  const soltas: { sql: string; args: unknown[] }[] = [];
  const lotes: { sql: string; args: unknown[] }[][] = [];
  let etag = opcoes.etag ?? 'etag-inicial';

  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...args: unknown[]) => ({
        first: vi.fn(async () => {
          if (sql.includes('FROM praise_materials WHERE id')) {
            return { id: 'mat-1', praise_id: 'praise-1', type: opcoes.type ?? 'gestures', r2_key: CHAVE };
          }
          return null;
        }),
        run: vi.fn(async () => {
          soltas.push({ sql, args });
          return { meta: { changes: 1 } };
        }),
        all: vi.fn(async () => ({ results: [] })),
        __sql: sql,
        __args: args,
      })),
    })),
    batch: vi.fn(async (stmts: { __sql: string; __args: unknown[] }[]) => {
      lotes.push(stmts.map((s) => ({ sql: s.__sql, args: s.__args })));
      return [];
    }),
  };

  const assets = {
    put: vi.fn(async (key: string, body: unknown, options?: R2PutOptions) => {
      const condicao = options?.onlyIf as R2Conditional | undefined;
      if (condicao?.etagMatches !== undefined && condicao.etagMatches !== etag) return null;
      etag = `etag-${gravacoes.length + 1}`;
      gravacoes.push({ key, body, options });
      return { etag, httpEtag: `"${etag}"` };
    }),
    head: vi.fn(async () => null),
    delete: vi.fn(async () => undefined),
  };

  return {
    gravacoes,
    soltas,
    lotes,
    env: {
      DB: db,
      ASSETS: assets,
      AUTH_JWT_SECRET: SEGREDO,
      AUTH_ALLOWED_EMAILS: '*',
      WEB_ORIGIN: ORIGEM,
      COLDIGOM_UPLOAD_TOKEN: TOKEN,
    },
  };
}

async function gravar(
  corpo: string,
  extras: { headers?: Record<string, string>; opcoes?: Parameters<typeof ambiente>[0] } = {}
) {
  const ctx = ambiente(extras.opcoes);
  const res = await app.request(
    '/api/materials/mat-1/content',
    {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${TOKEN}`,
        ...(extras.headers ?? {}),
      },
      body: corpo,
    },
    ctx.env as never
  );
  return { res, ...ctx };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PUT /content — material de gestos: validação', () => {
  it('recusa JSON quebrado com json_invalido e caminho vazio', async () => {
    const { res, gravacoes } = await gravar('{ isto não é json');
    expect(res.status).toBe(400);
    expect(gravacoes).toHaveLength(0);
    expect(await res.json()).toEqual({ error: MENSAGENS.json_invalido, code: 'json_invalido', path: '' });
  });

  it('recusa corpo vazio como json_invalido, não como "cifra vazia"', async () => {
    const { res } = await gravar('');
    expect(res.status).toBe(400);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe('json_invalido');
  });

  it('devolve o caminho do erro — é o que leva o revisor ao cartão', async () => {
    const doc = JSON.parse(EXEMPLO);
    doc.items[0].children[1] = { type: 'dança' };
    const { res, gravacoes } = await gravar(JSON.stringify(doc));
    expect(res.status).toBe(400);
    expect(gravacoes).toHaveLength(0);
    expect(await res.json()).toEqual({
      error: MENSAGENS.tipo_desconhecido,
      code: 'tipo_desconhecido',
      path: 'items[0].children[1]',
    });
  });

  it('NÃO confere gestureId contra o dicionário', async () => {
    // O importador pode chegar antes do dicionário. Nenhuma leitura de
    // gesture_dictionary acontece aqui — quem avisa é o editor.
    const { res, env } = await gravar(EXEMPLO);
    expect(res.status).toBe(200);
    const sqls = (env.DB.prepare as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => s.includes('gesture_dictionary'))).toBe(false);
  });

  it('recusa acima de 256 KB com documento_grande', async () => {
    const doc = JSON.parse(EXEMPLO);
    doc.items.push({ type: 'text', text: 'x'.repeat(256 * 1024) });
    const { res, gravacoes } = await gravar(JSON.stringify(doc));
    expect(res.status).toBe(413);
    expect(gravacoes).toHaveLength(0);
    expect(await res.json()).toEqual({ error: MENSAGENS.documento_grande, code: 'documento_grande', path: '' });
  });
});

describe('PUT /content — material de gestos: gravação', () => {
  it('grava como JSON, devolve ETag e recomputa gesture_usage no mesmo lote da marca de revisão', async () => {
    const { res, gravacoes, lotes, soltas } = await gravar(EXEMPLO);

    expect(res.status).toBe(200);
    expect(res.headers.get('etag')).toBe('"etag-1"');
    expect(gravacoes).toHaveLength(1);
    expect(gravacoes[0].key).toBe(`storage/${CHAVE}`);
    expect((gravacoes[0].options?.httpMetadata as { contentType: string }).contentType).toBe(
      'application/json; charset=utf-8'
    );

    expect(lotes).toHaveLength(1);
    const lote = lotes[0];
    expect(lote[0].sql).toMatch(/DELETE FROM gesture_usage WHERE material_id = \?/);
    expect(lote[0].args).toEqual(['mat-1']);
    const inserts = lote.filter((s) => s.sql.includes('INSERT INTO gesture_usage'));
    expect(inserts).toHaveLength(9);
    expect(inserts.map((s) => s.args)).toContainEqual(['mat-1', 'c687580e7682', 1]);
    const limpeza = lote[lote.length - 1];
    expect(limpeza.sql).toMatch(/is_reviewed = 0/);
    expect(limpeza.sql).toMatch(/reviewed_by\s*=\s*NULL/);
    // nada solto: se o lote falhar, nem o uso nem a marca mudam
    expect(soltas.find((s) => s.sql.includes('is_reviewed'))).toBeUndefined();
  });

  it('devolve 409 stale_write quando o If-Match não bate, sem tocar o banco', async () => {
    const { res, gravacoes, lotes } = await gravar(EXEMPLO, {
      headers: { 'if-match': '"etag-de-outra-versao"' },
    });
    expect(res.status).toBe(409);
    expect(gravacoes).toHaveLength(0);
    expect(lotes).toHaveLength(0);
    const json = (await res.json()) as { code: string; error: string };
    expect(json.code).toBe('stale_write');
    expect(json.error).toBe('O documento de gestos foi alterado por outra pessoa. Recarregue antes de salvar.');
  });

  it('grava quando o If-Match bate', async () => {
    const { res, gravacoes } = await gravar(EXEMPLO, {
      headers: { 'if-match': '"etag-inicial"' },
      opcoes: { etag: 'etag-inicial' },
    });
    expect(res.status).toBe(200);
    expect((gravacoes[0].options?.onlyIf as R2Conditional).etagMatches).toBe('etag-inicial');
  });

  it('o log estruturado diz que o tipo é gestures', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await gravar(EXEMPLO);
    const linha = log.mock.calls.map((c) => String(c[0])).find((l) => l.includes('material.content.write'));
    expect(linha).toBeDefined();
    expect((JSON.parse(linha!) as { tipo: string }).tipo).toBe('gestures');
  });

  it('a cifra continua no caminho antigo: type chord ainda grava texto puro', async () => {
    const { res, gravacoes, soltas } = await gravar('[C]Linha', { opcoes: { type: 'chord' } });
    expect(res.status).toBe(200);
    expect(gravacoes[0].body).toBe('[C]Linha');
    expect(soltas.find((s) => s.sql.includes('is_reviewed'))).toBeDefined();
  });

  it('outros tipos continuam recusados', async () => {
    const { res } = await gravar('%PDF', { opcoes: { type: 'pdf' } });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd api && npx vitest run src/__tests__/gesturesContentWrite.test.ts`
Expected: FAIL — os de gestos respondem 400 `Material is not a chord`.

- [ ] **Step 3: Reescrever o handler em `materials.ts`**

Substitua o handler inteiro `app.put('/api/materials/:materialId/content', …)` (linhas 83–191) por este. A ordem muda de propósito: **a linha do material é lida antes do corpo**, porque a mensagem do 413 e o ramo de validação dependem do tipo.

```ts
  app.put('/api/materials/:materialId/content', requireUploadOrAuth, async (c) => {
    const materialId = c.req.param('materialId');
    const rawContentType = c.req.header('content-type') || 'text/plain; charset=utf-8';

    let row: { id: string; praise_id: string; type: string; r2_key: string | null } | null;
    try {
      row = (await c.env.DB.prepare(
        `SELECT id, praise_id, type, r2_key FROM praise_materials WHERE id = ?`
      )
        .bind(materialId)
        .first()) as typeof row;
    } catch (error) {
      console.error('Error loading material:', error);
      return c.json({ error: 'Failed to upload content' }, 500);
    }
    if (!row) return c.json({ error: 'Material not found' }, 404);
    // Dois tipos têm conteúdo editável por aqui. O resto (pdf, mp3, youtube…) sobe
    // pelo bulk-upload ou é link, e um PUT neles seria gravar por cima de um binário.
    const ehGestos = row.type === 'gestures';
    if (!ehGestos && row.type !== 'chord') {
      return c.json({ error: 'Material is not a chord' }, 400);
    }
    if (!row.r2_key) return c.json({ error: 'Material has no r2_key' }, 400);

    let body: string;
    try {
      const leitura = await lerCorpoComTeto(
        c.req.raw,
        ehGestos ? MAX_GESTURES_DOCUMENT_BYTES : MAX_CHORD_CONTENT_BYTES
      );
      if (leitura.excedeu) {
        return ehGestos
          ? c.json({ error: MENSAGENS.documento_grande, code: 'documento_grande', path: '' }, 413)
          : c.json(
              { error: `Cifra acima do limite de ${Math.round(MAX_CHORD_CONTENT_BYTES / 1024)} KB.` },
              413
            );
      }
      body = leitura.texto;
    } catch {
      return c.json({ error: 'Invalid body' }, 400);
    }

    // Gestos: o corpo precisa ser um documento válido ANTES de qualquer gravação.
    // O caminho do erro vai na resposta — é o que leva o revisor ao cartão certo.
    let usos: Map<string, number> | null = null;
    if (ehGestos) {
      let valor: unknown;
      try {
        valor = JSON.parse(body);
      } catch {
        return c.json({ error: MENSAGENS.json_invalido, code: 'json_invalido', path: '' }, 400);
      }
      const resultado = validarDocumento(valor);
      if (!resultado.ok) {
        return c.json(
          { error: MENSAGENS[resultado.erro.codigo], code: resultado.erro.codigo, path: resultado.erro.caminho },
          400
        );
      }
      usos = contarUsos(resultado.doc);
    } else if (body.trim().length === 0) {
      // Corpo vazio respondia 200 e substituía o .chord por nada. A única defesa
      // era do lado da tela; o review-app grava por token e não passa por ela.
      // A regra aqui é a mais simples que se sustenta sozinha — "tem de sobrar
      // caractere depois de tirar o espaço" —, de propósito: replicar a gramática
      // do cliente daria duas regras divergentes em vez de uma rede.
      return c.json({ error: 'A cifra não pode ficar vazia.' }, 400);
    }

    try {
      // Confere e grava na MESMA instrução, como o PATCH do louvor já faz. O
      // cliente relia o arquivo e comparava antes de gravar: entre a comparação
      // e o PUT cabia outra gravação. Sem If-Match, grava como antes — o PLPCG e
      // o review-app não mandam o header.
      const opcoes: R2PutOptions = {
        httpMetadata: {
          contentType: ehGestos
            ? 'application/json; charset=utf-8'
            : rawContentType.trim() || 'text/plain; charset=utf-8',
        },
      };
      const ifMatch = normalizarIfMatch(c.req.header('if-match'));
      if (ifMatch) opcoes.onlyIf = { etagMatches: ifMatch };

      const gravado = (await c.env.ASSETS.put(storageKeyFor(row.r2_key), body, opcoes)) as R2Object | null;

      // Só com onlyIf o R2 devolve null, e é aí que null significa "outra
      // gravação chegou primeiro". Sem If-Match, o retorno não carrega decisão.
      if (ifMatch && !gravado) {
        return c.json(
          {
            error: ehGestos
              ? 'O documento de gestos foi alterado por outra pessoa. Recarregue antes de salvar.'
              : 'A cifra foi alterada por outra pessoa. Recarregue antes de salvar.',
            code: 'stale_write',
          },
          409
        );
      }

      // Trocar o conteúdo apaga a marca de revisão, SEMPRE. A migração 015 diz
      // que a marca existe para saber o que ainda precisa de olho humano; texto
      // novo nunca teve esse olho, venha de quem vier. Condicionar a marca ao
      // autor seria adivinhar que reler o próprio texto conta como revisar.
      const limparMarca = c.env.DB.prepare(
        `UPDATE praise_materials
            SET is_reviewed = 0, reviewed_at = NULL, reviewed_by = NULL
          WHERE id = ?`
      ).bind(row.id);

      if (usos) {
        // Uso e marca no mesmo lote: se um falhar, o dicionário não fica
        // contando um documento que não existe nem a marca some à toa.
        await c.env.DB.batch([
          c.env.DB.prepare(`DELETE FROM gesture_usage WHERE material_id = ?`).bind(row.id),
          ...[...usos].map(([gestureId, count]) =>
            c.env.DB.prepare(
              `INSERT INTO gesture_usage (material_id, gesture_id, count) VALUES (?, ?, ?)`
            ).bind(row.id, gestureId, count)
          ),
          limparMarca,
        ]);
      } else {
        await limparMarca.run();
      }

      // O token de upload é segredo estático compartilhado e não tem identidade:
      // sem este registro, qualquer cifra podia ser substituída sem rastro de
      // quando, por quem, nem de que tamanho.
      const autor = c.get('user') as AuthUser | undefined;
      console.log(
        JSON.stringify({
          msg: 'material.content.write',
          material_id: row.id,
          praise_id: row.praise_id,
          tipo: row.type,
          bytes: new TextEncoder().encode(body).byteLength,
          credential: autor ? 'session' : 'token',
          sub: autor?.sub ?? null,
        })
      );

      // Sem o ETag novo o cliente não consegue salvar duas vezes seguidas.
      if (gravado?.httpEtag) c.header('ETag', gravado.httpEtag);

      return c.json({ ok: true, material_id: row.id, praise_id: row.praise_id, r2_key: row.r2_key });
    } catch (error) {
      console.error('Error uploading content:', error);
      return c.json({ error: 'Failed to upload content' }, 500);
    }
  });
```

E os imports no topo de `materials.ts`:

```ts
import { MAX_GESTURES_DOCUMENT_BYTES, MENSAGENS, validarDocumento } from '../gestures/schema';
import { contarUsos } from '../gestures/usage';
```

- [ ] **Step 4: Rodar os dois arquivos de teste**

Run: `cd api && npx vitest run src/__tests__/gesturesContentWrite.test.ts src/__tests__/materialContentWrite.test.ts`
Expected: PASS nos dois. Atenção ao teste antigo "recusa corpo acima do teto sem gravar nada": ele continua 413 porque a linha falsa devolve `type: 'chord'` por padrão.

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/materials.ts api/src/__tests__/gesturesContentWrite.test.ts
git commit -m "feat(gestos): PUT /content valida e grava documento de gestos, recomputando o uso no mesmo lote"
```

---

### Task 4: `/assets/*` serve `.gestures`, `.png`, `.gif`; CORS expõe `ETag` e aceita `If-Match`

**Files:**
- Modify: `api/src/routes/assets.ts:72-85` (o mapa `contentTypes`)
- Modify: `api/src/index.ts:23-31` (o middleware de CORS)
- Test: `api/src/__tests__/gesturesAssetsCors.test.ts` (novo)

**Interfaces:**
- Produces: `GET /assets/…/x.gestures` → `Content-Type: application/json; charset=utf-8`; `.png` → `image/png`; `.gif` → `image/gif`. Preflight `OPTIONS` com `Access-Control-Request-Headers: if-match` é aceito e a resposta traz `Access-Control-Expose-Headers: ETag`.

- [ ] **Step 1: Escrever o teste**

`api/src/__tests__/gesturesAssetsCors.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import { app } from '../index';

const ORIGEM = 'https://web.example';

function r2Com(chave: string, corpo: string) {
  return {
    head: vi.fn(async (k: string) => (k === chave ? { size: corpo.length, httpEtag: '"v1"' } : null)),
    get: vi.fn(async (k: string) => (k === chave ? { body: corpo } : null)),
  };
}

describe('/assets/* — tipos de conteúdo dos gestos', () => {
  it.each([
    ['assets/praises/p1/m1.gestures', 'application/json; charset=utf-8'],
    ['assets/cia/gestures/c687580e7682.png', 'image/png'],
    ['assets/cia/gestures/c687580e7682.gif', 'image/gif'],
  ])('%s → %s', async (chave, tipo) => {
    const res = await app.request(`/${chave}`, {}, { ASSETS: r2Com(`storage/${chave}`, '{}') } as never);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe(tipo);
    expect(res.headers.get('etag')).toBe('"v1"');
  });
});

describe('CORS — gravação condicional a partir do navegador', () => {
  it('o preflight aceita If-Match e If-None-Match', async () => {
    // Sem isto, o PUT com If-Match nem sai do navegador em dev, onde o web fala
    // com o Worker por outra origem.
    const res = await app.request(
      '/api/materials/m1/content',
      {
        method: 'OPTIONS',
        headers: {
          origin: ORIGEM,
          'access-control-request-method': 'PUT',
          'access-control-request-headers': 'content-type, if-match',
        },
      },
      { WEB_ORIGIN: ORIGEM } as never
    );
    expect(res.status).toBe(204);
    const permitidos = (res.headers.get('access-control-allow-headers') ?? '').toLowerCase();
    expect(permitidos).toContain('if-match');
    expect(permitidos).toContain('if-none-match');
  });

  it('a resposta expõe o ETag ao JavaScript', async () => {
    // O assets.ts já mandava o header; sem Expose-Headers o
    // response.headers.get('ETag') devolvia null e ninguém tinha o token.
    const chave = 'assets/praises/p1/m1.gestures';
    const res = await app.request(
      `/${chave}`,
      { headers: { origin: ORIGEM } },
      { ASSETS: r2Com(`storage/${chave}`, '{}'), WEB_ORIGIN: ORIGEM } as never
    );
    expect(res.headers.get('access-control-expose-headers')?.toLowerCase()).toContain('etag');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd api && npx vitest run src/__tests__/gesturesAssetsCors.test.ts`
Expected: FAIL — `.gestures` sai como `application/octet-stream`; `allow-headers` sem `if-match`; `expose-headers` ausente.

- [ ] **Step 3: Editar `assets.ts`**

No mapa `contentTypes`, depois da linha `chord: 'text/plain; charset=utf-8',`:

```ts
      // O documento de gestos é JSON canônico (coldigom.gestures/1); as figuras
      // do dicionário moram em assets/cia/gestures/{id}.png|gif.
      gestures: 'application/json; charset=utf-8',
      png: 'image/png',
      gif: 'image/gif',
```

- [ ] **Step 4: Editar o CORS em `index.ts`**

```ts
app.use('/*', async (c, next) => {
  const origin = c.req.header('origin');
  return cors({
    origin: corsAllowOrigin(origin, c.env.WEB_ORIGIN),
    credentials: true,
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    // If-Match / If-None-Match: gravação condicional do editor de gestos e o 304
    // do dicionário. Sem eles no preflight, o navegador nem manda o PUT.
    allowHeaders: ['Content-Type', 'Authorization', 'If-Match', 'If-None-Match'],
    // O assets.ts e o PUT /content já emitiam ETag; sem expor, o JavaScript de
    // outra origem lia null e não tinha o token para mandar de volta.
    exposeHeaders: ['ETag'],
  })(c, next);
});
```

- [ ] **Step 5: Rodar tudo da API**

Run: `cd api && npx vitest run`
Expected: PASS. `assetsRange.test.ts` e `origins.test.ts` continuam verdes.

- [ ] **Step 6: Commit e fechar a fatia (a)**

```bash
git add api/src/routes/assets.ts api/src/index.ts api/src/__tests__/gesturesAssetsCors.test.ts
git commit -m "feat(gestos): assets servem .gestures/.png/.gif; CORS expõe ETag e aceita If-Match"
```

Depois, na raiz: `npm run verify`. Cole a saída no relatório da fatia (a).

---

### Task 5: Migração `018_gestures.sql` e o espelho em `schema.sql`

**Files:**
- Create: `api/migrations/018_gestures.sql`
- Modify: `api/schema.sql` (acrescentar ao fim, antes dos índices finais se houver)
- Modify: `api/src/__tests__/schemaSync.test.ts` (novo `it`)

**Interfaces:**
- Produces: tabelas `gesture_dictionary`, `gesture_dictionary_meta` (linha única `id = 1`, `version = 0`), `gesture_usage`; índice `idx_gesture_usage_gesture`.

- [ ] **Step 1: Acrescentar o teste em `schemaSync.test.ts`**

Dentro do `describe` existente, depois do `it('017: …')`:

```ts
  it('018: as três tabelas de gestos e o índice de uso estão nos dois', () => {
    const schema = normal(readFileSync(resolve(RAIZ, 'schema.sql'), 'utf8'));
    const mig = normal(readFileSync(resolve(RAIZ, 'migrations', '018_gestures.sql'), 'utf8'));
    for (const trecho of [
      'CREATE TABLE IF NOT EXISTS gesture_dictionary (',
      'CREATE TABLE IF NOT EXISTS gesture_dictionary_meta (',
      'CREATE TABLE IF NOT EXISTS gesture_usage (',
      'CREATE INDEX IF NOT EXISTS idx_gesture_usage_gesture ON gesture_usage(gesture_id)',
      'INSERT OR IGNORE INTO gesture_dictionary_meta (id, version) VALUES (1, 0)',
    ]) {
      expect(mig, `migração sem: ${trecho}`).toContain(trecho);
      expect(schema, `schema.sql sem: ${trecho}`).toContain(trecho);
    }
    const colunas = [
      'id TEXT PRIMARY KEY', 'name TEXT NOT NULL', 'description TEXT NOT NULL DEFAULT \'\'',
      "example_triggers TEXT NOT NULL DEFAULT '[]'", 'image_key TEXT', 'gif_key TEXT',
      "status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deprecated'))",
      'replaced_by TEXT', 'version INTEGER NOT NULL', 'material_id TEXT NOT NULL',
      'gesture_id TEXT NOT NULL', 'count INTEGER NOT NULL', 'PRIMARY KEY (material_id, gesture_id)',
      'FOREIGN KEY (material_id) REFERENCES praise_materials(id) ON DELETE CASCADE',
    ];
    for (const c of colunas) {
      expect(mig).toContain(c);
      expect(schema).toContain(c);
    }
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd api && npx vitest run src/__tests__/schemaSync.test.ts`
Expected: FAIL — `ENOENT … 018_gestures.sql`.

- [ ] **Step 3: Escrever `api/migrations/018_gestures.sql`**

```sql
-- Dicionário de gestos CIAs e uso por material (spec docs/superpowers/specs/2026-09-05-editor-de-gestos-design.md).
--
-- gesture_dictionary é o catálogo: id de 12 hex estável para sempre, figura e
-- GIF no R2 (assets/cia/gestures/{id}.png|gif). Um gesto nunca é apagado —
-- vira 'deprecated' com replaced_by apontando para o que o substituiu, e o
-- cliente segue a cadeia ao renderizar.
--
-- gesture_dictionary_meta tem UMA linha (id = 1) com a versão monotônica. Toda
-- escrita em gesture_dictionary sobe version no mesmo DB.batch() — é a versão
-- que vira o ETag "v{version}" de GET /api/gestures/dictionary. Nunca escreva
-- na tabela por fora de escreverNoDicionario() (api/src/gestures/dicionario.ts).
--
-- gesture_usage é derivada: recomputada a cada PUT /content de um material de
-- gestos e pelo importador. Serve à página do dicionário ("usado em N louvores")
-- e ao replace-with, que precisa saber quais documentos reescrever.
--
-- Aplicar: cd api && wrangler d1 execute coldigom --remote --file=migrations/018_gestures.sql

CREATE TABLE IF NOT EXISTS gesture_dictionary (
  id               TEXT PRIMARY KEY,                       -- 12 hex
  name             TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  example_triggers TEXT NOT NULL DEFAULT '[]',              -- JSON: string[]
  image_key        TEXT,                                    -- assets/cia/gestures/{id}.png
  gif_key          TEXT,                                    -- assets/cia/gestures/{id}.gif
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deprecated')),
  replaced_by      TEXT,                                    -- id do gesto que o substituiu
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gesture_dictionary_meta (
  id      INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL
);
INSERT OR IGNORE INTO gesture_dictionary_meta (id, version) VALUES (1, 0);

CREATE TABLE IF NOT EXISTS gesture_usage (
  material_id TEXT NOT NULL,
  gesture_id  TEXT NOT NULL,
  count       INTEGER NOT NULL,
  PRIMARY KEY (material_id, gesture_id),
  FOREIGN KEY (material_id) REFERENCES praise_materials(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_gesture_usage_gesture ON gesture_usage(gesture_id);
```

- [ ] **Step 4: Acrescentar o mesmo bloco ao fim de `api/schema.sql`**

Cole as três `CREATE TABLE`, o `INSERT OR IGNORE` e o `CREATE INDEX` acima ao fim de `schema.sql`, precedidos de:

```sql
-- Gestos CIAs: dicionário, versão (ETag) e uso por material. Ver migrations/018_gestures.sql.
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd api && npx vitest run src/__tests__/schemaSync.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 6: Commit**

```bash
git add api/migrations/018_gestures.sql api/schema.sql api/src/__tests__/schemaSync.test.ts
git commit -m "feat(gestos): migração 018 — dicionário, versão e uso de gestos"
```

---

### Task 6: `dicionario.ts` e as rotas de leitura (`GET dictionary`, `GET dictionary/:id`, `GET usage`)

**Files:**
- Create: `api/src/gestures/dictionaryTypes.ts` (só tipos e a constante do schema — sem referência a D1, para o importador poder importar sem os tipos do Worker)
- Create: `api/src/gestures/dicionario.ts`
- Create: `api/src/routes/gestures.ts`
- Modify: `api/src/index.ts` (import + `registerGesturesRoutes(app)` logo após `registerMaterialsRoutes(app)`)
- Modify: `api/src/__tests__/routes.inventory.test.ts` (as rotas novas, na posição certa)
- Test: `api/src/__tests__/gesturesDictionaryRead.test.ts` (novo)

**Interfaces:**
- Produces em `dicionario.ts`:
  - `type LinhaDoDicionario = { id; name; description; example_triggers; image_key; gif_key; status; replaced_by; created_at; updated_at }`
  - `linhaParaEntrada(l: LinhaDoDicionario): GestureEntry`
  - `type GestureEntry` e `type GestureDictionary` (o contrato da spec)
  - `lerVersao(db: D1Database): Promise<number>`
  - `escreverNoDicionario(db: D1Database, statements: D1PreparedStatement[]): Promise<void>` — anexa o bump de versão e manda `db.batch`
  - `chaveDaFigura(id: string, ext: 'png' | 'gif'): string` → `assets/cia/gestures/{id}.{ext}`
  - `gerarIdDeGesto(): string` — 12 hex de `crypto.getRandomValues`
  - `casaEtag(ifNoneMatch: string | undefined, etag: string): boolean`
  - `usosDoGesto(db, gestureId): Promise<Uso[]>` com `Uso = { material_id; praise_id; praise_name; praise_number; count }`
- Produces em `routes/gestures.ts`: `registerGesturesRoutes(app: App): void`. Nesta task só as três rotas de leitura; as cinco de escrita entram nas Tasks 7 e 8 **no mesmo arquivo**.
- Respostas: `GET /api/gestures/dictionary` → `GestureDictionary` com `ETag: "v{version}"`, `Cache-Control: public, max-age=300`, 304 se casar; `GET /api/gestures/dictionary/:id` → `{ data: GestureEntry & { usages: Uso[] } }` ou 404; `GET /api/gestures/usage?gestureId=` → `{ data: Uso[] }`; **sem** `gestureId` → `{ data: { gesture_id: string; materials: number }[] }` (quantos materiais usam cada gesto — é o que a lista do dicionário mostra sem fazer N requisições).

- [ ] **Step 1: Escrever o teste**

`api/src/__tests__/gesturesDictionaryRead.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import { app } from '../index';

/**
 * Banco falso com estado: versão e linhas do dicionário. Responde às leituras
 * pelos trechos de SQL, como os outros testes de rota fazem.
 */
function banco(opts: { versao?: number; linhas?: Record<string, unknown>[]; usos?: Record<string, unknown>[] } = {}) {
  const versao = opts.versao ?? 0;
  const linhas = opts.linhas ?? [];
  const usos = opts.usos ?? [];
  const db = {
    prepare: vi.fn((sql: string) => {
      const stmt = (args: unknown[]) => ({
        first: vi.fn(async () => {
          if (sql.includes('FROM gesture_dictionary_meta')) return { version: versao };
          if (sql.includes('FROM gesture_dictionary WHERE id')) {
            return linhas.find((l) => l.id === args[0]) ?? null;
          }
          return null;
        }),
        all: vi.fn(async () => {
          if (sql.includes('FROM gesture_usage')) return { results: usos };
          if (sql.includes('FROM gesture_dictionary')) return { results: linhas };
          return { results: [] };
        }),
        run: vi.fn(async () => ({})),
        __sql: sql,
      });
      return { bind: vi.fn((...args: unknown[]) => stmt(args)), ...stmt([]) };
    }),
    batch: vi.fn(async () => []),
  };
  return db;
}

const LINHA = {
  id: 'c687580e7682',
  name: 'Quero',
  description: 'Mãos ao peito',
  example_triggers: '["Quero","Desejo"]',
  image_key: 'assets/cia/gestures/c687580e7682.png',
  gif_key: null,
  status: 'active',
  replaced_by: null,
  created_at: '2026-09-01 00:00:00',
  updated_at: '2026-09-01 00:00:00',
};

describe('GET /api/gestures/dictionary', () => {
  it('responde o dicionário com ETag "v{version}" e cache de 5 minutos', async () => {
    const res = await app.request('/api/gestures/dictionary', {}, { DB: banco({ versao: 7, linhas: [LINHA] }) } as never);
    expect(res.status).toBe(200);
    expect(res.headers.get('etag')).toBe('"v7"');
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    const json = (await res.json()) as { schema: string; version: number; generatedAt: string; gestures: unknown[] };
    expect(json.schema).toBe('coldigom.gesture-dictionary/1');
    expect(json.version).toBe(7);
    expect(new Date(json.generatedAt).toString()).not.toBe('Invalid Date');
    expect(json.gestures).toEqual([
      {
        id: 'c687580e7682',
        name: 'Quero',
        description: 'Mãos ao peito',
        exampleTriggers: ['Quero', 'Desejo'],
        image: 'assets/cia/gestures/c687580e7682.png',
        gif: null,
        status: 'active',
        replacedBy: null,
        updatedAt: '2026-09-01 00:00:00',
      },
    ]);
  });

  it('304 quando o If-None-Match casa, inclusive fraco e em lista', async () => {
    for (const header of ['"v7"', 'W/"v7"', '"v2", "v7"']) {
      const res = await app.request(
        '/api/gestures/dictionary',
        { headers: { 'if-none-match': header } },
        { DB: banco({ versao: 7 }) } as never
      );
      expect(res.status, header).toBe(304);
      expect(res.headers.get('etag')).toBe('"v7"');
    }
  });

  it('200 quando o If-None-Match é de outra versão', async () => {
    const res = await app.request(
      '/api/gestures/dictionary',
      { headers: { 'if-none-match': '"v6"' } },
      { DB: banco({ versao: 7 }) } as never
    );
    expect(res.status).toBe(200);
  });

  it('meta ausente (banco recém-migrado sem seed) conta como versão 0', async () => {
    const db = banco();
    (db.prepare as ReturnType<typeof vi.fn>).mockImplementation((sql: string) => ({
      bind: () => ({ first: async () => null, all: async () => ({ results: [] }) }),
      first: async () => null,
      all: async () => ({ results: [] }),
      __sql: sql,
    }));
    const res = await app.request('/api/gestures/dictionary', {}, { DB: db } as never);
    expect(res.headers.get('etag')).toBe('"v0"');
  });
});

describe('GET /api/gestures/dictionary/:id', () => {
  it('devolve a entrada com os usos juntados aos louvores', async () => {
    const usos = [{ material_id: 'm1', praise_id: 'p1', praise_name: 'Quero Viver', praise_number: '182', count: 2 }];
    const res = await app.request('/api/gestures/dictionary/c687580e7682', {}, { DB: banco({ linhas: [LINHA], usos }) } as never);
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: { id: string; usages: unknown[] } };
    expect(data.id).toBe('c687580e7682');
    expect(data.usages).toEqual(usos);
  });

  it('404 para id desconhecido', async () => {
    const res = await app.request('/api/gestures/dictionary/000000000000', {}, { DB: banco() } as never);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/gestures/usage', () => {
  it('sem gestureId devolve a contagem de materiais por gesto', async () => {
    const db = banco();
    (db.prepare as ReturnType<typeof vi.fn>).mockImplementation((sql: string) => ({
      bind: () => ({ all: async () => ({ results: [] }), first: async () => null }),
      all: async () => (sql.includes('GROUP BY gesture_id') ? { results: [{ gesture_id: 'c687580e7682', materials: 3 }] } : { results: [] }),
      first: async () => null,
      __sql: sql,
    }));
    const res = await app.request('/api/gestures/usage', {}, { DB: db } as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [{ gesture_id: 'c687580e7682', materials: 3 }] });
  });

  it('lista os usos', async () => {
    const usos = [{ material_id: 'm1', praise_id: 'p1', praise_name: 'X', praise_number: '1', count: 1 }];
    const res = await app.request('/api/gestures/usage?gestureId=c687580e7682', {}, { DB: banco({ usos }) } as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: usos });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd api && npx vitest run src/__tests__/gesturesDictionaryRead.test.ts`
Expected: FAIL — 404 em tudo (rota não existe).

- [ ] **Step 3: Escrever `api/src/gestures/dictionaryTypes.ts` e `api/src/gestures/dicionario.ts`**

`dictionaryTypes.ts` — puro, sem `D1Database`; é o que `scripts/import_gestures.ts` importa:

```ts
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
```

`dicionario.ts`:

```ts
/**
 * Acesso ao dicionário de gestos no D1.
 *
 * A regra da casa mora aqui: TODA escrita em gesture_dictionary passa por
 * escreverNoDicionario(), que anexa o bump de versão ao mesmo batch. É a versão
 * que vira o ETag "v{version}" — se uma rota escrevesse por fora, o cliente
 * continuaria recebendo 304 sobre um dicionário que mudou.
 */

import type { GestureEntry, LinhaDoDicionario, Uso } from './dictionaryTypes';

export { DICTIONARY_SCHEMA } from './dictionaryTypes';
export type { GestureDictionary, GestureEntry, LinhaDoDicionario, Uso } from './dictionaryTypes';

export const COLUNAS = `id, name, description, example_triggers, image_key, gif_key, status, replaced_by, created_at, updated_at`;

export function chaveDaFigura(id: string, ext: 'png' | 'gif'): string {
  return `assets/cia/gestures/${id}.${ext}`;
}

/** 12 hex aleatórios — mesma forma dos ids que vêm do pdf_extractor. */
export function gerarIdDeGesto(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function linhaParaEntrada(l: LinhaDoDicionario): GestureEntry {
  let exampleTriggers: string[] = [];
  try {
    const lido = JSON.parse(l.example_triggers || '[]');
    if (Array.isArray(lido)) exampleTriggers = lido.filter((x): x is string => typeof x === 'string');
  } catch {
    // coluna corrompida à mão: melhor entrada sem exemplos que dicionário fora do ar
  }
  return {
    id: l.id,
    name: l.name,
    description: l.description ?? '',
    exampleTriggers,
    // image_key nulo só acontece entre o INSERT e o upload da figura; o
    // contrato promete string, e a chave canônica é derivável do id.
    image: l.image_key ?? chaveDaFigura(l.id, 'png'),
    gif: l.gif_key,
    status: l.status,
    replacedBy: l.replaced_by,
    updatedAt: l.updated_at,
  };
}

export async function lerVersao(db: D1Database): Promise<number> {
  const meta = await db
    .prepare(`SELECT version FROM gesture_dictionary_meta WHERE id = 1`)
    .first<{ version: number }>();
  return meta?.version ?? 0;
}

export async function lerLinha(db: D1Database, id: string): Promise<LinhaDoDicionario | null> {
  return db.prepare(`SELECT ${COLUNAS} FROM gesture_dictionary WHERE id = ?`).bind(id).first<LinhaDoDicionario>();
}

/** A única porta de escrita: statements + bump de versão, num batch só. */
export async function escreverNoDicionario(db: D1Database, statements: D1PreparedStatement[]): Promise<void> {
  await db.batch([
    ...statements,
    db.prepare(`UPDATE gesture_dictionary_meta SET version = version + 1 WHERE id = 1`),
  ]);
}

/** If-None-Match pode vir fraco (W/) e em lista; qualquer item que case basta. */
export function casaEtag(ifNoneMatch: string | undefined, etag: string): boolean {
  if (!ifNoneMatch) return false;
  return ifNoneMatch
    .split(',')
    .map((s) => s.trim().replace(/^W\//i, ''))
    .some((s) => s === etag || s === '*');
}

export async function usosDoGesto(db: D1Database, gestureId: string): Promise<Uso[]> {
  const r = await db
    .prepare(
      `SELECT gu.material_id, pm.praise_id, p.name AS praise_name, p.number AS praise_number, gu.count
         FROM gesture_usage gu
         JOIN praise_materials pm ON pm.id = gu.material_id
         JOIN praises p ON p.id = pm.praise_id
        WHERE gu.gesture_id = ?
        ORDER BY p.number, p.name`
    )
    .bind(gestureId)
    .all<Uso>();
  return r.results ?? [];
}
```

- [ ] **Step 4: Escrever `api/src/routes/gestures.ts` com as três rotas de leitura**

```ts
import type { App } from '../env';
import {
  DICTIONARY_SCHEMA,
  COLUNAS,
  casaEtag,
  lerLinha,
  lerVersao,
  linhaParaEntrada,
  usosDoGesto,
  type LinhaDoDicionario,
} from '../gestures/dicionario';

const CACHE = 'public, max-age=300';

/** Dicionário de gestos CIAs: leitura pública, escrita autenticada. */
export function registerGesturesRoutes(app: App): void {
  // GET /api/gestures/dictionary — o dicionário inteiro. A versão é o ETag: o
  // cliente guarda e manda If-None-Match; 304 custa uma leitura de uma linha.
  app.get('/api/gestures/dictionary', async (c) => {
    try {
      const version = await lerVersao(c.env.DB);
      const etag = `"v${version}"`;
      if (casaEtag(c.req.header('if-none-match'), etag)) {
        return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': CACHE } });
      }
      const linhas = await c.env.DB
        .prepare(`SELECT ${COLUNAS} FROM gesture_dictionary ORDER BY name, id`)
        .all<LinhaDoDicionario>();
      const corpo = {
        schema: DICTIONARY_SCHEMA,
        version,
        generatedAt: new Date().toISOString(),
        gestures: (linhas.results ?? []).map(linhaParaEntrada),
      };
      return c.json(corpo, 200, { ETag: etag, 'Cache-Control': CACHE });
    } catch (error) {
      console.error('Error reading gesture dictionary:', error);
      return c.json({ error: 'Failed to read gesture dictionary' }, 500);
    }
  });

  // GET /api/gestures/dictionary/:id — entrada + onde é usada.
  app.get('/api/gestures/dictionary/:id', async (c) => {
    const id = c.req.param('id');
    try {
      const linha = await lerLinha(c.env.DB, id);
      if (!linha) return c.json({ error: 'Gesture not found' }, 404);
      const usages = await usosDoGesto(c.env.DB, id);
      return c.json({ data: { ...linhaParaEntrada(linha), usages } });
    } catch (error) {
      console.error('Error reading gesture:', error);
      return c.json({ error: 'Failed to read gesture' }, 500);
    }
  });

  // GET /api/gestures/usage[?gestureId=] — com id, os usos daquele gesto; sem id,
  // a contagem por gesto, para a lista do dicionário não fazer N requisições.
  app.get('/api/gestures/usage', async (c) => {
    const gestureId = c.req.query('gestureId')?.trim();
    try {
      if (gestureId) return c.json({ data: await usosDoGesto(c.env.DB, gestureId) });
      const r = await c.env.DB
        .prepare(`SELECT gesture_id, COUNT(DISTINCT material_id) AS materials FROM gesture_usage GROUP BY gesture_id`)
        .all<{ gesture_id: string; materials: number }>();
      return c.json({ data: r.results ?? [] });
    } catch (error) {
      console.error('Error reading gesture usage:', error);
      return c.json({ error: 'Failed to read gesture usage' }, 500);
    }
  });
}
```

- [ ] **Step 5: Registrar em `index.ts` e atualizar o inventário**

Em `api/src/index.ts`, o import e a chamada:

```ts
import { registerGesturesRoutes } from './routes/gestures';
…
registerMaterialsRoutes(app);
registerGesturesRoutes(app);
registerTagsRoutes(app);
```

Em `routes.inventory.test.ts`, entre `'DELETE /api/materials/:materialId',` (a segunda) e `'GET /api/tags',`:

```ts
  'GET /api/gestures/dictionary',
  'GET /api/gestures/dictionary/:id',
  'GET /api/gestures/usage',
```

- [ ] **Step 6: Rodar**

Run: `cd api && npx vitest run src/__tests__/gesturesDictionaryRead.test.ts src/__tests__/routes.inventory.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add api/src/gestures/dictionaryTypes.ts api/src/gestures/dicionario.ts api/src/routes/gestures.ts api/src/index.ts api/src/__tests__/gesturesDictionaryRead.test.ts api/src/__tests__/routes.inventory.test.ts
git commit -m "feat(gestos): dicionário — leitura com ETag/304, detalhe com usos e consulta de uso"
```

---

### Task 7: Escrita no dicionário — `POST`, `PATCH`, `image`, `gif`

**Files:**
- Modify: `api/src/routes/gestures.ts` (acrescentar quatro rotas ao `registerGesturesRoutes`)
- Modify: `api/src/__tests__/routes.inventory.test.ts`
- Test: `api/src/__tests__/gesturesDictionaryWrite.test.ts` (novo)

**Interfaces:**
- `POST /api/gestures/dictionary` (`requireAuth`, multipart): campos `name` (obrigatório), `description`, `exampleTriggers` (JSON `string[]`), `id` (opcional, 12 hex, 409 se já existe), `image` (File PNG ≤ 2 MB, obrigatório). Grava a figura em `assets/cia/gestures/{id}.png` e a linha via `escreverNoDicionario`. → `201 { data: GestureEntry }`.
- `PATCH /api/gestures/dictionary/:id` (`requireAuth`, JSON): `{ name?, description?, exampleTriggers?, status? }`; qualquer campo inválido → 400; → `200 { data: GestureEntry }`.
- `POST /api/gestures/dictionary/:id/image` e `/gif` (`requireAuth`, multipart `file` ≤ 5 MB, `image/png` / `image/gif`) → `200 { data: GestureEntry }`.
- Toda escrita sobe a versão: o teste confere que o batch termina com `UPDATE gesture_dictionary_meta SET version = version + 1`.

- [ ] **Step 1: Escrever o teste**

`api/src/__tests__/gesturesDictionaryWrite.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';

import { app } from '../index';

const SEGREDO = '0123456789abcdef0123456789abcdef';
const ORIGEM = 'https://web.example';

async function sessao() {
  const jwt = await new SignJWT({ email: 'admin@test.com', jti: 'j-gestos' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('sub-admin')
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(new TextEncoder().encode(SEGREDO));
  return { origin: ORIGEM, cookie: `coldigom_access=${encodeURIComponent(jwt)}` };
}

const LINHA = {
  id: 'c687580e7682', name: 'Quero', description: '', example_triggers: '[]',
  image_key: 'assets/cia/gestures/c687580e7682.png', gif_key: null,
  status: 'active', replaced_by: null, created_at: 't0', updated_at: 't0',
};

/** Banco falso que guarda os lotes; a leitura depois do batch devolve a linha "de agora". */
function banco(linhas: Record<string, unknown>[] = [LINHA]) {
  const lotes: { sql: string; args: unknown[] }[][] = [];
  const db = {
    prepare: vi.fn((sql: string) => {
      const stmt = (args: unknown[]) => ({
        first: vi.fn(async () => {
          if (sql.includes('FROM gesture_dictionary_meta')) return { version: 1 };
          if (sql.includes('FROM gesture_dictionary WHERE id')) return linhas.find((l) => l.id === args[0]) ?? null;
          return null;
        }),
        all: vi.fn(async () => ({ results: [] })),
        run: vi.fn(async () => ({})),
        __sql: sql,
        __args: args,
      });
      return { bind: vi.fn((...args: unknown[]) => stmt(args)), ...stmt([]) };
    }),
    batch: vi.fn(async (stmts: { __sql: string; __args: unknown[] }[]) => {
      lotes.push(stmts.map((s) => ({ sql: s.__sql, args: s.__args })));
      return [];
    }),
  };
  return { db, lotes };
}

function r2() {
  const escritos: { key: string; tipo: string | undefined }[] = [];
  return {
    r2: {
      put: vi.fn(async (key: string, _body: unknown, opts?: R2PutOptions) => {
        escritos.push({ key, tipo: opts?.httpMetadata && 'contentType' in opts.httpMetadata ? opts.httpMetadata.contentType : undefined });
        return { httpEtag: '"x"' };
      }),
      head: vi.fn(async () => null),
      get: vi.fn(async () => null),
      delete: vi.fn(async () => undefined),
    },
    escritos,
  };
}

function env(db: unknown, assets: unknown) {
  return { DB: db, ASSETS: assets, AUTH_JWT_SECRET: SEGREDO, AUTH_ALLOWED_EMAILS: '*', WEB_ORIGIN: ORIGEM } as never;
}

const bumpNoFim = (lote: { sql: string }[]) =>
  expect(lote[lote.length - 1].sql).toMatch(/UPDATE gesture_dictionary_meta SET version = version \+ 1/);

describe('POST /api/gestures/dictionary', () => {
  async function criar(campos: Record<string, string | File>, linhas?: Record<string, unknown>[]) {
    const { db, lotes } = banco(linhas ?? []);
    const { r2: assets, escritos } = r2();
    const form = new FormData();
    for (const [k, v] of Object.entries(campos)) form.set(k, v);
    const res = await app.request(
      '/api/gestures/dictionary',
      { method: 'POST', headers: await sessao(), body: form },
      env(db, assets)
    );
    return { res, lotes, escritos };
  }
  const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'g.png', { type: 'image/png' });

  it('exige sessão', async () => {
    const res = await app.request('/api/gestures/dictionary', { method: 'POST', body: new FormData() }, env(banco().db, r2().r2));
    expect(res.status).toBe(401);
  });

  it('cria com id aleatório de 12 hex, grava a figura e sobe a versão', async () => {
    const { res, lotes, escritos } = await criar({ name: 'Quero', description: 'd', exampleTriggers: '["Quero"]', image: png() });
    expect(res.status).toBe(201);
    const { data } = (await res.json()) as { data: { id: string; image: string; exampleTriggers: string[] } };
    expect(data.id).toMatch(/^[0-9a-f]{12}$/);
    expect(data.image).toBe(`assets/cia/gestures/${data.id}.png`);
    expect(escritos).toEqual([{ key: `storage/assets/cia/gestures/${data.id}.png`, tipo: 'image/png' }]);
    expect(lotes).toHaveLength(1);
    expect(lotes[0][0].sql).toContain('INSERT INTO gesture_dictionary');
    bumpNoFim(lotes[0]);
  });

  it('aceita id informado e recusa id repetido com 409', async () => {
    const ok = await criar({ name: 'X', id: 'abcdefabcdef', image: png() });
    expect(ok.res.status).toBe(201);
    const dup = await criar({ name: 'X', id: 'c687580e7682', image: png() }, [LINHA]);
    expect(dup.res.status).toBe(409);
    expect(dup.lotes).toHaveLength(0);
  });

  it('recusa id fora da forma, nome vazio, figura ausente e figura acima de 2 MB', async () => {
    expect((await criar({ name: 'X', id: 'ZZZ', image: png() })).res.status).toBe(400);
    expect((await criar({ name: '  ', image: png() })).res.status).toBe(400);
    expect((await criar({ name: 'X' })).res.status).toBe(400);
    const grande = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'g.png', { type: 'image/png' });
    const { res, escritos } = await criar({ name: 'X', image: grande });
    expect(res.status).toBe(413);
    expect(escritos).toHaveLength(0);
  });

  it('recusa exampleTriggers que não é lista de strings', async () => {
    expect((await criar({ name: 'X', exampleTriggers: '{"a":1}', image: png() })).res.status).toBe(400);
  });
});

describe('PATCH /api/gestures/dictionary/:id', () => {
  async function editar(corpo: unknown, id = 'c687580e7682') {
    const { db, lotes } = banco();
    const res = await app.request(
      `/api/gestures/dictionary/${id}`,
      { method: 'PATCH', headers: { ...(await sessao()), 'content-type': 'application/json' }, body: JSON.stringify(corpo) },
      env(db, r2().r2)
    );
    return { res, lotes };
  }

  it('atualiza nome, descrição, exemplos e status num batch com bump', async () => {
    const { res, lotes } = await editar({ name: 'Desejo', description: 'nova', exampleTriggers: ['a', 'b'], status: 'deprecated' });
    expect(res.status).toBe(200);
    expect(lotes).toHaveLength(1);
    expect(lotes[0][0].sql).toMatch(/UPDATE gesture_dictionary SET/);
    expect(lotes[0][0].args).toEqual(['Desejo', 'nova', '["a","b"]', 'deprecated', 'c687580e7682']);
    bumpNoFim(lotes[0]);
  });

  it('404 para id desconhecido, 400 para status fora do CHECK e para corpo vazio', async () => {
    expect((await editar({ name: 'x' }, '000000000000')).res.status).toBe(404);
    expect((await editar({ status: 'apagado' })).res.status).toBe(400);
    expect((await editar({})).res.status).toBe(400);
  });
});

describe('POST /api/gestures/dictionary/:id/image e /gif', () => {
  async function subir(caminho: string, file: File) {
    const { db, lotes } = banco();
    const { r2: assets, escritos } = r2();
    const form = new FormData();
    form.set('file', file);
    const res = await app.request(caminho, { method: 'POST', headers: await sessao(), body: form }, env(db, assets));
    return { res, lotes, escritos };
  }

  it('troca a figura e sobe a versão', async () => {
    const { res, lotes, escritos } = await subir('/api/gestures/dictionary/c687580e7682/image', new File(['x'], 'a.png', { type: 'image/png' }));
    expect(res.status).toBe(200);
    expect(escritos[0]).toEqual({ key: 'storage/assets/cia/gestures/c687580e7682.png', tipo: 'image/png' });
    expect(lotes[0][0].sql).toMatch(/SET image_key = \?/);
    bumpNoFim(lotes[0]);
  });

  it('sobe o GIF na chave .gif', async () => {
    const { res, escritos, lotes } = await subir('/api/gestures/dictionary/c687580e7682/gif', new File(['x'], 'a.gif', { type: 'image/gif' }));
    expect(res.status).toBe(200);
    expect(escritos[0]).toEqual({ key: 'storage/assets/cia/gestures/c687580e7682.gif', tipo: 'image/gif' });
    expect(lotes[0][0].sql).toMatch(/SET gif_key = \?/);
  });

  it('recusa tipo errado e acima de 5 MB', async () => {
    expect((await subir('/api/gestures/dictionary/c687580e7682/image', new File(['x'], 'a.gif', { type: 'image/gif' }))).res.status).toBe(400);
    const grande = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'a.gif', { type: 'image/gif' });
    expect((await subir('/api/gestures/dictionary/c687580e7682/gif', grande)).res.status).toBe(413);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd api && npx vitest run src/__tests__/gesturesDictionaryWrite.test.ts`
Expected: FAIL com 404 nas rotas.

- [ ] **Step 3: Acrescentar as rotas em `routes/gestures.ts`**

Imports adicionais no topo do arquivo:

```ts
import { requireAuth } from '../middleware';
import { storageKeyFor } from '../storageKeys';
import {
  chaveDaFigura,
  escreverNoDicionario,
  gerarIdDeGesto,
} from '../gestures/dicionario';
import { GESTURE_ID_RE } from '../gestures/schema';
```

Constantes e helpers, antes de `registerGesturesRoutes`:

```ts
const MAX_FIGURA_NA_CRIACAO = 2 * 1024 * 1024;
const MAX_FIGURA_NA_TROCA = 5 * 1024 * 1024;

/** `exampleTriggers` chega como JSON string (multipart) ou array (JSON). Devolve null se inválido. */
function lerExemplos(valor: unknown): string[] | null {
  let lido: unknown = valor;
  if (typeof valor === 'string') {
    try {
      lido = JSON.parse(valor);
    } catch {
      return null;
    }
  }
  if (lido === undefined) return [];
  if (!Array.isArray(lido) || !lido.every((x) => typeof x === 'string')) return null;
  return lido.map((s) => s.trim()).filter(Boolean);
}

/** Confere tipo e tamanho de um arquivo de figura; devolve a resposta de erro ou null. */
function problemaNaFigura(file: unknown, tipo: 'image/png' | 'image/gif', teto: number): { status: 400 | 413; error: string } | null {
  if (!(file instanceof File)) return { status: 400, error: `Field 'file' must be a ${tipo}` };
  if (file.type !== tipo && !file.name.toLowerCase().endsWith(tipo === 'image/png' ? '.png' : '.gif')) {
    return { status: 400, error: `File must be ${tipo}` };
  }
  if (file.size > teto) return { status: 413, error: `File above ${Math.round(teto / (1024 * 1024))} MB` };
  return null;
}
```

E dentro de `registerGesturesRoutes`, depois de `GET /api/gestures/usage`:

```ts
  // POST /api/gestures/dictionary — gesto novo, com figura obrigatória.
  app.post('/api/gestures/dictionary', requireAuth, async (c) => {
    let form: FormData;
    try {
      form = await c.req.formData();
    } catch {
      return c.json({ error: 'Expected multipart form' }, 400);
    }
    const name = String(form.get('name') ?? '').trim();
    if (!name) return c.json({ error: "Field 'name' is required" }, 400);
    const description = String(form.get('description') ?? '').trim();
    const exemplos = lerExemplos(form.get('exampleTriggers') ?? undefined);
    if (exemplos === null) return c.json({ error: "Field 'exampleTriggers' must be a JSON array of strings" }, 400);
    const idInformado = form.get('id');
    if (idInformado !== null && (typeof idInformado !== 'string' || !GESTURE_ID_RE.test(idInformado))) {
      return c.json({ error: "Field 'id' must be 12 lowercase hex characters" }, 400);
    }
    const figura = form.get('image');
    if (!(figura instanceof File)) return c.json({ error: "Field 'image' (PNG) is required" }, 400);
    const problema = problemaNaFigura(figura, 'image/png', MAX_FIGURA_NA_CRIACAO);
    if (problema) return c.json({ error: problema.error }, problema.status);

    const id = typeof idInformado === 'string' ? idInformado : gerarIdDeGesto();
    try {
      if (await lerLinha(c.env.DB, id)) return c.json({ error: 'Gesture id already exists' }, 409);
      const imageKey = chaveDaFigura(id, 'png');
      await c.env.ASSETS.put(storageKeyFor(imageKey), figura.stream(), { httpMetadata: { contentType: 'image/png' } });
      await escreverNoDicionario(c.env.DB, [
        c.env.DB
          .prepare(
            `INSERT INTO gesture_dictionary (id, name, description, example_triggers, image_key, status)
             VALUES (?, ?, ?, ?, ?, 'active')`
          )
          .bind(id, name, description, JSON.stringify(exemplos), imageKey),
      ]);
      const linha = await lerLinha(c.env.DB, id);
      return c.json(
        {
          data: linha
            ? linhaParaEntrada(linha)
            : { id, name, description, exampleTriggers: exemplos, image: imageKey, gif: null, status: 'active', replacedBy: null, updatedAt: new Date().toISOString() },
        },
        201
      );
    } catch (error) {
      console.error('Error creating gesture:', error);
      return c.json({ error: 'Failed to create gesture' }, 500);
    }
  });

  // PATCH /api/gestures/dictionary/:id — campos de texto e status.
  app.patch('/api/gestures/dictionary/:id', requireAuth, async (c) => {
    const id = c.req.param('id');
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') return c.json({ error: 'Invalid JSON body' }, 400);

    const linha = await lerLinha(c.env.DB, id).catch(() => null);
    if (!linha) return c.json({ error: 'Gesture not found' }, 404);

    const name = body.name === undefined ? linha.name : String(body.name).trim();
    if (!name) return c.json({ error: "Field 'name' must be a non-empty string" }, 400);
    const description = body.description === undefined ? linha.description : String(body.description).trim();
    const exemplos = body.exampleTriggers === undefined ? null : lerExemplos(body.exampleTriggers);
    if (body.exampleTriggers !== undefined && exemplos === null) {
      return c.json({ error: "Field 'exampleTriggers' must be an array of strings" }, 400);
    }
    const status = body.status === undefined ? linha.status : body.status;
    if (status !== 'active' && status !== 'deprecated') return c.json({ error: "Field 'status' must be active or deprecated" }, 400);
    if (['name', 'description', 'exampleTriggers', 'status'].every((k) => body[k] === undefined)) {
      return c.json({ error: 'Nothing to update' }, 400);
    }

    try {
      await escreverNoDicionario(c.env.DB, [
        c.env.DB
          .prepare(
            `UPDATE gesture_dictionary SET name = ?, description = ?, example_triggers = ?, status = ?, updated_at = datetime('now') WHERE id = ?`
          )
          .bind(name, description, JSON.stringify(exemplos ?? JSON.parse(linha.example_triggers || '[]')), status, id),
      ]);
      const depois = (await lerLinha(c.env.DB, id)) ?? linha;
      return c.json({ data: linhaParaEntrada(depois) });
    } catch (error) {
      console.error('Error updating gesture:', error);
      return c.json({ error: 'Failed to update gesture' }, 500);
    }
  });

  // POST …/:id/image e …/:id/gif — trocar a figura; mesma rotina, chave e coluna diferentes.
  for (const [sufixo, tipo, coluna] of [
    ['image', 'image/png', 'image_key'],
    ['gif', 'image/gif', 'gif_key'],
  ] as const) {
    app.post(`/api/gestures/dictionary/:id/${sufixo}`, requireAuth, async (c) => {
      const id = c.req.param('id');
      let form: FormData;
      try {
        form = await c.req.formData();
      } catch {
        return c.json({ error: 'Expected multipart form' }, 400);
      }
      const file = form.get('file');
      const problema = problemaNaFigura(file, tipo, MAX_FIGURA_NA_TROCA);
      if (problema) return c.json({ error: problema.error }, problema.status);

      try {
        const linha = await lerLinha(c.env.DB, id);
        if (!linha) return c.json({ error: 'Gesture not found' }, 404);
        const chave = chaveDaFigura(id, sufixo === 'image' ? 'png' : 'gif');
        await c.env.ASSETS.put(storageKeyFor(chave), (file as File).stream(), { httpMetadata: { contentType: tipo } });
        await escreverNoDicionario(c.env.DB, [
          c.env.DB
            .prepare(`UPDATE gesture_dictionary SET ${coluna} = ?, updated_at = datetime('now') WHERE id = ?`)
            .bind(chave, id),
        ]);
        const depois = (await lerLinha(c.env.DB, id)) ?? linha;
        return c.json({ data: linhaParaEntrada({ ...depois, [coluna]: chave }) });
      } catch (error) {
        console.error(`Error uploading gesture ${sufixo}:`, error);
        return c.json({ error: `Failed to upload gesture ${sufixo}` }, 500);
      }
    });
  }
```

- [ ] **Step 4: Inventário**

Depois de `'GET /api/gestures/usage',`:

```ts
  'POST /api/gestures/dictionary',
  'POST /api/gestures/dictionary',
  'PATCH /api/gestures/dictionary/:id',
  'PATCH /api/gestures/dictionary/:id',
  'POST /api/gestures/dictionary/:id/image',
  'POST /api/gestures/dictionary/:id/image',
  'POST /api/gestures/dictionary/:id/gif',
  'POST /api/gestures/dictionary/:id/gif',
```

- [ ] **Step 5: Rodar**

Run: `cd api && npx vitest run src/__tests__/gesturesDictionaryWrite.test.ts src/__tests__/routes.inventory.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/src/routes/gestures.ts api/src/__tests__/gesturesDictionaryWrite.test.ts api/src/__tests__/routes.inventory.test.ts
git commit -m "feat(gestos): criar e editar gestos do dicionário, trocar figura e GIF — toda escrita sobe a versão"
```

---

### Task 8: `POST /api/gestures/dictionary/:id/replace-with`

**Files:**
- Modify: `api/src/routes/gestures.ts`
- Modify: `api/src/__tests__/routes.inventory.test.ts`
- Test: `api/src/__tests__/gesturesReplaceWith.test.ts` (novo)

**Interfaces:**
- Consumes: `substituirGesto`, `contarUsos` de `../gestures/usage`; `validarDocumento` de `../gestures/schema`; `usosDoGesto`, `escreverNoDicionario`, `lerLinha` de `../gestures/dicionario`.
- Produces: `POST …/:id/replace-with` (`requireAuth`, JSON `{ targetId: string; rewriteDocuments?: boolean }`) → `200 { ok: true, deprecated: id, replacedBy: targetId, reescritos: number, falhas: { materialId, motivo }[] }`. Deprecia sempre, no batch; reescreve documentos só com `rewriteDocuments: true`, sequencialmente, sem `onlyIf`, recomputando `gesture_usage` de cada material reescrito.

- [ ] **Step 1: Escrever o teste**

`api/src/__tests__/gesturesReplaceWith.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';

import { app } from '../index';

const SEGREDO = '0123456789abcdef0123456789abcdef';
const ORIGEM = 'https://web.example';
const EXEMPLO = readFileSync(resolve(__dirname, '..', 'gestures', '__fixtures__', 'valido-exemplo.json'), 'utf8');

async function sessao() {
  const jwt = await new SignJWT({ email: 'admin@test.com', jti: 'j-rw' })
    .setProtectedHeader({ alg: 'HS256' }).setSubject('sub-admin').setIssuedAt().setExpirationTime('2h')
    .sign(new TextEncoder().encode(SEGREDO));
  return { origin: ORIGEM, cookie: `coldigom_access=${encodeURIComponent(jwt)}`, 'content-type': 'application/json' };
}

const linha = (id: string, status = 'active') => ({
  id, name: id, description: '', example_triggers: '[]', image_key: null, gif_key: null,
  status, replaced_by: null, created_at: 't', updated_at: 't',
});

function cenario(opts: { alvo?: Record<string, unknown> | null; usos?: { material_id: string; r2_key: string | null }[]; objetos?: Record<string, string> } = {}) {
  const linhas = [linha('deadbeef0004'), opts.alvo === undefined ? linha('ffffffffffff') : opts.alvo].filter(Boolean) as Record<string, unknown>[];
  const usos = opts.usos ?? [];
  const objetos = { ...(opts.objetos ?? {}) };
  const lotes: { sql: string; args: unknown[] }[][] = [];
  const db = {
    prepare: vi.fn((sql: string) => {
      const stmt = (args: unknown[]) => ({
        first: vi.fn(async () => {
          if (sql.includes('FROM gesture_dictionary WHERE id')) return linhas.find((l) => l.id === args[0]) ?? null;
          if (sql.includes('FROM praise_materials WHERE id')) return usos.find((u) => u.material_id === args[0]) ?? null;
          return null;
        }),
        all: vi.fn(async () => (sql.includes('FROM gesture_usage') ? { results: usos.map((u) => ({ material_id: u.material_id, praise_id: 'p', praise_name: 'x', praise_number: '1', count: 1 })) } : { results: [] })),
        run: vi.fn(async () => ({})),
        __sql: sql, __args: args,
      });
      return { bind: vi.fn((...args: unknown[]) => stmt(args)), ...stmt([]) };
    }),
    batch: vi.fn(async (stmts: { __sql: string; __args: unknown[] }[]) => { lotes.push(stmts.map((s) => ({ sql: s.__sql, args: s.__args }))); return []; }),
  };
  const assets = {
    get: vi.fn(async (key: string) => (key in objetos ? { text: async () => objetos[key] } : null)),
    put: vi.fn(async (key: string, body: string) => { objetos[key] = body; return { httpEtag: '"n"' }; }),
    head: vi.fn(async () => null), delete: vi.fn(async () => undefined),
  };
  return { db, assets, lotes, objetos };
}

async function substituir(cen: ReturnType<typeof cenario>, corpo: unknown, id = 'deadbeef0004') {
  const res = await app.request(
    `/api/gestures/dictionary/${id}/replace-with`,
    { method: 'POST', headers: await sessao(), body: JSON.stringify(corpo) },
    { DB: cen.db, ASSETS: cen.assets, AUTH_JWT_SECRET: SEGREDO, AUTH_ALLOWED_EMAILS: '*', WEB_ORIGIN: ORIGEM } as never
  );
  return res;
}

describe('POST /api/gestures/dictionary/:id/replace-with', () => {
  it('deprecia com replacedBy num batch com bump, sem tocar documentos por padrão', async () => {
    const cen = cenario({ usos: [{ material_id: 'm1', r2_key: 'assets/praises/p/m1.gestures' }], objetos: { 'storage/assets/praises/p/m1.gestures': EXEMPLO } });
    const res = await substituir(cen, { targetId: 'ffffffffffff' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, deprecated: 'deadbeef0004', replacedBy: 'ffffffffffff', reescritos: 0, falhas: [] });
    expect(cen.lotes).toHaveLength(1);
    expect(cen.lotes[0][0].sql).toMatch(/SET status = 'deprecated', replaced_by = \?/);
    expect(cen.lotes[0][0].args).toEqual(['ffffffffffff', 'deadbeef0004']);
    expect(cen.lotes[0][cen.lotes[0].length - 1].sql).toMatch(/version = version \+ 1/);
    expect(cen.assets.put).not.toHaveBeenCalled();
  });

  it('com rewriteDocuments reescreve cada documento que usa o gesto e recomputa o uso', async () => {
    const cen = cenario({
      usos: [{ material_id: 'm1', r2_key: 'assets/praises/p/m1.gestures' }, { material_id: 'm2', r2_key: 'assets/praises/p/m2.gestures' }],
      objetos: { 'storage/assets/praises/p/m1.gestures': EXEMPLO, 'storage/assets/praises/p/m2.gestures': EXEMPLO },
    });
    const res = await substituir(cen, { targetId: 'ffffffffffff', rewriteDocuments: true });
    const json = (await res.json()) as { reescritos: number; falhas: unknown[] };
    expect(json.reescritos).toBe(2);
    expect(json.falhas).toEqual([]);
    const gravado = JSON.parse(cen.objetos['storage/assets/praises/p/m1.gestures']);
    expect(JSON.stringify(gravado)).not.toContain('deadbeef0004');
    expect(JSON.stringify(gravado)).toContain('ffffffffffff');
    // um batch para depreciar + um por material (DELETE + INSERTs de uso), sem bump nos últimos
    expect(cen.lotes).toHaveLength(3);
    expect(cen.lotes[1][0].sql).toMatch(/DELETE FROM gesture_usage WHERE material_id = \?/);
    expect(cen.lotes[1].some((s) => s.sql.includes('version = version + 1'))).toBe(false);
  });

  it('uma falha num documento não derruba os outros: vira item em falhas', async () => {
    const cen = cenario({
      usos: [{ material_id: 'm1', r2_key: 'assets/praises/p/m1.gestures' }, { material_id: 'm2', r2_key: 'assets/praises/p/m2.gestures' }],
      objetos: { 'storage/assets/praises/p/m1.gestures': '{ quebrado', 'storage/assets/praises/p/m2.gestures': EXEMPLO },
    });
    const res = await substituir(cen, { targetId: 'ffffffffffff', rewriteDocuments: true });
    const json = (await res.json()) as { reescritos: number; falhas: { materialId: string; motivo: string }[] };
    expect(json.reescritos).toBe(1);
    expect(json.falhas).toEqual([{ materialId: 'm1', motivo: expect.stringMatching(/JSON|inválido/i) }]);
  });

  it('recusa alvo igual, alvo inexistente, alvo depreciado e corpo sem targetId', async () => {
    expect((await substituir(cenario(), { targetId: 'deadbeef0004' })).status).toBe(400);
    expect((await substituir(cenario({ alvo: null }), { targetId: 'ffffffffffff' })).status).toBe(404);
    expect((await substituir(cenario({ alvo: linha('ffffffffffff', 'deprecated') }), { targetId: 'ffffffffffff' })).status).toBe(400);
    expect((await substituir(cenario(), {})).status).toBe(400);
  });

  it('404 quando o gesto de origem não existe', async () => {
    expect((await substituir(cenario(), { targetId: 'ffffffffffff' }, '000000000000')).status).toBe(404);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd api && npx vitest run src/__tests__/gesturesReplaceWith.test.ts`
Expected: FAIL (404 na rota).

- [ ] **Step 3: Acrescentar a rota**

Imports extras em `routes/gestures.ts`:

```ts
import { validarDocumento } from '../gestures/schema';
import { contarUsos, substituirGesto } from '../gestures/usage';
```

E, no fim de `registerGesturesRoutes`:

```ts
  // POST …/:id/replace-with — funde dois gestos: o de origem vira 'deprecated' com
  // replaced_by, SEMPRE e no batch. Reescrever os documentos é faxina opcional: a
  // resolução de alias já é do cliente, e reescrever N objetos no R2 numa
  // requisição é caro e falível — por isso é sequencial e cada falha vira item
  // da resposta em vez de derrubar o resto.
  app.post('/api/gestures/dictionary/:id/replace-with', requireAuth, async (c) => {
    const id = c.req.param('id');
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const targetId = typeof body?.targetId === 'string' ? body.targetId : '';
    if (!targetId) return c.json({ error: "Field 'targetId' is required" }, 400);
    if (targetId === id) return c.json({ error: 'A gesture cannot replace itself' }, 400);
    const rewriteDocuments = body?.rewriteDocuments === true;

    try {
      const origem = await lerLinha(c.env.DB, id);
      if (!origem) return c.json({ error: 'Gesture not found' }, 404);
      const alvo = await lerLinha(c.env.DB, targetId);
      if (!alvo) return c.json({ error: 'Target gesture not found' }, 404);
      if (alvo.status !== 'active') return c.json({ error: 'Target gesture is deprecated' }, 400);

      await escreverNoDicionario(c.env.DB, [
        c.env.DB
          .prepare(`UPDATE gesture_dictionary SET status = 'deprecated', replaced_by = ?, updated_at = datetime('now') WHERE id = ?`)
          .bind(targetId, id),
      ]);

      let reescritos = 0;
      const falhas: { materialId: string; motivo: string }[] = [];
      if (rewriteDocuments) {
        const usos = await usosDoGesto(c.env.DB, id);
        for (const uso of usos) {
          const materialId = uso.material_id;
          try {
            const row = await c.env.DB
              .prepare(`SELECT r2_key FROM praise_materials WHERE id = ?`)
              .bind(materialId)
              .first<{ r2_key: string | null }>();
            if (!row?.r2_key) throw new Error('material sem r2_key');
            const objeto = await c.env.ASSETS.get(storageKeyFor(row.r2_key));
            if (!objeto) throw new Error('objeto não existe no R2');
            let lido: unknown;
            try {
              lido = JSON.parse(await objeto.text());
            } catch {
              throw new Error('documento não é JSON válido');
            }
            const validado = validarDocumento(lido);
            if (!validado.ok) throw new Error(`documento inválido em ${validado.erro.caminho}`);
            const { doc, trocados } = substituirGesto(validado.doc, id, targetId);
            if (trocados === 0) continue;
            await c.env.ASSETS.put(storageKeyFor(row.r2_key), JSON.stringify(doc), {
              httpMetadata: { contentType: 'application/json; charset=utf-8' },
            });
            const usosNovos = contarUsos(doc);
            await c.env.DB.batch([
              c.env.DB.prepare(`DELETE FROM gesture_usage WHERE material_id = ?`).bind(materialId),
              ...[...usosNovos].map(([g, n]) =>
                c.env.DB.prepare(`INSERT INTO gesture_usage (material_id, gesture_id, count) VALUES (?, ?, ?)`).bind(materialId, g, n)
              ),
            ]);
            reescritos += 1;
          } catch (error) {
            falhas.push({ materialId, motivo: error instanceof Error ? error.message : String(error) });
          }
        }
      }

      console.log(JSON.stringify({ msg: 'gesture.replace', from: id, to: targetId, rewritten: reescritos, failed: falhas.length }));
      return c.json({ ok: true, deprecated: id, replacedBy: targetId, reescritos, falhas });
    } catch (error) {
      console.error('Error replacing gesture:', error);
      return c.json({ error: 'Failed to replace gesture' }, 500);
    }
  });
```

- [ ] **Step 4: Inventário**

Depois das duas linhas de `'POST /api/gestures/dictionary/:id/gif'`:

```ts
  'POST /api/gestures/dictionary/:id/replace-with',
  'POST /api/gestures/dictionary/:id/replace-with',
```

- [ ] **Step 5: Rodar**

Run: `cd api && npx vitest run src/__tests__/gesturesReplaceWith.test.ts src/__tests__/routes.inventory.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/src/routes/gestures.ts api/src/__tests__/gesturesReplaceWith.test.ts api/src/__tests__/routes.inventory.test.ts
git commit -m "feat(gestos): replace-with deprecia com alias e reescreve documentos sob demanda"
```

---

### Task 9: Os dois achados de rota — criar material de gestos com `r2_key`, `has_content` para gestos, e `DELETE` limpando `gesture_usage`

**Files:**
- Modify: `api/src/routes/praises.ts:924-993` (`POST /api/praises/:id/materials`) e `:372` (`if (m.type !== 'chord') return base;`)
- Modify: `api/src/routes/materials.ts` (handler do `DELETE /api/materials/:materialId`)
- Test: `api/src/__tests__/gesturesMaterialLifecycle.test.ts` (novo)

**Interfaces:**
- `POST /api/praises/:id/materials` com `type: 'gestures'` → linha com `r2_key = assets/praises/{praiseId}/{id}.gestures` e `source_material_id` (opcional; 400 `Source material does not belong to this praise` se for de outro louvor; 404 `Source material not found` se não existir). Nenhum objeto no R2.
- `GET /api/praises/:id` → materiais `gestures` trazem `has_content` como os `chord`.
- `DELETE /api/materials/:materialId` → executa `DELETE FROM gesture_usage WHERE material_id = ?` antes de apagar a linha.

- [ ] **Step 1: Escrever o teste**

`api/src/__tests__/gesturesMaterialLifecycle.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';

import { app } from '../index';

const SEGREDO = '0123456789abcdef0123456789abcdef';
const ORIGEM = 'https://web.example';

async function cabecalhos() {
  const jwt = await new SignJWT({ email: 'admin@test.com', jti: 'j-gm' })
    .setProtectedHeader({ alg: 'HS256' }).setSubject('sub-admin').setIssuedAt().setExpirationTime('2h')
    .sign(new TextEncoder().encode(SEGREDO));
  return { origin: ORIGEM, cookie: `coldigom_access=${encodeURIComponent(jwt)}`, 'content-type': 'application/json' };
}

/** Banco mínimo para criar, listar e apagar material num louvor só. */
function ambiente(opts: { fonte?: { id: string; praise_id: string } | null } = {}) {
  const escritas: { sql: string; args: unknown[] }[] = [];
  const materiais: Record<string, unknown>[] = [
    { id: 'g1', praise_id: 'praise-1', material_kind: 'k1', type: 'gestures', r2_key: 'assets/praises/praise-1/g1.gestures', file_path_legacy: '', source_material_id: null, url: null },
    { id: 'c1', praise_id: 'praise-1', material_kind: 'k1', type: 'chord', r2_key: 'assets/praises/praise-1/c1.chord', file_path_legacy: '', source_material_id: null, url: null },
  ];
  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...args: unknown[]) => ({
        first: vi.fn(async () => {
          if (/FROM praises\b/i.test(sql) && /SELECT id/i.test(sql)) return { id: args[0] };
          if (/FROM praises p/i.test(sql)) return { id: args[0], name: 'Louvor', tag_ids: null };
          if (/SELECT praise_id, r2_key FROM praise_materials WHERE id/i.test(sql)) {
            return { praise_id: 'praise-1', r2_key: 'assets/praises/praise-1/g1.gestures' };
          }
          if (/FROM praise_materials WHERE id/i.test(sql)) {
            if (opts.fonte === null) return null;
            return opts.fonte ?? { id: args[0], praise_id: 'praise-1' };
          }
          return null;
        }),
        all: vi.fn(async () => {
          if (/FROM material_kinds/i.test(sql)) return { results: [{ id: 'k1' }] };
          if (/FROM praise_materials/i.test(sql)) return { results: materiais };
          return { results: [] };
        }),
        run: vi.fn(async () => { escritas.push({ sql, args }); return { meta: { changes: 1 } }; }),
      })),
    })),
    batch: vi.fn(async () => []),
  };
  const assets = {
    head: vi.fn(async (key: string) => (key.endsWith('g1.gestures') ? { size: 10 } : null)),
    put: vi.fn(), delete: vi.fn(async () => undefined), get: vi.fn(async () => null),
  };
  return { db, assets, escritas, env: { DB: db, ASSETS: assets, AUTH_JWT_SECRET: SEGREDO, AUTH_ALLOWED_EMAILS: '*', WEB_ORIGIN: ORIGEM } as never };
}

describe('POST /api/praises/:id/materials — type gestures', () => {
  it('cria a linha com r2_key padrão e source_material_id, sem objeto no R2', async () => {
    const ctx = ambiente();
    const res = await app.request('/api/praises/praise-1/materials', {
      method: 'POST', headers: await cabecalhos(),
      body: JSON.stringify({ material_kind: 'k1', type: 'gestures', source_material_id: 'pdf-1' }),
    }, ctx.env);
    expect(res.status).toBe(200);
    const insert = ctx.escritas.find((e) => e.sql.includes('INSERT INTO praise_materials'));
    expect(insert).toBeDefined();
    const [id, praiseId, , type, r2Key, , source] = insert!.args as string[];
    expect(type).toBe('gestures');
    expect(r2Key).toBe(`assets/praises/${praiseId}/${id}.gestures`);
    expect(source).toBe('pdf-1');
    expect(ctx.assets.put).not.toHaveBeenCalled();
  });

  it('recusa source_material_id de outro louvor e inexistente', async () => {
    const outro = ambiente({ fonte: { id: 'pdf-x', praise_id: 'praise-2' } });
    const r1 = await app.request('/api/praises/praise-1/materials', {
      method: 'POST', headers: await cabecalhos(),
      body: JSON.stringify({ material_kind: 'k1', type: 'gestures', source_material_id: 'pdf-x' }),
    }, outro.env);
    expect(r1.status).toBe(400);
    expect(outro.escritas.find((e) => e.sql.includes('INSERT'))).toBeUndefined();

    const some = ambiente({ fonte: null });
    const r2 = await app.request('/api/praises/praise-1/materials', {
      method: 'POST', headers: await cabecalhos(),
      body: JSON.stringify({ material_kind: 'k1', type: 'gestures', source_material_id: 'nao-existe' }),
    }, some.env);
    expect(r2.status).toBe(404);
  });

  it('os outros tipos continuam sem r2_key na criação', async () => {
    const ctx = ambiente();
    await app.request('/api/praises/praise-1/materials', {
      method: 'POST', headers: await cabecalhos(),
      body: JSON.stringify({ material_kind: 'k1', type: 'youtube', url: 'https://youtu.be/abc' }),
    }, ctx.env);
    const insert = ctx.escritas.find((e) => e.sql.includes('INSERT INTO praise_materials'));
    expect(insert!.args[4]).toBeNull();
  });
});

describe('GET /api/praises/:id — has_content nos gestos', () => {
  it('materiais gestures trazem has_content como os chord', async () => {
    const ctx = ambiente();
    const res = await app.request('/api/praises/praise-1', {}, ctx.env);
    const { data } = (await res.json()) as { data: { materials: { id: string; has_content?: boolean }[] } };
    expect(data.materials.find((m) => m.id === 'g1')?.has_content).toBe(true);
    expect(data.materials.find((m) => m.id === 'c1')?.has_content).toBe(false);
  });
});

describe('DELETE /api/materials/:materialId — limpa gesture_usage', () => {
  it('apaga o uso antes da linha, explicitamente', async () => {
    const ctx = ambiente();
    const res = await app.request('/api/materials/g1', { method: 'DELETE', headers: await cabecalhos() }, ctx.env);
    expect(res.status).toBe(200);
    const sqls = ctx.escritas.map((e) => e.sql);
    const iUso = sqls.findIndex((s) => /DELETE FROM gesture_usage WHERE material_id = \?/.test(s));
    const iLinha = sqls.findIndex((s) => /DELETE FROM praise_materials WHERE id = \?/.test(s));
    expect(iUso).toBeGreaterThanOrEqual(0);
    expect(iUso).toBeLessThan(iLinha);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd api && npx vitest run src/__tests__/gesturesMaterialLifecycle.test.ts`
Expected: FAIL — `r2Key` é `null`; `has_content` `undefined`; sem `DELETE FROM gesture_usage`.

- [ ] **Step 3: `POST /api/praises/:id/materials` em `praises.ts`**

Depois do bloco `if (!louvor) return c.json({ error: 'Praise not found' }, 404);` e antes de `const id = crypto.randomUUID();`:

```ts
    // Gestos: a linha nasce com a chave padrão do R2 e SEM objeto — o editor lê
    // o 404 do asset como "documento novo". A origem (o PDF de gestos) é
    // opcional e precisa ser do mesmo louvor, senão o link "Abrir PDF" apontaria
    // para o material de outro.
    const ehGestos = type === 'gestures';
    const sourceMaterialId =
      ehGestos && typeof body.source_material_id === 'string' && body.source_material_id.trim()
        ? body.source_material_id.trim()
        : null;
    if (sourceMaterialId) {
      const fonte = await c.env.DB.prepare('SELECT id, praise_id FROM praise_materials WHERE id = ?')
        .bind(sourceMaterialId)
        .first<{ id: string; praise_id: string }>();
      if (!fonte) return c.json({ error: 'Source material not found' }, 404);
      if (fonte.praise_id !== praiseId) return c.json({ error: 'Source material does not belong to this praise' }, 400);
    }
```

E no `INSERT`, troque os dois `null` de `r2_key` e `source_material_id`:

```ts
      ).bind(
        id,
        praiseId,
        material_kind,
        type,
        ehGestos ? `assets/praises/${praiseId}/${id}.gestures` : null,
        '',
        sourceMaterialId,
        null,
        hasUrl ? url.trim() : null
      ).run();
```

- [ ] **Step 4: `has_content` em `GET /api/praises/:id`**

Na linha `if (m.type !== 'chord') return base;`:

```ts
          // Cifra e gestos têm r2_key preenchido mesmo sem arquivo; só o R2 sabe
          // quais existem de verdade, e a tela precisa disso para dizer "criar"
          // em vez de "editar".
          if (m.type !== 'chord' && m.type !== 'gestures') return base;
```

- [ ] **Step 5: `DELETE` em `materials.ts`**

Antes de `await c.env.DB.prepare(\`DELETE FROM praise_materials WHERE id = ?\`)…`:

```ts
      // gesture_usage tem ON DELETE CASCADE, mas a migração 018 cai sobre um
      // banco já existente e este handler não é batch: apagar explicitamente
      // custa uma statement e a contagem de uso do dicionário nunca mente.
      await c.env.DB.prepare(`DELETE FROM gesture_usage WHERE material_id = ?`).bind(materialId).run();
```

- [ ] **Step 6: Rodar toda a API**

Run: `cd api && npx vitest run`
Expected: PASS — inclusive `materialCreateGuards.test.ts`, `praiseDetailResilience.test.ts` e `materialPatchIntegrity.test.ts`.

- [ ] **Step 7: Commit e fechar a fatia (b)**

```bash
git add api/src/routes/praises.ts api/src/routes/materials.ts api/src/__tests__/gesturesMaterialLifecycle.test.ts
git commit -m "feat(gestos): criar material de gestos com r2_key e origem; has_content; DELETE limpa o uso"
```

Na raiz: `npm run verify`. Cole a saída no relatório da fatia (b).

---

### Task 10: Importador `api/scripts/import_gestures.ts` contra fixtures

**Files:**
- Create: `api/scripts/import_gestures.ts`
- Create: `api/scripts/__fixtures__/gestures-export/dictionary.json`
- Create: `api/scripts/__fixtures__/gestures-export/figures/c687580e7682.png` e `a1b2c3d4e5f6.png` (PNG 1×1)
- Create: `api/scripts/__fixtures__/gestures-export/praises/p1/txt-1.gestures.json` e `txt-1.meta.json`
- Create: `api/scripts/__fixtures__/gestures-export/praises/p2/txt-2.gestures.json` e `txt-2.meta.json`
- Modify: `api/package.json` (scripts `gestures:import:dry-run`, `gestures:import`, `gestures:import:upload`, `gestures:import:execute`, `gestures:import:full`)
- Test: `api/src/__tests__/importGestures.test.ts`

**Interfaces (o que o teste importa de `scripts/import_gestures.ts`):**
- `lerExport(dir: string): Exportacao` — lê e **valida** tudo; lança `Error` com a lista `caminho-do-arquivo: codigo em caminho` se algum documento for inválido.
- `type EstadoAtual = { dicionario: Map<string, LinhaDoDicionario>; materiais: Map<string, { praise_id: string; type: string; r2_key: string | null; is_reviewed: number; material_kind: string }>; louvores: Set<string>; documentos: Map<string, string> }`
- `planejar(exp: Exportacao, estado: EstadoAtual, opcoes: { force: boolean; materialKind?: string }): Plano`
- `type Plano = { dicionario: { criar: GestureEntry[]; atualizar: GestureEntry[]; iguais: number }; documentos: { criar: DocPlanejado[]; atualizar: DocPlanejado[]; pular: DocPlanejado[]; iguais: number; semLouvor: DocPlanejado[] }; versaoSobe: boolean; materialKind: string | null }` com `DocPlanejado = { materialId: string; praiseId: string; r2Key: string; doc: GestureDocument; sourceMaterialId: string | null }`
- `gerarSql(plano: Plano): string`
- `resumo(plano: Plano): string` — a tabela do `--dry-run`.
- O `main` só roda quando o arquivo é o script invocado (guarda `isRunAsScript`, igual ao `ingest.ts`).

- [ ] **Step 1: Criar as fixtures**

```bash
mkdir -p api/scripts/__fixtures__/gestures-export/figures api/scripts/__fixtures__/gestures-export/praises/p1 api/scripts/__fixtures__/gestures-export/praises/p2
# PNG 1×1 transparente, o menor válido
PNG=iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==
echo "$PNG" | base64 -d > api/scripts/__fixtures__/gestures-export/figures/c687580e7682.png
echo "$PNG" | base64 -d > api/scripts/__fixtures__/gestures-export/figures/a1b2c3d4e5f6.png
```

`dictionary.json`:

```json
{
  "schema": "coldigom.gesture-dictionary/1",
  "version": 1,
  "generatedAt": "2026-09-04T00:00:00Z",
  "gestures": [
    { "id": "c687580e7682", "name": "Quero", "description": "Mãos ao peito", "exampleTriggers": ["Quero"], "image": "assets/cia/gestures/c687580e7682.png", "gif": null, "status": "active", "replacedBy": null, "updatedAt": "2026-09-04T00:00:00Z" },
    { "id": "a1b2c3d4e5f6", "name": "Viver", "description": "Braços abertos", "exampleTriggers": ["viver", "vida"], "image": "assets/cia/gestures/a1b2c3d4e5f6.png", "gif": null, "status": "active", "replacedBy": null, "updatedAt": "2026-09-04T00:00:00Z" }
  ]
}
```

`praises/p1/txt-1.gestures.json`:

```json
{
  "schema": "coldigom.gestures/1",
  "title": "182 - QUERO VIVER",
  "dictionaryVersion": 1,
  "items": [
    { "type": "gesture", "gestureId": "c687580e7682", "lyrics": [{ "trigger": "Quero", "text": "viver" }] },
    { "type": "gesture", "gestureId": "a1b2c3d4e5f6", "lyrics": [{ "trigger": "viver", "text": "com Jesus" }] }
  ]
}
```

`praises/p1/txt-1.meta.json`: `{ "sourceMaterialId": "pdf-1", "validated": true, "title": "182 - QUERO VIVER" }`

`praises/p2/txt-2.gestures.json`:

```json
{
  "schema": "coldigom.gestures/1",
  "title": "7 - OUTRO",
  "dictionaryVersion": 1,
  "items": [
    { "type": "gesture", "gestureId": "c687580e7682", "lyrics": [{ "trigger": "Quero", "text": "" }] }
  ]
}
```

`praises/p2/txt-2.meta.json`: `{ "sourceMaterialId": null, "validated": false, "title": "7 - OUTRO" }`

- [ ] **Step 2: Escrever o teste**

`api/src/__tests__/importGestures.test.ts`:

```ts
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { gerarSql, lerExport, planejar, resumo, type EstadoAtual } from '../../scripts/import_gestures';

const EXPORT = resolve(__dirname, '..', '..', 'scripts', '__fixtures__', 'gestures-export');

function estadoVazio(): EstadoAtual {
  return { dicionario: new Map(), materiais: new Map(), louvores: new Set(['p1', 'p2']), documentos: new Map() };
}

/** Estado onde tudo o que o export traz já está gravado, byte a byte. */
function estadoEmDia(): EstadoAtual {
  const exp = lerExport(EXPORT);
  const estado = estadoVazio();
  for (const g of exp.dicionario.gestures) {
    estado.dicionario.set(g.id, {
      id: g.id, name: g.name, description: g.description, example_triggers: JSON.stringify(g.exampleTriggers),
      image_key: `assets/cia/gestures/${g.id}.png`, gif_key: null, status: g.status, replaced_by: g.replacedBy,
      created_at: 't', updated_at: 't',
    });
  }
  for (const d of exp.documentos) {
    estado.materiais.set(d.txtId, { praise_id: d.praiseId, type: 'gestures', r2_key: `assets/praises/${d.praiseId}/${d.txtId}.gestures`, is_reviewed: 0, material_kind: 'k-gestos' });
    estado.documentos.set(d.txtId, JSON.stringify(d.doc));
  }
  return estado;
}

describe('lerExport', () => {
  it('lê dicionário, figuras e documentos com meta', () => {
    const exp = lerExport(EXPORT);
    expect(exp.dicionario.gestures.map((g) => g.id)).toEqual(['c687580e7682', 'a1b2c3d4e5f6']);
    expect([...exp.figuras.keys()].sort()).toEqual(['a1b2c3d4e5f6', 'c687580e7682']);
    expect(exp.documentos.map((d) => [d.praiseId, d.txtId, d.meta.sourceMaterialId])).toEqual([
      ['p1', 'txt-1', 'pdf-1'],
      ['p2', 'txt-2', null],
    ]);
  });

  it('falha alto e inteiro se um documento for inválido, dizendo o caminho', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gestos-'));
    cpSync(EXPORT, dir, { recursive: true });
    writeFileSync(
      join(dir, 'praises', 'p2', 'txt-2.gestures.json'),
      JSON.stringify({ schema: 'coldigom.gestures/1', title: 'x', dictionaryVersion: 1, items: [{ type: 'gesture', gestureId: 'zz', lyrics: [] }] })
    );
    expect(() => lerExport(dir)).toThrow(/txt-2\.gestures\.json: gesture_id_invalido em items\[0\]\.gestureId/);
    rmSync(dir, { recursive: true });
  });
});

describe('planejar', () => {
  it('estado vazio: cria tudo, e a versão sobe', () => {
    const plano = planejar(lerExport(EXPORT), estadoVazio(), { force: false, materialKind: 'k-gestos' });
    expect(plano.dicionario.criar.map((g) => g.id)).toEqual(['c687580e7682', 'a1b2c3d4e5f6']);
    expect(plano.documentos.criar.map((d) => d.materialId)).toEqual(['txt-1', 'txt-2']);
    expect(plano.documentos.criar[0].r2Key).toBe('assets/praises/p1/txt-1.gestures');
    expect(plano.documentos.criar[0].sourceMaterialId).toBe('pdf-1');
    expect(plano.versaoSobe).toBe(true);
  });

  it('segunda passada é no-op', () => {
    const plano = planejar(lerExport(EXPORT), estadoEmDia(), { force: false });
    expect(plano.dicionario.criar).toEqual([]);
    expect(plano.dicionario.atualizar).toEqual([]);
    expect(plano.dicionario.iguais).toBe(2);
    expect(plano.documentos.criar).toEqual([]);
    expect(plano.documentos.atualizar).toEqual([]);
    expect(plano.documentos.iguais).toBe(2);
    expect(plano.versaoSobe).toBe(false);
    expect(gerarSql(plano).trim()).toBe('');
  });

  it('documento revisado e diferente: pula sem --force, atualiza com --force', () => {
    const estado = estadoEmDia();
    estado.materiais.get('txt-1')!.is_reviewed = 1;
    estado.documentos.set('txt-1', '{"schema":"coldigom.gestures/1","title":"antigo","dictionaryVersion":0,"items":[]}');
    const sem = planejar(lerExport(EXPORT), estado, { force: false });
    expect(sem.documentos.pular.map((d) => d.materialId)).toEqual(['txt-1']);
    expect(sem.documentos.atualizar).toEqual([]);
    const com = planejar(lerExport(EXPORT), estado, { force: true });
    expect(com.documentos.atualizar.map((d) => d.materialId)).toEqual(['txt-1']);
    expect(com.documentos.pular).toEqual([]);
  });

  it('louvor que não existe no D1 vai para semLouvor, não para criar', () => {
    const estado = estadoVazio();
    estado.louvores.delete('p2');
    const plano = planejar(lerExport(EXPORT), estado, { force: false, materialKind: 'k' });
    expect(plano.documentos.semLouvor.map((d) => d.materialId)).toEqual(['txt-2']);
    expect(plano.documentos.criar.map((d) => d.materialId)).toEqual(['txt-1']);
  });

  it('material_kind vem da linha de gestos mais comum quando não é informado', () => {
    const estado = estadoEmDia();
    estado.materiais.delete('txt-2');
    const plano = planejar(lerExport(EXPORT), estado, { force: false });
    expect(plano.materialKind).toBe('k-gestos');
    expect(plano.documentos.criar[0].materialId).toBe('txt-2');
  });

  it('sem material_kind possível e com linha a criar, lança', () => {
    expect(() => planejar(lerExport(EXPORT), estadoVazio(), { force: false })).toThrow(/material-kind/);
  });

  it('entrada do dicionário que mudou vai para atualizar', () => {
    const estado = estadoEmDia();
    estado.dicionario.get('c687580e7682')!.name = 'Nome velho';
    const plano = planejar(lerExport(EXPORT), estado, { force: false });
    expect(plano.dicionario.atualizar.map((g) => g.id)).toEqual(['c687580e7682']);
    expect(plano.versaoSobe).toBe(true);
  });
});

describe('gerarSql', () => {
  it('um único bump de versão para a importação inteira, e o uso recomputado por documento', () => {
    const sql = gerarSql(planejar(lerExport(EXPORT), estadoVazio(), { force: false, materialKind: 'k-gestos' }));
    expect(sql.match(/UPDATE gesture_dictionary_meta SET version = version \+ 1/g)).toHaveLength(1);
    expect(sql.match(/INSERT INTO gesture_dictionary/g)).toHaveLength(2);
    expect(sql.match(/INSERT INTO praise_materials/g)).toHaveLength(2);
    expect(sql).toContain("'assets/praises/p1/txt-1.gestures'");
    expect(sql.match(/DELETE FROM gesture_usage WHERE material_id = /g)).toHaveLength(2);
    expect(sql.match(/INSERT INTO gesture_usage/g)).toHaveLength(3);
  });

  it('atualização com --force zera a marca de revisão, como o PUT faz', () => {
    const estado = estadoEmDia();
    estado.materiais.get('txt-1')!.is_reviewed = 1;
    estado.documentos.set('txt-1', '{}');
    const sql = gerarSql(planejar(lerExport(EXPORT), estado, { force: true }));
    expect(sql).toMatch(/UPDATE praise_materials SET is_reviewed = 0, reviewed_at = NULL, reviewed_by = NULL WHERE id = 'txt-1'/);
  });

  it('o resumo do dry-run lista criar/atualizar/pular por seção', () => {
    const texto = resumo(planejar(lerExport(EXPORT), estadoVazio(), { force: false, materialKind: 'k' }));
    expect(texto).toMatch(/dicionário.*criar: 2/i);
    expect(texto).toMatch(/documentos.*criar: 2/i);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd api && npx vitest run src/__tests__/importGestures.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 4: Escrever `api/scripts/import_gestures.ts`**

```ts
/**
 * Importação dos gestos CIAs a partir do export do pdf_extractor.
 *
 * Uso (de api/):
 *   npm run gestures:import:dry-run -- --from ../../pdf_extractor/export/gestures
 *   npm run gestures:import         -- --from …   # --sql-only: escreve import_gestures.sql
 *   npm run gestures:import:upload  -- --from …   # sql + figuras e documentos no R2
 *   npm run gestures:import:execute -- --from …   # sql + D1 remoto
 *   npm run gestures:import:full    -- --from …   # tudo
 *   flags: --force (sobrescreve is_reviewed = 1), --material-kind <id>
 *
 * Duas metades, nessa ordem: dicionário (upsert + UM bump de versão para a
 * importação inteira) e louvores (linha em praise_materials com o id do .txt,
 * objeto no R2, gesture_usage recomputado). Todo documento é validado ANTES de
 * qualquer escrita: export ruim falha alto e inteiro, nunca pela metade.
 *
 * Estado atual do D1 vem por `wrangler d1 execute --json` (global, nunca npx);
 * os documentos já gravados vêm do R2 pela API S3, como o ingest.ts faz.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';

import { validarDocumento, type GestureDocument } from '../src/gestures/schema';
import { contarUsos } from '../src/gestures/usage';
import type { GestureDictionary, GestureEntry, LinhaDoDicionario } from '../src/gestures/dictionaryTypes';

const R2_CONFIG = {
  accountId: process.env.CF_ACCOUNT_ID || '',
  accessKeyId: process.env.CF_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.CF_SECRET_ACCESS_KEY || '',
  bucket: process.env.CF_R2_BUCKET || 'coldigom-assets',
};
const SQL_SAIDA = path.join(process.cwd(), 'import_gestures.sql');

export type Meta = { sourceMaterialId: string | null; validated: boolean; title: string };
export type DocExportado = { praiseId: string; txtId: string; doc: GestureDocument; meta: Meta; arquivo: string };
export type Exportacao = { dicionario: GestureDictionary; figuras: Map<string, string>; documentos: DocExportado[] };

export type MaterialAtual = { praise_id: string; type: string; r2_key: string | null; is_reviewed: number; material_kind: string };
export type EstadoAtual = {
  dicionario: Map<string, LinhaDoDicionario>;
  materiais: Map<string, MaterialAtual>;
  louvores: Set<string>;
  /** JSON já gravado no R2, por material_id. */
  documentos: Map<string, string>;
};

export type DocPlanejado = { materialId: string; praiseId: string; r2Key: string; doc: GestureDocument; sourceMaterialId: string | null };
export type Plano = {
  dicionario: { criar: GestureEntry[]; atualizar: GestureEntry[]; iguais: number };
  documentos: { criar: DocPlanejado[]; atualizar: DocPlanejado[]; pular: DocPlanejado[]; iguais: number; semLouvor: DocPlanejado[] };
  versaoSobe: boolean;
  materialKind: string | null;
};

// ---------- leitura ----------

export function lerExport(dir: string): Exportacao {
  const dicionario = JSON.parse(fs.readFileSync(path.join(dir, 'dictionary.json'), 'utf8')) as GestureDictionary;
  if (dicionario.schema !== 'coldigom.gesture-dictionary/1' || !Array.isArray(dicionario.gestures)) {
    throw new Error('dictionary.json não é um coldigom.gesture-dictionary/1');
  }
  const figuras = new Map<string, string>();
  const pastaFiguras = path.join(dir, 'figures');
  if (fs.existsSync(pastaFiguras)) {
    for (const nome of fs.readdirSync(pastaFiguras)) {
      if (nome.endsWith('.png')) figuras.set(nome.slice(0, -4), path.join(pastaFiguras, nome));
    }
  }

  const documentos: DocExportado[] = [];
  const erros: string[] = [];
  const pastaLouvores = path.join(dir, 'praises');
  const louvores = fs.existsSync(pastaLouvores) ? fs.readdirSync(pastaLouvores).sort() : [];
  for (const praiseId of louvores) {
    const pasta = path.join(pastaLouvores, praiseId);
    if (!fs.statSync(pasta).isDirectory()) continue;
    for (const nome of fs.readdirSync(pasta).sort()) {
      if (!nome.endsWith('.gestures.json')) continue;
      const txtId = nome.slice(0, -'.gestures.json'.length);
      const arquivo = path.join(pasta, nome);
      const lido = JSON.parse(fs.readFileSync(arquivo, 'utf8')) as unknown;
      const r = validarDocumento(lido);
      if (!r.ok) {
        erros.push(`${path.join(praiseId, nome)}: ${r.erro.codigo} em ${r.erro.caminho}`);
        continue;
      }
      const metaArquivo = path.join(pasta, `${txtId}.meta.json`);
      const meta: Meta = fs.existsSync(metaArquivo)
        ? (JSON.parse(fs.readFileSync(metaArquivo, 'utf8')) as Meta)
        : { sourceMaterialId: null, validated: false, title: r.doc.title };
      documentos.push({ praiseId, txtId, doc: r.doc, meta, arquivo });
    }
  }
  if (erros.length > 0) {
    throw new Error(`Export inválido — nada foi escrito:\n  ${erros.join('\n  ')}`);
  }
  return { dicionario, figuras, documentos };
}

// ---------- planejamento ----------

function entradaIgualALinha(g: GestureEntry, l: LinhaDoDicionario): boolean {
  return (
    g.name === l.name &&
    (g.description ?? '') === (l.description ?? '') &&
    JSON.stringify(g.exampleTriggers ?? []) === JSON.stringify(JSON.parse(l.example_triggers || '[]')) &&
    g.status === l.status &&
    (g.replacedBy ?? null) === (l.replaced_by ?? null)
  );
}

/** Igualdade de documento é por JSON canônico (chaves na ordem do contrato, sem espaço). */
function canonico(doc: unknown): string {
  return JSON.stringify(doc);
}

function materialKindMaisComum(materiais: Map<string, MaterialAtual>): string | null {
  const contagem = new Map<string, number>();
  for (const m of materiais.values()) {
    if (m.type !== 'gestures') continue;
    contagem.set(m.material_kind, (contagem.get(m.material_kind) ?? 0) + 1);
  }
  let melhor: string | null = null;
  let n = 0;
  for (const [k, v] of contagem) if (v > n) { melhor = k; n = v; }
  return melhor;
}

export function planejar(exp: Exportacao, estado: EstadoAtual, opcoes: { force: boolean; materialKind?: string }): Plano {
  const dicionario: Plano['dicionario'] = { criar: [], atualizar: [], iguais: 0 };
  for (const g of exp.dicionario.gestures) {
    const atual = estado.dicionario.get(g.id);
    if (!atual) dicionario.criar.push(g);
    else if (entradaIgualALinha(g, atual)) dicionario.iguais += 1;
    else dicionario.atualizar.push(g);
  }

  const documentos: Plano['documentos'] = { criar: [], atualizar: [], pular: [], iguais: 0, semLouvor: [] };
  for (const d of exp.documentos) {
    const planejado: DocPlanejado = {
      materialId: d.txtId,
      praiseId: d.praiseId,
      r2Key: `assets/praises/${d.praiseId}/${d.txtId}.gestures`,
      doc: d.doc,
      sourceMaterialId: d.meta.sourceMaterialId ?? null,
    };
    const material = estado.materiais.get(d.txtId);
    if (!material) {
      if (!estado.louvores.has(d.praiseId)) documentos.semLouvor.push(planejado);
      else documentos.criar.push(planejado);
      continue;
    }
    // Linha existente: a chave do R2 é a que já está no banco, não a padrão.
    if (material.r2_key) planejado.r2Key = material.r2_key;
    const gravado = estado.documentos.get(d.txtId);
    if (gravado !== undefined && canonico(JSON.parse(gravado)) === canonico(d.doc)) {
      documentos.iguais += 1;
    } else if (material.is_reviewed === 1 && !opcoes.force) {
      documentos.pular.push(planejado);
    } else {
      documentos.atualizar.push(planejado);
    }
  }

  const materialKind = opcoes.materialKind ?? materialKindMaisComum(estado.materiais);
  if (documentos.criar.length > 0 && !materialKind) {
    throw new Error('Há linhas a criar e nenhum material_kind conhecido: informe --material-kind <id>.');
  }

  return {
    dicionario,
    documentos,
    versaoSobe: dicionario.criar.length + dicionario.atualizar.length > 0,
    materialKind,
  };
}

// ---------- SQL ----------

function sql(valor: unknown): string {
  if (valor === null || valor === undefined) return 'NULL';
  if (typeof valor === 'number') return String(valor);
  return `'${String(valor).replace(/'/g, "''")}'`;
}

function sqlDoUso(d: DocPlanejado): string[] {
  const linhas = [`DELETE FROM gesture_usage WHERE material_id = ${sql(d.materialId)};`];
  for (const [g, n] of contarUsos(d.doc)) {
    linhas.push(`INSERT INTO gesture_usage (material_id, gesture_id, count) VALUES (${sql(d.materialId)}, ${sql(g)}, ${n});`);
  }
  return linhas;
}

export function gerarSql(plano: Plano): string {
  const linhas: string[] = [];
  for (const g of [...plano.dicionario.criar, ...plano.dicionario.atualizar]) {
    linhas.push(
      `INSERT INTO gesture_dictionary (id, name, description, example_triggers, image_key, gif_key, status, replaced_by) VALUES (` +
        `${sql(g.id)}, ${sql(g.name)}, ${sql(g.description ?? '')}, ${sql(JSON.stringify(g.exampleTriggers ?? []))}, ` +
        `${sql(`assets/cia/gestures/${g.id}.png`)}, ${sql(g.gif)}, ${sql(g.status)}, ${sql(g.replacedBy)}) ` +
        `ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, ` +
        `example_triggers = excluded.example_triggers, status = excluded.status, replaced_by = excluded.replaced_by, ` +
        `updated_at = datetime('now');`
    );
  }
  if (plano.versaoSobe) linhas.push(`UPDATE gesture_dictionary_meta SET version = version + 1 WHERE id = 1;`);

  for (const d of plano.documentos.criar) {
    linhas.push(
      `INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key, file_path_legacy, source_material_id, merged_from_praise_id, url) VALUES (` +
        `${sql(d.materialId)}, ${sql(d.praiseId)}, ${sql(plano.materialKind)}, 'gestures', ${sql(d.r2Key)}, '', ${sql(d.sourceMaterialId)}, NULL, NULL);`
    );
    linhas.push(...sqlDoUso(d));
  }
  for (const d of plano.documentos.atualizar) {
    // Conteúdo novo nunca teve olho humano: mesma regra do PUT /content.
    linhas.push(`UPDATE praise_materials SET is_reviewed = 0, reviewed_at = NULL, reviewed_by = NULL WHERE id = ${sql(d.materialId)};`);
    linhas.push(...sqlDoUso(d));
  }
  return linhas.join('\n') + (linhas.length ? '\n' : '');
}

export function resumo(plano: Plano): string {
  const d = plano.dicionario;
  const o = plano.documentos;
  const lista = (xs: DocPlanejado[]) => (xs.length ? '\n    ' + xs.map((x) => `${x.praiseId}/${x.materialId}`).join('\n    ') : '');
  return [
    `Dicionário — criar: ${d.criar.length}, atualizar: ${d.atualizar.length}, iguais: ${d.iguais}${plano.versaoSobe ? ' (versão sobe)' : ''}`,
    `Documentos — criar: ${o.criar.length}, atualizar: ${o.atualizar.length}, pular (revisados): ${o.pular.length}, iguais: ${o.iguais}, sem louvor: ${o.semLouvor.length}`,
    o.pular.length ? `  pulados sem --force:${lista(o.pular)}` : '',
    o.semLouvor.length ? `  louvor inexistente no D1:${lista(o.semLouvor)}` : '',
    plano.materialKind ? `material_kind das linhas novas: ${plano.materialKind}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

// ---------- estado atual (D1 + R2) ----------

function consultarD1<T>(comando: string): T[] {
  const saida = execFileSync('wrangler', ['d1', 'execute', 'coldigom', '--remote', '--json', '--command', comando], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const json = JSON.parse(saida) as { results: T[] }[];
  return json[0]?.results ?? [];
}

async function clienteS3() {
  const { S3Client } = await import('@aws-sdk/client-s3');
  return new S3Client({
    region: 'auto',
    endpoint: `https://${R2_CONFIG.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_CONFIG.accessKeyId, secretAccessKey: R2_CONFIG.secretAccessKey },
  });
}

async function lerEstadoAtual(): Promise<EstadoAtual> {
  const dicionario = new Map<string, LinhaDoDicionario>();
  for (const l of consultarD1<LinhaDoDicionario>('SELECT id, name, description, example_triggers, image_key, gif_key, status, replaced_by, created_at, updated_at FROM gesture_dictionary')) {
    dicionario.set(l.id, l);
  }
  const materiais = new Map<string, MaterialAtual>();
  for (const m of consultarD1<MaterialAtual & { id: string }>("SELECT id, praise_id, type, r2_key, is_reviewed, material_kind FROM praise_materials WHERE type = 'gestures'")) {
    materiais.set(m.id, m);
  }
  const louvores = new Set(consultarD1<{ id: string }>('SELECT id FROM praises').map((p) => p.id));

  const documentos = new Map<string, string>();
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  const s3 = await clienteS3();
  for (const [id, m] of materiais) {
    if (!m.r2_key) continue;
    try {
      const obj = await s3.send(new GetObjectCommand({ Bucket: R2_CONFIG.bucket, Key: `storage/${m.r2_key.replace(/^\/+/, '')}` }));
      documentos.set(id, await obj.Body!.transformToString());
    } catch {
      // sem objeto: a linha existe mas o documento nunca foi gravado — vira "atualizar"
    }
  }
  return { dicionario, materiais, louvores, documentos };
}

// ---------- execução ----------

async function subirParaR2(plano: Plano, exp: Exportacao): Promise<void> {
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  const s3 = await clienteS3();
  for (const g of [...plano.dicionario.criar, ...plano.dicionario.atualizar]) {
    const figura = exp.figuras.get(g.id);
    if (!figura) { console.warn(`  sem figura para ${g.id}`); continue; }
    await s3.send(new PutObjectCommand({ Bucket: R2_CONFIG.bucket, Key: `storage/assets/cia/gestures/${g.id}.png`, Body: fs.readFileSync(figura), ContentType: 'image/png' }));
  }
  for (const d of [...plano.documentos.criar, ...plano.documentos.atualizar]) {
    await s3.send(new PutObjectCommand({ Bucket: R2_CONFIG.bucket, Key: `storage/${d.r2Key}`, Body: JSON.stringify(d.doc), ContentType: 'application/json; charset=utf-8' }));
  }
}

function lerFlag(argv: string[], nome: string): string | undefined {
  const i = argv.indexOf(nome);
  return i >= 0 ? argv[i + 1] : undefined;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const from = lerFlag(argv, '--from');
  if (!from) throw new Error('Informe --from <pasta do export/gestures>');
  const full = argv.includes('--full');
  const dryRun = argv.includes('--dry-run') || !(full || argv.includes('--sql-only') || argv.includes('--upload-r2') || argv.includes('--execute-d1'));

  const exp = lerExport(path.resolve(from));
  console.log(`Export lido: ${exp.dicionario.gestures.length} gestos, ${exp.figuras.size} figuras, ${exp.documentos.length} documentos`);
  const estado = await lerEstadoAtual();
  const plano = planejar(exp, estado, { force: argv.includes('--force'), materialKind: lerFlag(argv, '--material-kind') });
  console.log(resumo(plano));
  if (dryRun) return;

  const sqlTexto = gerarSql(plano);
  fs.writeFileSync(SQL_SAIDA, sqlTexto);
  console.log(`SQL escrito em ${SQL_SAIDA} (${sqlTexto.split('\n').length - 1} statements)`);

  if (full || argv.includes('--upload-r2')) {
    await subirParaR2(plano, exp);
    console.log('R2 atualizado');
  }
  if (full || argv.includes('--execute-d1')) {
    if (!sqlTexto.trim()) { console.log('Nada a executar no D1'); return; }
    execFileSync('wrangler', ['d1', 'execute', 'coldigom', '--remote', `--file=${SQL_SAIDA}`], { stdio: 'inherit' });
    console.log('D1 atualizado');
  }
}

// Só roda quando é o script invocado. Sem a guarda, o import do teste unitário
// dispararia a importação — o mesmo bug que o ingest.ts já teve.
const isRunAsScript = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isRunAsScript) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
```

- [ ] **Step 5: Scripts no `api/package.json`**

Depois de `"ingest:verify"`:

```json
    "gestures:import:dry-run": "tsx scripts/import_gestures.ts --dry-run",
    "gestures:import": "tsx scripts/import_gestures.ts --sql-only",
    "gestures:import:upload": "tsx scripts/import_gestures.ts --upload-r2",
    "gestures:import:execute": "tsx scripts/import_gestures.ts --execute-d1",
    "gestures:import:full": "tsx scripts/import_gestures.ts --full",
```

- [ ] **Step 6: Rodar**

Run: `cd api && npx vitest run src/__tests__/importGestures.test.ts && npm run build:scripts`
Expected: PASS nos 12 testes; `tsc -p tsconfig.scripts.json` sem erro (o script importa de `../src/gestures/*`, que o tsconfig de scripts compila por referência).

- [ ] **Step 7: Commit e fechar a fatia (c)**

```bash
git add api/scripts/import_gestures.ts api/scripts/__fixtures__/gestures-export api/package.json api/src/__tests__/importGestures.test.ts
git commit -m "feat(gestos): importador em etapas do export do pdf_extractor, idempotente e contra fixtures"
```

Na raiz: `npm run verify`. Cole a saída no relatório da fatia (c).

---

### Task 11: Catraca de cobertura da API

**Files:**
- Modify: `api/vitest.config.ts`

- [ ] **Step 1: Medir**

Run: `cd api && npm run test:coverage 2>&1 | grep -E "^All files"`
Anote os quatro números (statements / branches / functions / lines).

- [ ] **Step 2: Subir os thresholds**

Em `api/vitest.config.ts`, acrescente a linha de histórico e troque os quatro valores pelo **piso** de cada número medido — nunca abaixo do que está lá hoje (70 / 66 / 72 / 72). Se algum medido ficou abaixo do atual, isso é um bug do plano: pare e avise em vez de baixar.

```ts
      // Gestos (2026-09-XX): editor de gestos — <medidos>
      thresholds: {
        statements: <piso>,
        branches: <piso>,
        functions: <piso>,
        lines: <piso>,
      },
```

- [ ] **Step 3: Verificar**

Run: `npm run verify` (na raiz)
Expected: verde.

- [ ] **Step 4: Commit**

```bash
git add api/vitest.config.ts
git commit -m "chore(api): catraca de cobertura sobe com os gestos"
```
