---
name: transcricao-vocal-coral
description: >-
  Metodologia para transcrever partituras vocais (SATB / Coro) a partir de faixas de ensaio isoladas (kits de voz), gerando MusicXML espaçado, compilando via MuseScore 4 e publicando no Coldigom.
---

# Transcrição Fiel de Kits Vocais (Coro / SATB)

## 1. Princípios de Percepção e Fidelidade
* **Natureza dos Kits**: Os kits vocais de ensaio gravam linhas corais de sustentação e contraponto silábico (tônica/dominante no Baixo, acordes em bloco), sem arpejos acrobáticos sintetizados.
* **Análise Acústica e F0**: Para cada naipe isolado (Contralto, Tenor, Baixo), analise a frequência fundamental real (F0) sílaba por sílaba com timestamps antes de definir as notas.
* **Harmonia do Compasso e Anacruses**: Em anacruses e finais de compasso (ex.: beat 4), a voz acompanha a harmonia do compasso vigente e só resolve na cabeça do compasso seguinte.
* **Tessitura e Oitavas na Clave de Fá**:
  - Na teoria musical brasileira, C4 = Dó 3 e C3 = Dó 2.
  - O naipe de Baixo/Barítono deve ser mantido na tessitura confortável da clave de Fá (geralmente entre G2/A2 e D4).
  - Evite notas com linhas suplementares inferiores profundas (como F#2) quando a melodia natural do naipe estiver na 4ª linha (F#3).

## 2. Layout Espaçado no MusicXML
* Para evitar que a letra (lyrics) fique visualmente espremida:
  - Configure `2 compassos cantados por sistema` usando quebras explícitas (`<print new-system="yes"/>`).
  - Escala de pentagrama: 6.4mm / 40 tenths.
  - Margens laterais equilibradas (55 tenths).

## 3. Fluxo de Compilação e Deploy
1. Atualize o arquivo JSON da transcrição (`linda_cidade_transcricao_v2.json` ou similar).
2. Execute o compilador MusicXML e chame o MuseScore 4 CLI:
   `/Applications/MuseScore 4.app/Contents/MacOS/mscore -o "output.pdf" "score.musicxml"`
3. Sincronize o arquivo local em `storage/assets/praises/<praise_id>/<material_id>.pdf`.
4. Envie para o Cloudflare R2 remoto com `--remote` e verifique com `curl -sI`.
