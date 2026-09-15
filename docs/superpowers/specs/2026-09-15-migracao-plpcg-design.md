# Migração PLPCG → Coldigom — design

Data: 2026-09-15 · Estado: proposta aprovada em conversa, aguardando revisão do spec

## 1. O problema

O PLPCG (plpcg.com, PWA SvelteKit em `dev/plpcjf`) e o Coldigom guardam o mesmo
acervo em dois bancos e dois buckets. O dono quer desligar o PLPCG. Para isso
três coisas precisam ser verdade, nesta ordem:

1. **toda entrada do PLPCG tem um material equivalente no coldigom**, no
   louvor certo, com o kind certo — mesmo que o arquivo do coldigom seja outra
   versão do mesmo material;
2. **o que só existe no PLPCG entra no coldigom** (upload no R2 + linha em
   `praise_materials`, criando o praise quando ele não existe);
3. **o app Flutter (`dev/coldigui`) passa a ler só do coldigom**, e os links
   antigos do PLPCG (`?s=<short_id>`) continuam resolvendo.

O que torna isso difícil não é volume (4.633 entradas), é confiabilidade: o
PLPCG não guarda id do coldigom, o coldigom não guarda id do PLPCG, e nem todo
material é o mesmo arquivo dos dois lados.

## 2. Inventário medido (D1 `plpcg-catalog` + D1 `coldigom` + disco, 2026-09-15)

### 2.1 O PLPCG

- D1 `plpcg-catalog`, tabela `louvores`: `pdf_id` (base64 urlsafe do caminho
  do PDF), `nome`, `numero`, `classificacao`, `categoria`, `pdf`, `group_id`,
  `short_id`. **4.633 linhas.** Os três `louvores-manifest.json` no disco têm
  4.609/4.627/4.629 — são fotos velhas; **a fonte é o D1**.
- `categoria` (5): Partitura 1.656 · Cifra nível I 1.036 · Cifra nível II
  1.033 · Cifra 654 · Gestos em Gravura 254.
- `group_id` é a identidade **de louvor**: `NNN:slug` (3.753 entradas) ou
  `avulso:slug` (880). **1.897 grupos.** Foi unificado à mão pelo dono em
  `plpcg-admin/scripts/merge-group-ids.py` — é testemunha forte.
- PDFs: 4.620 dos 4.633 `pdf_id` resolvem para arquivo local em
  `dev/plpcjf/assets/`; 13 (prefixo `assets/`, entradas recentes) só existem
  no R2 `pls-louvores` e se baixam de `https://plpcg.com/assets/<caminho>`.
- **2.709 das 4.633 entradas compartilham o PDF com outra entrada.** A página
  da coletânea que contém os louvores 31–34 é o mesmo arquivo nas quatro
  entradas de "Cifra I"; partituras que atravessam página (737/738) idem. O
  coldigom copiou a mesma página para cada louvor (1.890 grupos de hash
  repetido lá). **Hash sozinho nunca decide; decide hash ∩ louvor.**
- `classificacao` não bate com a pasta física: as cifras de "Coletânea
  Adultos" vivem em `Louvores Coletânea de Partituras/NNN - Nome/Cifra I.pdf`.

### 2.2 O coldigom

- 1.690 louvores · 21.223 materiais (pdf 11.283, mp3 6.662, chord 2.271,
  gestures 466, youtube 410, …). Nenhuma coluna de hash, origem ou `pdf_id`.
- O caminho original da coletânea vive no `csvmap`
  (`assets2/files_classification.csv`, 17.810 materiais com id) no formato
  `Coletânea /NNN - Nome/Cifra I.pdf` — **o mesmo padrão do `pdf_id`
  decodificado**. `file_path_legacy` cobre só 9.991 materiais e não tem a
  coletânea.
- `storage/assets/praises/<praise_id>/<material_id>.pdf` é o espelho local
  pré-R2: 11.110 PDFs, 11.085 com id de material vivo. Serve para hash barato;
  a verdade é o R2 `coldigom-assets` (`storage/<r2_key>`).
