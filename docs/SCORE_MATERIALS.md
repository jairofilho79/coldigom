# Partituras para o coldigui

Os tipos de material `mscz`, `mxl` e `musicxml` pertencem ao catalogo R2.
O `type` e o formato do arquivo; `material_kind_id` continua indicando a
voz/instrumento. Nao e necessario criar uma categoria de banco de dados
para cada extensao de partitura.

MSCZ e um ZIP com MSCX do MuseScore; MXL e MusicXML comprimido. Renomear um
arquivo arbitrario nao o transforma em partitura. O fluxo de contribuicoes
deve passar pelo sniff e pela validacao estrutural existentes, incluindo os
controles de seguranca do scanner, antes da curadoria.

## Cadastro pelo administrador

Em **Editar > Adicionar material**, selecionar o formato MSCZ, MXL ou
MusicXML e o arquivo. A categoria continua sendo vocal/instrumental.
O endpoint de upload autenticado valida o conteudo antes de gravar o asset;
falhas aparecem no formulario e permitem uma nova tentativa.

Uploads e contribuicoes compartilham a validacao estrutural de partitura:
ZIP ate 16 MiB, 128 entradas, 8 MiB por entrada, 16 MiB descomprimidos,
razao de expansao maxima 200, XML ate 4 MiB, container ate 64 KiB e
profundidade XML ate 64. Caminhos inseguros, CRC divergente e arquivos
truncados sao rejeitados.

DOCTYPEs PUBLIC oficiais do MusicXML sao aceitos sem resolucao externa.
DTD arbitraria, entidades e subconjuntos internos permanecem proibidos.

## Contrato de leitura

- Preservar `r2_key`, `type`, metadados e `material_kind_id` no manifesto.
- Assets de partituras sao servidos por `/assets/...`, como PDFs e cifras.
- O coldigui classifica esses tipos como partitura interativa e abre seu
  leitor proprio. Nao converter MSCZ em PDF como requisito para leitura.
- SoundFonts compartilhados nao sao materiais de um louvor e nao devem
  aparecer no catalogo de partituras.

## Banco de instrumentos compartilhado

O coldigui tem som minimo em memoria e funciona sem banco externo.
O banco completo padrao usa:

```text
storage/assets/shared/soundfonts/FluidR3Mono_GM.sf3
storage/assets/shared/soundfonts/FluidR3Mono_License.md
```

O primeiro arquivo e servido em
`/assets/shared/soundfonts/FluidR3Mono_GM.sf3`; o consumidor Web tambem pode
passar pelo proxy de assets do coldigui.

`storage/` e ignorado pelo Git: publicar no R2 e uma operacao separada,
com autorizacao de deploy/upload. Este documento nao efetua publicacao e
a ausencia do asset nao deve ser disfaracada como download bem-sucedido.

Fonte e licenca:

- [Banco oficial MuseScore v3.6.2](https://github.com/musescore/MuseScore/blob/v3.6.2/share/sound/FluidR3Mono_GM.sf3)
- [Licenca/creditos MIT](https://github.com/musescore/MuseScore/blob/v3.6.2/share/sound/FluidR3Mono_License.md)

Git blob IDs do conteudo oficial, uteis para conferir a origem com
`git hash-object <arquivo>`:

```text
FluidR3Mono_GM.sf3:     90710669bf3c87b1d5b5787ce2c269ea66ded877
FluidR3Mono_License.md: fc8bb32259d2fdb9a71b4b043afe094230d1278d
```

Preservar os creditos e a permissao junto do banco distribuido. SF2/SF3
recebem MIME de SoundFont na rota de assets, mas nao entram nos tipos R2
de materiais catalogados.

## Validacao

Na raiz:

```bash
npm run typecheck:api
```

Seletores rapidos, antes da verificacao final:

```bash
npm --prefix api test -- --run \
  src/__tests__/scoreMaterialContract.test.ts \
  src/__tests__/assetsRange.test.ts \
  src/__tests__/contributionsSniff.test.ts \
  src/__tests__/contributionsStructural.test.ts \
  src/__tests__/contributionsScan.test.ts \
  src/__tests__/contributionsRoutes.test.ts \
  src/__tests__/scoreUpload.test.ts
npm --prefix web test -- --run src/__tests__/PraiseDetailPage.test.tsx
```

Antes da entrega, executar build, lint e suites pertinentes. `typecheck:api`
e `verify` sao scripts da raiz; o teste da API usa Vitest e `--run` evita
deixar um watcher aberto.
