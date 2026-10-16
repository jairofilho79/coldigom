-- api/migrations/033_praise_biblical.sql
-- Metadados bíblicos e homiléticos dos louvores (citações diretas, mensagem central, temas e perícopes)
--
-- Aplicar no Cloudflare D1:
--   cd api && wrangler d1 execute coldigom --remote --file=migrations/033_praise_biblical.sql

CREATE TABLE IF NOT EXISTS praise_biblical (
  praise_id                   TEXT PRIMARY KEY REFERENCES praises(id) ON DELETE CASCADE,
  tem_citacao_direta          INTEGER NOT NULL DEFAULT 0,
  referencia_principal        TEXT,
  resumo_uma_linha            TEXT,
  resumo_formatado            TEXT,
  citacoes_diretas_json       TEXT NOT NULL DEFAULT '[]',
  mensagem_central            TEXT,
  temas_homileticos_json      TEXT NOT NULL DEFAULT '[]',
  passagem_origem_direta      TEXT,
  pericopes_relacionadas_json TEXT NOT NULL DEFAULT '[]',
  created_at                  TEXT DEFAULT (datetime('now')),
  updated_at                  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_praise_biblical_ref ON praise_biblical(referencia_principal);
