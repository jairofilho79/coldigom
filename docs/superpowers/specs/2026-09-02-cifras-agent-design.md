# Agente de cifras: PDF → ChordPro → coldigom

Data: 2026-09-02. Estado: aprovado em conversa. Substitui as ferramentas de
`scripts/pdf-to-chordpro/` (que ficam como estão, sem uso em produção).

## Problema

Os PDFs de cifra do acervo são páginas de hinário escaneadas (1 página, 2
colunas, 2 a 5 louvores por página) com camada de texto OCR. Acordes e barras
são em tinta vermelha. Um louvor pode começar numa coluna e terminar na outra
(18% dos casos). Precisamos, para cada material PDF de cifra (Cifra, Cifra I,
Cifra II), do ChordPro do louvor certo, com acorde colado onde há barra e solto
onde não há, publicado no coldigom com o mínimo de erros e erros fáceis de
corrigir na revisão por lá (critério "b").

## Princípio

A geometria produz, o modelo lê, o verificador decide. A tinta vermelha dá a
estrutura (quantas barras e quantos acordes por linha), medida em Python. O
subagente (Sonnet, nesta sessão, plano Claude, sem API) só preenche o que a
tinta não diz. Um arquivo só é publicado se passar em checks que contam coisas
que o modelo não pode inventar.

## Componentes (`scripts/cifras-agent/`)

- **Página**: render colorido, camada de texto com coordenadas, calha entre
  colunas, cabeçalhos `NNN - TÍTULO`, linhas `Tonalidade:`, rodapé. Produz a
  ordem de leitura (coluna esquerda de cima a baixo, depois direita).
- **Crop**: atribui linhas a louvores pela ordem de leitura. Saída: 1 ou 2
  retângulos e um PNG único costurado. Verificado por alinhamento com a letra
  canônica do `metadata.yml`.
- **Esqueleto**: por linha de letra, texto da camada de texto, barras medidas
  como posição de caractere, acordes vermelhos da linha acima com nome lido
  da camada de texto ou `?`.
- **Leitor** (subagente): recebe crop, esqueleto, letra canônica e metadados;
  devolve o ChordPro. Não pode mudar contagens medidas; discordância vai em
  campo separado.
- **Verificador**: barras = acordes colados por linha; acordes medidos =
  acordes escritos por linha; letra cobre a canônica e não tem texto de
  vizinho; gramática de acorde e campo do tom; espaçamento de estrofes.
- **Publicador**: `PUT /api/materials/:id/content` (já zera `is_reviewed`),
  nunca toca nos 56 revisados à mão, log retomável, simula por padrão.

## Fluxo por material

1. Página e crop em Python. Se o alinhamento com a letra canônica falhar, um
   subagente vê a página inteira e devolve retângulos; Python re-verifica.
2. Esqueleto → leitor → ChordPro.
3. Verificador. Passou: publica. Falhou: leitor recebe o relatório e tenta de
   novo, no máximo duas vezes.
4. Resíduo: publica com diretiva no topo dizendo qual check falhou e em que
   linha (decisão sujeita a revisão do dono).

## Regras do arquivo (ver memória `cifras-regras-do-acervo`)

- Acorde com barra: colado (`Se[F]nhor`). Sem barra: entre espaços, antes, no
  meio ou depois da frase. A barra nunca aparece no arquivo.
- `| bis` na margem vira `[*2x]` em linha própria acima do bloco.
- Louvor que atravessa coluna vira um arquivo só.
- Cifra I e Cifra II geram dois arquivos; cruzamento é check, não fusão.
- Metadados: `praise_number`/`praise_name` do `metadata.yml` mandam.
- Cabeçalho: `{title}`, `{subtitle: número}`, `{key}`, `{rhythm}`, `{artist}`.
- Uma linha em branco entre estrofes (convenção majoritária do gabarito).

## Medição

Dois gabaritos, dado e não código:

| Gabarito | Tamanho | Mede |
|---|---|---|
| Recortes manuais (`crops_meta.json`, `manual_recrop_ocr`) | 734 | crop (IoU) |
| Arquivos revisados à mão (`out/gold_set/manifest.json`) | 56 | extração |

`bench` roda os dois e imprime a tabela. Mudança só entra se não piorar.
Fixtures de teste: OCR congelado de páginas reais.

## Operação

Driver em Python com estado por material (retomável). Lotes de 10 a 15
subagentes por vez (teto do harness: 20). Cada rodada termina com balanço
rotulado (publicados, resíduo, checks que mais falharam).
