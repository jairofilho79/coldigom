-- 026: praise com a tag PES (raiz ou subtag) fica só com PES, subtags de PES e CIAs.
-- Saem Avulsos, Coletânea/*, GLTM e Migrados desses praises (289 ligações em 243 praises
-- em 2026-09-26). Só dados; as tags continuam existindo. Backup e SQL de volta em
-- scripts/validate-acervo/gabaritos/tags_pes/ (antes.json, desfazer.sql).
-- Aplicar: wrangler d1 execute coldigom --remote --file=migrations/026_pes_so_pes_e_cias.sql
DELETE FROM praise_tags
WHERE praise_id IN (
    SELECT pt.praise_id FROM praise_tags pt
    JOIN tags t ON t.id = pt.tag_id
    LEFT JOIN tags p ON p.id = t.parent_id
    WHERE (t.name = 'PES' AND t.parent_id IS NULL) OR COALESCE(p.name, '') = 'PES'
)
AND tag_id NOT IN (
    SELECT t.id FROM tags t
    LEFT JOIN tags p ON p.id = t.parent_id
    WHERE (t.name IN ('PES', 'CIAs') AND t.parent_id IS NULL) OR COALESCE(p.name, '') = 'PES'
);
