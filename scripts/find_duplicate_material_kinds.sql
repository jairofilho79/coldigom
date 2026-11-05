-- Script SQL para identificar louvores com tipos e formatos de material duplicados
-- Agrupa por (praise_id, material_kind, type) para evitar falsos positivos
-- (ex: coexistência aceita de 1 PDF + 1 ChordPro/chord em Cifra I ou 1 JSON + 1 YouTube em Gestos).
--
-- Retorna praise_id, praise_name, praise_tags, material_kind_id, material_type, link direto do Coldigom e explicação.
--
-- Como executar no Cloudflare D1:
--   wrangler d1 execute coldigom --remote --file=scripts/find_duplicate_material_kinds.sql
-- Ou filtrando apenas Sheet Music:
--   wrangler d1 execute coldigom --remote --command="... WHERE mk.name = 'Sheet Music' ..."

WITH duplicate_materials AS (
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
  dm.material_type;
