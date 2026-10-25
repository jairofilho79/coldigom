-- Migração 034: Notas rápidas de praise_materials (ex: I, II, Cifrado)
-- Permite diferenciar partes ou arranjos irmãos de um mesmo material_kind
-- sem a necessidade de criar múltiplos material_kinds no catálogo.

ALTER TABLE praise_materials ADD COLUMN notes TEXT;
