-- Crosswalk PLPCG → coldigom (spec docs/superpowers/specs/2026-09-15-migracao-plpcg-design.md, §8.1).
--
-- Uma linha por pdf_id do catálogo do PLPCG, apontando o material do coldigom
-- que o substitui. É o que faz plpcg.com/?s=<short_id> e as listas salvas do
-- coldigui continuarem vivas depois que o PLPCG desligar (GET /api/plpcg/resolve
-- e /api/plpcg/manifest, Fase D).
--
-- Sem FK, como o resto da casa: a integridade é do scripts/validate-acervo/core/apply.py,
-- que é a única porta de escrita (link_plpcg / import_plpcg_material /
-- create_praise_plpcg, Fase C). Um material do coldigom pode ter várias pdf_id
-- (o PLPCG tem 56 duplicatas internas medidas).
--
-- Aplicar: cd api && wrangler d1 execute coldigom --remote --file=migrations/019_plpcg_crosswalk.sql

CREATE TABLE IF NOT EXISTS plpcg_crosswalk (
  pdf_id             TEXT PRIMARY KEY,                       -- base64 urlsafe do caminho do PDF no PLPCG
  short_id           TEXT NOT NULL,                          -- o ?s= dos links antigos
  group_id           TEXT NOT NULL,                          -- 'NNN:slug' | 'avulso:slug' — o louvor no PLPCG
  praise_id          TEXT NOT NULL,
  praise_material_id TEXT NOT NULL,
  evidencia          TEXT NOT NULL,                          -- 'num+slug+hash+path' | 'site:é este' …
  confianca          TEXT NOT NULL,                          -- alta | media | humano
  decidido_por       TEXT NOT NULL,                          -- detector | jairo
  run_id             TEXT NOT NULL,                          -- o run do apply que escreveu (undo)
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_plpcg_crosswalk_short ON plpcg_crosswalk(short_id);
CREATE INDEX IF NOT EXISTS idx_plpcg_crosswalk_praise ON plpcg_crosswalk(praise_id);
