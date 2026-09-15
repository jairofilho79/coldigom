# Correção pós-fix: "243 - Na batalha eu oro ao Senhor" é a "A vitória da igreja"

O dono confirmou que "A vitória da igreja" (`123ab1f5-5a0d-4aa8-bf80-2c0e20e916ac`) e
"243 - Na batalha eu oro ao Senhor" são o **mesmo louvor** — o nome de catálogo difere
da primeira linha da letra, o que a varredura por título não pegou (o `praise_lyrics`
do próprio `metadata.yml` já é a letra de "Na batalha...", só o `praise_name` é outro).

Ação: restaurado `e724a3b3-e3ee-4629-9d0b-ebea0f0d8c52` (a cópia `is_reviewed = 1`,
revisada pelo dono — havia duas cópias de "243", a outra sob "Eu clamo, eu oro"
(`ff07ee43…`, nunca revisada, hash diferente) permanece apagada) de volta para
`123ab1f5…`:

- D1: `restaura_243.sql` (undo em `restaura_243_undo.sql`) — reinsere a linha de
  `praise_materials` exatamente como estava antes da exclusão original (`exclusao.sql`)
  e as 7 linhas de `gesture_usage`.
- R2: reenviado `assets/praises/123ab1f5…/e724a3b3….gestures` a partir do backup local
  (`../r2_backup/e724a3b3….gestures`), nunca tinha sido apagado o `.txt` fonte no
  acervo (só a entrada do `metadata.yml`), então nada precisou ser restaurado lá além
  da entrada.
- Acervo local: `metadata.yml` de `123ab1f5…` ganhou de volta a entrada `type: gestures`
  de `e724a3b3…`.

Estado final: 253 → 254 materiais `gestures`, ainda 1:1 com 254 louvores distintos.

A outra pendência registrada em `APLICADO.md` ("241 - Exaltai Exaltai", nunca em
produção) continua sem casa conhecida — não faz parte deste louvor.
