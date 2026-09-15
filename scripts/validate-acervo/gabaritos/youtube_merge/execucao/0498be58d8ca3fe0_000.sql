INSERT OR IGNORE INTO praise_tags (praise_id, tag_id) VALUES ('2d334abb-e8d9-4eac-9c35-7b2c19a84ffc', '45ab58b2-d293-45c7-aa75-090fcd968b24');
UPDATE praise_materials SET praise_id = '2d334abb-e8d9-4eac-9c35-7b2c19a84ffc', merged_from_praise_id = 'ee17e034-d0c0-4d15-b3cc-9b8aad86bdd0' WHERE id = '8dd647de-3693-4476-be18-5bb1c8eb0f15' AND praise_id = 'ee17e034-d0c0-4d15-b3cc-9b8aad86bdd0';
DELETE FROM praises WHERE id = 'ee17e034-d0c0-4d15-b3cc-9b8aad86bdd0' AND NOT EXISTS (SELECT 1 FROM praise_materials WHERE praise_id = 'ee17e034-d0c0-4d15-b3cc-9b8aad86bdd0');
