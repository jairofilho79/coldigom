-- Marca de revisão humana por praise (metadados e tags conferidos).
-- Motivação: o dashboard de curadoria (scripts/validate-acervo/curadoria)
-- percorre o acervo inteiro e precisa saber onde o dono já passou; a marca
-- por material (015) não diz nada sobre nome, número, autor e tags.
ALTER TABLE praises ADD COLUMN is_reviewed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE praises ADD COLUMN reviewed_at TEXT;
ALTER TABLE praises ADD COLUMN reviewed_by TEXT;

CREATE INDEX IF NOT EXISTS idx_praises_is_reviewed
  ON praises(is_reviewed);
