# Dívida técnica e trabalho adiado

Registro do que foi **encontrado e deliberadamente não corrigido** durante a
varredura de refatoração por setores, com o motivo do adiamento e onde cada
item deve ser retomado.

Regra: nada some daqui por esquecimento. Ao fechar um item, apague a linha no
mesmo commit que o resolve — e se decidir que não vale mais a pena, registre a
decisão em vez de apagar em silêncio.

Última atualização: 2026-08-31, ao fim do S8.

---

## Decisões conscientes de risco aceito

### Refresh token de 30 dias em `sessionStorage`
**Onde:** `web/src/services/api.ts`
**O que:** `/auth/refresh` e `/auth/exchange-code` devolvem o refresh token no
corpo JSON e o cliente guarda em `sessionStorage`. Um XSS em qualquer página
rouba uma sessão de 30 dias, não de 5 minutos.
**Por que não foi mexido:** foi assim que o bloqueio de cookie de terceiro no
Safari/iPhone foi contornado. Mexer reabre exatamente aquele problema.
**Retomar quando:** houver uma solução de sessão que funcione no Safari sem
depender de token acessível por JavaScript.

### Autorização delegada à lista de usuários de teste do Google
**Onde:** `api/wrangler.toml`, variável `AUTH_ALLOWED_EMAILS = "*"`
**O que:** quem pode escrever é decidido pela lista de usuários de teste do
OAuth no console do Google (máximo 100), fora do repositório.
**Risco que permanece:** publicar o app no console do Google — um clique, e a
coisa natural a fazer para sumir com o aviso de "app não verificado" — remove a
autorização inteira. Nenhum teste falha, nenhum log muda.
**Retomar quando:** os perfis de uso existirem. Aí `AUTH_ALLOWED_EMAILS` vira
uma lista de verdade, ou dá lugar a papéis por usuário.

---

## Adiado com motivo, a fazer

### Contrato estruturado de tags  — setor S6, coordenar com PLPCG
**Onde:** `api/src/routes/praises.ts` e `api/src/plpcgPraises.ts` (GROUP_CONCAT),
`web/src/components/ResultsTable.tsx:11` (`split(',')`)
**O que:** as tags viajam como string concatenada por vírgula e o cliente separa
por vírgula. Uma tag com vírgula no nome aparece como duas.
**Já feito:** o `POST /api/tags` recusa vírgula (S2), então não se cria dado
novo quebrado; a colisão de chaves do React na tabela foi corrigida (S6).
**O que falta:** tags que **já existam** com vírgula continuam exibidas errado.
O conserto é devolver as tags como lista estruturada.
**Por que não foi feito:** muda o formato de resposta que o **PLPCG** também
consome. Precisa ser coordenado com aquele cliente, ou entrar como campo novo
aditivo mantendo `tag_ids`/`tag_names` para compatibilidade.
**Antes de fechar:** conferir no D1 de produção se existe alguma tag com vírgula
no nome. Se não existir, o risco cai para zero e o item vira só higiene.

### Rate limiting — setor S1, reavaliar
**Onde:** nenhuma rota tem.
**Análise feita:** os alvos de força bruta são um código de troca de 32 bytes
aleatórios com TTL de 120s e um refresh de 48 bytes — inviáveis de adivinhar. O
login é barrado pela lista do Google. O abuso que importava era `?limit` sem
teto, e isso foi fechado no S2.
**Por que não foi feito:** exige binding novo de KV ou Durable Object, com
configuração de deploy que não dá para testar direito localmente, para um ganho
pequeno diante do que já está protegido.
**Retomar quando:** o app for publicado no console do Google, ou o acervo passar
a receber tráfego anônimo relevante.

---

## Fragilidades conhecidas, sem quebra hoje

### Contagem e listagem usam formas diferentes de consulta
**Onde:** `api/src/routes/praises.ts`, rota `GET /api/praises`
**O que:** a listagem tem `LEFT JOIN` e `GROUP BY`; a contagem é
`COUNT(*) FROM praises p` com a mesma cláusula `WHERE`. Funciona **hoje** porque
nenhum filtro referencia alias de JOIN. No dia em que um filtrar por coluna de
`tags`, a contagem quebra em silêncio e a paginação passa a mentir.

