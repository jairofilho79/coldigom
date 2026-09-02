# Validação do acervo de louvores — design

Data: 2026-09-02 · Estado: proposta aprovada em conversa, aguardando revisão do spec

## 1. O problema

O acervo tem 1.696 louvores e 20.862 materiais, quase todos ingeridos em lote e
pouquíssimos validados. O dono listou seis problemas; a medição encontrou um
sétimo, maior que quase todos os outros.

O objetivo não é "rodar um script e consertar". É **construir e treinar um
detector por problema**, medir a precisão de cada um contra gabarito rotulado às
cegas, e só então soltar no acervo — o mesmo caminho que deu certo no
`scripts/pdf-to-chordpro/`.

## 2. Inventário medido (D1 remoto + árvore local, 2026-09-02)

1.696 louvores · 20.862 materiais · 104 material kinds.

Materiais por `type`: pdf 11.166 · mp3 6.638 · chord 2.271 · youtube 402 ·
gestures 254 · midi 126 · outros 5.

| Fase | Problema | Volume medido |
|---|---|---|
| 1 | Louvores cujo único material é YouTube | 25 louvores (11 sem letra) |
| 2 | Kind de PDF errado | 11.085 PDFs a verificar; ~94 divergências CSV↔banco |
| 3A | Material duplicado dentro do mesmo louvor | 1.068 grupos byte-idênticos |
| 3B | Material idêntico entre louvores | 1.911 grupos → decompostos na seção 7.4 |
| 3C | Mesmo conteúdo, hash diferente | a medir |
| 4 | Metadados ausentes | 484 sem número · 593 sem autor · 547 sem ritmo · 540 sem tom · 524 sem categoria |
| 5a | Letra ausente, com `.chord` ou Cifra | ~50 louvores |
| 5b | Letra ausente, com `Coro` | 268 louvores |
| 6 | Kind/louvor de áudio errado | 6 divergências CSV↔banco; resto só o sinal acústico decide |
| **7** | **Louvores duplicados** | **39 pares com ≥80% do acervo compartilhado byte-a-byte** |

Excedente removível na Fase 3 (byte-a-byte, já provado): **3.732 materiais**.

### 2.1 A descoberta que reorganizou o plano

Existe em `/Volumes/SSD 2TB SD/assets2` a árvore de pastas original que originou a
ingestão: 18.317 arquivos, 26 GB, mais o `files_classification.csv` (18.160
linhas) com a coluna **`praise_material_id`** — o mesmo UUID que está no D1.

Isso dá uma testemunha independente (nome original, pasta original, kind chutado
na classificação) para **17.810 dos 20.862 materiais**. Os 3.052 que não casam
são justamente os que nasceram depois da árvore: 2.271 `chord` (gerados pelo
pipeline de cifras), 402 `youtube`, 254 `gestures`, mais 125 órfãos a investigar.

Sem essa árvore, as Fases 2, 3 e 6 seriam análise cega de conteúdo. Com ela,
viram confronto entre testemunhas.

### 2.2 Fatos medidos que viraram regra

- **Nome do arquivo > pasta.** Em 15 casos o `praise_id` do banco diverge do CSV
  sem ser merge; em todos, o banco está certo e a pasta errada
  (`Avulsos Diversos/Se Eu Orar/Madeiras/Lugar da Oração - Alto Saxophone.pdf`).
- **O CSV não é gabarito.** Ele mesmo chutou a partir do nome do arquivo. É uma
  testemunha como as outras.
- **Os áudios já estão certos.** 6.592 de 6.598 kinds de mp3 são idênticos entre
  CSV e banco. A Fase 6 é muito menor do que parecia.
- **Divergência de PDF é quase toda refinamento deliberado.** 2.065 das 2.159
  divergências CSV↔banco são `Chord Chart → Chord Chart I/II`.
- **`group_id` está morto.** 8 de 1.696 louvores usam a feature de relacionar.

## 3. Decisões fixadas pelo dono

