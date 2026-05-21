-- Correções de rótulos PT-BR (Score vs Sheet Music, Coro, MIDI derivados)
-- Apply: wrangler d1 execute coldigom --remote --file=migrations/003_material_kind_translations_pt-BR_fixes.sql

INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('c2fb644f-697c-4d43-9d5f-22319fa0ce79', 'pt-BR', 'Coro');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('835cdb0c-8920-4a69-a067-a31c5afb6560', 'pt-BR', 'Coro e piano');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('56c252f4-bcbe-47b9-99f6-f996de79ec32', 'pt-BR', 'MIDI coro');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('bfcc4a22-e9ae-4cab-946c-f4c6199f1feb', 'pt-BR', 'MIDI grade');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('a19e9baa-596d-4d11-87a4-f0ccecdebca3', 'pt-BR', 'Grade');
