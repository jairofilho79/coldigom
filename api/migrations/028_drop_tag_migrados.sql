-- 028: a tag Migrados sai do app (decisão do dono em 2026-09-26). Ela só repetia Avulsos:
-- dos 193 praises que ainda a tinham, 185 já têm Avulsos; os outros 8 são GLTM + Migrados e
-- vão para a subtag Avulsos · GLTM na migração do GLTM, então não ganham Avulsos raiz aqui.
-- A origem (pasta «Avulsos Migrados» do PLPCG) continua no plpcg_crosswalk (pdf_id = caminho).
-- Backup e SQL de volta em scripts/validate-acervo/gabaritos/tags_pes/ (antes_028.json, desfazer_028.sql).
-- Aplicar: wrangler d1 execute coldigom --remote --file=migrations/028_drop_tag_migrados.sql
DELETE FROM praise_tags WHERE tag_id IN (SELECT id FROM tags WHERE name = 'Migrados' AND parent_id IS NULL);
DELETE FROM tags WHERE name = 'Migrados' AND parent_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM tags f WHERE f.parent_id = tags.id);