### Histórico do navegador poluído por clique de filtro — setor S6
**Onde:** `web/src/hooks/useFilters.ts`
**O que:** `setSearchParams` empilha entrada de histórico a cada clique de
filtro. Depois de mexer em seis filtros, sair da Home exige sete "voltar".
**Conserto provável:** `replace: true` para mudança de filtro, mantendo push
para navegação de página.

### Duas chamadas a `setFilters` no mesmo tick se atropelariam
**Onde:** `web/src/hooks/useFilters.ts`
**O que:** o updater do react-router aplica sobre os `searchParams` da closure
do render, não sobre a URL mais recente. Nenhum caminho atual faz isso — risco
latente, sem repro no código de hoje.

---

## Dívida menor, catalogada

- **`driveImport.ts` em 1,5% e `driveCredentials.ts` em 0% de cobertura**
  (setor S4): o `driveImport` é o consumidor da fila do Cloudflare, e testá-lo
  de verdade exige simular `MessageBatch`, retentativas e a fila. O S4 cobriu o
  que dava sem essa infraestrutura (`driveApi` foi de 4% para 18%, `driveParse`
  para 81%), mas o caminho de importação em si segue quase sem rede.
- **25 avisos de `no-explicit-any` na api**: cada setor tipa o que é seu ao
  passar pelo arquivo.
- **`HomePage.test.tsx` mocka o `useFilters` inteiro**, então a integração
  URL↔busca não é exercitada por ele. Testes novos do S6 cobrem parte disso por
  fora, mas o buraco original continua.
- **`FilterBar` refaz `/filters` e `/materials/kinds` a cada montagem**, sem
  cache: ir ao detalhe de um louvor e voltar rebusca tudo.
- **Seletor de ordenação inverte a direção em silêncio** ao clicar na opção já
  selecionada — comportamento surpreendente.
- **`limit` fixo em 20**, não ajustável pelo usuário nem presente na URL.
- **Sem busca incremental, sugestões ou histórico de busca** — o campo só
  dispara no Enter.
- **Pool do vitest**: o padrão (`forks`) pendura processos neste ambiente de
  desenvolvimento e eles se acumulam até travar tudo. Contorno: `--pool=threads`
  ou `pkill -f vitest`. Mudar no `vitest.config.ts` afeta o CI também, então é
  decisão pendente do dono.
- **A barra de filtros cresceu e não foi verificada em tela estreita** (setor
  S9): o S6 acrescentou Ritmo, Tom, faixa de número e as marcas de filtro ativo
  à `FilterBar`. O CSS ganhou uma media query para a faixa de número, mas o
  conjunto não foi testado num aparelho real nem em viewport de celular.
- **Higiene do repositório (setor S10)**: `ingestion.sql` e `ingestion_no_tx.sql`
  no diretório de trabalho, três cópias de `LOGO_COLORIDO*.svg`,
  `fix_ingestion.py` na raiz, `.DS_Store`.

---

## Encontrado no S7, adiado com motivo

### `PATCH /api/materials/:id` não valida `material_kind` contra o catálogo
**Onde:** `api/src/routes/materials.ts`
**O que:** o S7 passou a validar a categoria nas três rotas de **criação**
(POST JSON, bulk-upload, drive-import). O PATCH ficou de fora. O S8 fechou o
`type` desta mesma rota (era travessia de caminho no ZIP público), mas não a
categoria.
**Custo de fechar:** uma linha — o helper `materialKindsForaDoCatalogo` já existe.
**Retomar em:** S10, ou na próxima mudança que passar por esse arquivo.

### `POST /api/praises/:id/materials` não confere se o louvor existe
**Onde:** `api/src/routes/praises.ts`
**O que:** o bulk-upload e o drive-import conferem e devolvem 404; a rota de
material avulso insere direto e o INSERT falha por FK, virando 500. Não deixa
arquivo órfão no R2 porque é material lógico — só devolve o código errado.

### Granularidade de segundo no token de escrita concorrente
**Onde:** `PATCH /api/praises/:id`, campo `if_updated_at`
**O que:** `datetime('now')` só tem segundos, então duas gravações dentro do
mesmo segundo não são detectadas. A janela cega é de ~1 s.
**Por que foi aceito:** o alvo real é duas pessoas com a tela aberta por minutos
ou horas, não uma corrida de milissegundos. Fechar exigiria trocar o token, e o
formato de `updated_at` é lido pelo PLPCG.
**Se um dia importar:** coluna `version INTEGER` incrementada no mesmo UPDATE —
aditivo, sem mexer no `updated_at`.

