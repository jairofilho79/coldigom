-- Contribuições da comunidade (spec coldigui/docs/superpowers/specs/2026-09-17-contribuicoes-comunidade-design.md §3).
--
-- Quem escreve em `status` é o consumer da Queue (recebida → pendente|bloqueada)
-- e o admin (em_analise|aceita|recusada|aplicada). O usuário só insere.
-- Arquivos ficam em quarantine/ no R2 até `scan_status = limpa`.
--
-- Aplicar: cd api && npx wrangler d1 execute coldigom --remote --file=migrations/021_contributions.sql

CREATE TABLE IF NOT EXISTS contributions (
  id                  TEXT PRIMARY KEY,          -- uuid
  user_id             TEXT NOT NULL,             -- userId do plpcg-catalog
  user_email          TEXT NOT NULL,
  user_name           TEXT,
  kind                TEXT NOT NULL,             -- bug | wrong_info | content | improvement | other
  subkind             TEXT,                      -- §3.1
  target_source       TEXT,                      -- coldigom | plpcg | NULL
  target_praise_id    TEXT,
  target_material_id  TEXT,
  title               TEXT NOT NULL,             -- ≤ 120 chars
  body                TEXT NOT NULL,             -- ≤ 4000 chars
  fields              TEXT,                      -- JSON por subkind (§3.1)
  links               TEXT,                      -- JSON: [{url, host, safe_browsing: 'pending'|'clean'|'unsafe'}]
  device              TEXT,                      -- JSON (só bug): DeviceSnapshot + same_device + other_device_note
  app_route           TEXT,                      -- rota da app quando abriu o Reportar
  app_version         TEXT,
  status              TEXT NOT NULL DEFAULT 'recebida',
                      -- recebida | bloqueada | pendente | em_analise | aceita | recusada | aplicada
  scan_status         TEXT NOT NULL DEFAULT 'pendente',
                      -- pendente | adiado | limpa | suspeita | infectada | sem_arquivo
  scan_report         TEXT,                      -- JSON: resumo por arquivo/link + reason
  decided_at          TEXT,
  decided_by          TEXT,
  decision_note       TEXT,
  created_at          TEXT DEFAULT (datetime('now')),
  updated_at          TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_contrib_user   ON contributions(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_contrib_status ON contributions(status, created_at);
CREATE INDEX IF NOT EXISTS idx_contrib_praise ON contributions(target_praise_id);

CREATE TABLE IF NOT EXISTS contribution_files (
  id               TEXT PRIMARY KEY,
  contribution_id  TEXT NOT NULL REFERENCES contributions(id),
  original_name    TEXT NOT NULL,                -- normalizado: sem / \ nem controle, ≤ 200
  declared_type    TEXT NOT NULL,                -- pdf | mp3 | jpg | png | txt | chordpro
  detected_type    TEXT,                         -- preenchido pelo scan estrutural
  size             INTEGER NOT NULL,
  sha256           TEXT NOT NULL,
  r2_key           TEXT NOT NULL,                -- quarantine/… → contributions/… após limpa
  scan_status      TEXT NOT NULL DEFAULT 'pendente',
  scan_detail      TEXT,                         -- JSON: {structural:{ok, tokens[]}, virustotal:{sha256|analysisId, malicious, suspicious, total}}
  created_at       TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cfiles_contrib ON contribution_files(contribution_id);
CREATE INDEX IF NOT EXISTS idx_cfiles_sha     ON contribution_files(sha256, scan_status);

-- Cota diária por usuário (20 envios / 200 MB) e contador global do VirusTotal (user_id = '_vt').
CREATE TABLE IF NOT EXISTS contribution_quota (
  user_id  TEXT NOT NULL,
  day      TEXT NOT NULL,                        -- 'YYYY-MM-DD' UTC
  count    INTEGER NOT NULL DEFAULT 0,
  bytes    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
