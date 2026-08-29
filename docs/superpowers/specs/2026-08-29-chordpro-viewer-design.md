# Viewer de ChordPro — design

Data: 2026-08-29
Status: aprovado

## Objetivo

Construir uma página dedicada que renderiza cifras ChordPro do acervo no frontend web
do coldigom. É a base sobre a qual virão a edição de cifras existentes e a criação de
novas.

## Critério que decide os trade-offs

O coldigom é ferramenta de **gestão** do acervo, não de consumo. Quando densidade de
informação e ações de CRUD competirem com conforto de leitura, ganha a informação. O app
Flutter é o de consumo; features de leitura dele (transposição, modo palco, auto-scroll,
offline) não são portadas.

## O dado

Cifras são materiais com `type: 'chord'` em `praise_materials`, com `material_kind_name`
em `Cifra`, `Cifra I` ou `Cifra II`.

Medido no D1 de produção em 2026-08-29:

| | |
|---|---:|
| registros `type='chord'` | 2.271 |
| com arquivo publicado no R2 | 57 |
| com `r2_key` preenchido | 2.271 |
| com PDF de origem no mesmo louvor | 2.271 |
| com `source_material_id` | 2.271 |

O `r2_key` está preenchido mesmo nos 2.214 sem arquivo, então o registro no D1 não
distingue publicado de não publicado — só o R2 sabe. Arquivos são minúsculos: média 611
bytes, máximo 1.750.

`GET /assets/*` é público e mapeia `/assets/<x>` → chave R2 `storage/assets/<x>`.

### Formato

```
{title: Comigo Habita, Ó Deus}
{subtitle: 692}
{key: Eb}
{rhythm: Canção}
{artist: Let. H/F.L / Mus. W.H.M}

[Eb]Co - [Bb]migo ha[Cm]bi - [Gm]ta, ó [Ab]Deus!
A [Bb]noite [Eb]vem,
```

Diretivas nos 57 publicados: `title` (57), `key` (57), `rhythm` (57), `artist` (56),
`subtitle` (42). O staging também usa `{comment: ...}` e `{meta: column left|right|full}`.

## Regras de negócio

### Barra vermelha

A barra marca a sílaba do acorde, e só quando o acorde encosta em texto. Para cada
`[Acorde]`, olhando os caracteres vizinhos **na linha original**:

- `attachLeft` = existe caractere anterior e não é espaço
- `attachRight` = existe caractere seguinte e não é espaço
- `attached = attachLeft || attachRight`

A barra é desenhada na borda esquerda do texto que vem depois do acorde, 2px, na altura
da linha de texto.

Distribuição medida nos 2.224 acordes dos 57 publicados:

| Vizinhança | Casos | Barra? |
|---|---:|---|
| espaço → texto (`é [Ab]Deus`) | 921 | sim |
| texto → texto (`ha[Cm]bi`) | 715 | sim |
| início de linha → texto | 208 | sim |
| texto → espaço/fim (`Sinai[C#m7]`) | 9 | sim, depois do último caractere |
| espaço → fim de linha | 170 | não |
| espaço → espaço | 148 | não |
| início → espaço (`[E]   A linda`) | 53 | não |

### Espaçamento

O espaçamento em branco é significativo e preservado literalmente. `"Deus é Amor [C]"` e
`"Deus é Amor   [C]"` são visualmente diferentes. **Nunca `trim()`** em nada que chegue ao
texto renderizado; os espaços entram como texto de verdade na célula, com `white-space:
pre`. 37 dos 57 arquivos têm corridas de 2+ espaços.

### Modelo de renderização

Cada linha vira uma sequência de células `{ chord, attached, text }`. Cada célula é uma
coluna: rótulo do acorde em cima, texto embaixo. A linha quebra **entre** células, nunca
dentro de uma.

- Célula com `text` vazio e `attached` (`Sinai[C#m7]`) precisa renderizar barra visível —
  não pode colapsar para altura zero.
