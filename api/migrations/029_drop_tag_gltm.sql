-- 029: a tag raiz GLTM sai do app (decisão do dono em 2026-09-26, lista G01–G81 em
-- scripts/validate-acervo/gabaritos/tags_pes/antes_029.json). Dos 81 praises com GLTM:
--  * 4 ficam só com a subtag Avulsos · GLTM (G01, G03, G70, G74):
--   (NÃO USAR) Pegue a tua parte
--   A Ti Senhor
--   Senhor, te agradeço
--   Tu és Maravilhoso
--  * 71 que só tinham GLTM passam a PES (o dono passa um pente fino no PES depois);
--  * 6 que tinham outra tag ficam só com ela.
-- Backup e SQL de volta em gabaritos/tags_pes/ (antes_029.json, desfazer_029.sql).
-- Aplicar: wrangler d1 execute coldigom --remote --file=migrations/029_drop_tag_gltm.sql
INSERT OR IGNORE INTO praise_tags (praise_id, tag_id) VALUES
  ('5a4d12f3-e518-4d6c-9e75-b635d4dfe58f', 'cc645dc3-e47b-4cb8-8330-fb04e67dd944'),
  ('13f78240-803a-4cad-a75b-5df52c95e5e4', 'cc645dc3-e47b-4cb8-8330-fb04e67dd944'),
  ('992f8b2a-1caa-45ec-8e60-023bf8c8e31d', 'cc645dc3-e47b-4cb8-8330-fb04e67dd944'),
  ('2b309bf1-50a0-48fc-8607-8ccce0031500', 'cc645dc3-e47b-4cb8-8330-fb04e67dd944');
