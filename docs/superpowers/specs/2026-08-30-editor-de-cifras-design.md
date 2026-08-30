# Editor de cifras — design

Data: 2026-08-30
Status: aprovado
Depende de: `2026-08-29-chordpro-viewer-design.md`

## Objetivo

Tornar a página de cifra editável: sessão visível, edição do conteúdo na própria
linha, um manual de como escrever acordes, e um validador que impede acorde sem
sentido de entrar no acervo.

## Critério que decide os trade-offs

O mesmo do viewer: o coldigom é ferramenta de **gestão**, não de consumo. Quando
densidade de informação e ações de CRUD competirem com conforto de leitura, ganha a
informação.

Foi por esse critério que a transposição saiu do escopo depois de entrar: mudar o tom
é feature de consumo e pertence ao app Flutter. O validador continua, mas o que ele
protege é o acervo, não a transposição.

## O vocabulário real

Medido nos 56 arquivos revisados à mão (`out/gold_set/manifest.json` → `reviewed.chordpro`),
**2.224 acordes, 109 tokens distintos, zero fora do padrão**:

| Parte | Formas observadas |
|---|---|
| raiz | `[A-G]` com `#` ou `b` opcional |
| qualidade | *(maior)* 1255 · `m` 525 · `7` 303 · `m7` 44 · `6` 19 · `9` 15 · `ø` 14 · `m6` 8 · `7M` 7 · `sus4` 6 · `m(b13)` 4 · `m7(9)` 3 · `7(b13)` 2 · `(b13)` 1 · `(#5)` 1 |
| baixo | sempre `[A-G]` com `#` ou `b` — `G/B`, `Am/C`, `B/D#`, `C7/E`, `E7/Ab`, `F#m/E`, `Gm/Bb` |
| anotação | `*2x` (16) e `*Coro` — **não são acordes** |

Três consequências que decidem o desenho:

1. **`[*2x]` e `[*Coro]` ocupam a linha inteira, sozinhos.** São a convenção de
   repetição e de seção do acervo. Um validador que só conhecesse acordes recusaria a
   própria sintaxe do dono.
2. **Meio-diminuto é `ø`, sétima maior é `7M`, aumentado é `(#5)`.** Convenção
   brasileira e do hinário. `maj7` seria importar convenção alheia.
3. **Diminuto puro não existe no corpus.** É aceito na gramática, mas não há
   precedente para copiar.

A gramática de `segment.py:32` no pipeline **não serve**: é case-insensitive, aceita
`bis`/`N.C.`/`%` e recusa `A7(sus4)`. Foi feita para detectar acorde em OCR sujo, não
para validar digitação humana.

## Arquitetura

### `web/src/lib/chordpro/chord.ts` — novo, puro

A única peça do sistema que sabe o que é um acorde.

```ts
export type ChordToken =
  | { kind: 'chord'; root: string; accidental: '' | '#' | 'b';
      quality: string; bass: string | null; raw: string }
  | { kind: 'annotation'; text: string; raw: string }
  | { kind: 'unknown'; raw: string; reason: string };

export function parseChordToken(raw: string): ChordToken;
export function normalizeChord(raw: string): string;
```

Três classes, não duas — `*2x` não é acorde nem erro.

Gramática:

```
token      := anotação | acorde
anotação   := "*" resto
acorde     := raiz qualidade? ( "/" raiz )?
raiz       := [A-G] [#b]?
qualidade  := "ø"                                  meio-diminuto
            | "°"                                  diminuto (sem precedente no corpus)
            | "m"? sus? ext? alteração*
sus        := "sus" ("2"|"4")
ext        := "6" | "7" | "9" | "11" | "13" | "7M"
alteração  := "(" [#b]? [0-9]{1,2} ")"
```

O `reason` de `unknown` aponta onde a análise quebrou: `"depois da raiz B, 'mm' não é
uma qualidade válida"`.

### Normalização na entrada

`ø` e `°` não estão no teclado. `normalizeChord` aceita as formas digitáveis e grava a
forma do acervo:

