-- Material kind display labels (pt-BR)
-- Apply: wrangler d1 execute coldigom --remote --file=migrations/002_material_kind_translations_pt-BR.sql

CREATE TABLE IF NOT EXISTS material_kind_translations (
    material_kind_id TEXT NOT NULL,
    locale TEXT NOT NULL,
    label TEXT NOT NULL,
    PRIMARY KEY (material_kind_id, locale),
    FOREIGN KEY (material_kind_id) REFERENCES material_kinds(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mk_translations_locale ON material_kind_translations(locale);

INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('6d35011f-b98b-436f-b4f7-92c3cff413c5', 'pt-BR', 'Saxofone alto');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('8ddc2fed-5298-4ead-bc71-e529921c00ac', 'pt-BR', 'Voz contralto');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('a185dd50-a5f4-46be-a364-d4d609cadcca', 'pt-BR', 'Voz contralto I');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('6db799b5-20ea-4c9a-8d0d-18840c593ff4', 'pt-BR', 'Voz contralto II');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('8860ed67-6b33-4e08-9064-adb93a5f5c2a', 'pt-BR', 'Áudio');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('649b3ef6-60f3-4956-b0dc-b3a8b73ca1d2', 'pt-BR', 'Áudio (grupo)');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('e27f4585-f1ec-43fe-98ed-6fc4405447e0', 'pt-BR', 'Áudio (solo)');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('40f562c0-c506-4044-a598-cccea7500fc4', 'pt-BR', 'Saxofone barítono');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('ad27aa1a-7da8-41da-a8bc-71676acdc63d', 'pt-BR', 'Voz barítono');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('4a3be8c6-9e6a-42d6-9181-0cd19e2d1096', 'pt-BR', 'Baixo');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('541a5d3e-e788-4de2-98ea-18b0317b0c33', 'pt-BR', 'Bumbo');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('c4ddecbd-ef4d-4e20-bece-4261201bccc8', 'pt-BR', 'Voz baixo');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('4930d355-80ce-4192-8bab-c09d00f82c3c', 'pt-BR', 'Fagote');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('1427517d-7991-4fad-a023-4b0ec3f46166', 'pt-BR', 'Metais');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('8cd30965-53c2-4317-bf24-52c8a430005b', 'pt-BR', 'Violoncelo');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('c2fb644f-697c-4d43-9d5f-22319fa0ce79', 'pt-BR', 'Coral');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('835cdb0c-8920-4a69-a067-a31c5afb6560', 'pt-BR', 'Coral e piano');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('e2274af6-a19f-4186-93cd-e3810ce75e2c', 'pt-BR', 'Cifra');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('27e39659-b4a0-4ef2-87f4-546fe292298d', 'pt-BR', 'Cifra I');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('5a9d9ced-a5e3-4848-adac-f02a14b56038', 'pt-BR', 'Cifra II');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('12f9ac21-4bec-40e0-9411-d39a129f2c7b', 'pt-BR', 'Clarinete');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('59df1962-d245-41eb-9fdc-ca79d69a34ab', 'pt-BR', 'Clarinete em Si bemol');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('71128210-90f0-447d-b201-aabd62a025bc', 'pt-BR', 'Contrabaixo');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('a3d013e7-790b-4e4e-a254-aefb14185b51', 'pt-BR', 'Corneta');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('04c80f74-0348-43af-8eb5-67699826e758', 'pt-BR', 'Prato');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('8146609a-659e-4787-9e7e-64f19d21a132', 'pt-BR', 'Bateria');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('e3a4ae9d-fce7-4d00-ba07-0068121e811c', 'pt-BR', 'Baixo elétrico');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('fb57aa8d-ba2d-4854-b3b5-41107b7240a0', 'pt-BR', 'Eufônio');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('e1a12c9e-ef1a-4ec9-9289-799479bc2e9b', 'pt-BR', 'Experiência');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('b324adec-924d-4a6b-9c2c-b3ef59eb1f6c', 'pt-BR', 'Primeira voz');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('d65e6267-372e-4377-80ed-8a02a6bed47f', 'pt-BR', 'Flugelhorn');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('11e3c9eb-c022-48c4-82a4-91f09bf089b0', 'pt-BR', 'Flauta');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('ef814b88-2562-4785-98a1-5fca88c11824', 'pt-BR', 'Trompa');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('4243223d-c2a0-433c-b385-1994dcfe4e46', 'pt-BR', 'Trompa em Fá');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('4a21d073-1726-41a3-bca7-77550f91e02a', 'pt-BR', 'Gestos CIAs');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('b6a296c6-f1f5-4b4d-a5db-1a63021b9c3a', 'pt-BR', 'Glockenspiel');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('38d1bb43-0959-435d-b845-754ebec83a87', 'pt-BR', 'Violão');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('495a10f3-204b-4fdd-9cea-755cda0fcff8', 'pt-BR', 'Harmonia');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('316d120c-527f-4a66-aa25-88c1b19f4714', 'pt-BR', 'Instrumental');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('f10ab9ff-a44e-4b4d-ad93-9203527d74e1', 'pt-BR', 'Teclado');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('3b55c854-aa8e-43cf-9433-ba49a0161d90', 'pt-BR', 'Letra');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('a7d5270a-652c-4f88-afb4-3dccf5cb89e1', 'pt-BR', 'MIDI');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('ab76454d-6876-433b-932c-6b4bb88075ac', 'pt-BR', 'MIDI contralto');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('23d92c83-1bad-4c4a-a741-3306ce491bb5', 'pt-BR', 'MIDI contralto I');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('251cc51f-5208-4b8c-a23c-657694a08997', 'pt-BR', 'MIDI contralto II');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('02e00e67-ada7-4ac3-a8c5-7d9a2ab2465b', 'pt-BR', 'MIDI barítono');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('82977793-e6e3-404c-bc22-cec6d4834151', 'pt-BR', 'MIDI baixo');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('2f7c63fc-c6f2-4357-86e7-77c7605f7eca', 'pt-BR', 'MIDI baixo I');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('35ab281e-8aab-4be4-ba74-ef6ce771c46b', 'pt-BR', 'MIDI baixo II');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('56c252f4-bcbe-47b9-99f6-f996de79ec32', 'pt-BR', 'MIDI coral');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('9bc574f7-fc96-427d-84c4-b060ef1a20cf', 'pt-BR', 'MIDI primeira voz');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('9641ba0d-0ccd-4f51-8747-7e6c002e461e', 'pt-BR', 'MIDI geral');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('578fa489-d31e-4a0e-8883-5e2c8a2b8957', 'pt-BR', 'MIDI instrumentos');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('fedcb814-e0b4-4bf9-9cb3-81898333d224', 'pt-BR', 'MIDI homens');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('bfcc4a22-e9ae-4cab-946c-f4c6199f1feb', 'pt-BR', 'MIDI partitura');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('c518686d-3919-45bd-8aac-314d7f30d7cc', 'pt-BR', 'MIDI segunda voz');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('b33a159b-955e-4e93-bdce-3f9dfeb811b2', 'pt-BR', 'MIDI soprano');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('8040b04a-d09b-46af-add6-32958c719369', 'pt-BR', 'MIDI soprano I');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('48a0529d-f6c4-455c-b83b-19a99c0285ae', 'pt-BR', 'MIDI soprano II');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('4bbf1331-b13e-4029-bbb7-bf5eda568409', 'pt-BR', 'MIDI tenor');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('76dd9e81-3b5a-4cad-b9c1-a688bdd60fbc', 'pt-BR', 'MIDI tenor I');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('06e50eca-b05d-4a69-8ce3-d4a3179bd11e', 'pt-BR', 'MIDI tenor II');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('da800c21-8078-4c3b-9fc5-ff66d53858d3', 'pt-BR', 'MIDI voz');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('4b880911-32df-4b86-aae2-78c6e467de60', 'pt-BR', 'MIDI voz homens');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('4120bf94-6ef9-4c94-be8f-97d088f0d9d4', 'pt-BR', 'MIDI voz mulheres');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('69b7a7c4-27e6-42a4-855c-1f0c9fd21940', 'pt-BR', 'MIDI mulheres');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('5181c85f-7f24-4002-b4e0-74cdcea9de4b', 'pt-BR', 'Oboé');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('6e373b8f-61cc-4046-8f3a-17254b5672f4', 'pt-BR', 'Sinos de orquestra');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('f04c2dbe-8152-430c-8120-5a51f3b2fac5', 'pt-BR', 'Percussão');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('09d5120b-2dd2-4408-8982-68bee197ce6a', 'pt-BR', 'Piano');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('8601426e-d1e8-4cb6-889e-17a1c116cdf5', 'pt-BR', 'Flautim');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('64be7569-0246-4334-96c4-cb3cfb3ae5b2', 'pt-BR', 'Playback');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('7c589108-7ab9-45cb-bcaa-2bff7e109ba5', 'pt-BR', 'Versão de ensaio');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('a3f9d722-b43c-4639-beb0-48a75757ab00', 'pt-BR', 'Saxofone');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('a19e9baa-596d-4d11-87a4-f0ccecdebca3', 'pt-BR', 'Partitura');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('32f70923-fbe8-4e39-893e-fc30824f749e', 'pt-BR', 'Segunda voz');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('36fa6e60-37d6-40a4-87e4-aa099839ad25', 'pt-BR', 'Partitura');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('8320af91-584c-4108-9cb9-6f23087a3a60', 'pt-BR', 'Slide');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('c1187df7-8d86-4865-bef8-1911dd82cfba', 'pt-BR', 'Caixa');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('e1f16ebc-20af-4d12-b95f-80f3608df128', 'pt-BR', 'Saxofone soprano');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('3723a55b-a0bb-49b1-be0e-2914915c51af', 'pt-BR', 'Voz soprano');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('cf15647d-eaab-47ec-b313-95deec1d04e8', 'pt-BR', 'Voz soprano I');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('e3e43744-492b-41a1-9f84-92f9e7d983dd', 'pt-BR', 'Voz soprano II');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('ac66b2d8-814c-42a0-8210-1b767ac609f7', 'pt-BR', 'Cordas');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('261d020a-1c04-4196-89ba-2bef4e090019', 'pt-BR', 'Voz cantada');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('8c548fbb-7c9b-4563-aea9-5b7cfb9f9244', 'pt-BR', 'Prato suspenso');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('68915148-9029-4c2b-bb35-c89338240f0a', 'pt-BR', 'Saxofone tenor');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('9125e159-3fd8-492d-952d-f8887e57d59f', 'pt-BR', 'Voz tenor');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('6b0c073a-f6f7-414c-9859-7c2d4a0a94c6', 'pt-BR', 'Voz tenor I');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('481a43df-dd03-4a0a-a333-7ca0aa99fdf7', 'pt-BR', 'Voz tenor II');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('9b0099ff-dc7a-48c2-a3be-6d02b5c2340c', 'pt-BR', 'Tímpanos');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('93ea287b-d712-4452-8ec6-84478ecb6c22', 'pt-BR', 'Trombone');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('b2d08b24-26b7-4bf6-970d-eb84e29833ea', 'pt-BR', 'Trompete');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('22997832-30fe-48e1-bdc0-3493b39814fb', 'pt-BR', 'Trompete em Si bemol');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('27c1d204-c45f-4d6c-8f0f-90df3700e82a', 'pt-BR', 'Tuba');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('9854d697-97cc-4c27-9d66-996cf38ebf10', 'pt-BR', 'Vibrafone');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('5d491559-6298-419d-a2d5-399675386a40', 'pt-BR', 'Viola');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('b30b17c4-3d57-459c-a50c-9561b98ecedb', 'pt-BR', 'Violino');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('02e5d7fc-640d-4a22-ae31-20556f19fc63', 'pt-BR', 'Violino I');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('858d8a00-e4f3-4679-9e33-4026c87df8f4', 'pt-BR', 'Violino II');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('e559526d-1064-401b-9a34-e4c39a302143', 'pt-BR', 'Voz homens');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('e60c9cf5-37d4-4f93-9459-0f1d4625d395', 'pt-BR', 'Voz mulheres');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('5605546e-b832-4b47-a141-13eed9d1a644', 'pt-BR', 'Madeiras');
