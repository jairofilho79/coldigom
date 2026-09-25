# validate-acervo

Arnês de validação do acervo. O detector propõe, o gabarito mede, e só o
`apply` escreve.

## Rodar

```bash
cd scripts/validate-acervo

python3 -m core.snapshot                    # espelha o D1 + indexa a árvore original
python3 -m core.reconcile                   # Fase 0 — liga material ao arquivo original
python3 -m detectors.youtube_merge          # Fase 1 — emite findings e o formulário

# 1. simula (padrão) — nada é escrito, nenhuma credencial é lida
python3 -m core.apply --from out/youtube_merge/findings.jsonl --faixa alta

# 2. mede contra o gabarito que você preencheu (saída != 0 = não aplique)
python3 -m core.gold --from out/youtube_merge/findings.jsonl \
                     --gabarito out/youtube_merge/gabarito.tsv

# 3. só então aplica, e só a faixa alta
python3 -m core.apply --from out/youtube_merge/findings.jsonl --faixa alta --execute

# desfaz uma corrida inteira
python3 -m core.apply --undo <run_id> --execute

# a fila de revisão (P2): média e baixa vão para o D1, a tela decide, o apply escreve
python3 -m core.queue --empurrar out/youtube_merge/findings.jsonl \
                      --gabarito gabaritos/youtube_merge/gabarito.preenchido.tsv \
                      --apply-log out/apply_log.jsonl
python3 -m core.snapshot                   # o acervo mudou desde o push — refaz o espelho antes de aplicar
python3 -m core.queue --puxar-aprovados out/fila/aprovados.jsonl
python3 -m core.apply --from out/fila/aprovados.jsonl --faixa alta            # simula
python3 -m core.apply --from out/fila/aprovados.jsonl --faixa alta --execute  # escreve
python3 -m core.queue --marcar-aplicados out/apply_log.jsonl
```

### Migração PLPCG (spec 2026-09-15-migracao-plpcg-design)

```bash
python3 -m core.plpcg                       # exporta o D1 plpcg-catalog, baixa o que falta, hasheia os dois lados
python3 -m core.snapshot                    # o acervo do coldigom, fresco
python3 -m detectors.plpcg_crosswalk        # Fase A — um finding por entrada do PLPCG + um por louvor só de lá
python3 -m revisao.serve --abrir            # o site local (spec §6): lista por louvor do PLPCG, PDF dos dois lados, botões de decisão
```

`revisao.serve` sobe `http://localhost:8765` só com a stdlib e lê
`out/plpcg_crosswalk/findings.jsonl` (ou, sem ele, o gabarito da rodada 1),
`out/snapshot.sqlite` e os PDFs de `dev/plpcjf/assets`, `out/plpcg/baixados`
e `storage/assets/praises` — todos sobrescrevíveis por flag (`--findings`,
`--snapshot`, `--plpcjf`, `--baixados`, `--storage`). O PDF do coldigom é
achado pelo `material_id`, não por `<praise_id>/<material_id>`: um material
movido por merge continua na pasta do praise antigo no espelho.

**Decisões** (Fase B): cada botão do painel faz `POST /decide`, que faz
append em `gabaritos/plpcg_crosswalk/decisoes.jsonl` (`--decisoes` muda o
caminho). Vale a última linha por `pdf_id` (ou `group_id`, nos louvores
novos); o arquivo entra no git. Os tipos são o vocabulário que o dono usou
na rodada 1 (`revisao/decisoes.py`): `link` (hash idêntico, só vincula),
`adicionar` (material novo no praise — o padrão, porque é mais fácil remover
no coldigom do que voltar no PLPCG desligado), `substituir` (importa e marca
o material do coldigom para remoção — quarta ação do spec §7
(`replace_plpcg_material`)), `criar` (praise novo), `nao_levar` (zero upload:
"não precisa levar", "manter o do coldigom"), `descartar`. `junto_com`
aponta outra entrada (por `short_id` na tela, `pdf_id` no arquivo): o
material vai para o praise que aquela entrada usa ou cria. O kind padrão de
`Partitura` é `Choir`, não `Sheet Music` — foi o que o dono pediu em 77 das
84 vezes que nomeou o kind de uma partitura.