| Digitado | Gravado |
|---|---|
| `m7(b5)`, `m7b5`, `ø` | `ø` |
| `dim`, `o`, `°` | `°` |
| `maj7`, `M7`, `7M` | `7M` |

Isso reescreve o que a pessoa digitou, o que atrita com o princípio "nunca reescrever"
do viewer. A distinção é deliberada: lá era sobre **exibir** arquivo publicado; aqui é
**entrada de dados**, onde consistência no acervo vale mais que fidelidade à tecla.
Nada mais é normalizado — espaçamento, letra e ordem ficam intocados.

### `web/src/lib/chordpro/validate.ts` — novo, puro

```ts
/** Endereço de uma linha dentro do Song. Usado pela validação e pela edição,
 *  para as duas falarem das mesmas coordenadas. */
export type LineRef = { stanza: number; line: number };

export type ValidationIssue = LineRef & {
  cell: number; raw: string; reason: string;
};
export function validateSong(song: Song): ValidationIssue[];
```

Casca fina sobre `chord.ts`: percorre o `Song`, devolve os `unknown` com posição.
Anotação nunca é issue. Linha `comment` não produz issue — não tem células.

O `{key: ...}` do cabeçalho **não é validado como acorde**: é tonalidade, não cifra, e o
corpus tem `{key: }` vazio legítimo.

### Correção obrigatória em `serialize.ts`

`serializeCells` não re-escapa `[` e `]` no texto. Verificado:

```
original : "um \[dois\] tres"
serializa: "um [dois] tres"
reparse  : [dois] virou ACORDE      → round-trip NÃO idempotente
```

Impacto em produção hoje é zero (nada chama `serialize` fora dos testes, e o corpus não
tem escapes), mas o editor passa a chamar. `serializeCells` precisa emitir `\[` e `\]`
para colchete literal no texto, e o teste de round-trip precisa cobrir o caso — o teste
atual afirmava idempotência exercitando só fixtures sem escape.

### `web/src/lib/chordpro/edit.ts` — novo, puro

Operações de estrutura sobre `Song`, sem DOM:

```ts
replaceLine(song, at: LineRef, texto: string): Song   // usa parseCells
insertLineAfter(song, at: LineRef): Song              // linha de células vazia
removeLine(song, at: LineRef): Song                   // estrofe que esvazia é removida
splitStanzaAt(song, at: LineRef): Song                // `at` e as seguintes viram nova estrofe
setHeaderField(song, campo, valor: string): Song      // valor vazio remove a diretiva
```

Todas puras: recebem `Song`, devolvem `Song` novo, nunca mutam. `LineRef` é o mesmo tipo
que a validação usa, então marcar um erro e editar a linha marcada falam a mesma língua.

Campo de cabeçalho vazio significa diretiva ausente — coerente com o que o parser já
faz com `{key: }` e `{subtitle: ?}`, e é o que permite consertar esses dois casos pela
tela.

### `web/src/components/chordpro/ChordProEditor.tsx` — novo

Edição na própria linha. Clicar numa linha chama `serializeCells(cells)` para obter o
texto editável; ao confirmar, `parseCells(texto)` devolve as células novas.

**O espaçamento é dado, não estilo**, e não dá para estilizá-lo dentro de um `<input>`.
Em vez da técnica de espelho sobreposto, **o preview da linha renderiza logo abaixo do
campo, ao vivo**, usando o próprio `ChordProView`. Como o preview usa `white-space: pre`,
a diferença entre um e três espaços fica visível enquanto se digita, sem uma segunda
implementação de renderização.

Por linha: inserir abaixo, remover, separar estrofe aqui. Linhas `{comment}` editam como
texto.

### `web/src/components/chordpro/ChordHints.tsx` — novo

Painel colapsável com o vocabulário **do acervo**, não com teoria musical genérica:

| | |
|---|---|
| `C` | maior |
| `Cm` | menor |
| `C7` | com sétima |
| `C7M` | com sétima maior — o acervo usa `7M`, não `maj7` |
| `Cø` | meio-diminuto |
| `C°` | diminuto |
| `C(#5)` | aumentado |
| `Csus4` | suspenso |
| `C/E` | baixo invertido |
| `[*2x]` | repetição — anotação, não acorde |