- O mapa categoria→kind já foi fixado pela ingestão original:

  | PLPCG `categoria` | kind do coldigom (família aceita) |
  |---|---|
  | Partitura | `Sheet Music` (coletânea, 776/777) · `Choir` / `Score` (avulsos) |
  | Cifra nível I | `Chord Chart I` (1.034/1.034) |
  | Cifra nível II | `Chord Chart II` (1.031/1.031) |
  | Gestos em Gravura | `CIAs Gestures` (254/254) |
  | Cifra | `Chord Chart` (família: qualquer `Chord Chart*`) |

- Tags por `classificacao`: Coletânea Adultos → `Coletânea` (sem `CIAs`/`PES`);
  Coletânea CIAs → `Coletânea`+`CIAs`; PES → `PES`; PES CIAs → `PES`+`CIAs`;
  Avulsos Diversos → `Avulsos` (+`Diversos`/`Migrados`) ou `GLTM`. A tag é
  desempate, não chave: o arranjo PES do hino 586 está no coldigom só como
  `Coletânea`.

### 2.3 O spike de cruzamento (throwaway, 2026-09-15)

Um script de ~150 linhas cruzou as 4.633 entradas pelas camadas do §5 e mediu:

| categoria | alta | média | faltante | ambíguo | sem louvor | total |
|---|---|---|---|---|---|---|
| Partitura | 1316 | 153 | 7 | 154 | 26 | 1656 |
| Cifra nível I | 1031 | 3 | 1 | 0 | 1 | 1036 |
| Cifra nível II | 1029 | 3 | 0 | 0 | 1 | 1033 |
| Cifra | 21 | 116 | 90 | 109 | 318 | 654 |
| Gestos em Gravura | 252 | 1 | 0 | 0 | 1 | 254 |
| **total** | **3649 (79%)** | 276 | 98 | 263 | 347 | 4633 |

Por louvor (1.897 grupos): 1.029 com tudo em alta · 300 sem ambiguidade ·
230 precisam de revisão · **338 não existem no coldigom**.

Fatos que o spike fixou:

- 3.299 entradas têm **as três camadas concordando** (número + hash +
  caminho). A coletânea está resolvida; o resíduo é Avulsos.
- **338 louvores só no PLPCG, não os ~100 estimados.** Quase todos são cifras
  avulsas em `Adicionados/` (nov/2025 em diante). Os nomes mais próximos no
  coldigom são louvores diferentes; uns 40 são variantes de título
  (`a-ti-que-habitas` ↔ `a-ti-que-habitas-entre-os-querubins`) e caem em
  média pela regra de continência.
- **73 grupos do PLPCG apontam para 2 praises do coldigom — e está certo.** O
  PLPCG agrupa a partitura da coletânea e o arranjo PES do mesmo hino; o
  coldigom mantém dois praises (`Clamo a ti [003]` Coletânea e `Clamo a ti
  [003]` Coletânea+PES). O cruzamento é por entrada, então isso não atrapalha.
- O ambíguo de Partitura é quase todo avulso onde o coldigom tem `Grade` e
  `Coro` e o PDF do PLPCG não é idêntico a nenhum. Só um humano olhando decide.
- O cruzamento denuncia duplicatas do coldigom (`Regozijai - vos` ×
  `Regozijai-vos` no 527; duas grafias no 566). Vão para a Fase 7 do
  validate-acervo, não para este spec.

## 3. Decisões fixadas pelo dono

| # | Decisão |
|---|---|
| D1 | **Protocolo em camadas**: moldura por louvor, evidências em cascata com faixas de confiança, crosswalk persistido no D1. Sem comparação por conteúdo/OCR (a "opção 5" do estudo). |
| D2 | **Resíduo mínimo, revisão humana barata.** Ele prefere revisar à mão um resíduo pequeno a gastar tokens; a régua é taxa de acerto alta na faixa alta. |
| D3 | **Site local de revisão**, fora do coldigom web. Decisões gravadas em `scripts/validate-acervo/gabaritos/plpcg_crosswalk/` (git). |
| D4 | **Os 338 louvores exclusivos são criados automaticamente** (praise + material, `is_reviewed = 0`, com undo). Revisão posterior no coldigom, no ritmo dele. |
| D5 | **Grupo do PLPCG com coletânea + arranjo PES continua sendo dois praises.** Fusão, se um dia, é Fase 7. |
| D6 | **Destino no mesmo spec, fase final**: tabela `plpcg_crosswalk` no D1, endpoint de resolução, manifest gerado pelo coldigom. |
| D7 | **Ele vai apontar padrões de erro e pedir ajuste de regra.** O ciclo detector → site → ajuste → re-rodada é parte do desenho, não exceção. |

