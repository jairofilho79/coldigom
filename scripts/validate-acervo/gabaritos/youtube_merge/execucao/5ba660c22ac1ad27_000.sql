UPDATE praises SET author = 'Os céus declaram a glória de Deus,', updated_at = datetime('now') WHERE id = '54a6c7c5-b238-4e3f-ac9c-713cd873d300' AND (author IS NULL OR trim(author) = '');
INSERT OR IGNORE INTO praise_tags (praise_id, tag_id) VALUES ('54a6c7c5-b238-4e3f-ac9c-713cd873d300', '45ab58b2-d293-45c7-aa75-090fcd968b24');
UPDATE praise_materials SET praise_id = '54a6c7c5-b238-4e3f-ac9c-713cd873d300', merged_from_praise_id = '56905a3d-f555-4d73-b17a-e80d7a43e010' WHERE id = '2de66f62-1115-4f9f-988f-dd6928b4ce60' AND praise_id = '56905a3d-f555-4d73-b17a-e80d7a43e010';
DELETE FROM praises WHERE id = '56905a3d-f555-4d73-b17a-e80d7a43e010' AND NOT EXISTS (SELECT 1 FROM praise_materials WHERE praise_id = '56905a3d-f555-4d73-b17a-e80d7a43e010');
