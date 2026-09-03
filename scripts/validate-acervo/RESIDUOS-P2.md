# Resíduos do P1 — o que ficou para o P2

Este arquivo é a memória durável do que o P1 decidiu **não** consertar. Cada
item foi visto por uma revisão, triado e adiado de propósito. Nenhum deles é
perda de dado em caminho alcançável — esse era o critério de corte.

O ledger de execução (`.superpowers/sdd/`) é scratch e some; isto aqui fica.

## Segurança de escrita

- **`--undo` devolve exit 0 mesmo com entradas indecidíveis.**
  `core/apply.py`, `main()`. Quando uma leitura de produção falha, a entrada é
  adiada e reportada em `indecidiveis`, mas o processo sai com sucesso. Antes
  da última rodada o mesmo caso derrubava o processo (exit 1). Nada é escrito e
  o aviso sai no stdout; morde só quem automatiza `--undo` olhando `$?`.
  *Conserto:* sair com código ≠ 0 quando `indecidiveis` não é vazio.

- **`_pos_condicao` não prova que o keeper recebeu nada.** Ela só pergunta se a
  fonte sumiu. Os dois caminhos que exploravam essa fraqueza estão fechados
  (portão de alvo repetido por lote + pré-condição de fonte viva entre lotes),
  mas a asserção continua fraca. *Conserto:* afirmar o estado do keeper, não a
  ausência da fonte.

- **Recusa de tag-pai é avaliada só contra o snapshot.** Mesma janela de corrida
  da recusa por `r2_key`: se a hierarquia de tags mudar em produção depois do
  snapshot, a guarda decide com dado velho.

- **`desfazer()` reporta "N escritas" contando entradas de log**, não escritas de
  fato. Número exibido ao dono, não decisão de código.

- **`indecidiveis` não entram no log.** Autocorrige sozinho: a entrada adiada não
  ganha linha "desfeito" e o próximo `--undo` a reencontra.

- **`except Exception` largo em `_fonte_existe`.** Trata qualquer falha como
  "não sei" e adia — falha segura, mas engole erro de programação junto com
  erro de rede.

- **Log de versão anterior (sem o campo `escreveu`) cai no fallback por `ok`.**
  Inerte hoje: não existe nenhum `apply_log.jsonl`. Vira real na primeira
  aplicação de verdade seguida de uma mudança de formato.

- **Um finding fica `ok:false` para sempre** depois do cenário de retomada: a
  fusão aconteceu, a pré-condição recusa certo a cada rodada e o dono vê o
  mesmo finding reprovando sempre. É ruído de relatório, não perda de dado;
  fechar exige estado novo no log.

- **Mutante M3 de `_pos_condicao` sobrevive.** Matá-lo exigiria um
  `run_sql_files` falso que desobedece ao SQL gerado; nenhum caminho real
  produz esse estado.

## Medição

- **A métrica da faixa média tem teto estrutural de ~51,9%.** O formulário tem
  uma linha por fonte; a faixa média emite até 7 findings por fonte. Não é bug
  de código, é o eixo de medição. Só faz sentido corrigir junto da tela de fila,
  que é P2. O portão que autoriza escrita é o da faixa **alta**, e ele não é
  afetado.

- **A cota de `sortear()` não redistribui a sobra.** `n // len(presentes)` igual
  para cada faixa: faixa com menos itens que a cota deixa o total abaixo de `n`.
  Não morde na Fase 1 (que não usa `sortear`); morde nas Fases 2/3 com lotes
  grandes e faixas desbalanceadas.

- **Truncamento da letra no formulário corta no meio da palavra**
  (`core/gold.py`). 200 caracteres já dão contexto; cortar no último espaço
  ficaria mais limpo.

- **Recall perdido na Fase 1: `Salmo 130` é `Do fundo de um abismo`, e o
  detector não listou.** Medido no gabarito de 2026-09-03 (o dono respondeu às
  cegas; `gabaritos/youtube_merge/`). O nome não casa por substring e as duas
  letras não compartilham nenhum shingle de 8 palavras. É o único órfão dos 25
  cuja resposta certa ficou fora da lista — os 7 "sem candidato" eram mesmo
  `NENHUM`, 7 em 7. Um detector por título-de-salmo ou um shingle menor com
  guarda de nome cobre isso; fica para o P2.

- **O gabarito da Fase 1, medido:** faixa alta 3/3 (100 %, zero falso
  positivo); faixa média 11/29 (37,9 %, dentro do teto estrutural acima). O
  formulário cego funcionou: o dono devolveu 25 vereditos sem ver a proposta.

- **`author` das fontes só-YouTube contém a primeira linha da letra.** Nos 3
  casos da faixa alta, todos: `'Estevão avistou os céus abertos:'`, `'Os céus
  declaram a glória de Deus,'`, `'Prostrado estou'`. Vem da importação do
  YouTube. A fusão doa `author` quando o keeper está vazio, então o lixo
  migraria. Na Fase 1 o dono limpou à mão antes do `--execute`; para as
  próximas fases vale um detector `author_e_letra` (P2) e/ou uma guarda na
  doação: não doar `author` que seja prefixo normalizado de `lyrics`.

## Cosméticos

- `core/reconcile.py`: `main()` sem teste direto — nem a cobertura nem o retorno
  1 abaixo de 99% são exercitados; validado só por execução real.
- `core/reconcile.py:18`: a coluna se chama `kind_id` e recebe `material_kind`.
  O nome está certo — `praise_materials.material_kind` guarda o UUID de
  `material_kinds.id` (FK mal nomeada na origem, `api/schema.sql:80`).
- Predicado de doação duplicado entre `_sql_merge` e `estado_anterior`:
  consistente hoje, mas mexer só num faz `doadas` derivar em silêncio.
- `--undo` não restaura `updated_at` do keeper — consequência pretendida.
- O comentário do `NOME_MINIMO` generaliza além do medido ("eu sou", "pela fe",
  "guia me" têm 6-7 caracteres e são genéricos). Medido: rodar o detector com
  8, 6 e 0 dá **faixa alta idêntica** nas três.
- `_lit` não aplicado em dois pontos (colunas TEXT, risco nulo); log serializa
  `antes` duas vezes; `trim()` do SQL vs `str.strip()` do Python.
