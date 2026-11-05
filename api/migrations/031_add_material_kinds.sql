-- api/migrations/031_add_material_kinds.sql
-- Novos material kinds: Audio (Studio, Church), Flute (I, II, Flutes),
-- Trumpet (I, II, Trumpets), Trombone (I, II, Trombones),
-- Clarinet (I, II, Clarinets, Sib I, Sib II, Sib).
--
-- Aplicar no Cloudflare D1:
--   cd api && wrangler d1 execute coldigom --remote --file=migrations/031_add_material_kinds.sql

INSERT OR IGNORE INTO material_kinds (id, name, class_id, parent_id, sort_order) VALUES
    ('d336b4ef-7cee-4b6e-8d7a-cdb15264e70d', 'Audio (Studio)', 'audio', '8860ed67-6b33-4e08-9064-adb93a5f5c2a', 32),
    ('dd947eae-1d84-4f82-9bae-c6bce23f7bf2', 'Audio (Church)', 'audio', '8860ed67-6b33-4e08-9064-adb93a5f5c2a', 34),
    ('e4d3baf3-c5f5-4c87-af45-298217d8a66f', 'Flute I', 'madeiras', '11e3c9eb-c022-48c4-82a4-91f09bf089b0', 32),
    ('3ba482c9-fb5f-4a80-a62b-11d71e5f5be6', 'Flute II', 'madeiras', '11e3c9eb-c022-48c4-82a4-91f09bf089b0', 34),
    ('ac1ee2a5-0dfa-4fb5-999f-e6f2025c0cc2', 'Flutes', 'madeiras', '11e3c9eb-c022-48c4-82a4-91f09bf089b0', 36),
    ('5989b562-aa89-465c-a869-4dc06efc19fc', 'Trumpet I', 'metais', 'b2d08b24-26b7-4bf6-970d-eb84e29833ea', 102),
    ('8b647c5f-bf5b-40fa-9a2b-aefb8bddd541', 'Trumpet II', 'metais', 'b2d08b24-26b7-4bf6-970d-eb84e29833ea', 104),
    ('9a2e9a05-44cf-4d88-b51b-09e6e32cd722', 'Trumpets', 'metais', 'b2d08b24-26b7-4bf6-970d-eb84e29833ea', 106),
    ('0084abef-6e3e-4003-9882-afab27107713', 'Trombone I', 'metais', '93ea287b-d712-4452-8ec6-84478ecb6c22', 142),
    ('71f3dd8f-02ae-434a-8e6a-0ba37fc736cc', 'Trombone II', 'metais', '93ea287b-d712-4452-8ec6-84478ecb6c22', 144),
    ('1c73024a-872a-44ad-bd63-4536a28a3063', 'Trombones', 'metais', '93ea287b-d712-4452-8ec6-84478ecb6c22', 146),
    ('bf62dc10-4a2e-48d2-8d4f-1f182c8fe6f9', 'Clarinet I', 'madeiras', '12f9ac21-4bec-40e0-9411-d39a129f2c7b', 52),
    ('085c34e3-1129-4ef3-8e48-e10d31c9579f', 'Clarinet II', 'madeiras', '12f9ac21-4bec-40e0-9411-d39a129f2c7b', 54),
    ('9a931e47-fade-4965-891b-790d8d90164a', 'Clarinets', 'madeiras', '12f9ac21-4bec-40e0-9411-d39a129f2c7b', 56),
    ('baa2b993-c37a-4f96-ae5f-8560d2e4b6d8', 'Clarinet in Sib I', 'madeiras', '12f9ac21-4bec-40e0-9411-d39a129f2c7b', 62),
    ('b5b61ce6-6ad1-41da-9889-eeabed58ffd2', 'Clarinet in Sib II', 'madeiras', '12f9ac21-4bec-40e0-9411-d39a129f2c7b', 64),
    ('b403be03-b66c-47c7-b28c-c8e248f99df5', 'Clarinets in Sib', 'madeiras', '12f9ac21-4bec-40e0-9411-d39a129f2c7b', 66);

INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('d336b4ef-7cee-4b6e-8d7a-cdb15264e70d', 'pt-BR', 'Áudio (estúdio)');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('dd947eae-1d84-4f82-9bae-c6bce23f7bf2', 'pt-BR', 'Áudio (igreja)');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('e4d3baf3-c5f5-4c87-af45-298217d8a66f', 'pt-BR', 'Flauta I');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('3ba482c9-fb5f-4a80-a62b-11d71e5f5be6', 'pt-BR', 'Flauta II');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('ac1ee2a5-0dfa-4fb5-999f-e6f2025c0cc2', 'pt-BR', 'Flautas');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('5989b562-aa89-465c-a869-4dc06efc19fc', 'pt-BR', 'Trompete I');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('8b647c5f-bf5b-40fa-9a2b-aefb8bddd541', 'pt-BR', 'Trompete II');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('9a2e9a05-44cf-4d88-b51b-09e6e32cd722', 'pt-BR', 'Trompetes');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('0084abef-6e3e-4003-9882-afab27107713', 'pt-BR', 'Trombone I');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('71f3dd8f-02ae-434a-8e6a-0ba37fc736cc', 'pt-BR', 'Trombone II');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('1c73024a-872a-44ad-bd63-4536a28a3063', 'pt-BR', 'Trombones');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('bf62dc10-4a2e-48d2-8d4f-1f182c8fe6f9', 'pt-BR', 'Clarinete I');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('085c34e3-1129-4ef3-8e48-e10d31c9579f', 'pt-BR', 'Clarinete II');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('9a931e47-fade-4965-891b-790d8d90164a', 'pt-BR', 'Clarinetes');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('baa2b993-c37a-4f96-ae5f-8560d2e4b6d8', 'pt-BR', 'Clarinete em Si bemol I');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('b5b61ce6-6ad1-41da-9889-eeabed58ffd2', 'pt-BR', 'Clarinete em Si bemol II');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('b403be03-b66c-47c7-b28c-c8e248f99df5', 'pt-BR', 'Clarinetes em Si bemol');
