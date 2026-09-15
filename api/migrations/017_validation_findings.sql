-- Fila de revisão da validação do acervo (spec docs/superpowers/specs/2026-09-02-validacao-do-acervo-design.md §6).
--
-- O detector (scripts/validate-acervo) só escreve sozinho na faixa alta. As
-- faixas média e baixa não tinham onde pousar: na Fase 1 ficaram num JSONL
-- que o dono só conseguia julgar por um formulário fora do app. Esta tabela
-- é o lugar delas. A tela do web lê daqui e grava a decisão; o script
-- scripts/validate-acervo/core/queue.py puxa os 'aprovado' de volta e o
-- apply.py de sempre escreve — a API nunca toca praises/praise_materials.
--
-- id é o finding_id determinístico do detector (sha1 de detector|target|field),
-- por isso é chave e por isso o push é INSERT OR IGNORE: rodar o detector de
-- novo não duplica nem sobrescreve uma decisão já tomada.
--
-- decision_note não é decorativa: a rejeição é o dado de treino do detector.
--
-- Aplicar: cd api && npx wrangler d1 execute coldigom --remote --file=migrations/017_validation_findings.sql

CREATE TABLE IF NOT EXISTS validation_findings (
  id             TEXT PRIMARY KEY,        -- finding_id determinístico
  run_id         TEXT NOT NULL,
  detector       TEXT NOT NULL,
  target_type    TEXT NOT NULL,           -- material | praise
  target_id      TEXT NOT NULL,
  praise_id      TEXT,                    -- para agrupar na tela
  action         TEXT NOT NULL,
  field          TEXT,
  current_value  TEXT,
  proposed_value TEXT,
  confidence     TEXT NOT NULL,           -- alta | media | baixa | discussao
  evidence       TEXT NOT NULL,           -- JSON
  status         TEXT NOT NULL DEFAULT 'pendente',  -- pendente|discussao|aprovado|rejeitado|aplicado
  decided_at     TEXT,
  decided_by     TEXT,
  decision_note  TEXT,
  created_at     TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_vf_status_conf ON validation_findings(status, confidence);
CREATE INDEX IF NOT EXISTS idx_vf_detector ON validation_findings(detector);
CREATE INDEX IF NOT EXISTS idx_vf_praise ON validation_findings(praise_id);
