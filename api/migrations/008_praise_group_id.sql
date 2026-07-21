-- Group related praise arrangements (same song, different arrangements/tags)
ALTER TABLE praises ADD COLUMN group_id TEXT;
CREATE INDEX IF NOT EXISTS idx_praises_group_id ON praises(group_id);