## 4. Arquitetura

Tudo vive em `scripts/validate-acervo/`, reaproveitando o arnês que já existe
(snapshot, findings, apply/undo, gabaritos). Nada de novo no coldigom web.

```
D1 plpcg-catalog ──wrangler export──┐
dev/plpcjf/assets (PDFs) ──sha256───┤
plpcg.com/assets (13 só no R2) ─────┤
                                    ▼
                     detectors/plpcg_crosswalk.py
                     (camadas §5; lê out/snapshot.sqlite + csvmap + hashes)
                                    │
                                    ▼
                     out/plpcg_crosswalk/findings.jsonl  (+ candidatos por entrada)
                                    │
             ┌──────────────────────┼──────────────────────┐
             ▼                      ▼                      ▼
        faixa alta            média / ambíguo         sem louvor
             │                      │                      │
             │            site local (§6)                  │
             │            gabaritos/plpcg_crosswalk/       │
             │            decisoes.jsonl                   │
             │                      │                      │
             └──────────► core/apply.py --execute ◄────────┘
                          link_plpcg · import_plpcg_material · create_praise_plpcg
                          (D1 coldigom + R2 coldigom-assets, log com undo)
                                    │
                                    ▼
                     D1: plpcg_crosswalk · praises · praise_materials
                                    │
                                    ▼
                     GET /api/plpcg/resolve/:short_id · GET /api/plpcg/manifest
                     coldigui sai do modo dual · plpcjf/plpcg-admin congelam
```

Componentes, cada um com uma responsabilidade:

| unidade | faz | depende de |
|---|---|---|
| `core/plpcg.py` | exporta o D1 do PLPCG para `out/plpcg/plpcg.sqlite`; decodifica `pdf_id`; localiza/baixa o PDF; calcula e cacheia sha256 dos dois lados (`out/hashes.sqlite`) | wrangler (cwd `dev/plpcg-admin/worker`), disco, `plpcg.com` |
| `detectors/plpcg_crosswalk.py` | as camadas do §5; emite um finding por entrada e um por grupo sem louvor, com lista de candidatos | snapshot, csvmap, `core/plpcg.py` |
| `revisao/` (servidor + uma página) | revisão humana do resíduo; grava decisões | findings, PDFs locais, `plpcg.com`, coldigom web (link) |
| `core/apply.py` (três ações novas) | escreve no D1 e no R2, simula por padrão, undo por `run_id` | wrangler, S3 do R2 |
| `api/migrations/019_plpcg_crosswalk.sql` + rotas | tabela e endpoints de resolução/manifest | D1 |

## 5. O cruzamento por camadas

Por entrada do PLPCG, nesta ordem. Cada camada nomeia sua testemunha na
evidência.

**Camada L — louvor.** Candidatos do coldigom para o grupo:

1. `NNN:` → todos os praises com `int(number) == NNN`, qualquer tag;
2. se mais de um, fica quem tem `slug(name) == slug` do grupo;
3. se ainda mais de um, fica quem tem as tags compatíveis com `classificacao`;
4. `avulso:` (ou número sem candidato) → praises com slug igual; depois
   continência (`a-b` é prefixo de `a-b-c`, ≥ 10 chars); depois similaridade
   ≥ 0,8. Tudo que veio por nome aproximado é marcado `nome~` e **nunca chega
   a alta sozinho**.

**Camada H — hash.** sha256 do PDF do PLPCG ∈ sha256 dos PDFs do coldigom
(`storage/` local; os 13 sem arquivo local baixam de plpcg.com). Devolve um
*conjunto* de materiais (páginas compartilhadas).

**Camada P — caminho.** `pdf_id` decodificado transformado para a forma do
`csvmap`: prefixo mapeado (`ColAdultos`/`Louvores Coletânea de Partituras` →
`Coletânea `; `ColCIAs`/`Louvores Coletânea CIAs` → `Coletânea CIAs`;
`Avulsos`/`Adicionados` → qualquer prefixo avulso), número da pasta ou nome
normalizado, basename normalizado (`ColAdultos/NNN.pdf` ≡ `…/Partitura.pdf`).