`python3 -m revisao.migrar_anotacoes` converteu, uma vez, as 1040 anotações
da rodada 1 (`rodada1/anotacoes.json`, o `localStorage` da versão anterior
do site: marca ✓/✗/? + texto livre) em decisões `origem: rodada1-texto`. O
texto manda, a marca não (o dono disse que a usou como "onde eu estava").
Onde o texto não decide sozinho, a linha sai com `tipo: null` e `duvida`; o
modo **Revisão 2** do site lista essas e mostra a dúvida em cima dos botões.
O modo gabarito (`?cego=1`) e o `core.gold` desta migração ainda não existem.

**Fase C — escrever no coldigom** (`core/plpcg_apply.py`, spec §7):

```bash
python3 -m core.plpcg_apply                          # simula tudo: plano por tipo, recusas, 3 exemplos de SQL/R2
python3 -m core.plpcg_apply --tipo link --execute    # 1º: só o crosswalk (alta do detector + "já existe" do site)
python3 -m core.snapshot
python3 -m core.plpcg_apply --tipo importar --execute   # "adicionar": upload no R2 + praise_materials + crosswalk
python3 -m core.plpcg_apply --tipo substituir --execute # idem + DELETE do material trocado (objeto R2 antigo fica)
python3 -m core.snapshot
python3 -m core.plpcg_apply --tipo criar --execute      # praises novos (um por nome) + materiais + crosswalk
python3 -m core.plpcg_apply --undo <run_id>             # desfaz um run inteiro, na ordem inversa
```

Lê `gabaritos/plpcg_crosswalk/decisoes.jsonl` (última linha por `pdf_id`) e o
`findings.jsonl` da rodada 1 (hash, path). Alta sem decisão vira `link` do
detector; `nao_levar`/`descartar` não escrevem mas entram no log como
decididas-sem-escrita; `junto_com` é resolvido em cadeia; `criar` repetido
para o mesmo nome vira um praise só. Simulação não toca rede nem lê
credencial. `--execute` exige `--tipo`; cada run grava em
`out/plpcg_apply_log.jsonl` e copia as suas linhas para
`gabaritos/plpcg_crosswalk/execucao/<run_id>.jsonl` (git). Pré-condições
lidas de produção uma vez por run (praise/material existem, `pdf_id` ainda
não está no crosswalk, sha256 do PDF confere, nenhum homônimo com a mesma
tag-base para criar); pós-condição por run (`plpcg_crosswalk WHERE run_id`).
R2 via `wrangler r2 object put|delete coldigom-assets/storage/…` — mesma
autenticação do D1. `--limite N` para o primeiro `--execute` ser pequeno.

Se um run morrer no meio (última linha `subindo_r2`/`escrevendo`), rode
`--undo <run_id>` e depois o mesmo `--tipo` de novo — a retomada por
pré-condição não distingue "aplicado por um run que caiu" de conflito. Um
undo com `erros_r2` fica `ok:true`: apague as chaves listadas à mão com
`wrangler r2 object delete coldigom-assets/<chave> --remote`. O wrangler
executa cada arquivo .sql como um batch atômico do D1 — é o que a retomada
assume (chunk que falhou não escreveu nada).

**Fase D — destino** (spec §8.2; código em `api/src/routes/plpcg.ts`, fora
deste arnês): o coldigom serve o que o plpcg.com servia.

```bash
API=https://coldigom-api.jairofilho79.workers.dev
curl -s $API/api/plpcg/manifest | python3 -c 'import json,sys; m=json.load(sys.stdin); print(len(m), m[0])'
curl -s $API/api/plpcg/manifest/checksum            # o mesmo hex do ETag do manifest
curl -s $API/api/plpcg/resolve/0453                  # {pdf_id, praise_id, material_id, url}
curl -sI "$API/api/plpcg/resolve/0453?redirect=1"    # 302 para o PDF
python3 -m core.plpcg --guardar-final                # exportação final do PLPCG → gabaritos/plpcg_crosswalk/plpcg_catalog_final.sql
```

O manifest tem uma entrada por linha de `plpcg_crosswalk` com `pdfId`,
`groupId` e `shortId` do PLPCG e `pdf` apontando para o coldigom; conferir
`len(m)` contra `SELECT COUNT(*) FROM plpcg_crosswalk` (4429 em 17/09) é o
teste de fumaça depois do deploy. `--guardar-final` junta os dumps de
`out/plpcg/dumps` (baixa antes, salvo `--pular-download`) num `.sql` único
com data e checksum no cabeçalho — rodar de novo no dia em que o
plpcg-admin parar de publicar (§8.3).