Botões para inserir `ø` e `°`, que não estão no teclado.

### `web/src/components/AuthControl.tsx` — novo

O controle está duplicado inline em `HomePage.tsx` e `PraiseDetailPage.tsx`, com texto
divergente ("Entrar com o Google" × "Entrar com Google"). Extrair um componente,
normalizar o texto para **"Entrar com o Google"**, e usar nos três lugares.

Sem sessão, a página de cifra fica como está hoje: sem modo de edição, mesmo padrão que
o `ReviewSwitch` já adota.

### Anotação deixa de parecer acorde

`ChordProView` hoje renderiza `[*2x]` como rótulo vermelho de acorde — está assim em
produção. Anotação passa a ter estilo próprio, distinto da tinta de acorde.

## Gravação

`PUT /api/materials/:materialId/content`, que já existe e está publicado. Corpo em texto
puro, `content-type: text/plain; charset=utf-8`, protegido por `requireUploadOrAuth`.
Devolve `{ok, material_id, praise_id, r2_key}`. Nenhum endpoint novo.

### Escrita concorrente

O endpoint não tem ETag: quem salva por último ganha, em silêncio. Deixou de ser
hipótese — durante o desenvolvimento do viewer, alguém editou arquivos e aplicou uma
migration em paralelo.

Como o arquivo tem 611 bytes em média, a defesa é barata: **antes de gravar, refazer o
GET do asset e comparar com o conteúdo carregado**. Se mudou, avisar e não sobrescrever.
É detecção, não trava — o usuário decide recarregar ou forçar.

## Validação na interface

Roda a cada mudança sobre o `Song`. Token não reconhecido marca a linha e o token,
mostra o `reason`, e **desabilita o Salvar**. Um botão separado, **"Salvar assim
mesmo"**, força a gravação — porque a cauda longa do corpus (`A(b13)`, `E(#5)`,
`E7/Ab`) mostra que a gramática pode não prever o próximo acorde legítimo, e travar o
dono do acervo seria pior que o erro que se quer evitar.

"Salvar assim mesmo" contorna **apenas o validador**. A detecção de escrita concorrente
continua valendo: forçar um acorde raro é uma decisão informada; sobrescrever o trabalho
de outra pessoa em silêncio não é.

## Testes

O teste que dá confiança de verdade:

> **Os 109 tokens do gabarito humano classificam como `chord` ou `annotation`. Zero
> `unknown`.**

Se a gramática recusar um acorde já aprovado à mão, falha. `out/` é gitignored, então o
gabarito não está no repositório: o vocabulário extraído vai commitado como
`web/src/__tests__/fixtures/chordpro/chord-vocabulary.json` (109 tokens com contagem),
para o teste ser reproduzível.

Além dele:

- as 15 qualidades observadas, uma a uma
- recusas: `Bmm`, `H`, `Am7/`, `C#m7(`, `[]`
- `*2x` e `*Coro` como `annotation`, nunca `unknown`
- normalização: `m7b5` → `ø`, `dim` → `°`, `maj7` → `7M`
- escape do serializer e o round-trip que faltou
- operações de `edit.ts` como funções puras
- editor: editar linha preserva espaçamento; campo de cabeçalho vazio remove a diretiva
- salvar: bloqueado quando inválido; liberado por "salvar assim mesmo"; abortado quando
  o arquivo mudou no servidor

## Fora de escopo

Transposição (retirada pelo dono depois de entrar), criação de cifra nova, edição das
notas `;` do pipeline, e o destaque do `|` — que só faria sentido se o editor abrisse
conteúdo do staging, e ele não abre.

## Risco a declarar

Este design altera `parse.ts`, `serialize.ts` e `ChordProView.tsx` — código publicado
há poucas horas, com a feature de marca de revisão de outra pessoa em cima. A correção
do escape e o estilo de anotação são mudanças de comportamento em código em produção,
não apenas adição.