- Rótulo mais largo que a sílaba alarga a célula e empurra o resto. É o comportamento do
  papel; não comprimir.
- Célula **sem** acorde quebra linha normalmente (`white-space: pre-wrap`). Célula **com**
  acorde fica em linha única (`white-space: pre`). Errar isso trunca letra longa em
  silêncio.

### Regras do parser

1. `^\{chave:\s*valor\}$` é diretiva. `title`, `subtitle`, `key`, `rhythm`, `artist`
   alimentam o cabeçalho; `comment` vira linha de comentário renderizada; qualquer outra
   (inclusive `meta`) é ignorada em silêncio. **Valor vazio ou `?` conta como ausente** —
   ambos ocorrem no corpus.
2. Linha começando com `;` não é renderizada no corpo da cifra. Ver "Notas do pipeline".
3. Linha em branco vira separador de estrofe; brancos consecutivos colapsam em um;
   separador no fim é descartado.
4. `\[([^\]]*)\]` separa acordes de texto. Adjacência lida da linha original, nunca de um
   buffer já processado.
5. O texto de uma célula vai do fim do acorde até o próximo acorde (ou fim da linha), com
   espaços preservados byte a byte.
6. `\[` e `\]` escapados são texto literal. Zero ocorrências no corpus; defensivo.
7. `[]` vazio é texto literal, não acorde sem nome. Zero ocorrências.
8. Arquivo cujo parse não produz nenhuma linha de letra conta como indisponível, mesmo com
   HTTP 200. Existe um no corpus. Não mostrar página em branco.

O parser não normaliza acordes, não transpõe e não conserta OCR. Só estrutura.

### O viewer nunca reconcilia

A tabela `praises` carrega os mesmos campos que as diretivas (`number`, `tonality`,
`rhythm`, `author`, `lyrics`) e eles divergem de verdade — `Confio em Deus` tem `{key: A}`
no arquivo e `tonality: G` no banco, e a cifra usa `A / Bm / E7 / D / G#7`.

**A cifra é renderizada na forma original, sempre.** Nada de normalizar, transpor ou
preferir o banco. O painel mostra os dois conjuntos de dados lado a lado, sem lógica de
comparação e sem alerta; quem olha julga. A resolução é manual e futura.

## Arquitetura

Nada que decide o desenho da cifra sabe o que é rede; nada que sabe de rede sabe desenhar
cifra.

### `web/src/lib/chordpro/parse.ts` — função pura

```ts
type Cell   = { chord: string | null; attached: boolean; text: string }
type Line   = { kind: 'cells'; cells: Cell[] } | { kind: 'comment'; text: string }
type Stanza = { lines: Line[] }
type Song   = {
  header: { title?: string; subtitle?: string; key?: string; rhythm?: string; artist?: string }
  stanzas: Stanza[]
  notes: string[]      // linhas ";" — recado de pipeline, fora do corpo
  hasLyrics: boolean   // regra 8
}

parse(source: string): Song
```

Sem React, sem DOM. As 8 regras moram aqui e em nenhum outro lugar.

### `web/src/lib/chordpro/serialize.ts`

`serialize(song: Song): string`. Existe agora para travar o modelo antes de a edição
depender dele, e para o teste de round-trip `parse → serialize → parse` ser idempotente,
espaçamento incluído.

### `web/src/components/chordpro/ChordProView.tsx`

`Song` → DOM. Puro: sem fetch, sem estado, sem rota. Implementa o modelo de células.
Recebe a paleta por CSS custom properties, não por prop.

### `web/src/hooks/useMaterialContent.ts`

O único que sabe de rede.

```ts
type ContentState =
  | { status: 'loading' }
  | { status: 'ready';  source: string }
  | { status: 'absent' }                    // 404 — arquivo não publicado
  | { status: 'error'; message: string }    // rede, 5xx, timeout
```

