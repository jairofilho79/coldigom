-- Dicionário de gestos CIAs e uso por material (spec docs/superpowers/specs/2026-09-05-editor-de-gestos-design.md).
--
-- gesture_dictionary é o catálogo: id de 12 hex estável para sempre, figura e
-- GIF no R2 (assets/cia/gestures/{id}.png|gif). Um gesto nunca é apagado —
-- vira 'deprecated' com replaced_by apontando para o que o substituiu, e o
-- cliente segue a cadeia ao renderizar.
--
-- gesture_dictionary_meta tem UMA linha (id = 1) com a versão monotônica. Toda
-- escrita em gesture_dictionary sobe version no mesmo DB.batch() — é a versão
-- que vira o ETag "v{version}" de GET /api/gestures/dictionary. Nunca escreva
-- na tabela por fora de escreverNoDicionario() (api/src/gestures/dicionario.ts).
--
-- gesture_usage é derivada: recomputada a cada PUT /content de um material de
-- gestos e pelo importador. Serve à página do dicionário ("usado em N louvores")
-- e ao replace-with, que precisa saber quais documentos reescrever.
--
-- Aplicar: cd api && wrangler d1 execute coldigom --remote --file=migrations/018_gestures.sql

CREATE TABLE IF NOT EXISTS gesture_dictionary (
  id               TEXT PRIMARY KEY,                       -- 12 hex
  name             TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  example_triggers TEXT NOT NULL DEFAULT '[]',              -- JSON: string[]
  image_key        TEXT,                                    -- assets/cia/gestures/{id}.png
  gif_key          TEXT,                                    -- assets/cia/gestures/{id}.gif
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deprecated')),
  replaced_by      TEXT,                                    -- id do gesto que o substituiu
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gesture_dictionary_meta (
  id      INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL
);
INSERT OR IGNORE INTO gesture_dictionary_meta (id, version) VALUES (1, 0);

CREATE TABLE IF NOT EXISTS gesture_usage (
  material_id TEXT NOT NULL,
  gesture_id  TEXT NOT NULL,
  count       INTEGER NOT NULL,
  PRIMARY KEY (material_id, gesture_id),
  FOREIGN KEY (material_id) REFERENCES praise_materials(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_gesture_usage_gesture ON gesture_usage(gesture_id);