| # | Decisão |
|---|---|
| D1 | **Híbrido por confiança**: alta aplica direto com log reversível; média e baixa vão para fila de revisão no web |
| D2 | **Letra manda, nome confirma** no casamento de louvores |
| D3 | Na fusão, **o keeper manda; a fonte só preenche campo vazio** |
| D4 | Genérico→específico **é erro a corrigir** (`Clarinete` → `Clarinete em Si bemol` quando o PDF diz) |
| D5 | Duplicata confirmada: **sobrevive o melhor, o resto é apagado** |
| D6 | **Só `Partitura` e `Coro` têm autoridade sobre metadados.** `Grade` entra em último caso, com prioridade menor — arquivo denso, alto risco de atrapalhar. Instrumento transpositor nunca |
| D7 | Letra de `Coro` entra, mas como **sub-fase separada** (5b), com treino próprio |
| D8 | Áudio sem nome original: **sinal acústico determinístico**, não ASR |
| D9 | **Rotulagem cega**: o dono rotula ~50 casos sem ver a saída do agente; o agente é medido contra isso |
| D10 | Portão de promoção: **precisão ≥ 98% na faixa alta**, com **zero erro destrutivo** na amostra |
| D11 | **Coletânea (ICM 2018) vs PES (arranjos novos) são o mesmo louvor em arranjos diferentes.** Relacionam por `group_id`, **nunca fundem** |

## 4. Arquitetura

`scripts/validate-acervo/`, em Python, espelhando `scripts/pdf-to-chordpro/geom/`.

```
scripts/validate-acervo/
  core/
    snapshot.py      espelho do D1 + índice da árvore local (hash, tamanho, nome, pasta)
    reconcile.py     material_id → arquivo local, em três passes
    findings.py      leitura/escrita de findings.jsonl, id determinístico
    gold.py          sorteio estratificado, rotulagem cega, métrica por faixa
    apply.py         dry-run por padrão, --execute, apply_log.jsonl, --undo <run_id>
    queue.py         empurra média/baixa para validation_findings no D1
  detectors/
    youtube_merge.py     Fase 1
    praise_dup.py        Fase 7
    material_dup.py      Fases 3A / 3B / 3C
    pdf_kind.py          Fase 2
    metadata.py          Fase 4
    lyrics_chord.py      Fase 5a
    lyrics_choir.py      Fase 5b
    audio_kind.py        Fase 6
  out/
```

O núcleo é escrito uma vez e serve as oito fases. Cada fase é um detector novo
que consome o snapshot e produz `findings.jsonl`. Nenhum detector escreve no
acervo: quem escreve é `apply.py`.

Fora de escopo: `scripts/pdf-to-chordpro/`, `migration/`, `storage/` — mas o
`geom/` é **reusado como biblioteca** pelas Fases 2 e 5a (separação de acorde e
letra pela tinta vermelha, extração de texto com bbox).

## 5. O contrato do finding

```jsonc
{
  "finding_id": "sha1(detector|target_id|field)",  // rodar de novo não duplica
  "run_id":     "2026-09-02T00:31Z-material_dup",
  "detector":   "material_dup",
  "target":     { "type": "material", "id": "<uuid>", "praise_id": "<uuid>" },
  "action":     "delete_material",
  "field":      null,
  "current":    null,
  "proposed":   null,
  "confidence": "alta",
  "evidence":   { "md5": "...", "sobrevivente": "<uuid>",
                  "motivo_sobrevivencia": "is_reviewed=1",
                  "arquivo_local": "Coletânea /092 - Pai celeste/Midi.mp3" }
}
```

Ações possíveis: `delete_material` · `set_material_kind` · `set_praise_field` ·
`merge_praise` · `set_group_id` · `move_material`.

### 5.1 Faixas de confiança — regra única para as oito fases

| Faixa | Definição | Destino |
|---|---|---|
| **alta** | duas testemunhas independentes concordam, nenhuma discorda | aplica direto, com log reversível |
| **média** | uma testemunha forte, nenhuma discordando | fila de revisão |
| **baixa** | testemunhas discordam, ou só heurística | fila de revisão, no fim |

Toda testemunha é nomeada na evidência: hash do arquivo, nome original, pasta
original, CSV de classificação, texto impresso no PDF, sinal acústico, letra do
acervo, tags do louvor.

### 5.2 Portão de promoção

Uma faixa só vira "aplica direto" depois de:

1. sorteio estratificado de ~50 casos daquele detector, por faixa;
2. o dono rotula **sem ver** a saída do detector;
3. o detector roda cego e reporta precisão por faixa;
4. promove só se **precisão ≥ 98% na faixa alta** e **zero erro destrutivo**
   (`delete_material`, `merge_praise`) na amostra.

Não bateu, a faixa inteira desce para a fila.

