# Vídeos por gesto — design

Data: 2026-09-15
Status: aprovado em conversa; aguardando revisão do texto
Depende de: `docs/superpowers/specs/2026-09-05-editor-de-gestos-design.md` (dicionário, versão, ETag)
Base de código: PR #25 (`feat/gestos-novo-no-seletor`) — o GIF já saiu de uso lá.

## Objetivo

Cada gesto do dicionário passa a apontar para os **vídeos de gestos de CIAs** em que
ele aparece, e, quando mapeado, para **os segundos** em que aparece em cada vídeo.
Quem lê (o coldigui, em v2.plpcg.com) vai poder clicar num gesto e abrir o YouTube
no momento certo — no vídeo do próprio louvor quando houver, senão no de outro louvor
que faça o mesmo gesto. Isso substitui o GIF, que nunca foi usado.

Este trabalho entrega o **coldigom**: dados, contrato, rotas e a tela de gestão. O
coldigui consome depois, em trabalho próprio, a partir do contrato daqui.

## Decisões tomadas (com o dono, 2026-09-15)

| Pergunta | Decisão |
|---|---|
| O que é "o vídeo" no dado? | Um material `youtube` do louvor (`praise_materials.type = 'youtube'`), não uma URL solta. Assim se sabe de qual louvor é o vídeo, e "ver o gesto em outro louvor" sai da mesma relação. |
| Quantos tempos por par (gesto, vídeo)? | Várias ocorrências. Uma linha por ocorrência; o tempo é opcional até ser mapeado. |
| Onde o vídeo toca? | **Abre o YouTube** (`&t=<s>s`). Sem player embutido, logo sem controle de velocidade — 0.5x não existe como parâmetro de URL; a pessoa muda no próprio YouTube. |
| Onde se cadastra? | Na página do gesto (`/gestos/dicionario/:id`), seção "Vídeos". Não no editor do documento. |
| Coldigui entra? | Não agora. |

## Fora de escopo (de propósito)

- Player embutido / velocidade de reprodução.
- Marcar tempos de dentro do editor de documento de um louvor.
- `replace-with` **não** move os vídeos do gesto substituído para o novo; a página
  do substituído continua mostrando os dele.
- O importador do pdf_extractor (`api/scripts/import_gestures.ts`) não toca nessa
  tabela: ela é só do coldigom.
- Mudanças no coldigui (regra de leitura está descrita abaixo só para o contrato
  servir a ela).

## Dados — migração `019_gesture_videos.sql`

```sql
CREATE TABLE IF NOT EXISTS gesture_video_occurrences (
  gesture_id  TEXT NOT NULL REFERENCES gesture_dictionary(id) ON DELETE CASCADE,
  material_id TEXT NOT NULL REFERENCES praise_materials(id)  ON DELETE CASCADE,  -- type = 'youtube'
  seconds     INTEGER,                                          -- NULL = ligado, tempo ainda não mapeado
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_gvo_gesture  ON gesture_video_occurrences (gesture_id);
CREATE INDEX IF NOT EXISTS idx_gvo_material ON gesture_video_occurrences (material_id);
```

Regras:

- O par (gesto, vídeo) "existe" quando há ao menos uma linha dele.
- Ligar sem tempo grava **uma** linha com `seconds NULL`. Ao gravar tempos, as linhas
  do par são substituídas pelas novas (a nula some). Não há duas linhas com o mesmo
  `(gesture_id, material_id, seconds)`: a rota deduplica antes de gravar.
- `seconds` é inteiro ≥ 0.
- A migração é aplicada à mão, como a 018: `cd api && wrangler d1 execute coldigom
  --remote --file=migrations/019_gesture_videos.sql`. Nunca `migrations apply`.
- A coluna `gif_key` de `gesture_dictionary` fica como está, sem uso.

## Contrato — `coldigom.gesture-dictionary/1`, campo aditivo `videos`

Cada `GestureEntry` ganha:

```ts
videos: {
  materialId: string;        // praise_materials.id (type youtube)
  praiseId: string;
  praiseNumber: string | null;
  praiseName: string;
  url: string;               // a URL do material, como cadastrada
  seconds: number[];         // ordenado; vazio = só ligado
}[]
```

- Ordenado por `praiseNumber` (numérico quando der, senão texto), depois `praiseName`.
- O schema **continua `/1`**: o campo é aditivo e o parser do coldigui
  (`parse_gesture_dictionary.dart`) ignora chaves que não conhece — verificado.
- `GET /api/gestures/dictionary` e `GET …/dictionary/:id` incluem `videos`. A
  consulta é uma só para o dicionário inteiro (JOIN `praise_materials` + `praises`),
  agrupada em memória — 207 entradas.
- **Toda** escrita nas ocorrências passa por `escreverNoDicionario` e portanto
  incrementa `gesture_dictionary_meta.version` → o ETag `"v{n}"` muda → o coldigui
  recarrega em até 5 min.

Regra de leitura que o coldigui vai aplicar (documentada aqui para o contrato servir
a ela; não é código deste repositório): ao clicar num gesto do documento do louvor P,
procurar em `videos` uma entrada com `praiseId === P` → abrir `url` em
`seconds[0]` (ou sem `t` se vazio); senão, a primeira entrada da lista com
`seconds` não vazio; senão, a primeira entrada; senão, nada a abrir.

## Rotas (`api/src/routes/gestures.ts`)

