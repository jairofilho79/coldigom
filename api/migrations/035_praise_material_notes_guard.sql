-- Migração 035: só permitir gravar notas quando já houver outro material do mesmo tipo no louvor.
-- Notas existentes não são revalidadas quando a duplicidade desaparece.
CREATE TRIGGER IF NOT EXISTS praise_materials_notes_bi
BEFORE INSERT ON praise_materials
WHEN NEW.notes IS NOT NULL
  AND trim(NEW.notes) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM praise_materials sibling
    WHERE sibling.praise_id = NEW.praise_id
      AND sibling.material_kind = NEW.material_kind
      AND sibling.id <> NEW.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM praise_materials current_material
    WHERE current_material.id = NEW.id
      AND current_material.notes IS NEW.notes
  )
BEGIN
  SELECT RAISE(ABORT, 'Notas exigem outro material do mesmo tipo no mesmo louvor');
END;

CREATE TRIGGER IF NOT EXISTS praise_materials_notes_bu
BEFORE UPDATE OF notes ON praise_materials
WHEN NEW.notes IS NOT OLD.notes
  AND NEW.notes IS NOT NULL
  AND trim(NEW.notes) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM praise_materials sibling
    WHERE sibling.praise_id = NEW.praise_id
      AND sibling.material_kind = NEW.material_kind
      AND sibling.id <> OLD.id
  )
BEGIN
  SELECT RAISE(ABORT, 'Notas exigem outro material do mesmo tipo no mesmo louvor');
END;
