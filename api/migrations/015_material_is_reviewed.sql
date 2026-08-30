-- Marca de revisão humana por material.
-- Motivação: o lote de cifras geradas por pipeline subiu junto com as revisadas
-- à mão. Sem uma marca no banco, não há como saber o que ainda precisa de olho
-- humano — a informação vivia só no review.sqlite da máquina local.
ALTER TABLE praise_materials ADD COLUMN is_reviewed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE praise_materials ADD COLUMN reviewed_at TEXT;
ALTER TABLE praise_materials ADD COLUMN reviewed_by TEXT;

CREATE INDEX IF NOT EXISTS idx_praise_materials_is_reviewed
  ON praise_materials(is_reviewed);
