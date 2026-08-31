# Dívida técnica e trabalho adiado

Registro do que foi **encontrado e deliberadamente não corrigido** durante a
varredura de refatoração por setores, com o motivo do adiamento e onde cada
item deve ser retomado.

Regra: nada some daqui por esquecimento. Ao fechar um item, apague a linha no
mesmo commit que o resolve — e se decidir que não vale mais a pena, registre a
decisão em vez de apagar em silêncio.

Última atualização: 2026-08-31, ao fim do S6 bloco 3.

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

### Cancelamento real da requisição de busca — setor S5
**Onde:** `web/src/pages/HomePage.tsx`, `web/src/services/api.ts`
**O que:** a corrida entre respostas foi fechada (S6): resposta obsoleta não
sobrescreve mais a boa. Mas a requisição antiga continua trafegando.
**O que falta:** `AbortSignal` atravessando o `fetchJson` do `services/api.ts`.
**Por que não foi feito:** `services/api.ts` é arquivo do S5.

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

- **27 erros de lint no `web`**: 24 são `any` em `PraiseDetailPage.test.tsx` e
  `HomePage.test.tsx`; os outros três são `set-state-in-effect` no
  `AudioPlayer.tsx` e `only-export-components` em `BulkFolderScanStatus.tsx` e
  `AuthContext.tsx`. Setores S5 e S7. **Enquanto não zerar, o passo de lint do
  web no CI segue `continue-on-error`** — o da api já é bloqueante.
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
- **Higiene do repositório (setor S10)**: `ingestion.sql` e `ingestion_no_tx.sql`
  no diretório de trabalho, três cópias de `LOGO_COLORIDO*.svg`,
  `fix_ingestion.py` na raiz, `.DS_Store`.
