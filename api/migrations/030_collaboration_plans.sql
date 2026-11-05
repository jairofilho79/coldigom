-- Planos do Assistente de Acervo (IA / MCP / Cloudflare)
--
-- Armazena os planos de TODOs gerados pelo modelo (@cf/zai-org/glm-5.3-flash)
-- para aprovação humana e o ledger de idempotência de execução de tarefas.
--
-- Aplicar: cd api && npx wrangler d1 execute coldigom --remote --file=migrations/030_collaboration_plans.sql

CREATE TABLE IF NOT EXISTS collaboration_plans (
  id               TEXT PRIMARY KEY,             -- UUID
  contribution_id  TEXT NOT NULL REFERENCES contributions(id) ON DELETE CASCADE,
  version          INTEGER NOT NULL DEFAULT 1,
  model_name       TEXT NOT NULL,                -- ex: '@cf/zai-org/glm-5.3-flash'
  summary          TEXT NOT NULL,                -- Resumo legível da proposta gerada pelo modelo
  todos            TEXT NOT NULL,                -- JSON string[]: checklist de TODOs
  plan_json        TEXT NOT NULL,                -- JSON canônico estruturado com tasks do catálogo
  plan_hash        TEXT NOT NULL,                -- SHA-256 do plan_json canônico
  status           TEXT NOT NULL DEFAULT 'pending_approval',
                   -- pending_approval | approved | rejected | superseded | applied
  decided_at       TEXT,
  decided_by       TEXT,                         -- user_sub de quem aprovou/rejeitou
  decision_note    TEXT,
  created_at       TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_colab_plans_colab ON collaboration_plans(contribution_id);
CREATE INDEX IF NOT EXISTS idx_colab_plans_status ON collaboration_plans(status);

CREATE TABLE IF NOT EXISTS collaboration_task_executions (
  id               TEXT PRIMARY KEY,             -- UUID
  plan_id          TEXT NOT NULL REFERENCES collaboration_plans(id) ON DELETE CASCADE,
  task_id          TEXT NOT NULL,                -- ID da task no plano
  operation        TEXT NOT NULL,                -- ex: 'edit_praise_metadata', 'attach_tag'
  status           TEXT NOT NULL DEFAULT 'pending', -- pending | running | completed | failed | unknown
  idempotency_key  TEXT NOT NULL UNIQUE,         -- hash(plan_id + task_id + payload_resolvido)
  resolved_params  TEXT NOT NULL,                -- JSON parâmetros após resolução de dependências
  result_data      TEXT,                         -- JSON resultado (ex: { id: "praise-uuid" })
  error_message    TEXT,
  executed_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_task_exec_plan ON collaboration_task_executions(plan_id);
