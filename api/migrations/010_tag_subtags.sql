-- One-level tag hierarchy (root → subtag). Rebuild tags to drop UNIQUE(name).
-- Apply: wrangler d1 execute coldigom --remote --file=migrations/010_tag_subtags.sql

PRAGMA foreign_keys=OFF;

CREATE TABLE tags_new (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT,
    FOREIGN KEY (parent_id) REFERENCES tags_new(id) ON DELETE RESTRICT
);

INSERT INTO tags_new (id, name, parent_id)
SELECT id, name, NULL FROM tags;

DROP TABLE tags;
ALTER TABLE tags_new RENAME TO tags;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_root_name ON tags(name) WHERE parent_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_child_name ON tags(parent_id, name) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tags_parent_id ON tags(parent_id);

PRAGMA foreign_keys=ON;