`core.plpcg` precisa do `wrangler` logado e do repo irmão `dev/plpcg-admin`
(cwd `worker/`, onde vive o binding do `plpcg-catalog`); os PDFs vêm de
`dev/plpcjf/assets` e, o que não está lá, de `plpcg.com`. Ambos sobrescrevíveis
por `PLPCG_ADMIN_WORKER` e `PLPCJF_ASSETS`. O hash é incremental em
`out/hashes.sqlite` — arquivo trocado no disco com o mesmo caminho não é
recalculado; apague a linha para forçar.

A **faixa do cruzamento** (§5.1 do spec) vive em `evidence["faixa"]`; o
`confidence` do finding é o contrato do arnês, pelo mapa — as cinco primeiras
linhas vêm de `CONTRATO`; a do louvor inteiro é decidida em `_finding_grupo`:

| faixa | confidence | action | quem decide |
|---|---|---|---|
| alta | alta | `link_plpcg` | o apply (depois do gabarito cego, Fase B) |
| media | media | `link_plpcg` | o site local |
| faltante | alta | `import_plpcg_material` | o apply (D4) |
| ambiguo | baixa | `link_plpcg` | o site local |
| sem_louvor (entrada) | media | `import_plpcg_material` | o site, ou o grupo abaixo |
| sem_louvor (grupo inteiro, `target_type = plpcg_grupo`) | alta | `create_praise_plpcg` | o apply (D4), depois da pré-visualização no site |

Evidência nova na faixa média: `hash-fora` — arquivo idêntico (mesmo sha256)
existe em outro louvor, quando o candidato único não tem material da família.

Nenhuma dessas ações escreve ainda: o `apply` as recusa nominalmente
("chega com a Fase C da migração PLPCG"). A migração 019
(`api/migrations/019_plpcg_crosswalk.sql`) criou a tabela `plpcg_crosswalk`
em produção em 15/09/2026, vazia (0 linhas, dois índices); é idempotente e
pode ser re-aplicada com `cd api && wrangler d1 execute coldigom --remote
--file=migrations/019_plpcg_crosswalk.sql`.

**A ordem dos três passos é o portão de promoção (spec §5.2), não estilo.**
Simular, medir com o gabarito preenchido, e só então aplicar. `core.gold`
sai com código != 0 tanto quando a faixa alta erra quanto quando não há
veredito nenhum para medir — gabarito em branco não é gabarito zerado.

Cada rodada commita `resumo.md`; `findings.jsonl` (~7 MB) só entra no git na
rodada que alimenta um gabarito ou uma `execucao/`.

### Seções da Coletânea viram subtags (spec 2026-09-24-secoes-coletanea-subtags-design §5)

> **Histórico.** A coluna `praises.category` saiu do schema na migração 025. Estes comandos (e os `--undo`
> deles) só rodam num D1 anterior à 025; os valores antigos estão nos logs em `gabaritos/secoes_coletanea/execucao/`.

```bash
python3 -m core.snapshot --assets2 /dev/null/sem-arvore   # D1 fresco; este comando não precisa da árvore
python3 -m core.secoes_coletanea                          # ensaio: travas, relatório, SQL — nada é escrito
python3 -m core.secoes_coletanea --execute                # grava (só depois do deploy da API, spec §6)
python3 -m core.secoes_coletanea --undo <run_id>          # simula o undo
python3 -m core.secoes_coletanea --undo <run_id> --execute
```

O ensaio grava `out/secoes_coletanea/<run_id>/relatorio.md` (contagem por
subtag contra a spec, os casos manuais, quem entra na Coletânea, ligações
diretas com a raiz removidas) e o SQL em `sql/`. As travas (a) valor de
`category` fora do mapeamento, (b) raiz `Coletânea` sem seção e (c) caso
manual ausente ou com outras tags abortam com código 2 antes de qualquer
escrita e listam todos os problemas de uma vez.

