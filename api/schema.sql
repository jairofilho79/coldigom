-- Schema for coldigom D1 Database
-- Based on PRD requirements

-- Table: praises (Louvores)
-- Main table for storing praise/hymn information
CREATE TABLE IF NOT EXISTS praises (
    id TEXT PRIMARY KEY,           -- UUID, PK
    name TEXT NOT NULL,            -- Nome do louvor
    number TEXT,                   -- Número na coletânea
    author TEXT,                   -- Autor/Tradutor
    rhythm TEXT,                   -- Ritmo
    tonality TEXT,                 -- Tom
    category TEXT,                 -- Categoria
    lyrics TEXT,                   -- Letra completa
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Table: praise_materials (Arquivos)
-- Stores file references for each praise
CREATE TABLE IF NOT EXISTS praise_materials (
    id TEXT PRIMARY KEY,           -- UUID, PK
    praise_id TEXT NOT NULL,       -- FK to praises.id
    material_kind TEXT NOT NULL,   -- UUID ref to material_kinds.id
    type TEXT NOT NULL,            -- pdf, mp3, chord, gestures
    r2_key TEXT,                   -- Path in R2 bucket (NULL when url is present)
    file_path_legacy TEXT,         -- Legacy file path
    source_material_id TEXT,       -- For derivative materials (auto-relationship, no FK constraint)
    merged_from_praise_id TEXT,    -- Source praise id when material was moved in a merge (duplicate removed)
    url TEXT,                      -- External link (YouTube, Google Drive, Spotify, etc.)
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (praise_id) REFERENCES praises(id) ON DELETE CASCADE
);

-- Table: praise_tags
-- Many-to-many relationship between praises and tags
CREATE TABLE IF NOT EXISTS praise_tags (
    praise_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (praise_id, tag_id),
    FOREIGN KEY (praise_id) REFERENCES praises(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- Table: tags
-- Lookup table for praise tags
CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,           -- UUID
    name TEXT NOT NULL UNIQUE      -- Tag name (Coletânea, Avulsos, CIAs, GLTM, PES, Migrados, Diversos)
);

-- Table: material_kinds
-- Lookup table for material types (Audio, Score, MIDI, Lyrics, Chord Chart, Vozes, Instrumentos, etc.)
CREATE TABLE IF NOT EXISTS material_kinds (
    id TEXT PRIMARY KEY,           -- UUID
    name TEXT NOT NULL UNIQUE      -- Canonical kind name (ingestion source language)
);

-- Display labels per locale (pt-BR first; SSOT for UI strings)
CREATE TABLE IF NOT EXISTS material_kind_translations (
    material_kind_id TEXT NOT NULL,
    locale TEXT NOT NULL,
    label TEXT NOT NULL,
    PRIMARY KEY (material_kind_id, locale),
    FOREIGN KEY (material_kind_id) REFERENCES material_kinds(id) ON DELETE CASCADE
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_praise_materials_praise_id ON praise_materials(praise_id);
CREATE INDEX IF NOT EXISTS idx_praise_materials_material_kind ON praise_materials(material_kind);
CREATE INDEX IF NOT EXISTS idx_mk_translations_locale ON material_kind_translations(locale);
CREATE INDEX IF NOT EXISTS idx_praise_materials_source_material_id ON praise_materials(source_material_id);
CREATE INDEX IF NOT EXISTS idx_praise_materials_merged_from ON praise_materials(merged_from_praise_id);
CREATE INDEX IF NOT EXISTS idx_praise_tags_praise_id ON praise_tags(praise_id);
CREATE INDEX IF NOT EXISTS idx_praise_tags_tag_id ON praise_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_praises_name ON praises(name);
CREATE INDEX IF NOT EXISTS idx_praises_number ON praises(number);

-- Auth: rotating refresh tokens (opaque value hashed at rest; access JWT is short-lived in cookie)
CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
    id TEXT PRIMARY KEY,
    user_sub TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    revoked_at INTEGER,
    replaced_by TEXT,
    user_claims TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (replaced_by) REFERENCES auth_refresh_tokens(id)
);

CREATE INDEX IF NOT EXISTS idx_auth_refresh_token_hash ON auth_refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_refresh_user_sub ON auth_refresh_tokens(user_sub);
CREATE INDEX IF NOT EXISTS idx_auth_refresh_expires ON auth_refresh_tokens(expires_at);

-- Google Drive import
CREATE TABLE IF NOT EXISTS google_drive_credentials (
    user_sub TEXT PRIMARY KEY,
    refresh_token_enc TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS drive_scans (
    id TEXT PRIMARY KEY,
    user_sub TEXT NOT NULL,
    source_url TEXT NOT NULL,
    root_id TEXT NOT NULL,
    root_kind TEXT NOT NULL,
    status TEXT NOT NULL,
    error TEXT,
    skipped_json TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_drive_scans_user ON drive_scans(user_sub);

CREATE TABLE IF NOT EXISTS drive_scan_files (
    id TEXT PRIMARY KEY,
    scan_id TEXT NOT NULL,
    drive_file_id TEXT NOT NULL,
    name TEXT NOT NULL,
    rel_path TEXT NOT NULL,
    mime_type TEXT,
    size_bytes INTEGER,
    FOREIGN KEY (scan_id) REFERENCES drive_scans(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_drive_scan_files_scan ON drive_scan_files(scan_id);

CREATE TABLE IF NOT EXISTS import_jobs (
    id TEXT PRIMARY KEY,
    praise_id TEXT NOT NULL,
    user_sub TEXT NOT NULL,
    status TEXT NOT NULL,
    total_count INTEGER NOT NULL DEFAULT 0,
    done_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (praise_id) REFERENCES praises(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_praise ON import_jobs(praise_id);
CREATE INDEX IF NOT EXISTS idx_import_jobs_user ON import_jobs(user_sub);

CREATE TABLE IF NOT EXISTS import_job_items (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    drive_file_id TEXT NOT NULL,
    material_kind TEXT NOT NULL,
    type TEXT NOT NULL,
    file_path_legacy TEXT,
    status TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    material_id TEXT,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (job_id) REFERENCES import_jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_import_job_items_job ON import_job_items(job_id);
CREATE INDEX IF NOT EXISTS idx_import_job_items_status ON import_job_items(job_id, status);

-- Full-text search virtual table for lyrics and name
CREATE VIRTUAL TABLE IF NOT EXISTS praises_fts USING fts5(
    name,
    lyrics,
    content='praises',
    content_rowid='rowid'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS praises_ai AFTER INSERT ON praises BEGIN
    INSERT INTO praises_fts(rowid, name, lyrics) VALUES (new.rowid, new.name, new.lyrics);
END;

CREATE TRIGGER IF NOT EXISTS praises_ad AFTER DELETE ON praises BEGIN
    INSERT INTO praises_fts(praises_fts, rowid, name, lyrics) VALUES('delete', old.rowid, old.name, old.lyrics);
END;

CREATE TRIGGER IF NOT EXISTS praises_au AFTER UPDATE ON praises BEGIN
    INSERT INTO praises_fts(praises_fts, rowid, name, lyrics) VALUES('delete', old.rowid, old.name, old.lyrics);
    INSERT INTO praises_fts(rowid, name, lyrics) VALUES (new.rowid, new.name, new.lyrics);
END;