### 5.3 Reversão

`apply_log.jsonl` grava a linha completa de antes de cada escrita.
`--undo <run_id>` reconstitui.

`DELETE /api/materials/:id` **apaga o objeto do R2 junto, sem lixeira**
(`api/src/routes/materials.ts:324`). Isso só é aceitável porque:
o sobrevivente é byte-a-byte idêntico e continua no acervo, e a árvore local
`assets2` guarda o original. Desfazer é re-upload + re-insert a partir do log.
**Requisito**: a Fase 3 nunca apaga material cujo sobrevivente não esteja
confirmado presente no acervo depois da escrita.

## 6. Fila de revisão

Migração `017_validation_findings.sql`:

```sql
CREATE TABLE validation_findings (
  id             TEXT PRIMARY KEY,        -- finding_id determinístico
  run_id         TEXT NOT NULL,
  detector       TEXT NOT NULL,
  target_type    TEXT NOT NULL,           -- material | praise
  target_id      TEXT NOT NULL,
  praise_id      TEXT,                    -- para agrupar na tela
  action         TEXT NOT NULL,
  field          TEXT,
  current_value  TEXT,
  proposed_value TEXT,
  confidence     TEXT NOT NULL,           -- alta | media | baixa
  evidence       TEXT NOT NULL,           -- JSON
  status         TEXT NOT NULL DEFAULT 'pendente',  -- pendente|aprovado|rejeitado|aplicado
  decided_at     TEXT,
  decided_by     TEXT,
  decision_note  TEXT,
  created_at     TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_vf_status_conf ON validation_findings(status, confidence);
CREATE INDEX idx_vf_detector ON validation_findings(detector);
CREATE INDEX idx_vf_praise ON validation_findings(praise_id);
```

API: `GET /api/validation/findings` (filtro por detector, faixa, status),
`PATCH /api/validation/findings/:id` (aprovar/rejeitar com nota),
`POST /api/validation/findings/bulk` (decisão em lote).

Tela nova no web, agrupada por detector, com a evidência renderizada — para PDF,
os dois arquivos lado a lado; para áudio, os dois players; para metadado, as duas
fontes. **A rejeição é o dado de treino**: `decision_note` volta para o detector.

Isso respeita o critério já fixado do Coldigom: é ferramenta de gestão, densidade
de informação e CRUD ganham de conforto de leitura.

## 7. As fases

Ordem de execução:

> **0** → **1** → **7** → **3A** → **3C** → **2** → **4** → **5a** → **5b** → **6**

A ordem é deliberada: fundir louvores duplicados **antes** de caçar material
duplicado converte evidência fraca (entre louvores) em evidência dura (dentro do
louvor); e validar kind ou extrair metadado de arquivo duplicado é trabalho
jogado fora.

### 7.1 Fase 0 — Reconciliação

Não escreve nada no acervo. Constrói `out/reconciliation.sqlite`: para cada
material, o arquivo local, md5, tamanho, nome original, pasta original, kind do
CSV, praise do CSV.

Três passes de casamento:
1. `praise_material_id` do CSV — 17.810 confirmados;
2. `file_path_legacy` normalizado — para os que o CSV não cobre;
3. hash do objeto no R2 contra hash local — para os 125 órfãos.

Entrega: relatório de cobertura e lista do que ficou sem origem recuperável.

**Critério de pronto**: cobertura ≥ 99% dos materiais que têm arquivo (isto é,
excluindo `chord`, `youtube` e `gestures`, que nasceram depois da árvore).

### 7.2 Fase 1 — Louvores só-YouTube (25)

Ação: `merge_praise`. É o **treino da Fase 7** — mesma ação, mesma API, 25 casos
baratos e reversíveis.

Testemunhas: letra normalizada (trecho contíguo em comum, sem acento nem
pontuação) e nome normalizado (**mantendo o conteúdo dos parênteses** no saco de
palavras — descartá-lo foi um erro que a exploração pegou).

- **alta**: as duas testemunhas apontam o mesmo alvo → funde. Keeper é o louvor
  do acervo. Metadados por D3. Tags em união. O link do YouTube migra.
- **média**: só o nome, sem letra para comparar (11 casos). Antes de rebaixar,
  tenta extrair a letra da descrição do vídeo.
- **baixa / sem candidato**: louvor legítimo novo. Reporta e não toca.

