UPDATE praises SET lyrics = 'Quanta dor e vergonha
o pecado traz.
A dor que sentes em tua alma
te faz entender
que não podes prosseguir
vivendo como estás.
Deus está pronto a te ajudar.

Vem, meu filho! Vem, meu filho! Vem!
Das algemas, hoje,
o teu Pai vai te libertar
e, do teu rosto, toda lágrima
enxugar e curar teu coração.
Encontrarás perdão.

Se a tua vida entregares a Jesus,
então verás a diferença de viver na luz.
A felicidade hoje encontrarás,
vem a Jesus te entregar!

Vem, meu filho! Vem, meu filho! Vem!
Das algemas, hoje,
o teu Pai vai te libertar
e, do teu rosto, toda lágrima
enxugar e curar teu coração.
Encontrarás perdão.

Vem, meu filho! Vem, meu filho! Vem!
Das algemas, hoje,
o teu Pai vai te libertar
e, do teu rosto, toda lágrima
enxugar e curar teu coração.
Encontrarás perdão.', updated_at = datetime('now') WHERE id = '0918d62f-9e09-47b5-80ae-b1ca7e3e69af' AND (lyrics IS NULL OR trim(lyrics) = '');
UPDATE praise_materials SET praise_id = '0918d62f-9e09-47b5-80ae-b1ca7e3e69af', merged_from_praise_id = '88560f02-3b4a-4409-b4a3-0ecb0ad7c667' WHERE id = 'e9768583-ef9d-41e2-bfd2-5b0c87250a99' AND praise_id = '88560f02-3b4a-4409-b4a3-0ecb0ad7c667';
DELETE FROM praises WHERE id = '88560f02-3b4a-4409-b4a3-0ecb0ad7c667' AND NOT EXISTS (SELECT 1 FROM praise_materials WHERE praise_id = '88560f02-3b4a-4409-b4a3-0ecb0ad7c667');