| Rota | Auth | Corpo | Efeito |
|---|---|---|---|
| `PUT /api/gestures/dictionary/:id/videos/:materialId` | sim | `{ "seconds": number[] }` | Substitui as ocorrências do par pelo que veio; `[]` = só ligar (linha nula). Valida: gesto existe (404 `Gesture not found`); material existe e é `youtube` (404 `Material not found` / 400 `Material is not a youtube video`); `seconds` array de inteiros ≥ 0 (400 `Field 'seconds' must be an array of non-negative integers`). Deduplica e ordena. Bump de versão. Responde `{ data: GestureEntry }` já com `videos`. |
| `DELETE /api/gestures/dictionary/:id/videos/:materialId` | sim | — | Apaga o par inteiro; 404 se não existia. Bump de versão. Responde `{ data: GestureEntry }`. |

Mensagens em inglês, como as rotas vizinhas (o web traduz).

Efeito colateral em rota existente: `DELETE /api/materials/:materialId` — o
`ON DELETE CASCADE` já limpa as ocorrências, mas o ETag não mudaria. Quando o material
apagado for `youtube` **e** tiver ocorrências, a exclusão vai no mesmo batch com o
bump de versão (mesma razão do `gesture_usage`, já tratada ali). Não há rota de
exclusão de louvor; a fusão de louvores move materiais, não os apaga.

Sem rota nova para escolher o louvor: a tela usa `GET /api/praises?q=` e
`GET /api/praises/:id` (materiais já vêm com `type` e `url`).

`api/src/__tests__/routes.inventory.test.ts` ganha as duas rotas (cada uma duas
vezes, por causa do `requireAuth`).

## Tela — `web/src/pages/GestureDetailPage.tsx`, seção "Vídeos"

Abaixo de "Dados". Para todo mundo (logado ou não):

- Lista dos vídeos ligados: `241 · Exaltai…` (número e nome do louvor, link para
  `/praise/:praiseId`), **Abrir no YouTube** (`url` com `&t=<seconds[0]>s`, ou sem `t`
  se não mapeado), e os tempos como chips `1:23 · 2:21`, cada chip um link no seu
  segundo. Sem vídeo: "Nenhum vídeo ligado a este gesto."

Logado, além disso:

- Por vídeo: campo de texto **Tempos** aceitando `1:23, 2:21` ou `83, 141` (mistura
  vale) → **Salvar tempos** (PUT); **Desligar** (DELETE). Entrada inválida mostra o
  motivo e não chama a API.
- **Adicionar vídeo**: busca de louvor (`searchPraises`, lista com número e nome);
  clicar no louvor mostra os materiais `youtube` dele (nome da categoria ou a URL);
  clicar num deles faz `PUT` com `[]`. Louvor sem youtube: "Este louvor não tem vídeo
  do YouTube." Já ligado: o item aparece desabilitado com "já ligado".

Estado local: como o resto da página, `executar(acao, mensagem)` e recarregar a
entrada depois de cada escrita (a resposta já traz `videos`; usa ela direto).

### Ajudantes puros — `web/src/lib/gestures/youtube.ts`

- `linkNoTempo(url: string, seconds: number | null): string` — reconhece
  `youtube.com/watch?v=`, `youtu.be/<id>`, `youtube.com/shorts/<id>`,
  `m.youtube.com`; devolve `https://www.youtube.com/watch?v=<id>&t=<s>s` (sem `t`
  quando `seconds` é null). URL que não reconhece volta como veio.
- `parseTempos(texto: string): { ok: true; seconds: number[] } | { ok: false; erro: string }`
  — separa por vírgula/quebra de linha/ponto-e-vírgula; aceita `m:ss`, `h:mm:ss` e
  inteiros; ordena e deduplica; vazio → `[]`.
- `formatarTempo(seconds: number): string` — `83 → "1:23"`, `3661 → "1:01:01"`.

### Cliente — `web/src/services/api.ts`

- `GestureEntry.videos` no tipo (`web/src/lib/gestures/dictionary.ts`).
- `putGestureVideo(id, materialId, seconds: number[]): Promise<GestureEntry>`.
- `deleteGestureVideo(id, materialId): Promise<GestureEntry>`.

Os fixtures de testes que constroem `GestureEntry` ganham `videos: []`.

## Testes

API (`api/src/__tests__/gesturesVideos.test.ts`, no padrão de
`gesturesDictionaryWrite.test.ts`, D1 falso com `lotes`):

- PUT cria o par com `[]` (uma linha nula), substitui por tempos (linha nula some),
  ordena e deduplica, rejeita gesto inexistente, material inexistente, material não
  youtube, `seconds` inválido; o batch termina com o bump (`bumpNoFim`).
- DELETE apaga o par e bumpa; 404 se não existia.
- GET do dicionário e da entrada trazem `videos` ordenados por número do louvor e
  com `seconds` ordenado; entrada sem vídeo tem `videos: []`.
- `DELETE /api/materials/:materialId` de um youtube com ocorrências bumpa a versão;
  de um pdf, não.
- Inventário de rotas.

Web:

- `youtube.test.ts` unitário para os três ajudantes (formatos de URL, entradas
  inválidas, ordenação).
- `GestureDetailPage.test.tsx`: lista com link no tempo certo e chips; salvar tempos
  (texto → `putGestureVideo` com `[83, 141]`); entrada inválida não chama a API;
  desligar; adicionar via busca (mock de `searchPraises` e `getPraise`); louvor sem
  youtube; deslogado não vê ações.
- Catraca de cobertura do web (91 / 83 / 90 / 94) não pode cair.

## Entrega

1. Branch `feat/gestos-videos` (a partir de `feat/gestos-novo-no-seletor`; PR para
   `develop` depois do #25).
2. Migração 019 em `api/migrations/`, aplicada em produção pelo dono à mão **antes**
   do deploy do Worker (a rota de leitura faz JOIN na tabela nova).
3. Deploy segue a regra da casa: só quando `develop` for mesclado em `main`.
