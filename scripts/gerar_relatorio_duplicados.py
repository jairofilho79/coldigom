import json
from collections import Counter
import os

with open('/tmp/dups_round2.json') as f:
    all_data = json.load(f)[0]['results']

praises_set = set(r['praise_id'] for r in all_data)
kind_counter = Counter(f"{r['material_kind_label']} ({r['material_kind_name']}) [{r['material_type']}]" for r in all_data)

choir = [r for r in all_data if r['material_kind_name'] == 'Choir' and r['material_type'] == 'pdf']
audio = [r for r in all_data if r['material_kind_name'] == 'Audio' and r['material_type'] == 'mp3']
chords_scores = [r for r in all_data if 'Chord' in r['material_kind_name'] or r['material_kind_name'] == 'Score']
voices = [r for r in all_data if 'Voice' in r['material_kind_name'] or 'MIDI' in r['material_kind_name']]
instruments = [r for r in all_data if r not in choir and r not in audio and r not in chords_scores and r not in voices]

def format_table(rows, include_type=False):
    table_lines = []
    if include_type:
        table_lines.append('| Nº | Louvor | Tipo | Formato | Tags | Material Kind ID | Link Coldigom | Explicação da Duplicata | Praise ID |')
        table_lines.append('| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |')
    else:
        table_lines.append('| Nº | Louvor | Tags | Formato | Material Kind ID | Link Coldigom | Explicação da Duplicata | Praise ID |')
        table_lines.append('| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |')

    for r in rows:
        num = r['praise_number'] or '-'
        name = r['praise_name'].replace('|', '/')
        tags = r['praise_tags'] or '-'
        m_type = r['material_type']
        mk_id = r['material_kind_id']
        url = r['coldigom_url']
        exp = r['explanation'].replace('|', '/')
        p_id = r['praise_id']
        kind = f"{r['material_kind_label']} (`{r['material_kind_name']}`)"

        if include_type:
            table_lines.append(f"| {num} | **{name}** | {kind} | `{m_type}` | {tags} | `{mk_id}` | [Abrir no Coldigom ↗]({url}) | {exp} | `{p_id}` |")
        else:
            table_lines.append(f"| {num} | **{name}** | {tags} | `{m_type}` | `{mk_id}` | [Abrir no Coldigom ↗]({url}) | {exp} | `{p_id}` |")
    return table_lines

