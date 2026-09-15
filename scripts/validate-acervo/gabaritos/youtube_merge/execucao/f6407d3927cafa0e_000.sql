INSERT OR IGNORE INTO praise_tags (praise_id, tag_id) VALUES ('060d9504-9e0c-46bb-babc-3fd466f6239c', '45ab58b2-d293-45c7-aa75-090fcd968b24');
UPDATE praise_materials SET praise_id = '060d9504-9e0c-46bb-babc-3fd466f6239c', merged_from_praise_id = '16e4e789-2a93-41b4-940f-263a890b1923' WHERE id = '1484cf0d-6579-46bf-b61f-f2ea811ddd29' AND praise_id = '16e4e789-2a93-41b4-940f-263a890b1923';
DELETE FROM praises WHERE id = '16e4e789-2a93-41b4-940f-263a890b1923' AND NOT EXISTS (SELECT 1 FROM praise_materials WHERE praise_id = '16e4e789-2a93-41b4-940f-263a890b1923');
