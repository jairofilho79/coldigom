# PDF → ChordPro

```bash
# 1) inventário
python3 scripts/pdf-to-chordpro/inventory.py

# 2) piloto (~30) com debug OCR
python3 scripts/pdf-to-chordpro/batch.py --pilot 30

# 3) relatório
python3 scripts/pdf-to-chordpro/qa_report.py

# 4) acervo completo
python3 scripts/pdf-to-chordpro/batch.py --all --purge-legacy-txt

# 5) upload para D1
python3 scripts/pdf-to-chordpro/upload_raw.py
python3 scripts/pdf-to-chordpro/upload_raw.py --execute
```

Saída: `storage/chordpro_staging/<pdf_material_id>/*.chordpro`

UI: `/raw-chordPro`

## Fase 1 — catálogo

Quando existe `metadata_from_chords.yml` no louvor, a segmentação:

- usa número / título / lado (`left`/`right`) como âncoras
- preenche title, subtitle, key, rhythm, artist a partir do catálogo
- não cai no fallback “1 PDF = 1 louvor” se o catálogo tem vários hinos

```bash
python3 scripts/pdf-to-chordpro/batch.py --ids <material_id> --debug
```

## Fase 2 — amostragem estatística (95% CI)

Amostra estratificada (~355 louvores, ±5% @ 95% em N≈4553), seed=42. Sem upload.

```bash
python3 scripts/pdf-to-chordpro/phase2_sample.py --draw
python3 scripts/pdf-to-chordpro/phase2_sample.py --process    # batch --crops + AI ab (retomável)
python3 scripts/pdf-to-chordpro/phase2_sample.py --report     # taxa auto + Wilson CI + pacote humano
```

Saídas: `scripts/pdf-to-chordpro/out/phase2_sample.json`, `phase2_report.json`.

Revisão humana das 50 (local, sem RawChords/D1):

```bash
python3 scripts/pdf-to-chordpro/phase2_sample.py --review-ui
open scripts/pdf-to-chordpro/out/phase2_review.html
```

Marque OK / Precisa ajuste → baixe `phase2_verdicts.json` e envie no chat.

## Crop + re-OCR (pré-IA)

Com catálogo: pass-1 OCR acha âncoras → corta a coluna por louvor → OCR de novo no crop → ChordPro.

```bash
python3 scripts/pdf-to-chordpro/batch.py --ids <id> --debug --crops
# desligar: --no-crops
```

Também: gutter dinâmico (vale de tinta no meio da página).

## Fallback IA — Modo A + Modo B (Workers AI)

Pipeline local (sem upload):

1. **Modo A** (texto): `@cf/meta/llama-3.1-8b-instruct-fast` — OCR + ChordPro atual → body.
2. **Modo B** (visão): se A rejeitar, `@cf/google/gemma-4-26b-a4b-it` no PNG do crop (Workers AI, thinking off). Se ainda houver sílabas com hífen espaçado, um polish leve via Modo A.

Auth: `CLOUDFLARE_API_TOKEN` ou OAuth do `wrangler login`.  
Backup: `*.chordpro.bak`. Validação rejeita ABC, markdown, spam, stubs, densidade baixa e acordes inválidos — se A+B falham, mantém o ChordPro do script.

```bash
# após batch --crops --debug
# sem --force: só mexe no que a validação já considera ruim
python3 scripts/pdf-to-chordpro/ai_fallback.py --ids 41430fda --modes ab
python3 scripts/pdf-to-chordpro/sample_qa.py --ids 41430fda --all-files
# forçar todos: --force
# legado visão: COLDIGOM_AI_MODEL_B='@cf/meta/llama-3.2-11b-vision-instruct'
```

Binding no Worker (rota futura): `[ai] binding = "AI"` em `api/wrangler.toml`.

Requer: `tesseract` (lang `por`), PyMuPDF, Pillow, PyYAML, Wrangler logado (ou token CF).