**Corroboração.** Materiais tipo `pdf` dos praises candidatos que estão em H
ou em P. Um só → ele escolhe o material **e** o louvor. O kind do coldigom é
registrado; divergir da família esperada vira nota, não rebaixa (o hash prova
que é o mesmo arquivo — a classificação é assunto da Fase 2).

### 5.1 Faixas — coerente com o §5.1 do spec de validação

| faixa | condição | destino |
|---|---|---|
| **alta** | louvor por número/slug exato **e** exatamente um material corroborado por H ou P | `link_plpcg` aplica direto |
| **média** | louvor único, um só material `pdf` da família, sem corroboração; ou louvor por `nome~` com corroboração; ou só H aponta para um único louvor | site |
| **faltante** | louvor único (exato), nenhum material da família | `import_plpcg_material` aplica direto (D4) |
| **ambíguo** | mais de um louvor ou mais de um material sem desempate | site |
| **sem louvor** | nenhum candidato em L, nada em H | `create_praise_plpcg` + `import_plpcg_material` aplicam direto (D4); o finding leva o nome mais parecido como aviso |

A alta exige duas testemunhas independentes (identidade do louvor + identidade
do arquivo), como manda a regra única.

### 5.2 O finding

Usa o contrato de `core/findings.py` com `target_type = "plpcg"`,
`target_id = pdf_id` (ou `group_id` para `create_praise_plpcg`). A evidência
carrega `path`, `sha256`, `evidencias` (`num`, `slug`, `classe`, `nome~`,
`hash`, `path`, `kind-unico`, `hash-so`), `praise_id`, `material_id`,
`kind_coldigom`, `nota` e **`candidatos`**: até 5 `(praise_id, material_id?,
score, por_que)` — é o que o site mostra. `finding_id` é determinístico por
`pdf_id`, então re-rodar não duplica.

### 5.3 Portão de promoção

Como no §5.2 do spec de validação, com uma diferença: `link_plpcg` não é
destrutivo (é uma linha nova numa tabela nova), então o gabarito cego da alta
pode ser menor. Regra: **30 entradas sorteadas da alta, estratificadas por
categoria, rotuladas às cegas no site (modo gabarito: mostra o PDF do PLPCG e
os materiais do louvor, esconde a proposta)**. Promove com ≥ 98 % e zero erro
de louvor. Média/ambíguo não têm portão: o site é o veredito.

Para D4 (criação automática): antes do `--execute`, o site lista os 338 com o
nome mais parecido ao lado; o dono passa o olho, não clica um a um. Um
`ignorar`/`é este` pontual retira o item da criação.

## 6. O site local de revisão

`python3 -m revisao.serve` sobe `http://localhost:8765` com `http.server` e uma
página estática (HTML + JS sem build, sem framework). Nada disso entra no
coldigom web nem na catraca de cobertura.

**Lista** (esquerda): entradas filtráveis por faixa, categoria, classificação,
evidência; **agrupadas por louvor do PLPCG**, para revisar um hino de cada vez.
Contadores por faixa no topo. Já decididas somem por padrão.

**Painel** (direita), por entrada:

- o PDF do PLPCG (iframe do arquivo local; fallback `plpcg.com/assets/…`);
- os candidatos (§5.2), cada um com o PDF do coldigom (iframe de `storage/`
  local; fallback link para a página do louvor no coldigom web), o nome do
  louvor, número, tags, kind, e *por que* é candidato (`hash`, `path`, `num`,
  `nome~ 0,84`…);
- ações: **é este** (escolhe o material) · **é este louvor, importar** (louvor
  certo, material não existe → upload) · **criar louvor** (nome/tags
  pré-preenchidos do PLPCG, editáveis) · **ignorar** (com motivo) ·
  **kind/tag divergente** (anota a correção que o apply leva junto).

**Persistência**: `POST /decide` faz append em
`gabaritos/plpcg_crosswalk/decisoes.jsonl` (`pdf_id`, `tipo`, `material_id`,
`praise_id`, `kind`, `tags`, `nome`, `motivo`, `quando`). Append-only, a
última linha por `pdf_id` vale. É gabarito humano: entra no git, nunca fica
só em `out/`.

