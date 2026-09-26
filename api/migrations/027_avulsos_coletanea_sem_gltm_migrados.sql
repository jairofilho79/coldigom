-- 027: praise com Avulsos E Coletânea (raiz ou subtag) perde as tags raiz GLTM e Migrados;
-- Avulsos e a seção da Coletânea ficam (decisão do dono em 2026-09-26). 20 ligações em
-- 2026-09-26, 9 delas de praises com PES que a 026 também limpa (ordem indiferente).
-- Backup e SQL de volta em scripts/validate-acervo/gabaritos/tags_pes/ (antes_027.json, desfazer_027.sql).
-- Aplicar: wrangler d1 execute coldigom --remote --file=migrations/027_avulsos_coletanea_sem_gltm_migrados.sql
DELETE FROM praise_tags
WHERE tag_id IN (SELECT id FROM tags WHERE parent_id IS NULL AND name IN ('GLTM', 'Migrados'))
AND praise_id IN (
    SELECT pt.praise_id FROM praise_tags pt JOIN tags t ON t.id = pt.tag_id LEFT JOIN tags p ON p.id = t.parent_id
    WHERE COALESCE(p.name, t.name) = 'Avulsos'
)
AND praise_id IN (
    SELECT pt.praise_id FROM praise_tags pt JOIN tags t ON t.id = pt.tag_id LEFT JOIN tags p ON p.id = t.parent_id
    WHERE COALESCE(p.name, t.name) = 'Coletânea'
);
