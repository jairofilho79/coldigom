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

-- Table: materials (Arquivos)
-- Stores file references for each praise
CREATE TABLE IF NOT EXISTS materials (
    id TEXT PRIMARY KEY,           -- UUID, PK
    praise_id TEXT NOT NULL,       -- FK to praises.id
    material_kind TEXT NOT NULL,   -- UUID ref to material_kinds
    type TEXT NOT NULL,            -- mp3, pdf, chord
    r2_key TEXT NOT NULL,          -- Path in R2 bucket
    file_path_legacy TEXT,         -- Legacy file path
    source_material_id TEXT,       -- For derivative materials
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
    name TEXT NOT NULL UNIQUE      -- Kind name
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_materials_praise_id ON materials(praise_id);
CREATE INDEX IF NOT EXISTS idx_materials_material_kind ON materials(material_kind);
CREATE INDEX IF NOT EXISTS idx_praise_tags_praise_id ON praise_tags(praise_id);
CREATE INDEX IF NOT EXISTS idx_praise_tags_tag_id ON praise_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_praises_name ON praises(name);
CREATE INDEX IF NOT EXISTS idx_praises_number ON praises(number);

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