Um `GET` no asset responde "existe?" e "qual é o conteúdo?" de uma vez. Sem `HEAD`.
`absent` e `error` são estados distintos porque levam a telas distintas e a ações
distintas — "ainda não existe, crie" não é "existe e a rede falhou".

### `web/src/pages/ChordProPage.tsx`

Rota `/praise/:praiseId/cifra/:materialId`. Busca o louvor com `GET /api/praises/:id`
(que já devolve os materiais — não existe `GET /api/materials/:id` e não será criado),
acha o material, chama o hook, monta cabeçalho e painel. Única peça que conhece
navegação.

### `web/src/hooks/useViewerTheme.ts`

Toggle claro/escuro local ao viewer, persistido em `localStorage`. Não toca no tema
global da aplicação.

## Interface

### Cabeçalho editorial

Título em serifa, número do hino, chips de tom / ritmo / `material_kind_name`, ações no
canto (tema, voltar). Rola junto com o conteúdo — não é barra fixa.

O cabeçalho é alimentado pelo **arquivo** (`Song.header`), não pelo banco — é o conteúdo
que está sendo exibido. Quando a diretiva está ausente, o campo some do cabeçalho em vez
de cair para o valor do banco; o valor do banco aparece no painel, identificado como tal.
O `material_kind_name` vem do banco, porque não existe no arquivo.

### Painel do material

Abaixo da cifra. É o que o critério de gestão pede:

- dados do arquivo: as diretivas do `Song.header`
- dados do banco: `praises.number`, `tonality`, `rhythm`, `author`
- `material_kind_name`, `r2_key`, tamanho
- PDF de origem (`source_material_id`, presente em 100% dos casos)
- `merged_from_praise_name` quando houver
- **notas do pipeline**: as linhas `;`

Lado a lado, sem comparação automática. É onde as ações de CRUD entram quando a edição
chegar.

#### Notas do pipeline

A spec original manda não renderizar linhas `;` porque carregam recado de pipeline, não
conteúdo. Correto para o corpo da cifra. Mas numa ferramenta de gestão o recado é a
informação mais acionável da tela:

```
; ATENÇÃO: o PDF anexado a este louvor no Coldigom é «9 - Dobro os meus joelhos».
; A cifra errada (Dobro) foi removida. Reanexe o PDF correto e processe de novo.
```

Resolução: `;` fora do corpo da cifra, exibido no painel como "notas do pipeline". No caso
`hasLyrics === false` a pessoa vê o motivo e o que fazer, em vez de tela vazia.

### Estados

- `loading` — spinner, no padrão das outras páginas.
- `ready` — cifra renderizada.
- `absent` (404) — cabeçalho e painel normais, com o link para o PDF de origem e a
  mensagem "esta cifra ainda não foi publicada". **Nenhum botão de criar nesta entrega** —
  a criação é entrega separada e é ela que decide esse fluxo. Raro depois do
  `has_content`, mas continua correto.
- `error` — "falha ao carregar" e botão de tentar de novo.
- `hasLyrics === false` com HTTP 200 — mesma tela do `absent`, com as notas do pipeline em
  destaque.

### Tema

Duas paletas, toggle local persistido. Acorde e barra na **mesma tinta vermelha**, como no
hinário impresso: `red_marks.py` classifica a tinta em `kind: "bar" | "chord_glyph"` e
acha as duas com a mesma máscara. Acorde e barra se distinguem por posição, não por cor.

| Token | Escuro | Claro |
|---|---|---|
| fundo | `#0f0e13` | `#faf6ee` |
| letra | `#e7e5e4` | `#2b2622` |
| acorde | `#ff6b5e` | `#d81f11` |
| barra | `#ff6b5e` | `#d81f11` |
| secundário | `#a8a29e` | `#7a726a` |
| régua | `#2b2a33` | `#e3dbcd` |

O vermelho difere entre as paletas de propósito: o mesmo tom não tem o mesmo contraste
sobre os dois fundos.

## Mudanças fora do viewer

### `has_content` na API

