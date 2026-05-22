-- Praise merge: track materials moved from a deleted duplicate praise
ALTER TABLE praise_materials ADD COLUMN merged_from_praise_id TEXT;
CREATE INDEX IF NOT EXISTS idx_praise_materials_merged_from ON praise_materials(merged_from_praise_id);