DELETE FROM praise_tags WHERE tag_id = '45ab58b2-d293-45c7-aa75-090fcd968b24' AND praise_id IN (
  '5a4d12f3-e518-4d6c-9e75-b635d4dfe58f',
  '13f78240-803a-4cad-a75b-5df52c95e5e4',
  '992f8b2a-1caa-45ec-8e60-023bf8c8e31d',
  '2b309bf1-50a0-48fc-8607-8ccce0031500'
);
INSERT OR IGNORE INTO praise_tags (praise_id, tag_id) VALUES
  ('d2c50fe3-1c76-46af-abd4-1f6bec15d6d2', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('f8e14e5d-414d-430b-b019-2e578aec2ff4', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('aaefd4eb-f9b4-4196-809e-e7ac7267f241', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('c20932c4-4740-4c05-a6cc-7a1237aa7d63', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('8dc296fa-c3fe-4058-b35d-403c76f67d89', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('a00a3d80-12be-4ec7-ba36-7666edf4a02e', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('7065b3ab-22c8-4ba6-bfa1-e2863e5085ce', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('2a1cc9a5-1517-4c41-a531-c3e3920162e7', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('2910ffd8-68c5-4fc1-bf56-dac3eff79904', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('8e7c2785-a6f3-4001-b579-28c166e93eb2', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('ad7eb26b-9061-48fd-acd8-1703e7967ca0', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('ea114f87-bb11-4530-8efe-e12306a7cd8a', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('eb383343-aa23-4a9f-bb25-efcfe9024699', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('ec28fc6a-a2e6-4e3f-b4bd-7051a6a5626a', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('f5ce0c60-236a-4773-9458-f5de86058019', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('b38f6381-1835-4941-a666-d287d8ec9884', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('0cebb7ef-496b-41f3-80fb-b61640a125f6', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('e983a2f6-0ea0-47ef-a703-00da2814f6b1', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('1b1d1b66-86c8-4d52-ac87-ef3a386e7442', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('a0224f38-2b6c-4e1c-a4f4-a86e7cea9451', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('e5d79102-d475-4b01-be63-1dbb33e3bf12', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('67e6c54b-b550-41f7-bc3d-9c290eae7ffe', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('c8a64894-53d1-4f49-a95e-55b8d542c2d9', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('3a1beb97-1d88-4ad9-9f86-94e277345c33', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('4acfbfd6-6aba-46dd-bfa3-12428692ec7f', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('4265fbf1-745b-46d6-83a6-60654d1a46b0', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('5110f0ba-d241-41cd-bba3-df0145f49ac7', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('1aaa927d-5db7-42ee-8e36-29b1ead72965', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('6a9039da-3e4e-4e3c-9511-56ffd1c9c47e', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('f3471e07-3a66-40ee-910d-7066b7a6d2e9', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('cb6b0992-c298-4da3-a45d-73ac3e10aa8a', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('83af2a70-bbaf-41ae-a7bd-cb0d97ac4cb6', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('7567db30-825e-4897-895b-9952db1ec37c', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('9dd67ed9-08f3-4a79-abb0-696766f84ab2', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('3b02deb3-ef07-4789-9dd3-2eacf97b4c46', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('7dcb367f-e099-42f2-92c2-f2d9359eb238', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('1f9d548d-f4f2-4fd6-ac64-dac5775780e1', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('babc4c0a-a85e-4745-ba70-f5dfaa390d81', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('8fd6eced-524c-437e-a608-71bcb333668c', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('3ceee6df-1f9d-41b7-b4b4-ca1140a0809a', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('67a5a59f-d2ac-47b1-8fac-06130be763cb', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('5a2ce285-998f-441d-86bb-165d78495bdc', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('7f3a37db-e945-47e0-b141-519a2119bc2d', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('b4d70d09-4121-459c-a887-47725087362a', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('01a2c719-4386-4ba6-b269-d57c6c03e0b1', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('655cb64b-042d-4c05-855c-f489ea9430c2', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('a1370b42-36dc-48dd-8797-72fa054a3985', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('182168a9-3dd2-48fb-a9f2-be945d128e4c', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('52b25113-5979-4593-82f9-7bc45929d890', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('587bfcff-0822-483d-aeef-d1197cc18563', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('32eeccf0-6ae1-4e42-9234-d4e4c6776b46', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('af443b58-b9d5-4ed3-80b3-c56cc7082ff8', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('88f3e2f9-0f50-4f25-be0a-e1c8221fb9c7', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('70c5b64d-3202-47f3-9023-78a128e64c23', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('cdcdbdbe-a57b-4ba7-97ea-3c674f0d1669', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('f2ba3831-7ae7-457c-8221-80857b46f8a7', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('556edcbd-d623-4aaa-be1f-599fb3a2218e', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('d7ab3973-543b-492c-82ec-fbbb97ca3c75', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('d69733a7-37ca-42de-829d-328b76d6af46', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('6539ebdf-b908-43e2-8d61-05eb63ed13ac', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('3f4d3601-a6d8-4737-9da2-3eacd7aefdc5', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('4fea5632-30b3-4ad5-af81-e19ece593971', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('45ac5c0a-a8be-4346-abcd-a6cc5097ce21', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('d7a8bae4-b82e-4b79-a70f-b1e8104d0f0d', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('54e20961-348c-4f6f-aa0b-1da350f279ed', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('1747e742-d521-47ff-bc7d-e72de709480a', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('ebbbac37-4409-4bcd-bfb3-25b1d3fbcc34', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('1e68df2a-fbaf-4192-a43d-91d3a874aaca', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('031eabb4-d340-48fe-bc25-cb4a00d273bb', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('393ecff2-3baf-4878-bd09-04dd69c03e44', '8d5f147b-a28c-425f-9ba8-101434030af9'),
  ('2e543a39-c6a8-4f87-8787-c18fdb222e8b', '8d5f147b-a28c-425f-9ba8-101434030af9');
DELETE FROM praise_tags WHERE tag_id = '377b4956-8af4-40b5-90ce-868956eab5c2';
DELETE FROM tags WHERE id = '377b4956-8af4-40b5-90ce-868956eab5c2' AND NOT EXISTS (SELECT 1 FROM tags f WHERE f.parent_id = '377b4956-8af4-40b5-90ce-868956eab5c2');
