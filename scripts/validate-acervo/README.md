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
```

`core.plpcg` precisa do `wrangler` logado e do repo irmão `dev/plpcg-admin`
(cwd `worker/`, onde vive o binding do `plpcg-catalog`); os PDFs vêm de
`dev/plpcjf/assets` e, o que não está lá, de `plpcg.com`. Ambos sobrescrevíveis
por `PLPCG_ADMIN_WORKER` e `PLPCJF_ASSETS`. O hash é incremental em
`out/hashes.sqlite` — arquivo trocado no disco com o mesmo caminho não é
recalculado; apague a linha para forçar.

A **faixa do cruzamento** (§5.1 do spec) vive em `evidence["faixa"]`; o
`confidence` do finding é o contrato do arnês, pelo mapa:

| faixa | confidence | action | quem decide |
|---|---|---|---|
| alta | alta | `link_plpcg` | o apply (depois do gabarito cego, Fase B) |
| media | media | `link_plpcg` | o site local |
| faltante | alta | `import_plpcg_material` | o apply (D4) |
| ambiguo | baixa | `link_plpcg` | o site local |
| sem_louvor (entrada) | media | `import_plpcg_material` | o site, ou o grupo abaixo |
| sem_louvor (grupo inteiro, `target_type = plpcg_grupo`) | alta | `create_praise_plpcg` | o apply (D4), depois da pré-visualização no site |

Nenhuma dessas ações escreve ainda: o `apply` as recusa nominalmente
("chega com a Fase C da migração PLPCG"). A tabela `plpcg_crosswalk`
(migração 019) já existe no D1, vazia.

**A ordem dos três passos é o portão de promoção (spec §5.2), não estilo.**
Simular, medir com o gabarito preenchido, e só então aplicar. `core.gold`
sai com código != 0 tanto quando a faixa alta erra quanto quando não há
veredito nenhum para medir — gabarito em branco não é gabarito zerado.

Testes: `python3 -m pytest tests/ -v`

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
