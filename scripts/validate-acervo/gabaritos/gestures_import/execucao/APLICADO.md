# Import de gestos CIAs — 2026-09-15T0330Z-gestures-import

Aplicado em produção (D1 `coldigom` remoto + R2 `coldigom-assets`) em 2026-09-15T03:43Z, sessão https://claude.ai/code/session_01Aq3JSaYD81hmB6n4pQU9Cy.

## Origem
- Export: `pdf_extractor/export/gestures/` gerado por `scripts/export_gestures_json.py` (pdf_extractor branch `feat/export-gestures-json`, commit d3088fd): 207 gestos, 207 figuras, 466 documentos válidos. 3 `.txt` barrados (2× "241 - EXALTAI EXALTAI" só com título; 1 gesto sem letra em bb38b7e8…/bc167329…).
- Importador: `api/scripts/import_gestures.ts --full` (SQL em `import_gestures.sql`, log em `import_full.log`).

## Passo 1 — import (--full)
Dicionário: 207 criados (versão 0 → 1). Documentos: 398 linhas criadas, 68 preenchidas (mesmo id do .txt). R2: 207 PNG em `storage/assets/cia/gestures/`, 466 JSON em `storage/assets/praises/{pid}/{mid}.gestures`. `gesture_usage`: 3645 linhas.

## Passo 2 — exclusão das 186 cascas (`exclusao.sql`, undo em `exclusao_undo.sql`)
As 254 linhas `gestures` antigas não tinham objeto no R2 (conferido com HEAD em `storage/<r2_key>`, antes e depois). 68 casavam por id com o export e foram preenchidas; 186 tinham ids que o pdf_extractor não conhece mais (acervo regenerado com ids novos) — todas em louvores que receberam o material novo. Guardas: 0 usos em `gesture_usage`, 186 = linhas gestures sem uso. Apagadas: 186 linhas (`changes: 187`).

## Estado final (`guard_final.json`)
{'dic': 207, 'versao': 1, 'usos': 3645, 'materiais': 466, 'revisados': 0, 'total_materiais': 21223, 'louvores': 1690}

## Pendente
- `is_reviewed`: o importador não usa `meta.validated` (o spec do coldigom não trouxe essa regra do prompt do pdf_extractor). 254 documentos vieram com `validated: true` e estão com `is_reviewed = 0`. Decisão do dono.

## Passo 3 — is_reviewed dos 254 validados (`revisados.sql`, undo em `revisados_undo.sql`)
Dono confirmou em 2026-09-15 que os 254 `validated: true` do pdf_extractor estão devidamente validados. Marca `is_reviewed = 1`, `reviewed_by` = o dono (mesma convenção das cifras), `reviewed_at = 2026-09-15T04:10:07Z` (data da marcação; a validação original não tem data registrada). Guarda antes: 0 materiais `gestures` revisados. Execução: pelo dono, à mão.
