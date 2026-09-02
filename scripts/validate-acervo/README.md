# validate-acervo

Arnês de validação do acervo. O detector propõe, o gabarito mede, e só o
`apply` escreve.

## Rodar

```bash
cd scripts/validate-acervo

python3 -m core.snapshot                    # espelha o D1 + indexa a árvore original
python3 -m core.reconcile                   # Fase 0 — liga material ao arquivo original
python3 -m detectors.youtube_merge          # Fase 1 — emite findings e o formulário

# simula (padrão) e depois aplica a faixa alta
python3 -m core.apply --from out/youtube_merge/findings.jsonl --faixa alta
python3 -m core.apply --from out/youtube_merge/findings.jsonl --faixa alta --execute

# mede contra o gabarito que você preencheu
python3 -m core.gold --from out/youtube_merge/findings.jsonl \
                     --gabarito out/youtube_merge/gabarito.tsv

# desfaz uma corrida inteira
python3 -m core.apply --undo <run_id> --execute
```

Testes: `python3 -m pytest tests/ -v`

## Arquivos

| arquivo | papel |
|---|---|
| `core/paths.py` | onde as coisas estão. Nenhuma lógica |
| `core/normalize.py` | normalização de nome e letra. O conteúdo dos parênteses é preservado |
| `core/d1.py` | fala com o D1 pelo wrangler. Escrita é `.sql` gerado + subprocess |
| `core/snapshot.py` | monta `out/snapshot.sqlite` e indexa `assets2` |
| `core/findings.py` | o contrato do finding e o contador de exclusões |
| `core/reconcile.py` | Fase 0 — liga cada material ao arquivo original |
| `core/apply.py` | a única porta de escrita. Simula por padrão |
| `core/gold.py` | sorteio, formulário cego, precisão por faixa |
| `detectors/youtube_merge.py` | Fase 1 — louvores cujo único material é do YouTube |

## As regras que não são óbvias no código

- **Simula por padrão.** `--execute` é o único portão de escrita, e o retorno
  antecipado da simulação acontece antes de ler qualquer credencial.
- **O gabarito é cego.** O formulário mostra o alvo e a evidência bruta, nunca
  a proposta do detector. Com a proposta à vista, a métrica vira concordância.
- **O CSV de classificação não é gabarito.** Ele mesmo chutou o kind a partir
  do nome do arquivo. É uma testemunha como as outras.
- **Nome do arquivo manda sobre a pasta.** Medido: há arquivos guardados na
  pasta do louvor errado cujo nome diz o louvor certo, e o banco já corrigiu.
- **Sem candidato não quer dizer louvor novo.** O detector reporta e para.
- **A fusão por SQL é recusada se a fonte tiver `r2_key`.** SQL não limpa o
  R2; o endpoint com JWT limpa. Na Fase 1 nenhum tem, mas deixar implícito
  viraria vazamento silencioso na primeira fase que reusasse a função.

## Pré-requisitos

- `wrangler` logado (o `api/wrangler.toml` é gitignored e precisa existir)
- A árvore original em `/Volumes/SSD 2TB SD/assets2`, ou `COLDIGOM_ASSETS2`
  apontando para ela
- Python 3.9+; nada a instalar além do que já está no sistema
