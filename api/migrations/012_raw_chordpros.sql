CREATE TABLE IF NOT EXISTS raw_chordpros (
    id TEXT PRIMARY KEY,
    source_pdf_material_id TEXT NOT NULL,
    praise_id TEXT,
    praise_name TEXT,
    kind_label TEXT,
    source_filename TEXT NOT NULL,
    title TEXT,
    subtitle TEXT,
    content TEXT NOT NULL,
    validated INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_raw_chordpros_validated ON raw_chordpros(validated);
CREATE INDEX IF NOT EXISTS idx_raw_chordpros_pdf ON raw_chordpros(source_pdf_material_id);