`--execute` relê as tags de produção (as raízes têm que ser as do snapshot;
subtag criada depois do snapshot é reaproveitada), guarda quais ligações já
existiam, roda os lotes e relê as ligações. O `INSERT` só pega se a
`category` (e, nos manuais, o conjunto de tags) ainda for a do snapshot, e o
`DELETE` da raiz só pega com a subtag já ligada — quem a guarda barrou sai
como "ficou para trás" (código 1): refaça o snapshot e rode de novo. O
`--execute` é recusado se o snapshot for mais velho que a última escrita
deste comando. Log em `out/secoes_coletanea_log.jsonl`; a cópia do run vai
para `gabaritos/secoes_coletanea/execucao/<run_id>.jsonl` (git).

O undo repõe a raiz `Coletânea`, tira só as ligações que não existiam antes
do run e apaga as subtags criadas só se ficaram sem nenhuma ligação.
`category` nunca é alterada por este comando.

**Nunca reaplique à mão um chunk `.sql` gerado por um ensaio ou por um
`--execute` anterior.** O chunk que cria as subtags tem um `INSERT INTO
tags`; produção já tem essas subtags depois do primeiro `--execute`, e o
`INSERT` esbarra no índice único `idx_tags_child_name` e aborta o arquivo
inteiro (é um batch atômico do D1). Quem precisa migrar o que ficou para
trás roda um ensaio novo — ele relê produção e usa as subtags já criadas
(§5.1.3) — em vez de reusar SQL antigo.

**Ordem do deploy (spec §6):** o passo 1, o deploy da API do coldigom que
aceita ligar um praise a uma tag pai (plano 1 desta spec — fim da trava
«parent tag», §3.2), vem antes do `--execute` deste script (passo 3). O
`--execute` em si fala com o D1 por SQL, não pela API; mas rodar antes do
deploy 1 deixa a raiz `Coletânea` (que passa a ter filhos) recusada pela API
em qualquer escrita futura que precise religá-la, até o deploy acontecer.
Tem um efeito mais imediato, e é o motivo de esperar: até o deploy 1,
`resolveTagFilterGroups` troca uma tag pai só pelos filhos dela (F6/§3.1),
não pai + filhos. Depois do `--execute`, `Avulsos` e `Coletânea` passam a
ter filhos (as subtags); um filtro por `Avulsos` no admin ou em
`/api/plpcg/praises` voltaria só o 1 praise de `Avulsos · GLTM` em vez de
~881, e um filtro por `Coletânea` voltaria só quem está ligado direto à raiz
(o esperado é 0 depois da migração) em vez das ~1123 subtags. O deploy 1
corrige o resolver antes disso acontecer.

Testes: `python3 -m pytest tests/ -v`

### Fase 3: `praises.category` vira NULL (`core.secoes_coletanea_categoria`)

> **Histórico.** A coluna `praises.category` saiu do schema na migração 025. Estes comandos (e os `--undo`
> deles) só rodam num D1 anterior à 025; os valores antigos estão nos logs em `gabaritos/secoes_coletanea/execucao/`.

Só depois do passo 4 da spec (admin web e app publicados e homologados sem a Categoria) — spec 2026-09-24-secoes-coletanea-subtags-design §6, item 5.

    python3 -m core.snapshot --assets2 /dev/null/sem-arvore
    python3 -m core.secoes_coletanea_categoria                  # ensaio: out/secoes_coletanea_categoria/<run>/relatorio.md
    python3 -m core.secoes_coletanea_categoria --execute        # dono; lê a produção na hora
    python3 -m core.secoes_coletanea_categoria --undo <run_id> --execute

Cada UPDATE é guardado pelo valor lido: quem teve a categoria editada no meio fica «atrasado» e não é
zerado. O log guarda `[id, valor antigo]` do que zerou; o undo só repõe onde a categoria ainda está NULL.
`updated_at` não muda. A coluna continua no schema.

## Arquivos

