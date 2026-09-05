# Editor de gestos CIAs — design

Data: 2026-09-05
Status: aprovado
Depende de: `pdf_extractor/docs/superpowers/specs/2026-09-03-gestos-viewer-editor-design.md`
Pedido por: `pdf_extractor/docs/prompts/2026-09-03-prompt-coldigom-editor-gestos.md`

## Objetivo

Dar ao coldigom o **editor de Gestos CIAs** e o **gestor do dicionário de gestos**.
Hoje o acervo tem 254 linhas de `praise_materials` com `type = 'gestures'` e nenhum
objeto no R2 por trás delas: a informação existe em PDF e em 471 arquivos `.txt` do
pdf_extractor, e nada disso é editável nem consultável por quem revisa.

Depois deste trabalho o coldigom é o **sistema de registro** dos gestos: o documento
de cada louvor é JSON canônico gravado no R2, o dicionário de gestos é tabela no D1
com versão monotônica, e o pdf_extractor deixa de ser dependência de execução — vira
apenas a origem de uma importação inicial.

## Critério que decide os trade-offs

O mesmo de sempre: o coldigom é ferramenta de **gestão**, não de consumo. Densidade de
informação e ações de CRUD ganham de conforto de leitura. É por esse critério que **não
existe visualizador de PDF dentro do editor** — o PDF de origem é um link "Abrir PDF de
gestos" que abre em aba nova, e a tela fica inteira para a edição.

## O que é fixo e não se discute aqui

Duas coisas chegaram decididas do design entre repositórios e **não podem divergir**,
porque o app Flutter (coldigui/PLPCG) vai renderizar o mesmo documento a partir da mesma
especificação, sem compartilhar uma linha de código com este repositório.

### O contrato de dados

```ts
type GestureDocument = {
  schema: "coldigom.gestures/1";
  title: string;                 // "182 - QUERO VIVER PRA SEMPRE COM JESUS"
  dictionaryVersion: number;     // versão do dicionário usada ao salvar (diagnóstico)
  items: Item[];                 // ordem do documento = ordem de execução
};

type Item = GestureItem | RepeatBlock | ChorusBlock | LinkBlock | FinalBlock
          | InstructionItem | TextItem;

type GestureItem = {
  type: "gesture";
  gestureId: string;             // 12 hex, id do dicionário (ex.: "c687580e7682")
  lyrics: LyricLine[];           // 1 a 3 linhas
};

type LyricLine = {
  trigger: string;               // palavra(s) em vermelho; "" em linha de continuação
  text: string;                  // leitura em preto
};

type RepeatBlock  = { type: "repeat"; count: number; children: BlockChild[] }; // count >= 2
type ChorusBlock  = { type: "coro";   children: BlockChild[] };
type LinkBlock    = { type: "link";   children: BlockChild[] };  // 2 ou 3 filhos
type FinalBlock   = { type: "final";  children: BlockChild[] };  // só na raiz

type BlockChild   = GestureItem | RepeatBlock | ChorusBlock | LinkBlock;

type InstructionItem = {
  type: "instruction";
  kind: "instruments" | "repeat_praise" | "back_to_chorus" | "back_to_chorus_and_finish";
};                                                                // só na raiz

type TextItem = { type: "text"; text: string };                   // linha livre; raro
```

```ts
type GestureDictionary = {
  schema: "coldigom.gesture-dictionary/1";
  version: number;               // inteiro monotônico
  generatedAt: string;           // ISO 8601
  gestures: GestureEntry[];
};

type GestureEntry = {
  id: string;                    // 12 hex, estável para sempre
  name: string;
  description: string;
  exampleTriggers: string[];
  image: string;                 // r2_key: assets/cia/gestures/{id}.png
  gif: string | null;            // r2_key: assets/cia/gestures/{id}.gif
  status: "active" | "deprecated";
  replacedBy: string | null;
  updatedAt: string;
};
```

### As cores e as regras de desenho

Papel sempre branco `#FFFFFF`. Gatilho `#D32F2F` em negrito; leitura `#1A1A1A`. Chave de
repetição, `Nx`, rótulo `CORO` e chave tracejada em `#1E63C8`. Conector de link `#E08A1E`.
Divisor e rótulo `FINAL` em `#6A2F2F`. Cartão de instrução com fundo `#F3F4F6`, texto
`#374151`, borda `#D1D5DB`. Gesto ausente com fundo `#FFF7E6` e borda tracejada `#E0B45C`.
Texto livre em `#6B7280`, itálico.