`GET /api/praises/:id` passa a devolver `has_content: boolean` nos materiais
`type='chord'` — um `head` no R2 por material de cifra (1 a 3 por louvor).

Na `PraiseDetailPage`, o card de cifra deixa de ser link para o arquivo cru e passa a
abrir a página dedicada, mostrando o estado: "Cifra I" ou "Cifra I · sem conteúdo". Os
dois abrem a página. O card sem conteúdo é o ponto de entrada do editor em branco quando
a criação chegar.

### Remoção do RawChordPro

Tentativa antiga de edição, anterior à estrutura atual, com 4.548 registros e **zero
validados**. Sai:

- `web/src/pages/RawChordProListPage.tsx`, `RawChordProDetailPage.tsx`
- `web/src/components/ChordProPreview.tsx`
- `web/src/types/rawChordpro.ts`
- rotas e imports em `App.tsx`; links em `HomePage.tsx`
- `listRawChordpros`, `getRawChordpro`, `patchRawChordpro` em `services/api.ts`
- regras `.raw-chordpro-*` em `styles/global.css`
- `GET /api/raw-chordpros`, `GET /:id`, `PATCH /:id` em `api/src/index.ts` e seus testes

Preservados: a tabela D1 `raw_chordpros`, `scripts/pdf-to-chordpro/upload_raw.py` e
`storage/chordpro_staging/`.

## Testes

### Fixtures reais

Baixados do R2 e commitados em `web/src/__tests__/fixtures/chordpro/`:

- `denso.chord` — `Comigo Habita, Ó Deus` (692), 5 acordes encostados na primeira linha,
  espaço duplo interno (`[Eb]A  [Fm]grande`), espaço em fim de linha
- `solto.chord` — `Confio Em Deus` (344), tem `[E]   A linda [A]flor`, o caso
  "início → espaço" com 3 espaços
- `lapide.chord` — `Clama, ó igreja`, zero linhas de letra, `{subtitle: ?}`, `{key: }`,
  `{rhythm: }`, `{artist: }` e duas linhas `;`

A lápide sozinha exercita a regra 1 nos dois formatos de ausente, a regra 2 e a regra 8.

### Cobertura

- Tabela de adjacência: as 7 combinações, uma a uma.
- Golden contra os três fixtures reais, não só strings sintéticas.
- Round-trip `parse → serialize → parse` idempotente, espaçamento incluído.
- Espaçamento: **assertivas estruturais**, não medição de largura. O nó de texto contém os
  espaços literais **e** a célula tem `white-space: pre`.
- Estados do `useMaterialContent`: 404 → `absent`, falha de rede → `error`, 200 → `ready`.
- `hasLyrics === false` não produz tela vazia.

### Por que não medir largura

A spec original pede um teste que asserte a largura renderizada, argumentando que comparar
texto passaria verde mesmo com o espaçamento quebrado. O argumento é correto, mas
`vitest.config.ts` usa `environment: 'jsdom'`, que **não tem motor de layout** —
`offsetWidth` e `getBoundingClientRect()` retornam 0. O teste não roda como está.

Decisão: assertivas estruturais agora, medição real adiada. Checar o texto literal **e** a
regra `white-space` cobre as duas causas reais de regressão — um `trim()` no código, ou a
regra CSS sumindo. Modo browser do vitest (`@vitest/browser` + playwright) entra quando a
edição chegar, porque aí o espaçamento passa a ser manipulado o tempo todo e a medição
real vale a dependência nova. O projeto hoje tem zero dependência de runtime; não vale
gastar isso agora.

## Fora de escopo

Transposição, modo palco, auto-scroll, download offline — nenhum foi necessário no app
Flutter e nenhum serve à gestão. Edição e criação entram no lugar deles, em entrega
separada.

Destaque visual do `|` como lixo de pipeline: é comportamento de revisão, não de leitura.
Os 57 arquivos publicados não têm `|`. Entra com o editor.