| arquivo | papel |
|---|---|
| `core/paths.py` | onde as coisas estão. Nenhuma lógica |
| `core/normalize.py` | normalização de nome e letra. O conteúdo dos parênteses é preservado |
| `core/d1.py` | fala com o D1 pelo wrangler. Escrita é `.sql` gerado + subprocess |
| `core/snapshot.py` | monta `out/snapshot.sqlite` e indexa `assets2` |
| `core/findings.py` | o contrato do finding e o contador de exclusões |
| `core/reconcile.py` | Fase 0 — liga cada material ao arquivo original |
| `core/apply.py` | a única porta de escrita. Simula por padrão |
| `core/gold.py` | sorteio, formulário cego, precisão por faixa |
| `core/queue.py` | a fila de revisão: empurra findings para o D1, puxa os aprovados como faixa alta, marca os aplicados |
| `core/plpcg.py` | o PLPCG como fonte: exportação do D1 `plpcg-catalog`, `pdf_id` ↔ caminho, download, cache de sha256 dos dois lados |
| `detectors/youtube_merge.py` | Fase 1 — louvores cujo único material é do YouTube |
| `detectors/plpcg_crosswalk.py` | Fase A da migração — louvor por número/slug/classe, hash e caminho só dentro do louvor, faixas e candidatos |
| `revisao/serve.py` + `revisao/index.html` | o site local de revisão da migração PLPCG — findings por louvor, PDFs lado a lado, `POST /decide` |
| `revisao/decisoes.py` · `revisao/migrar_anotacoes.py` | tipos de decisão, validação, `decisoes.jsonl`; migração única das anotações da rodada 1 |
| `core/plpcg_apply.py` | Fase C: decisões → link/importar/substituir/criar no D1 + R2, simulação, log, undo |
| `core/secoes_coletanea_mapa.py` | as constantes da spec das seções da Coletânea (§2.1–2.3), copiadas byte a byte, e `classificar()` |
| `core/secoes_coletanea.py` | seções da Coletânea → subtags: travas, SQL guardado, relatório do ensaio, execução, log, undo |
| `gabaritos/plpcg_crosswalk/decisoes.jsonl` | as decisões do dono, append-only, última por `pdf_id` vence — é o que o `apply` da Fase C vai ler |

## As regras que não são óbvias no código

- **Simula por padrão.** `--execute` é o único portão de escrita, e o retorno
  antecipado da simulação acontece antes de ler qualquer credencial.
- **O gabarito é cego.** O formulário mostra o alvo e a evidência bruta, nunca
  a proposta do detector. Com a proposta à vista, a métrica vira concordância.
- **O CSV de classificação não é gabarito.** Ele mesmo chutou o kind a partir
  do nome do arquivo. É uma testemunha como as outras.
- **O banco manda sobre o CSV.** É o que `core/reconcile.py` implementa: o
  vínculo do D1 vence, e `nome_arquivo`/`pasta` viajam junto só como evidência
  para o humano. A observação empírica por trás disso — há arquivo guardado na
  pasta do louvor errado cujo *nome* diz o louvor certo, e o banco já tinha
  corrigido — motiva a regra, mas não é ela: não existe no código nenhuma
  comparação entre nome do arquivo e pasta.
- **Sem candidato não quer dizer louvor novo.** O detector reporta e para.
- **A fusão por SQL é recusada se a fonte tiver `r2_key`.** SQL não limpa o
  R2; o endpoint com JWT limpa. Na Fase 1 nenhum tem, mas deixar implícito
  viraria vazamento silencioso na primeira fase que reusasse a função.
- **A fusão por SQL é recusada se a fonte trouxer uma tag-pai nova.** A API
  devolve 400 nesse caso; o SQL contornaria o invariante em silêncio. Mesma
  recusa, mesmo motivo da `r2_key`.
- **Só a faixa alta escreve.** `--execute` é recusado com erro se o lote tiver
  qualquer finding fora da faixa alta: D1 manda média e baixa para a fila de
  revisão humana (o P2). Simular qualquer faixa continua liberado.
- **Uma fusão cuja fonte já não existe em produção é recusada, não
  bem-sucedida.** A pós-condição aceita "a fonte sumiu" como prova de que a
  fusão aconteceu — e ela pode ter sumido numa fusão *anterior*. Sem essa
  recusa, dois `--execute` contra o **mesmo snapshot** (mexer numa constante do
  detector e re-rodar, com o `--db out/snapshot.sqlite` do default) doavam
  `author`/`lyrics` e as tags de uma fonte já fundida para um segundo keeper,
  que nunca foi fundido com nada — com `ok:true`. O portão de alvo repetido não
  alcança isso: ele é por lote, e o perigo atravessa lotes. Então a pergunta
  vai para **produção**, por finding, antes de escrever. Recusar um replay
  legítimo é falha segura; o replay honesto pelo log já é filtrado antes, pelo
  `finding_id` com `ok:true`.
