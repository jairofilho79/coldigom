# Gestos CIAs (.txt) atribuídos ao louvor errado — multilouvor

Aplicado em produção (D1 `coldigom` remoto + R2 `coldigom-assets`) em 2026-09-15, sessão desta conversa.

## Origem do problema

O dono percebeu no v2.plpcg.com que o louvor 100 "Cristo sente seu amor por mim" mostrava
3 gestos, sendo 2 deles pertencentes aos louvores 98 e 99. Raiz confirmada em
`pdf_extractor/gesture_manager/split_gesture_txts.py`: ao dividir um `.txt` de gestos com
vários louvores (`# título` múltiplos, herança de PDF multilouvor) em um arquivo por
música, o script grava as N fatias resultantes como N materiais `type: gestures` do
**mesmo** `praise_id` de onde partiu, em vez de rotear cada fatia para o louvor do seu
próprio título. O bug está na função `process_praise_dir` (itera por pasta de louvor,
nunca troca de `praise_id` ao criar os novos materiais).

## Levantamento

Script de varredura (não commitado, um-tiro): leu `assets/praises/*/metadata.yml`,
abriu o `.txt` de cada material `type: gestures`, extraiu o título embutido (linha
`# NN - TÍTULO`) e comparou com o nome/número do próprio louvor (normalizado, tolerando
prefixo `Avulso N -`, artigo inicial e título truncado por prefixo).

- 469 materiais `gestures` no acervo local; **217 atribuídos ao louvor errado** (~180 louvores afetados).
- Descartado por hash: nem todo "errado" é duplicata de outro documento — city por título.
- Cruzado com o catálogo completo de louvores (não só os que têm gestos) para achar a
  casa certa de cada material errado.

## Classificação final (`plano_final.json`)

- **213 materiais → excluir** (`exclusao.sql`, undo em `exclusao_undo.sql`): a casa certa
  de cada um já tinha o seu próprio gesto correto: nenhuma perda de conteúdo.
- **2 materiais → mover** (`mover.sql`, undo em `mover_undo.sql`; R2 copiado para a nova
  chave e a antiga apagada; `move_info.json` tem o detalhe):
  - `d86f070a…` ("221 - Vai raiar o dia") estava sob o louvor 222 (que não tinha gesto
    próprio) — mudou `praise_id`/`r2_key` para o louvor 221.
  - `179fa9bb…` ("247 - Jesus Voltará") estava sob o louvor "246 - Está chegando a hora"
    (que já tinha o seu próprio gesto correto). O achado interessante: o documento
    *certo* para "Jesus Voltará" no acervo local (`bc167329…`, sob `bb38b7e8…`) **nunca
    entrou em produção** — falhou validação no import de 2026-09-15 (gesto sem letra,
    já registrado em `gestures_import/execucao/import_full.log`). `179fa9bb…` é hoje a
    única cópia válida desse gesto em produção, por isso foi movido, não apagado.
- **2 materiais → só higiene do acervo local** (não existiam em produção; excluídos do
  export desde 2026-09-15 por falha de validação "241 - EXALTAI EXALTAI" só com título):
  `bc3e75e3…` e `910e1892…`.
- **2 materiais com título sem casa conhecida no catálogo** ("243 - Na batalha eu oro ao
  Senhor", sob os louvores "A vitória da igreja" e "Eu clamo, eu oro"): não existe louvor
  com esse nome/número no catálogo do coldigom — não é duplicata, é órfão. Removidos das
  duas casas erradas mesmo assim (claramente não pertencem a nenhuma delas); o conteúdo
  foi salvo em `scripts/validate-acervo/gabaritos/gestures_multilouvor/execucao/../..`
  (backup local do R2 antes de apagar) para o dono decidir depois se cria o louvor 243.

## Efeito colateral esperado

- Louvor "A vitória da igreja" (`123ab1f5…`) fica **sem nenhum gesto** depois do fix —
  tinha 3 materiais, todos emprestados de outros louvores (241/242/243), nenhum seu.
  Não é regressão: antes mostrava gestos errados, agora não mostra nenhum até alguém
  catalogar o gesto certo desse louvor.

## Passos executados

1. `exclusao.sql` — D1 remoto: apagou 213 `praise_materials` (+ 1513 `gesture_usage`).
2. `mover.sql` — D1 remoto: `UPDATE` de `praise_id`/`r2_key` nos 2 materiais movidos.
3. R2: baixado+reenviado o objeto de cada material movido para a chave nova, conferido
   byte-a-byte, e só então apagada a chave antiga.
4. R2: backup local dos 213 objetos apagados (`r2_backup/`, fora do worktree — não
   commitado) e então `wrangler r2 object delete` de cada um.
5. Acervo local (`pdf_extractor/assets/praises/*/metadata.yml`, fora do git — apenas
   backup local em `metadata_backup/`): removidas as 213+2 entradas erradas, movidas as
   2 entradas certas (metadata + `.txt` + `.gesture_match.json` físicos) para a pasta do
   louvor certo.

## Estado final (`guard_final.json`)

Ver arquivo ao lado.

## Não mexido

Nenhum material `type: pdf`/`chord` (inclusive "Gestos CIAs" em PDF) foi tocado — só
`type: gestures` (o `.txt` extraído).
