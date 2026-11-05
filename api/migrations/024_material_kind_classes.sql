-- api/migrations/024_material_kind_classes.sql
-- Classe, família e ordem dos material kinds (spec coldigui
-- docs/superpowers/specs/2026-09-24-filtro-materiais-classes-design.md §2 e §3.1).
--
-- O filtro «Materiais» do app agrupa os kinds por classe (Metais, Banda…) e
-- recolhe as variantes numa família (Saxofone → Saxofone alto…). A família tem
-- um nível só, como as tags (migração 010): o pai é raiz e da mesma classe do
-- filho; apagar um pai com filhos é barrado (RESTRICT). Kind sem classe (um
-- kind novo, ou «Desconhecido») aparece em «Outros» no app.
--
-- Sem tela de edição: um kind novo se classifica com um UPDATE como os abaixo.
-- Depois de qualquer UPDATE manual, rode a verificação do fim do arquivo.
--
-- Aplicar UMA vez (o ALTER não se repete), ANTES do deploy do Worker que lê as colunas:
--   cd api && wrangler d1 execute coldigom --remote --file=migrations/024_material_kind_classes.sql

CREATE TABLE IF NOT EXISTS material_kind_classes (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    sort_order INTEGER NOT NULL UNIQUE
);

ALTER TABLE material_kinds ADD COLUMN class_id TEXT REFERENCES material_kind_classes(id) ON DELETE SET NULL;
ALTER TABLE material_kinds ADD COLUMN parent_id TEXT REFERENCES material_kinds(id) ON DELETE RESTRICT;
ALTER TABLE material_kinds ADD COLUMN sort_order INTEGER;
CREATE INDEX IF NOT EXISTS idx_material_kinds_parent_id ON material_kinds(parent_id);

INSERT OR IGNORE INTO material_kind_classes (id, label, sort_order) VALUES
    ('regencia', 'Regência e geral', 10),
    ('letra', 'Letra e projeção', 20),
    ('vozes', 'Vozes', 30),
    ('madeiras', 'Madeiras', 40),
    ('metais', 'Metais', 50),
    ('percussao', 'Percussão', 60),
    ('banda', 'Banda', 70),
    ('cordas', 'Cordas', 80),
    ('audio', 'Áudio e acompanhamento', 90),
    ('midi', 'MIDI de ensaio', 100);