### 7.3 Fase 7 — Louvores duplicados

**Três desfechos, não dois** — é a fase de maior risco.

| Desfecho | Quando | Ação |
|---|---|---|
| Duplicata | as **partes** (instrumentos e vozes) são byte-idênticas | `merge_praise` |
| Arranjos distintos | as partes existem nos dois e são **diferentes** | `set_group_id` — relaciona, **nunca funde** (D11) |
| Nada | evidência insuficiente | reporta |

**O discriminador**, medido e validado: compare só as partes instrumentais e
vocais, **ignorando `Chord Chart*`, `Lyrics`, `Audio` e `Gestures`** — que são
derivados ou avulsos e caem numa cópia só. Nos 39 pares fortes medidos, o
não-compartilhado é sempre `Chord Chart I/II` + `Sheet Music` (arquivos que o
pipeline de cifras gerou depois, em uma das cópias) e `Audio` avulso; as partes
estão 100% compartilhadas. Logo, são duplicatas — não arranjos.

Volume: 39 pares com ≥80% de cobertura; ~68 com nome idêntico em qualquer
cobertura. `Regozijai-vos` está cadastrado três vezes. Sete pares têm o **mesmo
nome e o mesmo número de coletânea** (413, 199, 042, 649, 510, 609, 477).

Risco explícito: `Coletânea` vs `Coletânea+PES` é o padrão dominante nos pares.
Toda fusão dessa fase passa pela fila, mesmo em faixa alta, até o portão da
seção 5.2 ser batido com amostra rotulada às cegas.

### 7.4 Fase 3 — Materiais duplicados

Decomposição medida dos 2.979 grupos byte-idênticos:

| Camada | Evidência | Volume | Ação |
|---|---|---|---|
| **3A** | md5 idêntico, **mesmo louvor** | 1.068 grupos | alta → apaga o perdedor |
| **3B-legítimo** | kind compartilhável (`Chord Chart I/II`, `CIAs Gestures`, `Lyrics`) em louvores sem relação | **829 grupos** | **nunca é finding** — um PDF de cifra contém vários louvores na mesma folha |
| **3B-louvor** | nomes de louvor relacionados | 1.011 grupos | vai para a **Fase 7**, não é duplicata de material |
| **3B-resíduo** | parte instrumental/vocal em louvores sem relação | ~71 grupos, menos depois de corrigir a normalização de parênteses | média → fila. É o problema "material no louvor errado" |
| **3C** | mesmo conteúdo, **hash diferente** (escaneado por outra pessoa) | a medir | média/baixa → fila, **nunca apaga** |

Hipótese testada e **rejeitada**: `group_id` compartilhado como sinal de
duplicata — 6 grupos em 1.911.

Sobrevivência na camada 3A, ordem determinística:
`is_reviewed=1` > tem `file_path_legacy` > `created_at` mais antigo > menor `id`.

Detecção da camada 3C: para PDF, texto extraído normalizado + número de páginas +
assinatura de layout; para áudio, duração + fingerprint acústico. `Áudio` com até
10 no mesmo louvor pode ser gravação legítima diferente — por isso 3C nunca apaga
sozinha.

### 7.5 Fase 2 — Kind dos PDFs (11.085)

Três testemunhas:
1. **nome original** do arquivo (`- Alto Sax.pdf`, `Cifra I.pdf`, `Partitura.pdf`) —
   léxico nome→kind construído do próprio acervo;
2. **texto impresso no PDF**: cabeçalho da primeira pauta (`Flute`,
   `Clarinet in Bb`, `Violino I`), contagem de pautas, presença de letra sob as
   pautas, presença de tinta vermelha — reusa `geom/`;
3. **kind do CSV**.

- **alta**: nome e PDF concordam entre si e discordam do banco → aplica.
- **média**: só uma testemunha, ou nome ausente/genérico.
- **baixa**: nome e PDF discordam.

Por D4, genérico→específico conta como erro a corrigir.

### 7.6 Fase 4 — Metadados

Fonte, em ordem de autoridade: **`Partitura` > `Coro` > `Grade`**. `Grade` só
quando não houver nenhum dos dois primeiros, e com prioridade menor — é arquivo
denso e a chance de atrapalhar é alta (D6). Instrumento transpositor nunca.

Campos: `tonality` (armadura de clave da primeira pauta, só em concert pitch),
`author` e `number` (tipografia de cabeçalho), `rhythm`.