**O ciclo de ajuste (D7)**: o dono anota `motivo` em texto livre. Eu leio os
motivos, ajusto a regra do detector, re-rodo. `core.gold` mede a nova rodada
contra as decisões já tomadas (`é este` = verdade), então um ajuste que quebra
o que já estava certo aparece antes de qualquer `--execute`.

**Modo gabarito** (`?cego=1`): mesma página, sem a proposta e sem os scores —
só o PDF do PLPCG e os materiais do louvor casado por número. É o portão do
§5.3.

## 7. Escrita: as três ações novas do `apply`

Todas simulam por padrão, geram `.sql` em `out/sql/<run_id>/`, gravam no
`apply_log.jsonl` com o estado anterior, e são desfeitas por `--undo <run_id>`.

| ação | escreve | undo |
|---|---|---|
| `link_plpcg` | `INSERT INTO plpcg_crosswalk (pdf_id, short_id, group_id, praise_material_id, praise_id, evidencia, confianca, decidido_por, run_id)` | `DELETE` pela `pdf_id` |
| `import_plpcg_material` | upload S3 para `storage/assets/praises/<praise_id>/<material_id>.pdf` (chave nova, uuid4); `INSERT INTO praise_materials (type='pdf', material_kind=família→kind, is_reviewed=0)`; depois `link_plpcg` | `DELETE` da linha + `DeleteObject` no R2 (a chave fica no log) |
| `create_praise_plpcg` | `INSERT INTO praises (name=nome do PLPCG, number=NNN se grupo numerado e classificação coletânea, senão '')` + `praise_tags` pelo mapa do §2.2; depois `import_plpcg_material` para cada entrada do grupo | `DELETE` em cascata (materiais, tags, praise), R2 idem |

Pré-condições (recusa em vez de escrever): `praise_id`/`material_id` ainda
existem no D1 remoto; `pdf_id` ainda não está em `plpcg_crosswalk`; para
importar, o hash do PDF local confere com o registrado no finding; para criar,
nenhum praise com o mesmo slug e mesma tag-base apareceu desde o snapshot
(refazer `core.snapshot` antes de aplicar, como manda o README).

Credenciais: as mesmas de `api/scripts/import_gestures.ts` (S3 derivado de
`CLOUDFLARE_R2_API_TOKEN`; tudo sob `storage/` no bucket). Nenhuma é lida na
simulação.

## 8. Destino

### 8.1 Tabela `plpcg_crosswalk` (migração 019)

```sql
CREATE TABLE plpcg_crosswalk (
  pdf_id            TEXT PRIMARY KEY,
  short_id          TEXT NOT NULL,
  group_id          TEXT NOT NULL,
  praise_id         TEXT NOT NULL,
  praise_material_id TEXT NOT NULL,
  evidencia         TEXT NOT NULL,   -- "num+slug+hash+path" | "site:é este" …
  confianca         TEXT NOT NULL,   -- alta | media | humano
  decidido_por      TEXT NOT NULL,   -- detector | jairo
  run_id            TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_plpcg_crosswalk_short ON plpcg_crosswalk(short_id);
CREATE INDEX idx_plpcg_crosswalk_praise ON plpcg_crosswalk(praise_id);
```

Sem FK (padrão da casa); a integridade é do `apply`. Um material do coldigom
pode ter várias `pdf_id` (duplicatas internas do PLPCG — 56 casos medidos).

### 8.2 Endpoints

- `GET /api/plpcg/resolve/:short_id` → `{praise_id, material_id, url}` (302
  opcional). É o que faz `plpcg.com/?s=…` e listas salvas no coldigui
  continuarem vivos.
- `GET /api/plpcg/manifest` → o **mesmo JSON** do `louvores-manifest.json`,
  gerado do coldigom: `pdfId` preservado quando há crosswalk (as chaves de
  cache do cliente sobrevivem), `pdf` apontando para o R2 do coldigom. Permite
  apontar o plpcjf e o coldigui para o coldigom **sem mudar o formato** —
  a transição não depende de release de app.

### 8.3 Desligamento (fora deste repo, mas é o critério de pronto)

1. coldigui: `manifestUrl` → `coldigom-api/api/plpcg/manifest`; modo dual
   desligado; short links via `resolve`.