- **Refazer o snapshot entre dois `--execute` é o certo**, e agora não é mais
  o que separa o acervo de um estrago: com o snapshot velho, o finding do
  segundo lote nasce de um estado que já não existe e a recusa acima o pega.
- **O `--undo` desfaz o que falhou *pela metade*, não o que falhou *antes de
  começar*.** Uma escrita é reversível quando o log tem o `antes` **e**
  registra que o SQL chegou a rodar (`escreveu: true`) — não é o `ok` que
  decide, mas também não é o `antes` sozinho. Falha depois de o wrangler ter
  entrado, e `guarda_barrou` (o keeper já recebeu a doação e o material já
  migrou, mas a fonte continua viva): **desfaz**. Processo morto antes de
  qualquer SQL, recusa do próprio `apply` (`r2_key`, tag-pai, fonte que já não
  existe em produção) e finding intocado de um lote que quebrou antes dele:
  **não desfaz — e é isso que se quer**, porque nada aconteceu em produção e
  "desfazer" ali seria escrever o snapshot por cima de estado vivo. Nesses
  casos o `--undo` reporta `0 escritas`.
- **Uma recusa posterior não apaga uma escrita anterior.** O log tem várias
  entradas por finding, e o `--undo` fica com a última **que escreveu**, não
  com a última. Sem isso, a retomada documentada acima (rodar o mesmo
  `findings` de novo depois de uma falha) destruía a reversibilidade: o
  wrangler que aplica tudo e morre ao reportar deixa `escreveu: true`, a
  retomada grava por cima uma recusa da pré-condição de fonte viva com
  `escreveu: false`, e o `--undo` passava a dizer `0 escritas` — a frase que
  se lê como "nada aconteceu" — para uma fusão completa num acervo sem
  lixeira.
- **E o que ele desfaz, desfaz só se produção ainda estiver como a fusão
  deixou.** Cada peça leva a sua guarda otimista, dos dois lados: coluna doada
  ao keeper só volta se ainda contém o valor doado; material só volta para a
  fonte se ainda está pendurado no keeper por esta fusão; a linha da fonte só
  é reinserida se a fusão de fato a apagou (`ON CONFLICT DO NOTHING`), e as
  tags dela só voltam se a fonte tinha mesmo sumido. Editou pelo app depois do
  snapshot, moveu um material, apagou uma tag? O `--undo` no-opa naquela peça
  em vez de pisar na edição. O preço é uma leitura pontual em produção por
  fusão desfeita, inclusive na simulação (sem `--execute`).
- **E se essa leitura falhar, o `--undo` não morre: ele adia aquela entrada.**
  Wrangler deslogado, sem rede, D1 fora do ar — a exceção matava o `--undo`
  inteiro, inclusive a simulação e inclusive as entradas do mesmo run que não
  precisam de leitura nenhuma. Agora a entrada da fusão fica **inteira** de
  fora (reinserir a linha da fonte apagaria a evidência que decide as tags, e
  o material não pode voltar para uma fonte que talvez não exista — a FK é
  real), o resto do run é desfeito normalmente, e o `--undo` **diz
  nominalmente** quais entradas não pôde decidir e por quê. Elas não entram no
  `desfeito` do log e continuam desfazíveis: basta rodar o `--undo` de novo
  com o wrangler no ar.
- **O undo se registra no log**, então o finding volta a ser aplicável depois
  de desfeito.
- **Uma decisão humana é a única promoção para a faixa alta.** O veredito do
  gabarito e o `aprovado` da fila passam pela mesma `findings.promovido()`, e
  o `finding_id` não muda. `aplicado` na fila é marcado só pelo
  `--marcar-aplicados`, lendo o log do apply.

## Pré-requisitos

- `wrangler` logado. O `api/wrangler.toml` precisa existir — e, ao contrário do
  que o `.gitignore` sugere, ele **está rastreado no git** (entrou no índice
  antes da regra de ignore). Ou seja, `account_id` e `database_id` estão
  versionados; segredo de verdade vai por `wrangler secret put`, nunca nesse
  arquivo.
- A árvore original em `/Volumes/SSD 2TB SD/assets2`, ou `COLDIGOM_ASSETS2`
  apontando para ela
- Python 3.9+; nada a instalar além do que já está no sistema