-- Classificação dos kinds de produção (2026-09-24), por id. Pais antes dos filhos.
UPDATE material_kinds SET class_id = 'regencia', parent_id = NULL, sort_order = 10 WHERE id = '36fa6e60-37d6-40a4-87e4-aa099839ad25'; -- Partitura
UPDATE material_kinds SET class_id = 'regencia', parent_id = NULL, sort_order = 20 WHERE id = 'a19e9baa-596d-4d11-87a4-f0ccecdebca3'; -- Grade
UPDATE material_kinds SET class_id = 'regencia', parent_id = NULL, sort_order = 30 WHERE id = '316d120c-527f-4a66-aa25-88c1b19f4714'; -- Instrumental
UPDATE material_kinds SET class_id = 'regencia', parent_id = NULL, sort_order = 40 WHERE id = 'e1a12c9e-ef1a-4ec9-9289-799479bc2e9b'; -- Experiência
UPDATE material_kinds SET class_id = 'letra', parent_id = NULL, sort_order = 10 WHERE id = '3b55c854-aa8e-43cf-9433-ba49a0161d90'; -- Letra
UPDATE material_kinds SET class_id = 'letra', parent_id = NULL, sort_order = 20 WHERE id = '8320af91-584c-4108-9cb9-6f23087a3a60'; -- Slide
UPDATE material_kinds SET class_id = 'letra', parent_id = NULL, sort_order = 30 WHERE id = '4a21d073-1726-41a3-bca7-77550f91e02a'; -- Gestos CIAs
UPDATE material_kinds SET class_id = 'vozes', parent_id = NULL, sort_order = 10 WHERE id = 'c2fb644f-697c-4d43-9d5f-22319fa0ce79'; -- Coro
UPDATE material_kinds SET class_id = 'vozes', parent_id = NULL, sort_order = 20 WHERE id = 'b324adec-924d-4a6b-9c2c-b3ef59eb1f6c'; -- Primeira voz
UPDATE material_kinds SET class_id = 'vozes', parent_id = NULL, sort_order = 30 WHERE id = '32f70923-fbe8-4e39-893e-fc30824f749e'; -- Segunda voz
UPDATE material_kinds SET class_id = 'vozes', parent_id = NULL, sort_order = 40 WHERE id = '261d020a-1c04-4196-89ba-2bef4e090019'; -- Voz cantada
UPDATE material_kinds SET class_id = 'vozes', parent_id = NULL, sort_order = 50 WHERE id = 'e60c9cf5-37d4-4f93-9459-0f1d4625d395'; -- Voz mulheres
UPDATE material_kinds SET class_id = 'vozes', parent_id = NULL, sort_order = 60 WHERE id = 'e559526d-1064-401b-9a34-e4c39a302143'; -- Voz homens
UPDATE material_kinds SET class_id = 'vozes', parent_id = NULL, sort_order = 70 WHERE id = '3723a55b-a0bb-49b1-be0e-2914915c51af'; -- Voz soprano
UPDATE material_kinds SET class_id = 'vozes', parent_id = '3723a55b-a0bb-49b1-be0e-2914915c51af', sort_order = 80 WHERE id = 'cf15647d-eaab-47ec-b313-95deec1d04e8'; -- Voz soprano I
UPDATE material_kinds SET class_id = 'vozes', parent_id = '3723a55b-a0bb-49b1-be0e-2914915c51af', sort_order = 90 WHERE id = 'e3e43744-492b-41a1-9f84-92f9e7d983dd'; -- Voz soprano II
UPDATE material_kinds SET class_id = 'vozes', parent_id = NULL, sort_order = 100 WHERE id = '8ddc2fed-5298-4ead-bc71-e529921c00ac'; -- Voz contralto
UPDATE material_kinds SET class_id = 'vozes', parent_id = '8ddc2fed-5298-4ead-bc71-e529921c00ac', sort_order = 110 WHERE id = 'a185dd50-a5f4-46be-a364-d4d609cadcca'; -- Voz contralto I
UPDATE material_kinds SET class_id = 'vozes', parent_id = '8ddc2fed-5298-4ead-bc71-e529921c00ac', sort_order = 120 WHERE id = '6db799b5-20ea-4c9a-8d0d-18840c593ff4'; -- Voz contralto II
UPDATE material_kinds SET class_id = 'vozes', parent_id = NULL, sort_order = 130 WHERE id = '9125e159-3fd8-492d-952d-f8887e57d59f'; -- Voz tenor
UPDATE material_kinds SET class_id = 'vozes', parent_id = '9125e159-3fd8-492d-952d-f8887e57d59f', sort_order = 140 WHERE id = '6b0c073a-f6f7-414c-9859-7c2d4a0a94c6'; -- Voz tenor I
UPDATE material_kinds SET class_id = 'vozes', parent_id = '9125e159-3fd8-492d-952d-f8887e57d59f', sort_order = 150 WHERE id = '481a43df-dd03-4a0a-a333-7ca0aa99fdf7'; -- Voz tenor II
UPDATE material_kinds SET class_id = 'vozes', parent_id = NULL, sort_order = 160 WHERE id = 'ad27aa1a-7da8-41da-a8bc-71676acdc63d'; -- Voz barítono
UPDATE material_kinds SET class_id = 'vozes', parent_id = NULL, sort_order = 170 WHERE id = 'c4ddecbd-ef4d-4e20-bece-4261201bccc8'; -- Voz baixo
UPDATE material_kinds SET class_id = 'madeiras', parent_id = NULL, sort_order = 10 WHERE id = '5605546e-b832-4b47-a141-13eed9d1a644'; -- Madeiras
UPDATE material_kinds SET class_id = 'madeiras', parent_id = NULL, sort_order = 20 WHERE id = '8601426e-d1e8-4cb6-889e-17a1c116cdf5'; -- Flautim
UPDATE material_kinds SET class_id = 'madeiras', parent_id = NULL, sort_order = 30 WHERE id = '11e3c9eb-c022-48c4-82a4-91f09bf089b0'; -- Flauta
UPDATE material_kinds SET class_id = 'madeiras', parent_id = NULL, sort_order = 40 WHERE id = '5181c85f-7f24-4002-b4e0-74cdcea9de4b'; -- Oboé
UPDATE material_kinds SET class_id = 'madeiras', parent_id = NULL, sort_order = 50 WHERE id = '12f9ac21-4bec-40e0-9411-d39a129f2c7b'; -- Clarinete
UPDATE material_kinds SET class_id = 'madeiras', parent_id = '12f9ac21-4bec-40e0-9411-d39a129f2c7b', sort_order = 60 WHERE id = '59df1962-d245-41eb-9fdc-ca79d69a34ab'; -- Clarinete em Si bemol
UPDATE material_kinds SET class_id = 'madeiras', parent_id = NULL, sort_order = 70 WHERE id = '4930d355-80ce-4192-8bab-c09d00f82c3c'; -- Fagote
UPDATE material_kinds SET class_id = 'metais', parent_id = NULL, sort_order = 10 WHERE id = '1427517d-7991-4fad-a023-4b0ec3f46166'; -- Metais
UPDATE material_kinds SET class_id = 'metais', parent_id = NULL, sort_order = 20 WHERE id = '495a10f3-204b-4fdd-9cea-755cda0fcff8'; -- Harmonia
UPDATE material_kinds SET class_id = 'metais', parent_id = NULL, sort_order = 30 WHERE id = 'a3f9d722-b43c-4639-beb0-48a75757ab00'; -- Saxofone
UPDATE material_kinds SET class_id = 'metais', parent_id = 'a3f9d722-b43c-4639-beb0-48a75757ab00', sort_order = 40 WHERE id = 'e1f16ebc-20af-4d12-b95f-80f3608df128'; -- Saxofone soprano
UPDATE material_kinds SET class_id = 'metais', parent_id = 'a3f9d722-b43c-4639-beb0-48a75757ab00', sort_order = 50 WHERE id = '6d35011f-b98b-436f-b4f7-92c3cff413c5'; -- Saxofone alto
UPDATE material_kinds SET class_id = 'metais', parent_id = 'a3f9d722-b43c-4639-beb0-48a75757ab00', sort_order = 60 WHERE id = '68915148-9029-4c2b-bb35-c89338240f0a'; -- Saxofone tenor
UPDATE material_kinds SET class_id = 'metais', parent_id = 'a3f9d722-b43c-4639-beb0-48a75757ab00', sort_order = 70 WHERE id = '40f562c0-c506-4044-a598-cccea7500fc4'; -- Saxofone barítono
UPDATE material_kinds SET class_id = 'metais', parent_id = NULL, sort_order = 80 WHERE id = 'ef814b88-2562-4785-98a1-5fca88c11824'; -- Trompa
UPDATE material_kinds SET class_id = 'metais', parent_id = 'ef814b88-2562-4785-98a1-5fca88c11824', sort_order = 90 WHERE id = '4243223d-c2a0-433c-b385-1994dcfe4e46'; -- Trompa em Fá
UPDATE material_kinds SET class_id = 'metais', parent_id = NULL, sort_order = 100 WHERE id = 'b2d08b24-26b7-4bf6-970d-eb84e29833ea'; -- Trompete
UPDATE material_kinds SET class_id = 'metais', parent_id = 'b2d08b24-26b7-4bf6-970d-eb84e29833ea', sort_order = 110 WHERE id = '22997832-30fe-48e1-bdc0-3493b39814fb'; -- Trompete em Si bemol
UPDATE material_kinds SET class_id = 'metais', parent_id = NULL, sort_order = 120 WHERE id = 'a3d013e7-790b-4e4e-a254-aefb14185b51'; -- Corneta
UPDATE material_kinds SET class_id = 'metais', parent_id = NULL, sort_order = 130 WHERE id = 'd65e6267-372e-4377-80ed-8a02a6bed47f'; -- Flugelhorn
UPDATE material_kinds SET class_id = 'metais', parent_id = NULL, sort_order = 140 WHERE id = '93ea287b-d712-4452-8ec6-84478ecb6c22'; -- Trombone
UPDATE material_kinds SET class_id = 'metais', parent_id = NULL, sort_order = 150 WHERE id = 'fb57aa8d-ba2d-4854-b3b5-41107b7240a0'; -- Eufônio
UPDATE material_kinds SET class_id = 'metais', parent_id = NULL, sort_order = 160 WHERE id = '27c1d204-c45f-4d6c-8f0f-90df3700e82a'; -- Tuba
UPDATE material_kinds SET class_id = 'percussao', parent_id = NULL, sort_order = 10 WHERE id = 'f04c2dbe-8152-430c-8120-5a51f3b2fac5'; -- Percussão
UPDATE material_kinds SET class_id = 'percussao', parent_id = NULL, sort_order = 20 WHERE id = '8146609a-659e-4787-9e7e-64f19d21a132'; -- Bateria
UPDATE material_kinds SET class_id = 'percussao', parent_id = NULL, sort_order = 30 WHERE id = '541a5d3e-e788-4de2-98ea-18b0317b0c33'; -- Bumbo
UPDATE material_kinds SET class_id = 'percussao', parent_id = NULL, sort_order = 40 WHERE id = 'c1187df7-8d86-4865-bef8-1911dd82cfba'; -- Caixa
UPDATE material_kinds SET class_id = 'percussao', parent_id = NULL, sort_order = 50 WHERE id = '04c80f74-0348-43af-8eb5-67699826e758'; -- Prato
UPDATE material_kinds SET class_id = 'percussao', parent_id = '04c80f74-0348-43af-8eb5-67699826e758', sort_order = 60 WHERE id = '8c548fbb-7c9b-4563-aea9-5b7cfb9f9244'; -- Prato suspenso
UPDATE material_kinds SET class_id = 'percussao', parent_id = NULL, sort_order = 70 WHERE id = '9b0099ff-dc7a-48c2-a3be-6d02b5c2340c'; -- Tímpanos
UPDATE material_kinds SET class_id = 'percussao', parent_id = NULL, sort_order = 80 WHERE id = 'b6a296c6-f1f5-4b4d-a5db-1a63021b9c3a'; -- Glockenspiel
UPDATE material_kinds SET class_id = 'percussao', parent_id = NULL, sort_order = 90 WHERE id = '9854d697-97cc-4c27-9d66-996cf38ebf10'; -- Vibrafone
UPDATE material_kinds SET class_id = 'percussao', parent_id = NULL, sort_order = 100 WHERE id = '6e373b8f-61cc-4046-8f3a-17254b5672f4'; -- Sinos de orquestra
UPDATE material_kinds SET class_id = 'banda', parent_id = NULL, sort_order = 10 WHERE id = 'e2274af6-a19f-4186-93cd-e3810ce75e2c'; -- Cifra
UPDATE material_kinds SET class_id = 'banda', parent_id = 'e2274af6-a19f-4186-93cd-e3810ce75e2c', sort_order = 20 WHERE id = '27e39659-b4a0-4ef2-87f4-546fe292298d'; -- Cifra I
UPDATE material_kinds SET class_id = 'banda', parent_id = 'e2274af6-a19f-4186-93cd-e3810ce75e2c', sort_order = 30 WHERE id = '5a9d9ced-a5e3-4848-adac-f02a14b56038'; -- Cifra II
UPDATE material_kinds SET class_id = 'banda', parent_id = NULL, sort_order = 40 WHERE id = '38d1bb43-0959-435d-b845-754ebec83a87'; -- Violão
UPDATE material_kinds SET class_id = 'banda', parent_id = NULL, sort_order = 50 WHERE id = 'f10ab9ff-a44e-4b4d-ad93-9203527d74e1'; -- Teclado
UPDATE material_kinds SET class_id = 'banda', parent_id = NULL, sort_order = 60 WHERE id = '09d5120b-2dd2-4408-8982-68bee197ce6a'; -- Piano
UPDATE material_kinds SET class_id = 'banda', parent_id = NULL, sort_order = 70 WHERE id = 'e3a4ae9d-fce7-4d00-ba07-0068121e811c'; -- Baixo elétrico
UPDATE material_kinds SET class_id = 'banda', parent_id = NULL, sort_order = 80 WHERE id = '4a3be8c6-9e6a-42d6-9181-0cd19e2d1096'; -- Base
UPDATE material_kinds SET class_id = 'banda', parent_id = NULL, sort_order = 90 WHERE id = '835cdb0c-8920-4a69-a067-a31c5afb6560'; -- Coro e piano
UPDATE material_kinds SET class_id = 'cordas', parent_id = NULL, sort_order = 10 WHERE id = 'ac66b2d8-814c-42a0-8210-1b767ac609f7'; -- Cordas
UPDATE material_kinds SET class_id = 'cordas', parent_id = NULL, sort_order = 20 WHERE id = 'b30b17c4-3d57-459c-a50c-9561b98ecedb'; -- Violino
UPDATE material_kinds SET class_id = 'cordas', parent_id = 'b30b17c4-3d57-459c-a50c-9561b98ecedb', sort_order = 30 WHERE id = '02e5d7fc-640d-4a22-ae31-20556f19fc63'; -- Violino I
UPDATE material_kinds SET class_id = 'cordas', parent_id = 'b30b17c4-3d57-459c-a50c-9561b98ecedb', sort_order = 40 WHERE id = '858d8a00-e4f3-4679-9e33-4026c87df8f4'; -- Violino II
UPDATE material_kinds SET class_id = 'cordas', parent_id = NULL, sort_order = 50 WHERE id = '5d491559-6298-419d-a2d5-399675386a40'; -- Viola
UPDATE material_kinds SET class_id = 'cordas', parent_id = NULL, sort_order = 60 WHERE id = '8cd30965-53c2-4317-bf24-52c8a430005b'; -- Violoncelo
UPDATE material_kinds SET class_id = 'cordas', parent_id = NULL, sort_order = 70 WHERE id = '71128210-90f0-447d-b201-aabd62a025bc'; -- Contrabaixo
UPDATE material_kinds SET class_id = 'audio', parent_id = NULL, sort_order = 10 WHERE id = '8860ed67-6b33-4e08-9064-adb93a5f5c2a'; -- Áudio
UPDATE material_kinds SET class_id = 'audio', parent_id = '8860ed67-6b33-4e08-9064-adb93a5f5c2a', sort_order = 20 WHERE id = '649b3ef6-60f3-4956-b0dc-b3a8b73ca1d2'; -- Áudio (grupo)
UPDATE material_kinds SET class_id = 'audio', parent_id = '8860ed67-6b33-4e08-9064-adb93a5f5c2a', sort_order = 30 WHERE id = 'e27f4585-f1ec-43fe-98ed-6fc4405447e0'; -- Áudio (solo)
UPDATE material_kinds SET class_id = 'audio', parent_id = NULL, sort_order = 40 WHERE id = '64be7569-0246-4334-96c4-cb3cfb3ae5b2'; -- Playback
UPDATE material_kinds SET class_id = 'audio', parent_id = NULL, sort_order = 50 WHERE id = '7c589108-7ab9-45cb-bcaa-2bff7e109ba5'; -- Versão de ensaio
UPDATE material_kinds SET class_id = 'midi', parent_id = NULL, sort_order = 10 WHERE id = 'a7d5270a-652c-4f88-afb4-3dccf5cb89e1'; -- MIDI
UPDATE material_kinds SET class_id = 'midi', parent_id = NULL, sort_order = 20 WHERE id = '9641ba0d-0ccd-4f51-8747-7e6c002e461e'; -- MIDI geral
UPDATE material_kinds SET class_id = 'midi', parent_id = NULL, sort_order = 30 WHERE id = 'bfcc4a22-e9ae-4cab-946c-f4c6199f1feb'; -- MIDI grade
UPDATE material_kinds SET class_id = 'midi', parent_id = NULL, sort_order = 40 WHERE id = '56c252f4-bcbe-47b9-99f6-f996de79ec32'; -- MIDI coro
UPDATE material_kinds SET class_id = 'midi', parent_id = NULL, sort_order = 50 WHERE id = '578fa489-d31e-4a0e-8883-5e2c8a2b8957'; -- MIDI instrumentos
UPDATE material_kinds SET class_id = 'midi', parent_id = NULL, sort_order = 60 WHERE id = 'da800c21-8078-4c3b-9fc5-ff66d53858d3'; -- MIDI voz
UPDATE material_kinds SET class_id = 'midi', parent_id = 'da800c21-8078-4c3b-9fc5-ff66d53858d3', sort_order = 70 WHERE id = '4120bf94-6ef9-4c94-be8f-97d088f0d9d4'; -- MIDI voz mulheres
UPDATE material_kinds SET class_id = 'midi', parent_id = 'da800c21-8078-4c3b-9fc5-ff66d53858d3', sort_order = 80 WHERE id = '4b880911-32df-4b86-aae2-78c6e467de60'; -- MIDI voz homens
UPDATE material_kinds SET class_id = 'midi', parent_id = NULL, sort_order = 90 WHERE id = '69b7a7c4-27e6-42a4-855c-1f0c9fd21940'; -- MIDI mulheres
UPDATE material_kinds SET class_id = 'midi', parent_id = NULL, sort_order = 100 WHERE id = 'fedcb814-e0b4-4bf9-9cb3-81898333d224'; -- MIDI homens
UPDATE material_kinds SET class_id = 'midi', parent_id = NULL, sort_order = 110 WHERE id = '9bc574f7-fc96-427d-84c4-b060ef1a20cf'; -- MIDI primeira voz
UPDATE material_kinds SET class_id = 'midi', parent_id = NULL, sort_order = 120 WHERE id = 'c518686d-3919-45bd-8aac-314d7f30d7cc'; -- MIDI segunda voz
UPDATE material_kinds SET class_id = 'midi', parent_id = NULL, sort_order = 130 WHERE id = 'b33a159b-955e-4e93-bdce-3f9dfeb811b2'; -- MIDI soprano
UPDATE material_kinds SET class_id = 'midi', parent_id = 'b33a159b-955e-4e93-bdce-3f9dfeb811b2', sort_order = 140 WHERE id = '8040b04a-d09b-46af-add6-32958c719369'; -- MIDI soprano I
UPDATE material_kinds SET class_id = 'midi', parent_id = 'b33a159b-955e-4e93-bdce-3f9dfeb811b2', sort_order = 150 WHERE id = '48a0529d-f6c4-455c-b83b-19a99c0285ae'; -- MIDI soprano II
UPDATE material_kinds SET class_id = 'midi', parent_id = NULL, sort_order = 160 WHERE id = 'ab76454d-6876-433b-932c-6b4bb88075ac'; -- MIDI contralto
UPDATE material_kinds SET class_id = 'midi', parent_id = 'ab76454d-6876-433b-932c-6b4bb88075ac', sort_order = 170 WHERE id = '23d92c83-1bad-4c4a-a741-3306ce491bb5'; -- MIDI contralto I
UPDATE material_kinds SET class_id = 'midi', parent_id = 'ab76454d-6876-433b-932c-6b4bb88075ac', sort_order = 180 WHERE id = '251cc51f-5208-4b8c-a23c-657694a08997'; -- MIDI contralto II
UPDATE material_kinds SET class_id = 'midi', parent_id = NULL, sort_order = 190 WHERE id = '4bbf1331-b13e-4029-bbb7-bf5eda568409'; -- MIDI tenor
UPDATE material_kinds SET class_id = 'midi', parent_id = '4bbf1331-b13e-4029-bbb7-bf5eda568409', sort_order = 200 WHERE id = '76dd9e81-3b5a-4cad-b9c1-a688bdd60fbc'; -- MIDI tenor I
UPDATE material_kinds SET class_id = 'midi', parent_id = '4bbf1331-b13e-4029-bbb7-bf5eda568409', sort_order = 210 WHERE id = '06e50eca-b05d-4a69-8ce3-d4a3179bd11e'; -- MIDI tenor II
UPDATE material_kinds SET class_id = 'midi', parent_id = NULL, sort_order = 220 WHERE id = '02e00e67-ada7-4ac3-a8c5-7d9a2ab2465b'; -- MIDI barítono
UPDATE material_kinds SET class_id = 'midi', parent_id = NULL, sort_order = 230 WHERE id = '82977793-e6e3-404c-bc22-cec6d4834151'; -- MIDI baixo
UPDATE material_kinds SET class_id = 'midi', parent_id = '82977793-e6e3-404c-bc22-cec6d4834151', sort_order = 240 WHERE id = '2f7c63fc-c6f2-4357-86e7-77c7605f7eca'; -- MIDI baixo I
UPDATE material_kinds SET class_id = 'midi', parent_id = '82977793-e6e3-404c-bc22-cec6d4834151', sort_order = 250 WHERE id = '35ab281e-8aab-4be4-ba74-ef6ce771c46b'; -- MIDI baixo II
-- Verificação (deve voltar vazia):
--   SELECT c.id FROM material_kinds c JOIN material_kinds p ON p.id = c.parent_id
--   WHERE p.parent_id IS NOT NULL OR c.class_id IS NOT p.class_id OR c.id = c.parent_id;