### Envio em lote fatiado não é atômico entre as fatias
**Onde:** `web/src/services/api.ts`, `bulkUploadMaterials`
**O que:** cada fatia de 200 arquivos é atômica no servidor, mas as fatias são
requisições independentes. Falhando a terceira de cinco, as duas primeiras já
entraram. A mensagem de erro diz quantos entraram, e reenviar o que faltou é
manual.
**Por que foi aceito:** a alternativa é uma sessão de upload no servidor, com
estado e limpeza — muito para o ganho, dado que o erro agora é explícito.

---

## Encontrado no S8, adiado com motivo

### Notação brasileira de acorde é recusada pelo validador
**Onde:** `web/src/lib/chordpro/chord.ts`, `QUALITY_RE`
**O que:** `A4` (sus4), `A7+` (7M), `Asus`, `Aadd9`, `A6/9`, `Cdim7`, `C9sus4` e
`A°7` voltam como não reconhecidos. A gramática foi derivada dos 2224 acordes do
gabarito e é fiel a ele — mas o gabarito são 56 arquivos. São grafias legítimas
que o revisor vai digitar e o validador vai recusar sem oferecer alias.
**Por que não foi feito:** ampliar a gramática exige decidir, com o dono do
acervo, quais grafias são canônicas — e ele já fixou regras de extração antes.
É conversa, não conserto solitário. O "Salvar assim mesmo" existe justamente
para o acorde legítimo que a gramática não previu, então ninguém fica travado.
**Retomar quando:** houver a lista de grafias aceitas, vinda do dono.

### `[A][B]` marca duas barras vermelhas que não existem no PDF
**Onde:** `web/src/lib/chordpro/parse.ts`, cálculo de `attached`
**O que:** em dois acordes adjacentes, nenhum encosta em letra — os dois encostam
no colchete do outro — e ambos saem `attached: true`, que a view pinta como
barra. Contra a regra "colado ⟺ tinha barra".
**Por que não foi feito:** zero ocorrências de `][` nos 5590 arquivos do acervo.
O defeito existe, o dano não. Fechar exige olhar o caractere de texto vizinho
ignorando colchete de acorde adjacente.

### `hasLyrics` congela no parse e mente depois de qualquer edição
**Onde:** `web/src/lib/chordpro/types.ts` e `parse.ts`
**O que:** é calculado uma vez e as operações de `edit.ts` o carregam adiante sem
recalcular: um Song com zero estrofes pode ter `hasLyrics: true`.
**Já contornado:** a `ChordProPage` não confia nele — usa `temLinhaDeLetra()`, e o
comentário lá explica exatamente por quê.
**O que falta:** virar derivado, ou sair do tipo público. Enquanto estiver lá,
mente para o próximo chamador.

### `replaceLine` descarta tudo depois da primeira linha
**Onde:** `web/src/lib/chordpro/edit.ts`
**O que:** texto com `\n` só tem a primeira linha aproveitada; texto que não forma
linha vira linha vazia, que na releitura é separador de estrofe e some.
**Por que não foi feito:** não é explorável pela tela — o campo é `<input>` e o
editor recusa antes com "Esse texto não forma uma linha de cifra". É o contrato
da biblioteca que está frouxo, não um bug de produto.

### Deploy de preview do Cloudflare Pages deixa de ser origem confiável
**Onde:** `api/src/origins.ts`, `api/wrangler.toml`
**O que:** o S8 corrigiu `isTrustedWebOrigin` — entrada sem curinga passou a exigir
hostname igual, porque os dois ramos do `if (wildcard)` eram a mesma expressão e
`https://coldigom-web.pages.dev` confiava em qualquer subdomínio.
**Efeito colateral:** as URLs de preview do Pages (`<hash>.coldigom-web.pages.dev`)
deixam de ser aceitas. O CI só publica `--branch=main`, então nenhum fluxo
automático depende disso; mas abrir um preview à mão e tentar editar vai falhar.
**Se incomodar:** trocar a entrada por `https://*coldigom-web.pages.dev` no
`WEB_ORIGIN` — a sintaxe de curinga já existe e já é usada para `*plpcg.com`.
