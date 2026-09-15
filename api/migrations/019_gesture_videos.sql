-- Vídeos por gesto (spec docs/superpowers/specs/2026-09-15-gestos-videos-design.md).
--
-- Uma linha por ocorrência de um gesto num vídeo youtube de um louvor
-- (praise_materials.type = 'youtube'). seconds NULL = o par gesto↔vídeo está
-- ligado mas o tempo ainda não foi mapeado; ao gravar tempos, a rota troca as
-- linhas do par (a nula some). Toda escrita aqui passa por escreverNoDicionario()
-- (api/src/gestures/dicionario.ts) para o ETag do dicionário mudar.
--
-- Aplicar: cd api && wrangler d1 execute coldigom --remote --file=migrations/019_gesture_videos.sql

CREATE TABLE IF NOT EXISTS gesture_video_occurrences (
  gesture_id  TEXT NOT NULL REFERENCES gesture_dictionary(id) ON DELETE CASCADE,
  material_id TEXT NOT NULL REFERENCES praise_materials(id)  ON DELETE CASCADE,
  seconds     INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_gvo_gesture  ON gesture_video_occurrences (gesture_id);
CREATE INDEX IF NOT EXISTS idx_gvo_material ON gesture_video_occurrences (material_id);
