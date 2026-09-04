UPDATE praises SET lyrics = '1. À minha voz, ó Deus atende,
Pois noite e dia clamo a Ti.
Tão frágil sou, tão pobre aqui!
Magoada e só, minha alma arqueja
E te deseja.

2. Da vida e luz Tu és a fonte.
Em mim derrama o Teu poder!
Minha oração vem receber
Pois, de meu leito, o sol vigio
E em ti confio.

3. Não és um Deus que Te comprazas
No vaguear do pecador.
Bondoso e justo és Tu, Senhor!
E Teu favor jamais consentes
Aos maldizentes.

4. Meus pés, à luz de Teus caminhos,
Humilde e grato, inclinarei.
Tu és meu Deus, Tu és meu Rei.
Puro e sincero.

5. Teus filhos têm constante gozo,
Rejubilando em Tua paz.
De todo os guardarás,
Pois Tua lei, ó Deus conhece E te obedecem.', updated_at = datetime('now') WHERE id = 'feb7c9b3-3739-4dea-ac5a-2233a4c8c31e' AND (lyrics IS NULL OR trim(lyrics) = '');
UPDATE praise_materials SET praise_id = 'feb7c9b3-3739-4dea-ac5a-2233a4c8c31e', merged_from_praise_id = 'd9b27ecd-9ded-42dc-a780-116d7e885f5d' WHERE id = '54849ac9-ed85-49b3-9064-c4df23d0944b' AND praise_id = 'd9b27ecd-9ded-42dc-a780-116d7e885f5d';
DELETE FROM praises WHERE id = 'd9b27ecd-9ded-42dc-a780-116d7e885f5d' AND NOT EXISTS (SELECT 1 FROM praise_materials WHERE praise_id = 'd9b27ecd-9ded-42dc-a780-116d7e885f5d');