- campo vazio no banco + valor extraído → **alta**, aplica;
- campo preenchido divergente → **fila**, com as duas fontes lado a lado;
- 74 louvores não têm `Partitura` nem `Coro` → fora de escopo desta fase.

### 7.7 Fase 5a — Letra de `.chord` e Cifra (~50)

- `.chord` existe: remove `[acordes]` e diretivas do ChordPro, sobra a letra.
  Determinístico → **alta**.
- só Cifra PDF: o `geom/` já separa acorde de letra pela tinta vermelha; a faixa
  vem do `verify.json` dele.

### 7.8 Fase 5b — Letra de `Coro` (268)

Remontar sílabas hifenizadas sob as pautas e descartar a repetição entre as
quatro vozes. Verificação cruzada contra `.chord` ou letra conhecida quando
houver. Nasce toda em **média**. É a fase que mais precisa de treino (D7).

### 7.9 Fase 6 — Áudio

As 6 divergências CSV↔banco são triviais. O trabalho real é onde CSV **e** banco
concordam e os dois estão errados — aí a única testemunha independente é o som.

- **kind**: histograma de F0 separa soprano/contralto/tenor/baixo por tessitura;
  ausência de formantes separa MIDI de voz humana; detecção de voz separa
  playback de cantada.
- **louvor correto**: contorno de F0 do áudio contra o MIDI do próprio louvor
  (126 `.midi` + os mp3 de MIDI por naipe).

Sem ASR (D8).

## 8. Riscos

| Risco | Mitigação |
|---|---|
| Fundir arranjos distintos como duplicata | Discriminador da 7.3 + toda fusão pela fila até o portão ser batido |
| Apagar material que não é duplicata | Só byte-a-byte idêntico apaga; 3C nunca apaga; árvore local é rede de segurança |
| `DELETE` remove do R2 sem lixeira | Log com `r2_key` + caminho local; sobrevivente confirmado presente antes de apagar |
| CSV tratado como gabarito | Fixado na 5.1: é testemunha, não verdade |
| Normalização de nome perdendo parênteses | Corrigido; `Quão grande amor (Vigiai)` vs `Vigiai (Quão grande amor)` foi o caso que pegou |
| Gabarito enviesado | Rotulagem cega (D9), o dono não vê a saída do detector antes de decidir |

## 9. Fora de escopo

- Podar o vocabulário de 104 material kinds (pares genérico/específico ficam;
  D4 resolve caso a caso).
- Os 74 louvores sem `Partitura` nem `Coro` na Fase 4.
- Os 19 louvores sem nenhuma fonte de letra na Fase 5.
- ASR de áudio.

## 10. Como se sabe que acabou

Por fase: gabarito rotulado, precisão medida por faixa, faixa alta aplicada com
log, faixas média e baixa na fila com volume conhecido. O relatório final de cada
fase diz quantos foram aplicados, quantos foram para a fila, quantos ficaram sem
veredito e por quê.

## 11. Como este spec vira plano

Oito fases não cabem num plano de implementação só. A decomposição em planos:

| Plano | Conteúdo | Por que agrupado assim |
|---|---|---|
| **P1** | Fase 0 + núcleo (`snapshot`, `reconcile`, `findings`, `apply`, `gold`) + Fase 1 | O núcleo só se prova construindo um detector de ponta a ponta. A Fase 1 é o menor (25 casos), o mais reversível e o que exercita a ação mais perigosa (`merge_praise`). Sai daqui o primeiro número de precisão real |
| **P2** | Fila de revisão: migração `017`, endpoints, tela no web | Só faz sentido depois que P1 produzir findings de verdade para a tela mostrar |
| **P3** | Fase 7 + Fase 3 (A, B, C) | Mesma máquina de fusão da Fase 1, agora com o discriminador arranjo-vs-duplicata; e a Fase 3 depende da 7 ter rodado |
| **P4** | Fase 2 | Depende do `geom/` como biblioteca |
| **P5** | Fase 4 + 5a | Compartilham a leitura de `Partitura`/`Coro`/Cifra |
| **P6** | Fase 5b | Treino próprio, por D7 |
| **P7** | Fase 6 | Independente das outras; menor volume conhecido |

Cada plano tem seu próprio ciclo de gabarito e portão. **O próximo passo é
escrever o P1** — os outros só depois que o P1 der um número.