2. plpcjf: idem, ou congelado.
3. plpcg-admin: publicação de manifest desativada; D1 `plpcg-catalog` vira
   somente leitura (última exportação guardada em
   `gabaritos/plpcg_crosswalk/plpcg_catalog_final.sql`).

## 9. Fases e portões

| fase | entrega | portão |
|---|---|---|
| **A — arnês** | `core/plpcg.py`, `detectors/plpcg_crosswalk.py` com testes de fixture (uma entrada por faixa, páginas compartilhadas, grupo com 2 praises, `nome~`), `findings.jsonl` da rodada 1, migração 019 aplicada | tabela do §2.3 reproduzida (± ajustes de regra) |
| **B — site + gabarito** | `revisao/`, decisões gravadas, gabarito cego de 30 | §5.3 passa |
| **C — aplicação** | `apply` com as três ações; `--execute` da alta, dos faltantes, dos 338; depois dos aprovados no site | `plpcg_crosswalk` cobre 100 % das `pdf_id`; undo testado numa corrida real e desfeita |
| **D — destino** | endpoints `resolve`/`manifest`, coldigui apontado | coldigui em modo único por uma semana sem "não encontrado" |

Dentro de C a ordem é: primeiro `link_plpcg` (não destrutivo) → snapshot novo
→ `import_plpcg_material` dos faltantes → `create_praise_plpcg` dos 338 →
snapshot novo → aprovados do site. Cada `--execute` é um `run_id` e um
registro em `gabaritos/plpcg_crosswalk/execucao/` (a regra que ficou da
Fase 1: `out/` é git-ignored e já morreu com um worktree; nada fica só lá).

## 10. Riscos

| risco | mitigação |
|---|---|
| `storage/` local ≠ R2 (materiais nascidos depois, arquivo trocado no web) | hash local é só testemunha; o `apply` confere existência no D1 remoto; materiais sem arquivo local aparecem no site com link para o coldigom web |
| Página compartilhada casa com o vizinho | corroboração só conta dentro do louvor escolhido por número/slug; o gabarito cego mede exatamente isso |
| Criar praise duplicado nos 338 | finding leva o nome mais parecido; lista de pré-visualização antes do `--execute`; undo por `run_id`; duplicata que escapar é caso da Fase 7 |
| O D1 do PLPCG muda durante o trabalho (`short_id_next`, `checksum` em `catalog_meta`) | `core/plpcg.py` registra o `checksum`; re-rodar o detector lista só as `pdf_id` novas |
| `wrangler d1 execute --remote` falha transitoriamente | chunks de 300 statements e log retomável, como já é |
| Apontar o coldigui e descobrir kind/nome errado em produção | o site permite anotar kind/tag junto da decisão; `is_reviewed = 0` em tudo que foi importado |

## 11. Fora de escopo

- Fusão de praises coletânea × arranjo PES (D5) e as duplicatas do coldigom
  que o cruzamento revelou (Fase 7).
- Reclassificar kinds existentes do coldigom (Fase 2), mesmo quando o hash
  mostra `Choir` onde o PLPCG diz `Partitura`.
- Comparação por conteúdo/OCR (D1).
- Mudanças no coldigui e no plpcjf (repos próprios) — este spec entrega a API;
  a troca de fonte é uma tarefa lá, citada no §8.3 como critério de pronto.
- Migrar listas/favoritos de usuários do PLPCG.

## 12. Como se sabe que acabou

- `SELECT COUNT(*) FROM plpcg_crosswalk` = número de linhas em `louvores` do
  PLPCG na exportação final, e toda `praise_material_id` existe.
- Zero entradas em `decisoes.jsonl` sem aplicação correspondente no
  `apply_log`.
- `GET /api/plpcg/manifest` devolve tantas entradas quanto o manifest do PLPCG
  e o coldigui roda em modo único.
- `gabaritos/plpcg_crosswalk/` tem: exportação final do PLPCG, decisões, gabarito
  cego com métrica, `execucao/` de cada `run_id`.

## 13. Como este spec vira plano

Um plano por fase (A → D), cada um executável em sessão própria com
`superpowers:executing-plans`. A fase A começa com o detector reproduzindo os
números do §2.3; a B só abre depois que o dono viu o site com dados reais e
apontou a primeira leva de padrões (D7).
