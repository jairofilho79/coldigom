-- Triagem e Classificação com IA de Decisão (Clef-Omni)
--
-- Armazena o resultado da triagem executada pelo modelo @cf/cloudflare/clef-omni
-- para categorizar o intuito (elogio, crítica, bug, sugestão, catálogo),
-- criticidade, urgência e recomendação de ação.
--
-- Aplicar: cd api && npx wrangler d1 execute coldigom --remote --file=migrations/032_contribution_triage.sql

CREATE TABLE IF NOT EXISTS contribution_triages (
  id                  TEXT PRIMARY KEY,             -- UUID
  contribution_id     TEXT NOT NULL UNIQUE REFERENCES contributions(id) ON DELETE CASCADE,
  model_name          TEXT NOT NULL DEFAULT '@cf/cloudflare/clef-omni',
  intent              TEXT NOT NULL,                -- praise_or_compliment | critique | bug_report | feature_suggestion | catalog_correction | spam_or_noise
  severity            TEXT NOT NULL,                -- critical | moderate | minor | none
  urgency             TEXT NOT NULL,                -- immediate | normal | backlog
  is_actionable       INTEGER NOT NULL DEFAULT 1,   -- 1 = sim, 0 = não
  requires_curation   INTEGER NOT NULL DEFAULT 0,   -- 1 = sim, 0 = não
  recommended_action  TEXT NOT NULL,                -- run_planner | notify_dev_urgent | review_dev_bug | feedback_backlog | compliment_archive | spam_filter
  confidence          REAL NOT NULL DEFAULT 1.0,    -- Probabilidade do intent vencedor (0.0 a 1.0)
  scores_json         TEXT NOT NULL,                -- JSON com as probabilidades completas de cada pergunta
  state_summary       TEXT NOT NULL,                -- Resumo do texto/contexto enviado ao modelo
  created_at          TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_contrib_triage_contrib ON contribution_triages(contribution_id);
CREATE INDEX IF NOT EXISTS idx_contrib_triage_intent  ON contribution_triages(intent);
CREATE INDEX IF NOT EXISTS idx_contrib_triage_urgency ON contribution_triages(urgency);