lines = []
lines.append('# Relatório de Louvores com Materiais Duplicados no Coldigom — Rodada 2')
lines.append('')
lines.append('> [!IMPORTANT]')
lines.append('> **Progresso da Rodada 1 para a Rodada 2:**')
lines.append('> - **Partituras (`Sheet Music` [pdf]):** Você **zerou 100% das duplicatas**! (De 204 para **0**). 🎉')
lines.append(f'> - **Total de Louvores com Duplicata:** Caiu de 750 para **{len(praises_set)} louvores** (-200 louvores totalmente limpos).')
lines.append(f'> - **Ocorrências Restantes:** De 2.139 para **{len(all_data)} ocorrências** (-344 duplicatas resolvidas).')
lines.append('')
lines.append('Este relatório traz a lista completa de todas as duplicatas restantes no acervo Cloudflare D1, organizadas por categoria para facilitar a resolução.')
lines.append('')
lines.append('---')
lines.append('')
lines.append('## Sumário das Categorias Restantes')
lines.append('')
lines.append('| Categoria | Formato Principal | Quantidade | Seção |')
lines.append('| :--- | :--- | :--- | :--- |')
lines.append(f'| **Coro** (`Choir`) | `pdf` | {len(choir)} | [Ver Seção 1](#1-coro-choir-pdf) |')
lines.append(f'| **Áudio** (`Audio`) | `mp3` | {len(audio)} | [Ver Seção 2](#2-áudio-audio-mp3) |')
lines.append(f'| **Cifras e Grades** (`Chord Chart`, `Score`) | `pdf` / `chord` | {len(chords_scores)} | [Ver Seção 3](#3-cifras-e-grades-chord-chart-score) |')
lines.append(f'| **Vozes e Ensaio** (`Voice`, `MIDI`) | `mp3` | {len(voices)} | [Ver Seção 4](#4-vozes-e-ensaios-voice-midi) |')
lines.append(f'| **Instrumentos** (Madeiras, Metais, Cordas...) | `pdf` | {len(instruments)} | [Ver Seção 5](#5-instrumentos-de-orquestra-e-banda-pdf) |')
lines.append('')
lines.append('---')
lines.append('')
lines.append(f'## 1. Coro (`Choir` [pdf]) — {len(choir)} ocorrências')
lines.append('')
lines.extend(format_table(choir, include_type=False))
lines.append('')
lines.append('---')
lines.append('')
lines.append(f'## 2. Áudio (`Audio` [mp3]) — {len(audio)} ocorrências')
lines.append('')
lines.extend(format_table(audio, include_type=False))
lines.append('')
lines.append('---')
lines.append('')
lines.append(f'## 3. Cifras e Grades (`Chord Chart`, `Score`) — {len(chords_scores)} ocorrências')
lines.append('')
lines.extend(format_table(chords_scores, include_type=True))
lines.append('')
lines.append('---')
lines.append('')
lines.append(f'## 4. Vozes e Ensaios (`Voice`, `MIDI`) — {len(voices)} ocorrências')
lines.append('')
lines.extend(format_table(voices, include_type=True))
lines.append('')
lines.append('---')
lines.append('')
lines.append(f'## 5. Instrumentos de Orquestra e Banda [pdf] — {len(instruments)} ocorrências')
lines.append('')
lines.extend(format_table(instruments, include_type=True))
lines.append('')
lines.append('---')
lines.append('')
lines.append('## 6. Consulta SQL de Verificação')
lines.append('')
lines.append('```sql')
lines.append("""WITH duplicate_materials AS (
  SELECT 
    pm.praise_id,
    pm.material_kind AS material_kind_id,
    pm.type AS material_type,
    COUNT(*) AS duplicate_count,
    MIN(pm.id) AS target_material_id,
    GROUP_CONCAT(pm.id, '; ') AS material_ids
  FROM praise_materials pm
  GROUP BY pm.praise_id, pm.material_kind, pm.type
  HAVING COUNT(*) > 1
),
praise_tags_agg AS (
  SELECT 
    pt.praise_id,
    GROUP_CONCAT(t.name, ', ') AS praise_tags
  FROM praise_tags pt
  JOIN tags t ON t.id = pt.tag_id
  GROUP BY pt.praise_id
)
SELECT 
  p.id AS praise_id,
  p.name AS praise_name,
  COALESCE(p.number, '') AS praise_number,
  COALESCE(pta.praise_tags, '') AS praise_tags,
  dm.material_kind_id,
  COALESCE(mkt.label, mk.name) AS material_kind_label,
  mk.name AS material_kind_name,
  dm.material_type,
  dm.duplicate_count,
  'https://coldigom-web.pages.dev/praise/' || p.id || '?materialId=' || dm.target_material_id AS coldigom_url,
  'Duplicata detectada: O louvor possui ' || dm.duplicate_count || ' materiais do tipo "' || 
    COALESCE(mkt.label, mk.name) || '" (' || mk.name || ') com o mesmo formato/type "' || dm.material_type || 
    '". IDs dos materiais: ' || dm.material_ids AS explanation
FROM duplicate_materials dm
JOIN praises p ON p.id = dm.praise_id
JOIN material_kinds mk ON mk.id = dm.material_kind_id
LEFT JOIN material_kind_translations mkt ON mkt.material_kind_id = mk.id AND mkt.locale = 'pt-BR'
LEFT JOIN praise_tags_agg pta ON pta.praise_id = p.id
ORDER BY 
  CASE WHEN p.number IS NOT NULL AND p.number != '' THEN CAST(p.number AS INTEGER) ELSE 999999 END,
  p.name,
  material_kind_label,
  dm.material_type;""")
lines.append('```')

out_path = '/tmp/relatorio_materiais_duplicados_r2.md'
with open(out_path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines))

print('Relatorio gerado em:', out_path)