Cartão de gesto: figura quadrada à esquerda (`object-fit: contain`, **64 px no editor**,
96 px no visualizador), letras à direita, alinhadas ao topo. Uma linha por `LyricLine`:
gatilho vermelho em negrito, espaço, leitura preta — **sem o espaço quando a leitura
começa com `, . ; : ! ? ) ]`**. Gatilho vazio imprime só a leitura. **Nunca quebrar linha
dentro do gatilho.** Figura e todas as letras ficam no mesmo cartão.

Blocos: `repeat` empilha os filhos com chave azul vertical à direita e o `Nx` centrado
(aninhar acrescenta chave externa); `coro` põe o rótulo azul em negrito acima e chave
tracejada à direita; `link` cola os filhos sem espaço e traz conector laranja vertical à
esquerda com seta para baixo; `final` desenha divisor traço-ponto e rótulo antes dos
filhos. Página em coluna única, largura máxima 720 px, título em caixa alta no topo.

## Arquitetura

### `api/src/gestures/schema.ts` — novo, puro; e o espelho em `web/src/lib/gestures/schema.ts`

Os dois arquivos são cópias declaradas um do outro, no padrão que `uploadLimits.ts` já
estabeleceu neste repositório ("o servidor manda; isto existe para o usuário descobrir
antes da rede"). Cada arquivo carrega três coisas:

1. os tipos do contrato acima;
2. `validarDocumento(valor: unknown): { ok: true; doc: GestureDocument } | { ok: false; erro: ErroDeValidacao }`;
3. a tabela `codigo → frase em português`.

**O `validate.ts` que o pedido listava à parte não existe: ele está fundido aqui.** Separar
produziria duas metades que nunca são usadas isoladamente e obrigaria a manter a tabela de
mensagens em quatro lugares em vez de dois. A API responde `400 { error, path, code }` com
a frase da tabela; o editor mostra exatamente a mesma frase sem gastar rede.

`ErroDeValidacao` é `{ codigo: CodigoDeErro; caminho: string }`, e o caminho é textual e
navegável: `items[3].children[1]`, `items[0].lyrics[2].trigger`, `""` para o documento todo.
A validação para no primeiro erro — quem edita conserta um problema por vez, e listar todos
só encheria a tela.

| Código | Quando |
|---|---|
| `json_invalido` | corpo não é JSON |
| `schema_desconhecido` | `schema` != `"coldigom.gestures/1"` |
| `titulo_invalido` | `title` ausente ou vazio |
| `versao_dicionario_invalida` | `dictionaryVersion` não é inteiro >= 0 |
| `itens_vazios` | `items` ausente, não-array ou vazio |
| `sem_gesto` | nenhum `gesture` em nenhuma profundidade |
| `tipo_desconhecido` | `type` fora do contrato |
| `gesture_id_invalido` | não casa `^[0-9a-f]{12}$` |
| `letras_fora_do_limite` | `lyrics` com 0 ou mais de 3 linhas |
| `linha_invalida` | `trigger`/`text` não são string |
| `primeira_linha_vazia` | primeira `LyricLine` sem `trigger` e sem `text` |
| `repeticao_invalida` | `count` não é inteiro >= 2 |
| `bloco_vazio` | `repeat`/`coro`/`final` sem filhos |
| `link_com_filhos_invalidos` | `link` sem exatamente 2 ou 3 filhos |
| `final_fora_da_raiz` | `final` dentro de outro bloco |
| `final_duplicado` | mais de um `final` |
| `item_depois_do_final` | algo que não é `instruction` depois do `final` |
| `instrucao_fora_da_raiz` | `instruction` dentro de bloco |
| `instrucao_desconhecida` | `kind` fora das quatro |
| `texto_invalido` | `text` ausente ou não-string |
| `documento_grande` | acima de 256 KB |

**O que a validação deliberadamente não faz:** conferir `gestureId` contra o dicionário. O
importador pode chegar antes do dicionário, e uma gravação recusada por isso seria dado
perdido. Quem avisa é o editor, visualmente, com o cartão de gesto ausente.

### Fixtures compartilhadas — `api/src/gestures/__fixtures__/`

Documentos válidos e inválidos, cada inválido acompanhado do `codigo` e do `caminho`
esperados. **Um teste de cada lado varre a mesma pasta**: o da API por `import`, o do web
por `fs` com caminho relativo (importar de fora de `src` arrastaria os arquivos para o
bundle do Vite). Provar comportamento equivalente sobre o mesmo corpo de casos é mais forte
do que comparar o texto dos dois arquivos.

### `api/src/gestures/usage.ts` — novo, puro

`contarUsos(doc): Map<string, number>` percorre a árvore e conta `gestureId`. É a única coisa
que sabe traduzir documento em linhas de `gesture_usage`, e serve tanto ao `PUT /content`
quanto ao importador.

### `api/migrations/018_gestures.sql` — novo

`017_validation_findings.sql` já está tomada; esta é a 018. Cria:

- `gesture_dictionary` — `id` TEXT PK (12 hex), `name`, `description`, `example_triggers`
  TEXT DEFAULT `'[]'`, `image_key`, `gif_key`, `status` TEXT CHECK IN (`'active'`,`'deprecated'`),
  `replaced_by`, `created_at`, `updated_at`;
- `gesture_dictionary_meta` — `id` INTEGER PK CHECK (`id = 1`), `version` INTEGER NOT NULL,
  semeada com `version = 0`;
- `gesture_usage` — `material_id`, `gesture_id`, `count`, PK(`material_id`, `gesture_id`),
  `FOREIGN KEY (material_id) REFERENCES praise_materials(id) ON DELETE CASCADE`, mais
  `idx_gesture_usage_gesture`.

Espelhada em `api/schema.sql` no mesmo commit — `schemaSync.test.ts` cobra isso.

### A versão do dicionário é o ETag

Toda escrita em `gesture_dictionary` sobe `version` **no mesmo `DB.batch()`**. A garantia não
é disciplina: existe uma função só de escrita, `escreverNoDicionario(db, statements)`, que
anexa `UPDATE gesture_dictionary_meta SET version = version + 1 WHERE id = 1` ao array antes
de mandar. Nenhuma rota fala com a tabela por fora dela.

`GET /api/gestures/dictionary` responde `ETag: "v{version}"`, `304` quando o `If-None-Match`
casa, e `Cache-Control: public, max-age=300`.

### `api/src/routes/gestures.ts` — novo módulo

`registerGesturesRoutes(app)`, registrado em `api/src/index.ts` logo depois de
`registerMaterialsRoutes`. `routes.inventory.test.ts` é atualizado no mesmo commit, na ordem
de registro e com os caminhos literais antes dos parametrizados.

| Rota | Auth | O que faz |
|---|---|---|
| `GET /api/gestures/dictionary` | pública | dicionário inteiro, ETag `"v{version}"`, 304, cache 300 s |
| `GET /api/gestures/dictionary/:id` | pública | entrada + usos, juntados aos louvores |
| `POST /api/gestures/dictionary` | `requireAuth` | multipart; `id` opcional (aleatório 12 hex); PNG <= 2 MB |
| `PATCH /api/gestures/dictionary/:id` | `requireAuth` | nome, descrição, gatilhos de exemplo, status |
| `POST /api/gestures/dictionary/:id/image` | `requireAuth` | PNG <= 5 MB em `assets/cia/gestures/{id}.png` |
| `POST /api/gestures/dictionary/:id/gif` | `requireAuth` | GIF <= 5 MB em `assets/cia/gestures/{id}.gif` |
| `POST /api/gestures/dictionary/:id/replace-with` | `requireAuth` | `{ targetId, rewriteDocuments? }` |
| `GET /api/gestures/usage?gestureId=` | pública | materiais e louvores que usam o gesto |

### `PUT /api/materials/:materialId/content` — estendido

Hoje o handler recusa qualquer coisa que não seja cifra (`if (row.type !== 'chord')`). Passa a
despachar por tipo. No ramo `gestures`: `lerCorpoComTeto` com o teto de 256 KB que já existe,
`JSON.parse` (falha vira 400 com `path: ""`), `validarDocumento`, e 400 `{ error, path, code }`
no primeiro erro. O `If-Match` normalizado, o `onlyIf: { etagMatches }` e o 409 `stale_write`
continuam idênticos aos da cifra.

Gravado o objeto, um **único `DB.batch()`** faz: `DELETE FROM gesture_usage WHERE material_id = ?`,
os `INSERT` vindos de `contarUsos(doc)`, e o `UPDATE praise_materials SET is_reviewed = 0,
reviewed_at = NULL, reviewed_by = NULL` que a cifra já faz. O log estruturado
`material.content.write` ganha `tipo` no payload.

### `POST /api/praises/:id/materials` — estendido (achado)

A rota insere `r2_key` e `source_material_id` **fixos em `null`** (`praises.ts:971`): criar
material de gestos por ela é impossível hoje. Passa a montar
`assets/praises/{praiseId}/{materialId}.gestures` — mesmo padrão do `bulk-upload`
(`praises.ts:1079`) — e a aceitar `source_material_id` quando `type === 'gestures'`, conferindo
que o material de origem pertence ao mesmo louvor. **Nenhum objeto é criado no R2**: o editor lê
o `absent` do `useMaterialContent` como "documento novo".

### `DELETE /api/materials/:materialId` — estendido (achado)

O handler (`materials.ts:324`) apaga a linha e o objeto e não sabe de `gesture_usage`. O
`ON DELETE CASCADE` cobre em teoria, mas a migração cai sobre um banco já existente e o handler
não usa batch, então não dá para depender do pragma. Ganha um `DELETE FROM gesture_usage WHERE
material_id = ?` explícito junto do delete da linha: uma statement, e a contagem de uso do
dicionário nunca mente.

### `/assets/*` — três tipos a mais

`gestures → application/json; charset=utf-8`, `png → image/png`, `gif → image/gif`. O `ETag` já é
emitido por essa rota (`assets.ts:90`).

### CORS — correção bloqueante (achado)

`api/src/index.ts:29` declara `allowHeaders: ['Content-Type', 'Authorization']` e **nenhum
`exposeHeaders`**. Em desenvolvimento o web fala com o Worker por outra origem, então hoje
`response.headers.get('ETag')` devolve `null` e um `PUT` com `If-Match` **falharia no preflight**.
Sem esta correção a gravação condicional é impossível a partir do navegador: entram
`exposeHeaders: ['ETag']` e `If-Match` / `If-None-Match` no `allowHeaders`.

### `api/scripts/import_gestures.ts` — novo

Molde do `ingest.ts`: `execFileSync('wrangler', …)` — sempre o global, nunca `npx` —, etapas por
flag (`--dry-run`, `--sql-only`, `--upload-r2`, `--execute-d1`, `--full`) e `--force`. Entrada por
`--from`, apontando para o `export/gestures/` do pdf_extractor:

```
export/gestures/
  dictionary.json                                  # GestureDictionary
  figures/{id}.png
  praises/{praise_id}/{txt_id}.gestures.json       # GestureDocument
  praises/{praise_id}/{txt_id}.meta.json           # { sourceMaterialId, validated, title }
```

Duas metades, nessa ordem. **Dicionário**: `dictionary.json` + `figures/` viram upsert em
`gesture_dictionary` e objetos em `assets/cia/gestures/{id}.png`, com **um único bump de versão
para a importação inteira**. **Louvores**: cada `.gestures.json` vira linha em `praise_materials`
(com `material_id` = id do `.txt`, que é o que fecha a diferença entre 471 arquivos e 254 linhas),
objeto no R2 e `gesture_usage` recomputado.

Todo documento passa por `validarDocumento` **antes de qualquer escrita**: export ruim falha alto
e inteiro, nunca pela metade. Segunda passada é no-op. Linha com `is_reviewed = 1` só é sobrescrita
com `--force`. `--dry-run` imprime a tabela criar/atualizar/pular.

### `web/src/lib/gestures/` — novo, puro

Além do `schema.ts` espelhado:

- **`flatten.ts`** — `achatar(doc): Cartao[]`, com
  `Cartao = { caminho: Caminho; item: Item; profundidade: number; blocosAbertos: Bloco[] }`.
  É projeção, nunca cópia editável: o editor renderiza a lista e escreve na árvore.
- **`edit.ts`** — `inserirApos`, `remover`, `moverEntreIrmaos`, `envolver(caminhos, bloco)`,
  `desagrupar(caminho)`, `editarLinha`, `trocarGesto`. Cada uma devolve `{ doc, foco }` — o caminho
  que fica selecionado depois. Sem isso toda operação viraria duas: a mudança e o conserto do cursor.
- **`dictionary.ts`** — `indexar(dic)`, `resolver(id)` seguindo `replacedBy` com teto de 5 saltos
  (ciclo ou estouro devolve o id original marcado como não resolvido) e `buscar(termo)` sobre `name`
  e `exampleTriggers`, sem acento e sem caixa.

Quatro invariantes formam o contrato de `edit.ts`, e são o que impede o editor de chegar ao `PUT`
com algo que o servidor recusaria: toda operação devolve documento novo; entrada válida produz saída
válida; seleção só entre irmãos contíguos do mesmo pai; `final` e `instruction` só na raiz.

Desfazer é pilha de documentos inteiros com teto de 50. O documento tem 256 KB no limite e uns
poucos KB na prática; guardar diffs seria complexidade paga sem comprador.

### `web/src/components/gestures/` — novos

`GestureDocumentView` é o renderizador da seção de cores, e é **o mesmo componente na
pré-visualização do editor e em qualquer outro lugar**. As cores vivem em um arquivo só,
`regras.css`, como custom properties nomeadas pela função (`--gesto-gatilho`,
`--gesto-chave-repeticao`, `--gesto-conector-link`), não pelo tom. O tamanho da figura entra por
prop (64 no editor, 96 no visualizador) — a única diferença que as regras admitem.

`GestureThumb` resolve `image` para `/assets/...` e desenha o cartão de gesto ausente quando o id
não está no dicionário. `GesturePicker` é o diálogo de busca sobre o dicionário indexado.
`GesturesEditor` é a lista de cartões com seleção contígua entre irmãos.

### `web/src/hooks/useMaterialContent.ts` — estendido (achado)

O hook não guarda o `ETag`. O estado `ready` passa a ser
`{ status: 'ready'; source: string; etag: string | null }`. A cifra ignora o campo novo — e vale
registrar que ela hoje salva **sem** `If-Match` ("quem grava por último ganha, em silêncio",
`ChordProPage.tsx:271`): o editor de gestos é o primeiro cliente real da gravação condicional que a
API já aceitava.

### `web/src/pages/GesturesEditorPage.tsx` — novo

Rota `/praise/:praiseId/gestos/:materialId`. Molde da `ChordProPage`: cabeçalho do louvor, link
"Abrir PDF de gestos" em aba nova quando há `source_material_id`, o `ReviewSwitch` reaproveitado
como está, e Salvar com `If-Match`. 412 e 409 viram o mesmo cartão de conflito, com "recarregar e
perder o que digitei" dito explicitamente. Desktop em duas colunas — editor à esquerda,
`GestureDocumentView` à direita, rolagem seguindo o cartão em foco; mobile em abas. Teclado:
`Ctrl+S`, `Ctrl+Z` / `Ctrl+Shift+Z`, `Ctrl+Enter`.

### `web/src/pages/GestureDictionaryPage.tsx` e `GestureDetailPage.tsx` — novos

Rotas `/gestos/dicionario` e `/gestos/dicionario/:id`. Lista com figura, nome e contagem de uso;
detalhe com edição dos campos, troca de figura e GIF, e "Substituir por outro gesto", que deprecia
com `replacedBy`.

### `web/src/components/gestures/SecaoGestos.tsx` — novo, e o mínimo na `PraiseDetailPage`

`PraiseDetailPage.tsx` tem 1876 linhas e é o maior arquivo do web; acrescentar a seção inline
pioraria um problema que a varredura em setores já registrou. A seção nasce como componente
próprio, recebendo `{ praiseId, materiais, podeEditar }`, e a página ganha um import e um elemento.
Junto vai o mínimo em `web/src/lib/materials.ts`: `'gestures'` entra em `KnownMaterialType`, no
`TYPE_ORDER` e no `TYPE_LABELS` como **"Gestos CIAs"** — sem isso o agrupamento genérico continua
rotulando a caixa como "GESTURES".

## Decisões, e o que foi descartado

**O estado do editor é a própria árvore `GestureDocument`.** Descartadas: manter uma lista linear
com marcadores de início/fim de bloco (permite estado irrepresentável — bloco aberto e não fechado —
e transforma "envolver" em função parcial) e manter duas estruturas sincronizadas (duplica a fonte
da verdade). Com árvore + caminhos, o que se edita é o que se salva: zero conversão. O custo é mover
cartão entre níveis, que se resolve com "desagrupar e reagrupar" — e na prática o revisor move
cartão dentro do mesmo bloco.

**Validador à mão, não zod.** O repositório não tem zod em nenhum dos três `package.json` e valida à
mão em todos os lugares onde valida. Trazer uma dependência para o Worker por causa deste recurso
seria mudar a casa por uma feature.

**`replace-with` com `rewriteDocuments` em `false` por padrão.** Reescrever N objetos no R2 numa
requisição só (254 no pior caso) é operação cara e falível. Como a resolução de alias já é do
cliente, a reescrita é **faxina opcional, não correção**: o alcance é limitado aos `material_id` que
estão em `gesture_usage` para aquele gesto, é sequencial, e a resposta devolve
`{ reescritos, falhas: [{ materialId, motivo }] }` em vez de estourar tudo se um objeto falhar.
Depreciar o gesto e gravar `replacedBy` acontece sempre, no batch, antes de qualquer reescrita.

**Importador contra fixtures.** O `export/gestures/` do pdf_extractor ainda não existe. A fatia (c)
é construída contra `api/scripts/__fixtures__/gestures-export/`, escrito no formato acima. É contrato
assumido, e é a única fatia que muda se o formato real divergir.

## Testes

TDD nas libs puras. `schema` sobre as fixtures compartilhadas, cada inválido com `codigo` e `caminho`
esperados, nos dois lados. Os quatro invariantes de `edit` exercitados sobre o corpo inteiro de
fixtures. `flatten` com a identidade "achatar → caminho → recuperar item". `dictionary` com cadeia de
alias, ciclo e estouro de 5 saltos.

Na API: `materialContentWrite.test.ts` ganha o ramo de gestos (400 com caminho, uso recomputado,
`is_reviewed` zerado, 409 `stale_write`); `gesturesDictionary.test.ts` nasce com ETag/304, bump por
escrita e `replace-with`; `routes.inventory.test.ts` e `schemaSync.test.ts` continuam verdes — o
segundo é o que amarra `018_gestures.sql` ao `schema.sql`. O importador é testado no molde do
`ingest.test.ts`, sobre as fixtures: `--dry-run` lista, segunda passada é no-op, `is_reviewed = 1`
sobrevive sem `--force`.

No web: `GestureDocumentView` renderizando o documento de exemplo (o `CORO` com chave tracejada sobre
os cinco primeiros cartões, gatilhos vermelhos em negrito, dois cartões de instrução); envolver três
cartões consecutivos em "Repetir 2x" produzindo `{ type: "repeat", count: 2, children: [...] }`; e a
tela de conflito no 412.

## Catraca de cobertura

Sobe uma vez por plano, medida depois da última fatia, arredondada para baixo, **nunca descendo**.
Hoje: api 70/66/72/72 e web 79/72/76/81 (statements/branches/functions/lines).

## Fatias de entrega

Plano da API — `2026-09-05-editor-de-gestos-api.md`:
(a) `schema.ts` + fixtures + `PUT /content` + `/assets/*` + CORS;
(b) migração 018 + rotas do dicionário + `gesture_usage` + os dois achados de rota;
(c) importador.

Plano do web — `2026-09-05-editor-de-gestos-web.md`:
(d) `web/src/lib/gestures` + `GestureDocumentView`;
(e) `GesturesEditorPage` + `GesturePicker` + `SecaoGestos` na `PraiseDetailPage`;
(f) páginas do dicionário.

Cada fatia fecha com `npm run verify` verde, e mudança de rota entra no mesmo commit que a
atualização de `routes.inventory.test.ts`.

## Fora de escopo

O visualizador do coldigui (prompt irmão, outro repositório), o `export_gestures_json.py` do
pdf_extractor, e a cópia velha em `storage/assets/cia_gestures/`, que continua sendo ignorada.

## Riscos a declarar

O formato do `export/gestures/` é contrato assumido enquanto o produtor não existir; se divergir,
a fatia (c) é a que paga. A ausência de conferência de `gestureId` contra o dicionário no `PUT` é
decisão consciente: documentos podem referenciar gestos que ainda não foram importados, e é o editor
que precisa deixar isso visível — se o cartão de gesto ausente for discreto demais, o acervo acumula
referência quebrada em silêncio.
