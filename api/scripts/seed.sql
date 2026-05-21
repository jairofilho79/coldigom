INSERT INTO material_kinds (id, name) VALUES ('68d7b6f7-a6bd-45ad-b712-95db907f853c', 'Áudio');
INSERT INTO material_kinds (id, name) VALUES ('f2666cb0-d69a-4710-b6ef-03e4a69af164', 'Partitura');
INSERT INTO material_kinds (id, name) VALUES ('ab74b25c-72ed-4342-aef9-789282e5b3d5', 'MIDI');
INSERT INTO material_kinds (id, name) VALUES ('2d6c0599-ddf7-4a3b-b2e3-b999219bd9a0', 'Letra');
INSERT INTO material_kinds (id, name) VALUES ('04dfd0f1-ab99-4eec-948d-f5c17869259f', 'Cifra');
INSERT INTO material_kinds (id, name) VALUES ('95ee0488-eae1-4551-b587-7e9617211b9d', 'Vozes');
INSERT INTO material_kinds (id, name) VALUES ('d86323b8-633f-4b3c-a2a6-9c3b05fb7972', 'Instrumentos');
INSERT INTO material_kinds (id, name) VALUES ('c16e9157-3b0e-4fec-ae9b-e6ed01852a58', 'Playalong');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('68d7b6f7-a6bd-45ad-b712-95db907f853c', 'pt-BR', 'Áudio');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('f2666cb0-d69a-4710-b6ef-03e4a69af164', 'pt-BR', 'Partitura');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('ab74b25c-72ed-4342-aef9-789282e5b3d5', 'pt-BR', 'MIDI');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('2d6c0599-ddf7-4a3b-b2e3-b999219bd9a0', 'pt-BR', 'Letra');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('04dfd0f1-ab99-4eec-948d-f5c17869259f', 'pt-BR', 'Cifra');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('95ee0488-eae1-4551-b587-7e9617211b9d', 'pt-BR', 'Vozes');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('d86323b8-633f-4b3c-a2a6-9c3b05fb7972', 'pt-BR', 'Instrumentos');
INSERT OR REPLACE INTO material_kind_translations (material_kind_id, locale, label) VALUES ('c16e9157-3b0e-4fec-ae9b-e6ed01852a58', 'pt-BR', 'Playalong');
INSERT INTO tags (id, name) VALUES ('1c6139f0-536a-496a-9f86-6b281321acbd', 'Coletânea');
INSERT INTO tags (id, name) VALUES ('dca5af40-3d5e-4e8d-a4b0-56b3b558e304', 'Avulsos');
INSERT INTO tags (id, name) VALUES ('e49cea68-b261-42a8-9ea4-fae45f337597', 'CIAs');
INSERT INTO tags (id, name) VALUES ('aac881e1-228c-44cb-9fe9-b5feb5da4444', 'GLTM');
INSERT INTO tags (id, name) VALUES ('26f42a63-0eac-4e1d-9096-973bfe8d193a', 'PES');
INSERT INTO tags (id, name) VALUES ('59db85f8-4c2b-4da5-80c7-c9b770922199', 'Migrados');
INSERT INTO tags (id, name) VALUES ('8c473fcc-77d2-4a25-b364-787341f39608', 'Diversos');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('c18fb284-b8a9-471c-8a80-369b04c41b55', 'Aleluia', '001', 'Heitor P. de Oliveira', 'Marcha', 'Sol Maior', 'Adoração', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('c18fb284-b8a9-471c-8a80-369b04c41b55', 'e49cea68-b261-42a8-9ea4-fae45f337597');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('45d76670-0bbd-4396-a4b5-249128cb87c5', 'c18fb284-b8a9-471c-8a80-369b04c41b55', 'd86323b8-633f-4b3c-a2a6-9c3b05fb7972', 'mp3', 'praises/001_aleluia/mp3');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('b1576c8d-2a51-450f-b0fa-94c8ba1157bf', 'Cristo Vive', '002', 'Anselmo Silva', 'Balada', 'Ré Maior', 'Alegria', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('b1576c8d-2a51-450f-b0fa-94c8ba1157bf', '1c6139f0-536a-496a-9f86-6b281321acbd');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('b17e7c03-312c-46fb-beb6-a7aff30740bd', 'b1576c8d-2a51-450f-b0fa-94c8ba1157bf', 'c16e9157-3b0e-4fec-ae9b-e6ed01852a58', 'mp3', 'praises/002_cristo_vive/mp3');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('54055563-c8a6-485c-88ae-4bea91f7576f', 'b1576c8d-2a51-450f-b0fa-94c8ba1157bf', 'ab74b25c-72ed-4342-aef9-789282e5b3d5', 'pdf', 'praises/002_cristo_vive/pdf');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('1bf1903d-56a3-4c21-979c-a93bd04424d1', 'b1576c8d-2a51-450f-b0fa-94c8ba1157bf', '68d7b6f7-a6bd-45ad-b712-95db907f853c', 'chord', 'praises/002_cristo_vive/chord');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('8a9015f3-c511-4b68-b5f0-53d5291eb02e', 'Deus é Amor', '003', 'Hellen G. da Silva', 'Valsa', 'Dó Maior', 'Amor', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('8a9015f3-c511-4b68-b5f0-53d5291eb02e', '8c473fcc-77d2-4a25-b364-787341f39608');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('8a9015f3-c511-4b68-b5f0-53d5291eb02e', '59db85f8-4c2b-4da5-80c7-c9b770922199');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('d87dc758-618f-4781-a58d-15ff81c031ef', '8a9015f3-c511-4b68-b5f0-53d5291eb02e', '2d6c0599-ddf7-4a3b-b2e3-b999219bd9a0', 'mp3', 'praises/003_deus_é_amor/mp3');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('987c08a2-fec6-492e-8448-54bfe2bfd595', '8a9015f3-c511-4b68-b5f0-53d5291eb02e', 'ab74b25c-72ed-4342-aef9-789282e5b3d5', 'pdf', 'praises/003_deus_é_amor/pdf');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('87051598-1541-443c-be54-5279a8782301', 'Em Nome de Jesus', '004', 'Roberto Lopes', 'Balada', 'Mi Maior', 'Poder', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('87051598-1541-443c-be54-5279a8782301', 'dca5af40-3d5e-4e8d-a4b0-56b3b558e304');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('87051598-1541-443c-be54-5279a8782301', 'aac881e1-228c-44cb-9fe9-b5feb5da4444');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('87051598-1541-443c-be54-5279a8782301', '26f42a63-0eac-4e1d-9096-973bfe8d193a');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('bec0d126-85c2-4207-b2b8-9a0a5fc9e708', '87051598-1541-443c-be54-5279a8782301', '04dfd0f1-ab99-4eec-948d-f5c17869259f', 'mp3', 'praises/004_em_nome_de_jesus/mp3');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('e6f7a86a-aa0a-4f8c-9653-d5e3faf6e044', '87051598-1541-443c-be54-5279a8782301', 'ab74b25c-72ed-4342-aef9-789282e5b3d5', 'pdf', 'praises/004_em_nome_de_jesus/pdf');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('ca834105-6b79-4c48-8914-47809fd9b5a1', '87051598-1541-443c-be54-5279a8782301', 'c16e9157-3b0e-4fec-ae9b-e6ed01852a58', 'chord', 'praises/004_em_nome_de_jesus/chord');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('386de923-98c5-4b71-9e2c-77461363383d', 'Grande é o Senhor', '005', 'Mário de Oliveira', 'Marcha', 'Fá Maior', 'Adoração', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('386de923-98c5-4b71-9e2c-77461363383d', 'aac881e1-228c-44cb-9fe9-b5feb5da4444');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('386de923-98c5-4b71-9e2c-77461363383d', 'dca5af40-3d5e-4e8d-a4b0-56b3b558e304');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('386de923-98c5-4b71-9e2c-77461363383d', 'e49cea68-b261-42a8-9ea4-fae45f337597');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('4d600f56-f474-4958-8298-fa16883ab2a3', '386de923-98c5-4b71-9e2c-77461363383d', '2d6c0599-ddf7-4a3b-b2e3-b999219bd9a0', 'mp3', 'praises/005_grande_é_o_senhor/mp3');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('318e9836-17fd-4dd1-8cd2-5dfc36a51c1e', '386de923-98c5-4b71-9e2c-77461363383d', '68d7b6f7-a6bd-45ad-b712-95db907f853c', 'pdf', 'praises/005_grande_é_o_senhor/pdf');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('d6ba64d0-568e-41c3-a83e-413b017755e9', 'Himno da Vitória', '006', 'César A. Ferreira', 'Marcha', 'Si Bemol Maior', 'Vitória', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('d6ba64d0-568e-41c3-a83e-413b017755e9', 'dca5af40-3d5e-4e8d-a4b0-56b3b558e304');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('d6ba64d0-568e-41c3-a83e-413b017755e9', '59db85f8-4c2b-4da5-80c7-c9b770922199');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('d6ba64d0-568e-41c3-a83e-413b017755e9', '26f42a63-0eac-4e1d-9096-973bfe8d193a');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('01157eaa-99ad-4ec2-a67f-4d630d971ff6', 'd6ba64d0-568e-41c3-a83e-413b017755e9', '68d7b6f7-a6bd-45ad-b712-95db907f853c', 'mp3', 'praises/006_himno_da_vitória/mp3');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('ec9a9d5d-8c41-4399-93c2-ef05d19984c0', 'Jeová Jireh', '007', 'José R. Santos', 'Balada', 'Sol Maior', 'Providência', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('ec9a9d5d-8c41-4399-93c2-ef05d19984c0', 'e49cea68-b261-42a8-9ea4-fae45f337597');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('b68d20da-42fa-4cc2-b8d4-32a9e7cff22c', 'ec9a9d5d-8c41-4399-93c2-ef05d19984c0', '95ee0488-eae1-4551-b587-7e9617211b9d', 'mp3', 'praises/007_jeová_jireh/mp3');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('14580f4a-e82f-4b2e-9494-f054d5d5b526', 'Louvai ao Senhor', '008', 'Pedro H. Costa', 'Marcha', 'Dó Maior', 'Adoração', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('14580f4a-e82f-4b2e-9494-f054d5d5b526', 'dca5af40-3d5e-4e8d-a4b0-56b3b558e304');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('14580f4a-e82f-4b2e-9494-f054d5d5b526', '26f42a63-0eac-4e1d-9096-973bfe8d193a');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('aac840e8-150c-40d4-9152-7f19b5d73d21', '14580f4a-e82f-4b2e-9494-f054d5d5b526', 'd86323b8-633f-4b3c-a2a6-9c3b05fb7972', 'mp3', 'praises/008_louvai_ao_senhor/mp3');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('e4bde9bf-084a-4669-874a-b299eda42cbb', 'Maranata', '009', 'Silas F. de Lima', 'Balada', 'Ré Maior', 'Esperança', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('e4bde9bf-084a-4669-874a-b299eda42cbb', 'e49cea68-b261-42a8-9ea4-fae45f337597');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('e4bde9bf-084a-4669-874a-b299eda42cbb', '1c6139f0-536a-496a-9f86-6b281321acbd');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('657b4b5a-098c-468f-8919-0cfab58de11b', 'e4bde9bf-084a-4669-874a-b299eda42cbb', '68d7b6f7-a6bd-45ad-b712-95db907f853c', 'mp3', 'praises/009_maranata/mp3');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('bc323b26-589d-46dd-8739-eb69626b8cff', 'e4bde9bf-084a-4669-874a-b299eda42cbb', 'f2666cb0-d69a-4710-b6ef-03e4a69af164', 'pdf', 'praises/009_maranata/pdf');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('67c30bc2-fef3-4065-a8d7-512c0817df06', 'e4bde9bf-084a-4669-874a-b299eda42cbb', 'ab74b25c-72ed-4342-aef9-789282e5b3d5', 'chord', 'praises/009_maranata/chord');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('6ef6a524-4399-4885-8583-5040a0bd8ae2', 'Nome Superexaltado', '010', 'André L. Martins', 'Balada', 'Sol Maior', 'Adoração', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('6ef6a524-4399-4885-8583-5040a0bd8ae2', '1c6139f0-536a-496a-9f86-6b281321acbd');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('6ef6a524-4399-4885-8583-5040a0bd8ae2', '26f42a63-0eac-4e1d-9096-973bfe8d193a');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('6ef6a524-4399-4885-8583-5040a0bd8ae2', 'dca5af40-3d5e-4e8d-a4b0-56b3b558e304');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('53f56571-a1c5-44fc-92fa-87e3d1af07b8', '6ef6a524-4399-4885-8583-5040a0bd8ae2', '2d6c0599-ddf7-4a3b-b2e3-b999219bd9a0', 'mp3', 'praises/010_nome_superexaltado/mp3');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('67d73de3-8367-4445-b44a-8fb001754785', 'O Amor de Deus', '011', 'Marcos V. Silva', 'Valsa', 'Dó Maior', 'Amor', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('67d73de3-8367-4445-b44a-8fb001754785', 'dca5af40-3d5e-4e8d-a4b0-56b3b558e304');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('67d73de3-8367-4445-b44a-8fb001754785', '59db85f8-4c2b-4da5-80c7-c9b770922199');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('67d73de3-8367-4445-b44a-8fb001754785', 'e49cea68-b261-42a8-9ea4-fae45f337597');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('6a89eb1a-4bce-4d84-be04-f7ba5d77dde2', '67d73de3-8367-4445-b44a-8fb001754785', 'c16e9157-3b0e-4fec-ae9b-e6ed01852a58', 'mp3', 'praises/011_o_amor_de_deus/mp3');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('30ab28e3-b500-4523-9cb9-f0eae69d2525', '67d73de3-8367-4445-b44a-8fb001754785', 'ab74b25c-72ed-4342-aef9-789282e5b3d5', 'pdf', 'praises/011_o_amor_de_deus/pdf');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('1b2dc1af-d7b1-43db-ab45-4b34471ab6ce', 'Pecador', '012', 'Ronaldo C. Pinto', 'Balada', 'Mi Maior', 'Conversão', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('1b2dc1af-d7b1-43db-ab45-4b34471ab6ce', '26f42a63-0eac-4e1d-9096-973bfe8d193a');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('1b2dc1af-d7b1-43db-ab45-4b34471ab6ce', '8c473fcc-77d2-4a25-b364-787341f39608');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('1b2dc1af-d7b1-43db-ab45-4b34471ab6ce', '59db85f8-4c2b-4da5-80c7-c9b770922199');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('7ec196de-fcbe-4ac2-bbf1-4b42838e00b9', '1b2dc1af-d7b1-43db-ab45-4b34471ab6ce', '95ee0488-eae1-4551-b587-7e9617211b9d', 'mp3', 'praises/012_pecador/mp3');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('3a622fa5-03aa-41db-9d2a-b04e14804ff5', '1b2dc1af-d7b1-43db-ab45-4b34471ab6ce', '2d6c0599-ddf7-4a3b-b2e3-b999219bd9a0', 'pdf', 'praises/012_pecador/pdf');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('d707d2db-ff66-4ad4-9d7f-cbe0165b8b6d', '1b2dc1af-d7b1-43db-ab45-4b34471ab6ce', '04dfd0f1-ab99-4eec-948d-f5c17869259f', 'chord', 'praises/012_pecador/chord');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('2f0620de-f298-415b-9a3c-7e4cbd1fa445', 'Quão Grande é Deus', '013', 'Sérgio A. Rodrigues', 'Marcha', 'Fá Maior', 'Adoração', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('2f0620de-f298-415b-9a3c-7e4cbd1fa445', 'dca5af40-3d5e-4e8d-a4b0-56b3b558e304');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('056fefa4-b5af-43ba-80b8-20eb8b0f4bc2', '2f0620de-f298-415b-9a3c-7e4cbd1fa445', 'c16e9157-3b0e-4fec-ae9b-e6ed01852a58', 'mp3', 'praises/013_quão_grande_é_deus/mp3');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('67de4fdc-5d24-42ff-9ab1-7673a55bf09e', 'Santo, Santo, Santo', '014', 'Ricardo B. Santos', 'Hino', 'Si Bemol Maior', 'Adoração', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('67de4fdc-5d24-42ff-9ab1-7673a55bf09e', '8c473fcc-77d2-4a25-b364-787341f39608');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('67de4fdc-5d24-42ff-9ab1-7673a55bf09e', '26f42a63-0eac-4e1d-9096-973bfe8d193a');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('b50b9911-7d24-44bb-8c70-5e3f9671c4c4', '67de4fdc-5d24-42ff-9ab1-7673a55bf09e', 'd86323b8-633f-4b3c-a2a6-9c3b05fb7972', 'mp3', 'praises/014_santo,_santo,_santo/mp3');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('5ad435dd-152c-4b1b-ba3e-6993d9baa161', '67de4fdc-5d24-42ff-9ab1-7673a55bf09e', '68d7b6f7-a6bd-45ad-b712-95db907f853c', 'pdf', 'praises/014_santo,_santo,_santo/pdf');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('4fefc222-4046-4b3f-9417-46d76a965294', 'Tão Grande Salvação', '015', 'Fábio J. Oliveira', 'Balada', 'Sol Maior', 'Salvação', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('4fefc222-4046-4b3f-9417-46d76a965294', 'dca5af40-3d5e-4e8d-a4b0-56b3b558e304');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('4fefc222-4046-4b3f-9417-46d76a965294', '8c473fcc-77d2-4a25-b364-787341f39608');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('2e16652d-213d-4e1c-bcc2-d54a78a38d28', '4fefc222-4046-4b3f-9417-46d76a965294', '04dfd0f1-ab99-4eec-948d-f5c17869259f', 'mp3', 'praises/015_tão_grande_salvação/mp3');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('a0e6c10c-86b7-4b63-ac7d-6d0f36488d45', '4fefc222-4046-4b3f-9417-46d76a965294', '2d6c0599-ddf7-4a3b-b2e3-b999219bd9a0', 'pdf', 'praises/015_tão_grande_salvação/pdf');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('c013d2d6-a7eb-473f-837c-978944504c16', 'Tu és Deus', '016', 'Paulo R. Costa', 'Marcha', 'Dó Maior', 'Adoração', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('c013d2d6-a7eb-473f-837c-978944504c16', '1c6139f0-536a-496a-9f86-6b281321acbd');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('f2b5bf21-0eec-4bc0-9f45-2c1f63fd6952', 'c013d2d6-a7eb-473f-837c-978944504c16', 'ab74b25c-72ed-4342-aef9-789282e5b3d5', 'mp3', 'praises/016_tu_és_deus/mp3');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('fe4294bf-cfa2-4238-a03f-ee3815e60499', 'c013d2d6-a7eb-473f-837c-978944504c16', '2d6c0599-ddf7-4a3b-b2e3-b999219bd9a0', 'pdf', 'praises/016_tu_és_deus/pdf');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('940582aa-3e60-4de9-b0c8-a47556104d42', 'c013d2d6-a7eb-473f-837c-978944504c16', '04dfd0f1-ab99-4eec-948d-f5c17869259f', 'chord', 'praises/016_tu_és_deus/chord');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('bab5568c-0d78-490c-b1fd-d550df8a6597', 'Ungido do Senhor', '017', 'Carlos E. Lima', 'Balada', 'Ré Maior', 'Cristo', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('bab5568c-0d78-490c-b1fd-d550df8a6597', '1c6139f0-536a-496a-9f86-6b281321acbd');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('bab5568c-0d78-490c-b1fd-d550df8a6597', 'aac881e1-228c-44cb-9fe9-b5feb5da4444');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('73a54356-b41f-4740-90d3-62b388e9506c', 'bab5568c-0d78-490c-b1fd-d550df8a6597', 'd86323b8-633f-4b3c-a2a6-9c3b05fb7972', 'mp3', 'praises/017_ungido_do_senhor/mp3');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('e9e23909-b2fc-4289-b42c-d596be2d581b', 'bab5568c-0d78-490c-b1fd-d550df8a6597', '95ee0488-eae1-4551-b587-7e9617211b9d', 'pdf', 'praises/017_ungido_do_senhor/pdf');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('15424f13-c2cc-4a0e-95cc-93ecdc54e7dd', 'Vem, Espírito Santo', '018', 'Bruno M. Ferreira', 'Balada', 'Sol Maior', 'Espírito Santo', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('15424f13-c2cc-4a0e-95cc-93ecdc54e7dd', 'dca5af40-3d5e-4e8d-a4b0-56b3b558e304');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('15424f13-c2cc-4a0e-95cc-93ecdc54e7dd', 'aac881e1-228c-44cb-9fe9-b5feb5da4444');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('a1eaaee1-f442-4f96-af65-7be6252b257d', '15424f13-c2cc-4a0e-95cc-93ecdc54e7dd', '95ee0488-eae1-4551-b587-7e9617211b9d', 'mp3', 'praises/018_vem,_espírito_santo/mp3');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('c38a777c-134d-47de-b3ce-64e989ad7d4e', '15424f13-c2cc-4a0e-95cc-93ecdc54e7dd', 'd86323b8-633f-4b3c-a2a6-9c3b05fb7972', 'pdf', 'praises/018_vem,_espírito_santo/pdf');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('ef5aa39a-a455-4a9f-8eff-d82eceb644f5', 'Vencedor', '019', 'Leonardo F. Santos', 'Marcha', 'Fá Maior', 'Vitória', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('ef5aa39a-a455-4a9f-8eff-d82eceb644f5', '1c6139f0-536a-496a-9f86-6b281321acbd');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('ef5aa39a-a455-4a9f-8eff-d82eceb644f5', '8c473fcc-77d2-4a25-b364-787341f39608');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('6583cd1c-da79-450e-8c51-7bfc63ca4657', 'ef5aa39a-a455-4a9f-8eff-d82eceb644f5', '2d6c0599-ddf7-4a3b-b2e3-b999219bd9a0', 'mp3', 'praises/019_vencedor/mp3');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('8bab548e-a44d-4459-a927-165de39f1f7e', 'ef5aa39a-a455-4a9f-8eff-d82eceb644f5', '95ee0488-eae1-4551-b587-7e9617211b9d', 'pdf', 'praises/019_vencedor/pdf');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('09e442af-9c16-446c-add0-cc8318b3c228', 'ef5aa39a-a455-4a9f-8eff-d82eceb644f5', 'ab74b25c-72ed-4342-aef9-789282e5b3d5', 'chord', 'praises/019_vencedor/chord');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('ed5b835d-fbeb-46ac-bd3e-3db7166cc9dc', 'Zeus, o Deus Vivo', '020', 'Rafael A. Oliveira', 'Marcha', 'Si Bemol Maior', 'Adoração', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('ed5b835d-fbeb-46ac-bd3e-3db7166cc9dc', '8c473fcc-77d2-4a25-b364-787341f39608');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('ed5b835d-fbeb-46ac-bd3e-3db7166cc9dc', 'dca5af40-3d5e-4e8d-a4b0-56b3b558e304');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('3f9fc983-022e-4710-aa39-1e6e90ff3e55', 'ed5b835d-fbeb-46ac-bd3e-3db7166cc9dc', '2d6c0599-ddf7-4a3b-b2e3-b999219bd9a0', 'mp3', 'praises/020_zeus,_o_deus_vivo/mp3');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('a9c79737-0ab3-41a7-b0cb-a37bcabc2a88', 'ed5b835d-fbeb-46ac-bd3e-3db7166cc9dc', '95ee0488-eae1-4551-b587-7e9617211b9d', 'pdf', 'praises/020_zeus,_o_deus_vivo/pdf');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('ac1684d5-a501-43bc-9e49-dce4f4ff054c', 'ed5b835d-fbeb-46ac-bd3e-3db7166cc9dc', 'c16e9157-3b0e-4fec-ae9b-e6ed01852a58', 'chord', 'praises/020_zeus,_o_deus_vivo/chord');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('87e50a03-aab6-42be-bda1-6b25820de543', 'Alegrai-vos', '021', 'Gustavo L. Silva', 'Balada', 'Dó Maior', 'Alegria', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('87e50a03-aab6-42be-bda1-6b25820de543', '26f42a63-0eac-4e1d-9096-973bfe8d193a');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('87e50a03-aab6-42be-bda1-6b25820de543', '59db85f8-4c2b-4da5-80c7-c9b770922199');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('2beefd70-4fb1-4bef-8ef2-59ac083ddd6b', '87e50a03-aab6-42be-bda1-6b25820de543', '68d7b6f7-a6bd-45ad-b712-95db907f853c', 'mp3', 'praises/021_alegrai-vos/mp3');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('0e06bf3d-4a37-41b0-a701-c1eb98f468ce', '87e50a03-aab6-42be-bda1-6b25820de543', 'f2666cb0-d69a-4710-b6ef-03e4a69af164', 'pdf', 'praises/021_alegrai-vos/pdf');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('4274c77e-c0a2-4dec-acc4-4263e88b57a5', 'Bendito Seja', '022', 'Thiago R. Costa', 'Valsa', 'Sol Maior', 'Adoração', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('4274c77e-c0a2-4dec-acc4-4263e88b57a5', '8c473fcc-77d2-4a25-b364-787341f39608');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('4274c77e-c0a2-4dec-acc4-4263e88b57a5', '1c6139f0-536a-496a-9f86-6b281321acbd');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('4274c77e-c0a2-4dec-acc4-4263e88b57a5', '26f42a63-0eac-4e1d-9096-973bfe8d193a');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('aa6f2840-49fd-4b11-8ec7-35a298b18f17', '4274c77e-c0a2-4dec-acc4-4263e88b57a5', '68d7b6f7-a6bd-45ad-b712-95db907f853c', 'mp3', 'praises/022_bendito_seja/mp3');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('712ff8fc-daf0-4e61-83d0-0ad8df01d8d6', '4274c77e-c0a2-4dec-acc4-4263e88b57a5', 'f2666cb0-d69a-4710-b6ef-03e4a69af164', 'pdf', 'praises/022_bendito_seja/pdf');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('7151801f-880b-4c09-815f-0218f11e261c', 'Casa de Oração', '023', 'Daniel P. Martins', 'Balada', 'Ré Maior', 'Igreja', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('7151801f-880b-4c09-815f-0218f11e261c', '1c6139f0-536a-496a-9f86-6b281321acbd');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('7151801f-880b-4c09-815f-0218f11e261c', 'aac881e1-228c-44cb-9fe9-b5feb5da4444');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('d0822675-d673-4d11-9b06-48852f221c4f', '7151801f-880b-4c09-815f-0218f11e261c', 'd86323b8-633f-4b3c-a2a6-9c3b05fb7972', 'mp3', 'praises/023_casa_de_oração/mp3');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('4dbc5d3f-3cfd-4c06-ba73-0b316ef7d6c3', 'Deus está Aqui', '024', 'Fernando J. Lima', 'Marcha', 'Fá Maior', 'Presença', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('4dbc5d3f-3cfd-4c06-ba73-0b316ef7d6c3', '1c6139f0-536a-496a-9f86-6b281321acbd');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('4dbc5d3f-3cfd-4c06-ba73-0b316ef7d6c3', 'dca5af40-3d5e-4e8d-a4b0-56b3b558e304');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('ed2ecf87-443a-4c00-8de3-f2366f09f9a0', '4dbc5d3f-3cfd-4c06-ba73-0b316ef7d6c3', 'd86323b8-633f-4b3c-a2a6-9c3b05fb7972', 'mp3', 'praises/024_deus_está_aqui/mp3');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('194f5ae1-d408-4fa1-9bd5-c83fa67dff0c', '4dbc5d3f-3cfd-4c06-ba73-0b316ef7d6c3', '2d6c0599-ddf7-4a3b-b2e3-b999219bd9a0', 'pdf', 'praises/024_deus_está_aqui/pdf');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('f88c5541-1f37-4485-bcbb-7ce5fb988c90', 'Ele é o Rei', '025', 'Vinícius A. Santos', 'Marcha', 'Si Bemol Maior', 'Reino', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('f88c5541-1f37-4485-bcbb-7ce5fb988c90', '1c6139f0-536a-496a-9f86-6b281321acbd');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('f88c5541-1f37-4485-bcbb-7ce5fb988c90', 'dca5af40-3d5e-4e8d-a4b0-56b3b558e304');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('f88c5541-1f37-4485-bcbb-7ce5fb988c90', '26f42a63-0eac-4e1d-9096-973bfe8d193a');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('089d8a18-38f0-4534-bf53-2f676ddd4eb7', 'f88c5541-1f37-4485-bcbb-7ce5fb988c90', 'ab74b25c-72ed-4342-aef9-789282e5b3d5', 'mp3', 'praises/025_ele_é_o_rei/mp3');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('c668934a-f17d-4d92-8dfb-6b6ee31ca704', 'Faz-me um Instrumento', '026', 'Lucas B. Oliveira', 'Balada', 'Dó Maior', 'Serviço', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('c668934a-f17d-4d92-8dfb-6b6ee31ca704', 'e49cea68-b261-42a8-9ea4-fae45f337597');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('c668934a-f17d-4d92-8dfb-6b6ee31ca704', 'aac881e1-228c-44cb-9fe9-b5feb5da4444');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('c668934a-f17d-4d92-8dfb-6b6ee31ca704', '59db85f8-4c2b-4da5-80c7-c9b770922199');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('662f331e-8f0c-41b6-8edf-ee2780db62c7', 'c668934a-f17d-4d92-8dfb-6b6ee31ca704', '68d7b6f7-a6bd-45ad-b712-95db907f853c', 'mp3', 'praises/026_faz-me_um_instrumento/mp3');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('8178adb4-9f28-45f4-ba08-a58f0727e95e', 'Glória a Deus', '027', 'Matheus C. Costa', 'Hino', 'Sol Maior', 'Adoração', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('8178adb4-9f28-45f4-ba08-a58f0727e95e', 'e49cea68-b261-42a8-9ea4-fae45f337597');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('8178adb4-9f28-45f4-ba08-a58f0727e95e', '1c6139f0-536a-496a-9f86-6b281321acbd');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('8178adb4-9f28-45f4-ba08-a58f0727e95e', 'aac881e1-228c-44cb-9fe9-b5feb5da4444');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('5d14f3d9-b305-4d04-ab44-c9eabb37c2a3', '8178adb4-9f28-45f4-ba08-a58f0727e95e', 'd86323b8-633f-4b3c-a2a6-9c3b05fb7972', 'mp3', 'praises/027_glória_a_deus/mp3');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('d1d1b000-fc22-4a9d-9a0c-b59489da49b7', '8178adb4-9f28-45f4-ba08-a58f0727e95e', '2d6c0599-ddf7-4a3b-b2e3-b999219bd9a0', 'pdf', 'praises/027_glória_a_deus/pdf');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('fafe5405-2bcd-42d8-8e24-3bec72826491', 'Honra e Glória', '028', 'Gabriel D. Silva', 'Marcha', 'Ré Maior', 'Adoração', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('fafe5405-2bcd-42d8-8e24-3bec72826491', 'e49cea68-b261-42a8-9ea4-fae45f337597');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('fafe5405-2bcd-42d8-8e24-3bec72826491', 'aac881e1-228c-44cb-9fe9-b5feb5da4444');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('aa10e927-71d7-4c27-a15c-e048c835c9e6', 'fafe5405-2bcd-42d8-8e24-3bec72826491', '68d7b6f7-a6bd-45ad-b712-95db907f853c', 'mp3', 'praises/028_honra_e_glória/mp3');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('0043a72b-6cdc-44f0-a515-0631f5e2a9eb', 'fafe5405-2bcd-42d8-8e24-3bec72826491', 'f2666cb0-d69a-4710-b6ef-03e4a69af164', 'pdf', 'praises/028_honra_e_glória/pdf');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('1b830989-f4cd-4e68-93c9-5b21fc65dad5', 'Incomparável', '029', 'Diego E. Santos', 'Balada', 'Mi Maior', 'Adoração', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('1b830989-f4cd-4e68-93c9-5b21fc65dad5', '59db85f8-4c2b-4da5-80c7-c9b770922199');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('dfdd0e41-de85-4fd3-ae79-f2ee24901711', '1b830989-f4cd-4e68-93c9-5b21fc65dad5', '2d6c0599-ddf7-4a3b-b2e3-b999219bd9a0', 'mp3', 'praises/029_incomparável/mp3');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('80554c93-6a88-4223-8e8c-878b671376e4', '1b830989-f4cd-4e68-93c9-5b21fc65dad5', 'ab74b25c-72ed-4342-aef9-789282e5b3d5', 'pdf', 'praises/029_incomparável/pdf');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('f5eb8d44-372f-45f1-a0cd-30bdb5c08302', '1b830989-f4cd-4e68-93c9-5b21fc65dad5', '95ee0488-eae1-4551-b587-7e9617211b9d', 'chord', 'praises/029_incomparável/chord');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('5f002d36-e150-4be8-ace1-45ab63c7fc70', 'Jesus, Meu Amigo', '030', 'Rodrigo F. Lima', 'Balada', 'Fá Maior', 'Amor', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('5f002d36-e150-4be8-ace1-45ab63c7fc70', '8c473fcc-77d2-4a25-b364-787341f39608');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('5f002d36-e150-4be8-ace1-45ab63c7fc70', '1c6139f0-536a-496a-9f86-6b281321acbd');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('5f002d36-e150-4be8-ace1-45ab63c7fc70', 'dca5af40-3d5e-4e8d-a4b0-56b3b558e304');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('fd4b585b-be73-4a73-87e8-2e8b5e973e45', '5f002d36-e150-4be8-ace1-45ab63c7fc70', '2d6c0599-ddf7-4a3b-b2e3-b999219bd9a0', 'mp3', 'praises/030_jesus,_meu_amigo/mp3');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('e57f98dd-2c6e-4824-bbbc-cf9ead74d3fb', '5f002d36-e150-4be8-ace1-45ab63c7fc70', '68d7b6f7-a6bd-45ad-b712-95db907f853c', 'pdf', 'praises/030_jesus,_meu_amigo/pdf');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('fea0a7ef-cd2b-4040-b458-9d3ebf85579e', '5f002d36-e150-4be8-ace1-45ab63c7fc70', '95ee0488-eae1-4551-b587-7e9617211b9d', 'chord', 'praises/030_jesus,_meu_amigo/chord');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('d100c989-1f4b-4e39-bd9a-b45a7a58ed5d', 'Luz do Mundo', '031', 'Alexandre G. Costa', 'Balada', 'Dó Maior', 'Luz', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('d100c989-1f4b-4e39-bd9a-b45a7a58ed5d', 'aac881e1-228c-44cb-9fe9-b5feb5da4444');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('d100c989-1f4b-4e39-bd9a-b45a7a58ed5d', '8c473fcc-77d2-4a25-b364-787341f39608');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('bd9b0706-5b9c-4b40-99b4-c6976e38425f', 'd100c989-1f4b-4e39-bd9a-b45a7a58ed5d', 'ab74b25c-72ed-4342-aef9-789282e5b3d5', 'mp3', 'praises/031_luz_do_mundo/mp3');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('a06c7775-0fe5-471d-895a-052e0baf4ccd', 'Manso e Humilde', '032', 'Henrique H. Oliveira', 'Valsa', 'Sol Maior', 'Cristo', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('a06c7775-0fe5-471d-895a-052e0baf4ccd', 'dca5af40-3d5e-4e8d-a4b0-56b3b558e304');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('d75af9a1-b1cc-4f80-a1bc-b3e7fd714a4b', 'a06c7775-0fe5-471d-895a-052e0baf4ccd', '68d7b6f7-a6bd-45ad-b712-95db907f853c', 'mp3', 'praises/032_manso_e_humilde/mp3');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('d8201428-da6e-4570-a848-0e70e827f971', 'a06c7775-0fe5-471d-895a-052e0baf4ccd', '04dfd0f1-ab99-4eec-948d-f5c17869259f', 'pdf', 'praises/032_manso_e_humilde/pdf');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('2ec43709-16a1-489b-9b94-fab64181f331', 'Noite de Paz', '033', 'Igor I. Santos', 'Valsa', 'Dó Maior', 'Natal', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('2ec43709-16a1-489b-9b94-fab64181f331', '8c473fcc-77d2-4a25-b364-787341f39608');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('e3a3a6f0-5ad1-426a-873b-aec2bbca57d0', '2ec43709-16a1-489b-9b94-fab64181f331', '2d6c0599-ddf7-4a3b-b2e3-b999219bd9a0', 'mp3', 'praises/033_noite_de_paz/mp3');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('f2fa564a-c680-4663-a986-0531ff6af69e', 'Oh, Quão Lindo', '034', 'João J. Silva', 'Balada', 'Ré Maior', 'Beleza', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('f2fa564a-c680-4663-a986-0531ff6af69e', 'dca5af40-3d5e-4e8d-a4b0-56b3b558e304');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('f2fa564a-c680-4663-a986-0531ff6af69e', 'aac881e1-228c-44cb-9fe9-b5feb5da4444');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('f2fa564a-c680-4663-a986-0531ff6af69e', '26f42a63-0eac-4e1d-9096-973bfe8d193a');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('4da0f3e9-b7ed-4242-8cd1-0ee67e5580c2', 'f2fa564a-c680-4663-a986-0531ff6af69e', 'c16e9157-3b0e-4fec-ae9b-e6ed01852a58', 'mp3', 'praises/034_oh,_quão_lindo/mp3');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('06bb87a5-5024-4aad-9d06-e409cff2de16', 'f2fa564a-c680-4663-a986-0531ff6af69e', 'd86323b8-633f-4b3c-a2a6-9c3b05fb7972', 'pdf', 'praises/034_oh,_quão_lindo/pdf');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('5bca35b9-f4c7-4567-ac1e-779a7486272a', 'f2fa564a-c680-4663-a986-0531ff6af69e', '2d6c0599-ddf7-4a3b-b2e3-b999219bd9a0', 'chord', 'praises/034_oh,_quão_lindo/chord');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('2fab3a38-4d26-4ddc-bf98-cb0389997dd0', 'Pai Nosso', '035', 'Leonardo K. Lima', 'Balada', 'Fá Maior', 'Oração', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('2fab3a38-4d26-4ddc-bf98-cb0389997dd0', '8c473fcc-77d2-4a25-b364-787341f39608');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('2fab3a38-4d26-4ddc-bf98-cb0389997dd0', 'e49cea68-b261-42a8-9ea4-fae45f337597');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('2fab3a38-4d26-4ddc-bf98-cb0389997dd0', '26f42a63-0eac-4e1d-9096-973bfe8d193a');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('800b7138-e427-4265-a129-e7328129e643', '2fab3a38-4d26-4ddc-bf98-cb0389997dd0', '2d6c0599-ddf7-4a3b-b2e3-b999219bd9a0', 'mp3', 'praises/035_pai_nosso/mp3');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('2ad666a2-7284-4212-a0e6-124901cee2ad', 'Qualquer Dia', '036', 'Marcelo L. Costa', 'Balada', 'Si Bemol Maior', 'Esperança', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('2ad666a2-7284-4212-a0e6-124901cee2ad', '1c6139f0-536a-496a-9f86-6b281321acbd');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('2ad666a2-7284-4212-a0e6-124901cee2ad', 'dca5af40-3d5e-4e8d-a4b0-56b3b558e304');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('2ad666a2-7284-4212-a0e6-124901cee2ad', '8c473fcc-77d2-4a25-b364-787341f39608');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('90383215-6100-4944-9881-52f7073d8530', '2ad666a2-7284-4212-a0e6-124901cee2ad', '04dfd0f1-ab99-4eec-948d-f5c17869259f', 'mp3', 'praises/036_qualquer_dia/mp3');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('fc0baa85-1d4b-48e9-a111-bd7f4404e35a', 'Restaura-me', '037', 'Natanael M. Santos', 'Balada', 'Dó Maior', 'Renovação', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('fc0baa85-1d4b-48e9-a111-bd7f4404e35a', 'aac881e1-228c-44cb-9fe9-b5feb5da4444');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('fc0baa85-1d4b-48e9-a111-bd7f4404e35a', 'e49cea68-b261-42a8-9ea4-fae45f337597');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('fc0baa85-1d4b-48e9-a111-bd7f4404e35a', '1c6139f0-536a-496a-9f86-6b281321acbd');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('f7738019-f4d5-488c-bf8c-1409658e17a6', 'fc0baa85-1d4b-48e9-a111-bd7f4404e35a', '68d7b6f7-a6bd-45ad-b712-95db907f853c', 'mp3', 'praises/037_restaura-me/mp3');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('0528c848-ba80-4572-9a12-fd15d2a778db', 'fc0baa85-1d4b-48e9-a111-bd7f4404e35a', 'f2666cb0-d69a-4710-b6ef-03e4a69af164', 'pdf', 'praises/037_restaura-me/pdf');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('b21dd96f-47ad-4b01-89ef-adfeac1c5c0c', 'Salmo 23', '038', 'Otávio N. Oliveira', 'Balada', 'Sol Maior', 'Salmo', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('b21dd96f-47ad-4b01-89ef-adfeac1c5c0c', 'e49cea68-b261-42a8-9ea4-fae45f337597');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('b21dd96f-47ad-4b01-89ef-adfeac1c5c0c', 'dca5af40-3d5e-4e8d-a4b0-56b3b558e304');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('1cbf2be5-fa9c-4c62-9655-bbf2d8b3e1b6', 'b21dd96f-47ad-4b01-89ef-adfeac1c5c0c', '68d7b6f7-a6bd-45ad-b712-95db907f853c', 'mp3', 'praises/038_salmo_23/mp3');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('3147d12d-8c06-4d22-ad8b-e6f1582ac6f9', 'b21dd96f-47ad-4b01-89ef-adfeac1c5c0c', 'd86323b8-633f-4b3c-a2a6-9c3b05fb7972', 'pdf', 'praises/038_salmo_23/pdf');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('0bf2fafe-117a-4cf6-ab3d-5ddd1938ab8d', 'Te Louvarei', '039', 'Paulo O. Silva', 'Marcha', 'Ré Maior', 'Adoração', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('0bf2fafe-117a-4cf6-ab3d-5ddd1938ab8d', 'aac881e1-228c-44cb-9fe9-b5feb5da4444');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('0bf2fafe-117a-4cf6-ab3d-5ddd1938ab8d', '1c6139f0-536a-496a-9f86-6b281321acbd');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('0bf2fafe-117a-4cf6-ab3d-5ddd1938ab8d', 'dca5af40-3d5e-4e8d-a4b0-56b3b558e304');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('93ca469b-e872-45d1-8d00-bc6c1ebf8980', '0bf2fafe-117a-4cf6-ab3d-5ddd1938ab8d', '2d6c0599-ddf7-4a3b-b2e3-b999219bd9a0', 'mp3', 'praises/039_te_louvarei/mp3');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('1b022134-e7ee-43e3-aaac-647450ae1b2c', '0bf2fafe-117a-4cf6-ab3d-5ddd1938ab8d', '68d7b6f7-a6bd-45ad-b712-95db907f853c', 'pdf', 'praises/039_te_louvarei/pdf');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('d15b6cec-9e03-4f0b-89ca-e4593a467067', 'Tudo é de Deus', '040', 'Quéliton P. Lima', 'Balada', 'Fá Maior', 'Providência', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('d15b6cec-9e03-4f0b-89ca-e4593a467067', 'dca5af40-3d5e-4e8d-a4b0-56b3b558e304');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('c1c8bd14-0631-49aa-9051-edd8339f4609', 'd15b6cec-9e03-4f0b-89ca-e4593a467067', 'f2666cb0-d69a-4710-b6ef-03e4a69af164', 'mp3', 'praises/040_tudo_é_de_deus/mp3');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('ea2ce882-3b1e-41d8-99a4-7680a9e72ad9', 'd15b6cec-9e03-4f0b-89ca-e4593a467067', '04dfd0f1-ab99-4eec-948d-f5c17869259f', 'pdf', 'praises/040_tudo_é_de_deus/pdf');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('f1ffbf55-3f67-4a2f-8fde-8fa29e87c3b8', 'd15b6cec-9e03-4f0b-89ca-e4593a467067', '95ee0488-eae1-4551-b587-7e9617211b9d', 'chord', 'praises/040_tudo_é_de_deus/chord');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('e4418aca-0d60-4d60-921a-13ceb7b1dbe5', 'Um Novo Dia', '041', 'Renato Q. Costa', 'Balada', 'Dó Maior', 'Esperança', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('e4418aca-0d60-4d60-921a-13ceb7b1dbe5', '59db85f8-4c2b-4da5-80c7-c9b770922199');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('08c0184d-5397-4351-a45e-8013df972f3a', 'e4418aca-0d60-4d60-921a-13ceb7b1dbe5', 'c16e9157-3b0e-4fec-ae9b-e6ed01852a58', 'mp3', 'praises/041_um_novo_dia/mp3');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('1efe3522-5585-4f58-abf1-5fda4b834a89', 'e4418aca-0d60-4d60-921a-13ceb7b1dbe5', '2d6c0599-ddf7-4a3b-b2e3-b999219bd9a0', 'pdf', 'praises/041_um_novo_dia/pdf');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('5a0139d8-6c31-45e2-bc8c-95d6866ceae8', 'e4418aca-0d60-4d60-921a-13ceb7b1dbe5', 'd86323b8-633f-4b3c-a2a6-9c3b05fb7972', 'chord', 'praises/041_um_novo_dia/chord');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('4137ffe5-1323-4828-b27a-a355a5d71539', 'Vem Com Alegria', '042', 'Sérgio R. Santos', 'Marcha', 'Sol Maior', 'Alegria', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('4137ffe5-1323-4828-b27a-a355a5d71539', 'aac881e1-228c-44cb-9fe9-b5feb5da4444');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('4137ffe5-1323-4828-b27a-a355a5d71539', 'dca5af40-3d5e-4e8d-a4b0-56b3b558e304');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('1c1b0ad5-ff07-4907-9b1b-5c27fd919654', '4137ffe5-1323-4828-b27a-a355a5d71539', 'c16e9157-3b0e-4fec-ae9b-e6ed01852a58', 'mp3', 'praises/042_vem_com_alegria/mp3');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('cb219ae3-825e-4768-b81c-a9505de12643', '4137ffe5-1323-4828-b27a-a355a5d71539', '2d6c0599-ddf7-4a3b-b2e3-b999219bd9a0', 'pdf', 'praises/042_vem_com_alegria/pdf');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('d454b756-4159-40ca-8905-de323f87b66d', 'Xilogravura', '043', 'Tiago S. Oliveira', 'Balada', 'Mi Maior', 'Arte', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('d454b756-4159-40ca-8905-de323f87b66d', '1c6139f0-536a-496a-9f86-6b281321acbd');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('d454b756-4159-40ca-8905-de323f87b66d', 'aac881e1-228c-44cb-9fe9-b5feb5da4444');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('d454b756-4159-40ca-8905-de323f87b66d', 'e49cea68-b261-42a8-9ea4-fae45f337597');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('fcdc25ef-d62e-403b-aaaf-a27d5f12b7cd', 'd454b756-4159-40ca-8905-de323f87b66d', '04dfd0f1-ab99-4eec-948d-f5c17869259f', 'mp3', 'praises/043_xilogravura/mp3');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('e771ef8b-4427-44d4-b0b3-1d98481d0f5d', 'Yahweh', '044', 'Ulisses T. Silva', 'Marcha', 'Si Bemol Maior', 'Adoração', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('e771ef8b-4427-44d4-b0b3-1d98481d0f5d', '1c6139f0-536a-496a-9f86-6b281321acbd');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('4dd86955-b190-4bcb-a2cb-644a565997b2', 'e771ef8b-4427-44d4-b0b3-1d98481d0f5d', '04dfd0f1-ab99-4eec-948d-f5c17869259f', 'mp3', 'praises/044_yahweh/mp3');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('7eb2474f-7673-4a62-bd7c-682fcdb0d79d', 'Zion', '045', 'Valdemir U. Lima', 'Balada', 'Fá Maior', 'Esperança', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('7eb2474f-7673-4a62-bd7c-682fcdb0d79d', '59db85f8-4c2b-4da5-80c7-c9b770922199');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('8c516bfc-c324-4643-958b-04a34c9a567a', '7eb2474f-7673-4a62-bd7c-682fcdb0d79d', '95ee0488-eae1-4551-b587-7e9617211b9d', 'mp3', 'praises/045_zion/mp3');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('0d9694f2-6df2-45ad-b89b-c33c65fd6d14', 'Abraão', '046', 'Wagner V. Costa', 'Balada', 'Dó Maior', 'História', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('0d9694f2-6df2-45ad-b89b-c33c65fd6d14', 'e49cea68-b261-42a8-9ea4-fae45f337597');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('9c39d25f-ddb2-4700-8354-83421d5669a7', '0d9694f2-6df2-45ad-b89b-c33c65fd6d14', 'ab74b25c-72ed-4342-aef9-789282e5b3d5', 'mp3', 'praises/046_abraão/mp3');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('eaae96f9-ed34-4b93-b7db-b22d0720bd4c', '0d9694f2-6df2-45ad-b89b-c33c65fd6d14', 'f2666cb0-d69a-4710-b6ef-03e4a69af164', 'pdf', 'praises/046_abraão/pdf');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('2c640e14-3f17-4c9f-b51a-2db09b065aea', 'Benção', '047', 'Xavier W. Santos', 'Balada', 'Sol Maior', 'Benção', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('2c640e14-3f17-4c9f-b51a-2db09b065aea', '26f42a63-0eac-4e1d-9096-973bfe8d193a');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('2c640e14-3f17-4c9f-b51a-2db09b065aea', '1c6139f0-536a-496a-9f86-6b281321acbd');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('d9c7deda-e1f9-4672-818b-a1d71694d70f', '2c640e14-3f17-4c9f-b51a-2db09b065aea', 'd86323b8-633f-4b3c-a2a6-9c3b05fb7972', 'mp3', 'praises/047_benção/mp3');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('bd781ca2-8d8f-4e63-8603-42610ede990d', '2c640e14-3f17-4c9f-b51a-2db09b065aea', '04dfd0f1-ab99-4eec-948d-f5c17869259f', 'pdf', 'praises/047_benção/pdf');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('85eab902-dd54-4e94-934c-fce11b9a9582', '2c640e14-3f17-4c9f-b51a-2db09b065aea', '68d7b6f7-a6bd-45ad-b712-95db907f853c', 'chord', 'praises/047_benção/chord');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('fd098d95-29fd-4494-bd01-4092228de635', 'Caminho Novo', '048', 'Yuri X. Oliveira', 'Balada', 'Ré Maior', 'Caminho', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('fd098d95-29fd-4494-bd01-4092228de635', '1c6139f0-536a-496a-9f86-6b281321acbd');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('fd098d95-29fd-4494-bd01-4092228de635', '59db85f8-4c2b-4da5-80c7-c9b770922199');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('5e26585b-f67f-407f-b7ce-e7f51f1b72bb', 'fd098d95-29fd-4494-bd01-4092228de635', 'd86323b8-633f-4b3c-a2a6-9c3b05fb7972', 'mp3', 'praises/048_caminho_novo/mp3');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('95d61885-8b86-4f3a-bdd2-9109b5209664', 'Dia de Festa', '049', 'Zaqueu Y. Silva', 'Marcha', 'Fá Maior', 'Festa', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('95d61885-8b86-4f3a-bdd2-9109b5209664', '26f42a63-0eac-4e1d-9096-973bfe8d193a');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('95d61885-8b86-4f3a-bdd2-9109b5209664', 'dca5af40-3d5e-4e8d-a4b0-56b3b558e304');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('e9895398-20e8-41fd-82f3-4f10082ae2a8', '95d61885-8b86-4f3a-bdd2-9109b5209664', '04dfd0f1-ab99-4eec-948d-f5c17869259f', 'mp3', 'praises/049_dia_de_festa/mp3');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('32accc67-3009-460a-b4d4-1cc00e175bb8', '95d61885-8b86-4f3a-bdd2-9109b5209664', 'd86323b8-633f-4b3c-a2a6-9c3b05fb7972', 'pdf', 'praises/049_dia_de_festa/pdf');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('e21ebcdd-59bb-42a1-91bd-e89e9cfd6bfc', '95d61885-8b86-4f3a-bdd2-9109b5209664', '2d6c0599-ddf7-4a3b-b2e3-b999219bd9a0', 'chord', 'praises/049_dia_de_festa/chord');
INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('64b83ac1-f3bb-4ff9-9477-d1cdea5d2856', 'Eternamente', '050', 'Adriano Z. Lima', 'Balada', 'Dó Maior', 'Eternidade', 'Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('64b83ac1-f3bb-4ff9-9477-d1cdea5d2856', '26f42a63-0eac-4e1d-9096-973bfe8d193a');
INSERT INTO praise_tags (praise_id, tag_id) VALUES ('64b83ac1-f3bb-4ff9-9477-d1cdea5d2856', 'e49cea68-b261-42a8-9ea4-fae45f337597');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('d8b8d4b5-0971-4f86-abbe-5c0bd691ca72', '64b83ac1-f3bb-4ff9-9477-d1cdea5d2856', 'c16e9157-3b0e-4fec-ae9b-e6ed01852a58', 'mp3', 'praises/050_eternamente/mp3');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('fec5d984-dea1-4c24-978b-4c0d39625dcb', '64b83ac1-f3bb-4ff9-9477-d1cdea5d2856', '2d6c0599-ddf7-4a3b-b2e3-b999219bd9a0', 'pdf', 'praises/050_eternamente/pdf');
INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('a86d709e-20ed-47ce-a986-abe4a800dd63', '64b83ac1-f3bb-4ff9-9477-d1cdea5d2856', 'ab74b25c-72ed-4342-aef9-789282e5b3d5', 'chord', 'praises/050_eternamente/chord');
