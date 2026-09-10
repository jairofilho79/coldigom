-- Limpeza aprovada pelo dono em 2026-09-03, depois do run 2026-09-03T2040Z-youtube_merge.
-- A fusão doou o author-lixo da fonte ao keeper vazio e somou a tag Avulsos aos keepers
-- que são Coletânea. Cada linha é guardada pelo valor que a fusão deixou: se alguém já
-- editou pelo app, a linha vira no-op.
UPDATE praises SET author = NULL, updated_at = datetime('now')
 WHERE id = '54a6c7c5-b238-4e3f-ac9c-713cd873d300' AND author = 'Os céus declaram a glória de Deus,';
DELETE FROM praise_tags WHERE praise_id = '2d334abb-e8d9-4eac-9c35-7b2c19a84ffc' AND tag_id = '45ab58b2-d293-45c7-aa75-090fcd968b24';
DELETE FROM praise_tags WHERE praise_id = '060d9504-9e0c-46bb-babc-3fd466f6239c' AND tag_id = '45ab58b2-d293-45c7-aa75-090fcd968b24';
