-- Unknown / Desconhecido — fallback for bulk upload when kind cannot be inferred reliably
-- Apply: wrangler d1 execute coldigom --remote --file=migrations/006_unknown_material_kind.sql

INSERT OR IGNORE INTO material_kinds (id, name) VALUES ('c7454ea9-3ae0-4548-9cc5-c4187b80641a', 'Unknown');

INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label)
VALUES ('c7454ea9-3ae0-4548-9cc5-c4187b80641a', 'pt-BR', 'Desconhecido');
