# Validação do acervo — P2: fila de revisão — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar às faixas média e baixa um lugar para pousar — a tabela `validation_findings` no D1, três endpoints e uma tela — e fechar o circuito *decisão humana → escrita pela única porta*, começando pelas 11 fusões da Fase 1 que o dono já confirmou no gabarito.

**Architecture:** O detector continua emitindo findings em JSONL. `core/queue.py` empurra os que não são faixa alta para o D1 com `INSERT OR IGNORE` (uma decisão já tomada nunca é sobrescrita por um re-push). A tela lista, agrupa os candidatos concorrentes do mesmo louvor e grava decisões (`aprovado` / `rejeitado` / `discussao`) com nota. `core/queue.py --puxar-aprovados` traz as decisões de volta como findings **promovidos à faixa alta**, e o `apply.py` de sempre escreve; `--marcar-aplicados` fecha o ciclo. Uma decisão humana — o veredito do gabarito hoje, a fila amanhã — é a única forma de um finding de faixa média virar escrita, e as duas passam pela mesma função, `findings.promovido()`.

**Tech Stack:** Python 3.9 sem dependências (`sqlite3`, `csv`, `json`), pytest · Cloudflare Workers + Hono + D1 (TypeScript, vitest) · React 18 + Vite + react-router + @testing-library (vitest, jsdom).

**Spec:** `docs/superpowers/specs/2026-09-02-validacao-do-acervo-design.md` — §5 (contrato do finding; §5.1 faixas; §5.2 portão de promoção), §6 (fila de revisão: DDL, endpoints, tela), §11 (P2). Leitura obrigatória junto: `scripts/validate-acervo/README.md` (as regras que não são óbvias no código) e `scripts/validate-acervo/RESIDUOS-P2.md` (o que o P1 adiou para cá — em especial o teto estrutural da faixa média, que é o motivo do agrupamento por louvor na tela).

## Global Constraints

- **`core/apply.py` é a única porta de escrita no acervo** (README). Simula por padrão; `--execute` é recusado se o lote tiver qualquer finding fora da faixa alta. P2 **não abre uma segunda porta**: a API grava só em `validation_findings`, nunca em `praises`, `praise_materials` ou `praise_tags`.
- **`aplicado` é status que só o script grava.** A API recusa `status: "aplicado"` com 400.
- **O gabarito é cego** (spec §5.2). A promoção por gabarito usa só o veredito do dono — igualdade estrita com `proposed` — nunca um score.
- **Faixas** (spec §5.1): `alta | media | baixa | discussao`. **Status** (spec §6): `pendente | discussao | aprovado | rejeitado | aplicado`.
- **A rejeição é o dado de treino** (spec §6): `decision_note` é gravada e devolvida pela API, nunca descartada.
- **Ferramenta de gestão** (spec §6): densidade de informação e CRUD ganham de conforto de leitura.
- **Nenhum subagent roda `--execute` nem `wrangler d1 execute --remote`.** Escrita em produção é do orquestrador, depois de ver a simulação. Tarefas marcadas **[ops]** são dele.
- **Catraca de cobertura, nunca desce** — api `statements 69 / branches 64 / functions 72 / lines 71` (`api/vitest.config.ts:26-31`); web `79 / 72 / 76 / 81` (`web/vitest.config.ts:20-25`). A folga hoje é menor que 1 ponto em cada. **Cada tarefa entrega os testes junto.**
- **`api/src/__tests__/routes.inventory.test.ts`** lista todas as rotas em ordem de registro; rota com `requireAuth` aparece **duas vezes**. Atualizar no mesmo commit que registra a rota.
- **`api/schema.sql` é sincronizado à mão** com `api/migrations/`; nada valida (a Task 4 cria o teste que passa a validar). Migração é aplicada manualmente: `cd api && npx wrangler d1 execute coldigom --remote --file=migrations/017_validation_findings.sql`.
- **Nunca usar `--c-success-bg` / `--c-warning-bg` / `--c-info-bg`** (fundo claro num app escuro, `web/src/styles/design-system.css:62-66`). Selos seguem o precedente `.drive-job-pill--ok|err|run` (`global.css:1911-1931`).
- Python: sempre `python3 -B` (o cache de bytecode do sistema já deu falso positivo em mutação). Testes: `cd scripts/validate-acervo && python3 -B -m pytest tests -q`. TypeScript: `npm run test:api`, `npm run test:web`, e `npm run verify` na raiz antes de fechar.
- Mensagens de commit em português, `tipo(escopo): frase`, com o trailer de atribuição da sessão.

## Raias — o que roda em paralelo

| raia | tarefas | toca | espera |
|---|---|---|---|
| **S · scripts** | 1 → 2 → 3 → 7 | `scripts/validate-acervo/` | — |
| **A · api** | 4 → 5 → 6 | `api/` | — |
| **W · web** | 8 → 9 → 10 | `web/` | nada para codar: o contrato da API está fixado nas Tasks 5 e 6 deste plano. Espera A só para o teste manual de ponta a ponta |
| **fecho** | 11 → 12 | tudo | S, A e W fechadas; a 12 exige a migração aplicada no D1 remoto |

Dentro de uma raia é sequencial. Entre raias não há arquivo em comum. Quem executa com subagents pode disparar S, A e W ao mesmo tempo.

## File Structure

**scripts/validate-acervo/** (raia S)
- Modify `core/findings.py` — `promovido(f, motivo)`: cópia na faixa alta com o motivo na evidência.
- Modify `core/gold.py` — `promover(gabarito, findings, origem)` e a flag `--promover SAIDA.jsonl`.
- Modify `core/apply.py` — duas guardas na doação de `_sql_merge`: `author` que é a primeira linha da letra não é doado; a tag `Avulsos` não é doada. Constante `TAGS_NAO_DOADAS`.
- Create `core/queue.py` — `linha_de`, `sql_insert`, `empurrar`, `puxar_aprovados`, `marcar_aplicados`, CLI. Fala com o D1 só por `core.d1` (`run_sql_files`, `query`), injetáveis nos testes.
- Modify `tests/test_findings.py`, `tests/test_gold.py`, `tests/test_apply.py`; Create `tests/test_queue.py`.
- Modify `README.md` — o ciclo da fila.

**api/** (raia A)
- Create `migrations/017_validation_findings.sql` — DDL da spec §6, com cabeçalho explicando o porquê.
- Modify `schema.sql` — mesma tabela e índices, ao final.
- Create `src/routes/validation.ts` — `registerValidationRoutes(app)`: `GET /api/validation/findings`, `POST /api/validation/findings/bulk`, `PATCH /api/validation/findings/:id`.
- Modify `src/index.ts` — importar e registrar depois de `registerTagsRoutes(app)`.
- Create `src/__tests__/schemaSync.test.ts`, `src/__tests__/validationFindings.test.ts`; Modify `src/__tests__/routes.inventory.test.ts`.

**web/** (raia W)
- Modify `src/types/index.ts` — `FindingConfidence`, `FindingStatus`, `ValidationFinding`, `FindingDecision`.
- Modify `src/services/api.ts` — `listValidationFindings`, `decideValidationFinding`, `bulkDecideValidationFindings`.
- Create `src/pages/ValidationQueuePage.tsx` — a tela; exporta também `agruparPorAlvo` (puro, testável).
- Create `src/components/FindingEvidence.tsx` — evidência: chave/valor genérico + os dois louvores lado a lado para `merge_praise`.
- Modify `src/App.tsx` — rota `/validacao`.
- Modify `src/styles/global.css` — bloco `.vf-*` no fim.
- Create `src/__tests__/validationApi.test.ts`, `src/__tests__/ValidationQueuePage.test.tsx`, `src/components/__tests__/FindingEvidence.test.tsx`.

**fecho**
- Modify `api/vitest.config.ts`, `web/vitest.config.ts` — catraca sobe.
- Modify `docs/INGESTION.md` — a linha da migração 017. Modify `docs/DIVIDA-TECNICA.md` — o que este plano deixa registrado.
- Create `scripts/validate-acervo/gabaritos/youtube_merge/execucao/promovidos.jsonl` (Task 3) — fora do `out/`, que é git-ignored.

---

## Raia S — scripts

### Task 1 [S]: `promovido()` e `gold --promover` — decisão humana vira faixa alta

**Files:**
- Modify: `scripts/validate-acervo/core/findings.py` (depois de `read_findings`, antes de `class Motivos`)
- Modify: `scripts/validate-acervo/core/gold.py` (nova função depois de `medir`; flag e uso em `main`)
- Test: `scripts/validate-acervo/tests/test_findings.py`, `scripts/validate-acervo/tests/test_gold.py`

**Interfaces:**
- Produces: `core.findings.promovido(f: Finding, motivo: dict) -> Finding` — cópia com `confidence="alta"` e `evidence={**f.evidence, "promocao": motivo}`; **mesmo `finding_id`** (é o mesmo achado, com mais uma testemunha). O original não é alterado.
- Produces: `core.gold.promover(gabarito: dict[str, str], findings: list[Finding], origem: str) -> list[Finding]` — só findings **fora** da faixa alta cujo `proposed == gabarito[target_id]`, cada um passado por `promovido(f, {"por": "gabarito", "origem": origem})`. Ordem de entrada preservada.
- CLI: `python3 -B -m core.gold --from F.jsonl --gabarito G.tsv --promover SAIDA.jsonl` — mede como sempre e, além disso, grava SAIDA. O código de saída continua sendo o do portão (a promoção não muda a medição). A Task 7 consome `promovido` de novo, com `{"por": "fila", ...}`.

- [ ] **Step 1: Write the failing tests**

Em `tests/test_findings.py`, ao final (o arquivo já importa `Finding`; acrescente `promovido` ao import de `core.findings`):

```python
def test_promovido_vira_alta_mantem_o_id_e_registra_o_motivo():
    f = Finding(run_id="r1", detector="d", target_type="praise", target_id="t",
                action="merge_praise", confidence="media", proposed="k",
                evidence={"letra": True})
    p = promovido(f, {"por": "gabarito", "origem": "g.tsv"})
    assert p.confidence == "alta"
    assert p.finding_id == f.finding_id
    assert p.evidence == {"letra": True, "promocao": {"por": "gabarito", "origem": "g.tsv"}}
    # o original nao muda: quem chamou ainda tem o finding de faixa media
    assert f.confidence == "media"
    assert "promocao" not in f.evidence
```

Em `tests/test_gold.py`, ao final (troque o import de `core.findings` por `from core.findings import Finding, read_findings, write_findings` e acrescente `promover` ao import de `core.gold`):

```python
def test_promover_so_o_que_o_dono_confirmou_e_so_fora_da_alta():
    fs = [_f("a1", "alta", "k1"),    # ja e alta: nao entra
          _f("m1", "media", "k1"),   # confirmado: entra
          _f("m2", "media", "k9"),   # dono apontou outro: nao entra
          _f("m3", "media", "k3"),   # dono disse NENHUM: nao entra
          _f("m4", "baixa", "k4")]   # confirmado na baixa: entra
    gab = {"a1": "k1", "m1": "k1", "m2": "k2", "m3": "NENHUM", "m4": "k4"}
    out = promover(gab, fs, origem="g.tsv")
    assert [(f.target_id, f.confidence) for f in out] == [("m1", "alta"), ("m4", "alta")]
    assert out[0].evidence["promocao"] == {"por": "gabarito", "origem": "g.tsv"}
    assert out[0].finding_id == fs[1].finding_id


def test_main_promover_grava_o_arquivo_e_nao_muda_o_portao(tmp_path):
    src = str(tmp_path / "f.jsonl")
    gab = str(tmp_path / "g.tsv")
    saida = str(tmp_path / "p.jsonl")
    write_findings([_f("a1", "alta", "k1"), _f("m1", "media", "k1")], src)
    open(gab, "w", encoding="utf-8").write(
        "target_id\tnome\tletra\turl\tveredito\n"
        "a1\t\t\t\tk1\n"
        "m1\t\t\t\tk1\n")
    assert main(["--from", src, "--gabarito", gab, "--promover", saida]) == 0
    lidos = read_findings(saida)
    assert [(f.target_id, f.confidence) for f in lidos] == [("m1", "alta")]
    assert lidos[0].evidence["promocao"]["origem"] == "g.tsv"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd scripts/validate-acervo && python3 -B -m pytest tests/test_findings.py tests/test_gold.py -q`
Expected: erro de import (`cannot import name 'promovido'` / `'promover'`).

- [ ] **Step 3: Implement**

`core/findings.py`, depois de `read_findings`:

```python
def promovido(f: Finding, motivo: dict) -> Finding:
    """Cópia do finding na faixa alta, com o motivo gravado na evidência.

    A faixa alta é a única que o apply escreve, e a única forma legítima de
    um finding de faixa média chegar lá é uma decisão humana — o veredito do
    gabarito hoje, a fila de revisão amanhã. As duas passam por aqui. O
    finding_id não muda: é o mesmo achado, com mais uma testemunha, e o log
    do apply continua reconhecendo replays por ele.
    """
    d = asdict(f)
    d["confidence"] = "alta"
    d["evidence"] = {**f.evidence, "promocao": dict(motivo)}
    return Finding(**d)
```

`core/gold.py`: troque o import para `from core.findings import FAIXAS, Finding, promovido, read_findings, write_findings` e acrescente depois de `medir`:

```python
def promover(gabarito: dict[str, str], findings: list[Finding], origem: str) -> list[Finding]:
    """Os findings fora da faixa alta cujo alvo o dono confirmou.

    'Confirmou' é igualdade estrita entre a proposta e o veredito. NENHUM e
    veredito diferente ficam de fora. Quem já é alta não precisa de
    promoção — e pode já ter sido aplicado pelo portão.
    """
    out: list[Finding] = []
    for f in findings:
        if f.confidence == "alta":
            continue
        if gabarito.get(f.target_id) == f.proposed:
            out.append(promovido(f, {"por": "gabarito", "origem": origem}))
    return out
```

Em `main`, acrescente o argumento logo depois de `--gabarito`:

```python
    ap.add_argument("--promover", default="",
                    help="grava aqui, como findings de faixa alta, os que o dono confirmou no gabarito")
```

e, depois do bloco que imprime a tabela por faixa e grava `metrica.json`, **antes** de `alta = r["alta"]`:

```python
    if args.promover:
        promovidos = promover(gabarito, findings, origem=os.path.basename(args.gabarito))
        write_findings(promovidos, args.promover)
        print(f"promovidos pelo gabarito: {len(promovidos)} -> {args.promover}")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd scripts/validate-acervo && python3 -B -m pytest tests -q`
Expected: tudo verde (105 + 3 novos).

- [ ] **Step 5: Commit**

```bash
git add scripts/validate-acervo/core/findings.py scripts/validate-acervo/core/gold.py scripts/validate-acervo/tests/test_findings.py scripts/validate-acervo/tests/test_gold.py
git commit -m "feat(gold): veredito do dono promove o finding para a faixa alta"
```

---

### Task 2 [S]: duas guardas na doação da fusão — `author` que é letra, tag `Avulsos`

**Files:**
- Modify: `scripts/validate-acervo/core/apply.py` — import de `norm_letra`; constante `TAGS_NAO_DOADAS` junto de `DOAVEIS` (linhas 17-19); função `_author_e_letra`; o laço de doação (`for c in DOAVEIS:` em `_sql_merge`, ~linha 123) e o laço de tags (~linha 131)
- Test: `scripts/validate-acervo/tests/test_apply.py`

**Interfaces:**
- Consumes: `core.normalize.norm_letra(s) -> str` (já existe).
- Produces: `TAGS_NAO_DOADAS: tuple[str, ...] = ("Avulsos",)` — nomes de tag que nunca migram da fonte para o keeper. `_author_e_letra(author, lyrics) -> bool`.
- Comportamento: `_sql_merge` não emite `UPDATE praises SET author` quando `_author_e_letra(s["author"], s["lyrics"])`; não emite `INSERT OR IGNORE INTO praise_tags` para tag cujo nome está em `TAGS_NAO_DOADAS`. A recusa por tag-pai (linhas 101-110) continua olhando **todas** as tags da fonte. `estado_anterior` e `desfazer` não mudam: `antes["tags"]` continua sendo as tags da fonte (para reinseri-las na fonte no undo) e `antes["keeper_tags"]` as do keeper.

Por que agora e não no P3: na Fase 1, 3 de 3 fontes só-YouTube tinham `author` = primeira linha da letra (importação), e as 3 tinham `Avulsos`; a fusão doou lixo a um keeper vazio e pôs `Avulsos` em dois louvores da Coletânea. O dono limpou à mão. As 11 fusões da Task 3 repetiriam isso em 2 + 8 keepers.

- [ ] **Step 1: Write the failing tests**

Em `tests/test_apply.py`, ao final. O `_mundo` do arquivo já cria a fonte com letra `'Medo tens que o tentador'` e a tag `t-av` = `Avulsos`:

```python
def test_fusao_nao_doa_author_que_e_a_primeira_linha_da_letra(tmp_path):
    # Importacao do YouTube grava a primeira linha da letra no author. Fase 1:
    # 3 de 3 fontes. O keeper vazio recebia isso como autor.
    conn = _mundo(tmp_path)
    conn.execute("UPDATE praises SET author = 'Medo tens que o tentador,' WHERE id = 'fonte'")
    conn.commit()
    junto = "\n".join(sql_para(_merge(), conn))
    assert "SET author" not in junto


def test_fusao_doa_author_de_verdade(tmp_path):
    conn = _mundo(tmp_path)
    conn.execute("UPDATE praises SET author = 'Silas Cezar' WHERE id = 'fonte'")
    conn.commit()
    junto = "\n".join(sql_para(_merge(), conn))
    assert "SET author = 'Silas Cezar'" in junto


def test_fusao_nao_doa_a_tag_avulsos_mas_doa_as_outras(tmp_path):
    conn = _mundo(tmp_path)
    conn.execute("INSERT INTO tags VALUES ('t-nt','Natal',NULL)")
    conn.execute("INSERT INTO praise_tags VALUES ('fonte','t-nt')")
    conn.commit()
    junto = "\n".join(sql_para(_merge(), conn))
    assert "INSERT OR IGNORE INTO praise_tags (praise_id, tag_id) VALUES ('keeper', 't-nt')" in junto
    assert "VALUES ('keeper', 't-av')" not in junto


def test_undo_nao_tira_do_keeper_uma_avulsos_que_ele_ja_tinha(tmp_path, monkeypatch):
    # A guarda nao doa Avulsos; o undo nao pode 'devolver' uma que nao foi doada.
    conn = _mundo(tmp_path)
    conn.execute("INSERT INTO praise_tags VALUES ('keeper','t-av')")
    conn.commit()
    monkeypatch.setattr("core.apply.run_sql_files", _executar_no_conn(conn))
    monkeypatch.setattr("core.apply.query", _query_no_conn(conn))
    log = str(tmp_path / "apply_log.jsonl")
    sql_dir = str(tmp_path / "sql")

    aplicar([_merge()], conn, execute=True, log_path=log, remote=False, sql_dir=sql_dir)
    desfazer("r1", log, execute=True, remote=False, sql_dir=sql_dir)

    tags_keeper = {r["tag_id"] for r in conn.execute(
        "SELECT tag_id FROM praise_tags WHERE praise_id='keeper'")}
    assert tags_keeper == {"t-av"}
    tags_fonte = {r["tag_id"] for r in conn.execute(
        "SELECT tag_id FROM praise_tags WHERE praise_id='fonte'")}
    assert tags_fonte == {"t-av"}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd scripts/validate-acervo && python3 -B -m pytest tests/test_apply.py -q -k "doa or avulsos"`
Expected: os dois primeiros e o terceiro falham (`SET author` presente; `'t-av'` presente). O quarto pode passar já — se passar, mantenha: é a guarda de regressão do undo.

- [ ] **Step 3: Implement**

No topo de `core/apply.py`, junto dos imports de `core.*`:

```python
from core.normalize import norm_letra
```

Logo depois de `DOAVEIS = (...)`:

```python
# Tags que nunca migram da fonte para o keeper numa fusão. 'Avulsos' marca
# o louvor que não está na Coletânea; um órfão só-YouTube nasce Avulsos por
# ser importado, não por ser avulso. Na Fase 1 a união de tags pôs Avulsos em
# dois louvores numerados da Coletânea e o dono teve que tirar à mão.
TAGS_NAO_DOADAS = ("Avulsos",)


def _author_e_letra(author, lyrics) -> bool:
    """Author que é a primeira linha da letra é artefato da importação do
    YouTube, não autor. Medido na Fase 1: 3 de 3 fontes só-YouTube."""
    a = norm_letra(author)
    l = norm_letra(lyrics)
    return bool(a) and bool(l) and l.startswith(a)
```

Em `_sql_merge`, o laço de doação vira:

```python
    for c in DOAVEIS:
        if _vazio(k[c]) and not _vazio(s[c]):
            if c == "author" and _author_e_letra(s["author"], s["lyrics"]):
                continue
            stmts.append(
                f"UPDATE praises SET {c} = {sql_str(s[c])}, updated_at = datetime('now') "
                f"WHERE id = {sql_str(keeper)} AND ({c} IS NULL OR trim({c}) = '');"
            )
```

e o laço de tags vira (o `tags_da_fonte` usado na recusa de tag-pai fica como está):

```python
    # Tags em união: o keeper mantém as dele e recebe as da fonte — menos as
    # que marcam a fonte como o que ela era (TAGS_NAO_DOADAS).
    nome_da_tag = {t["id"]: t["name"] for t in conn.execute("SELECT id, name FROM tags")}
    for t in tags_da_fonte:
        if nome_da_tag.get(t) in TAGS_NAO_DOADAS:
            continue
        stmts.append(
            "INSERT OR IGNORE INTO praise_tags (praise_id, tag_id) VALUES "
            f"({sql_str(keeper)}, {sql_str(t)});"
        )
```

Se o quarto teste falhar depois disso, leia `desfazer` (linhas ~745-800): o undo do keeper deve remover só as tags que **esta fusão** pôs lá — `antes["tags"]` menos `antes["keeper_tags"]` — e a guarda otimista (`AND tag_id IN (...)` da fonte) já protege o caso; se remover `t-av` do keeper, o filtro `TAGS_NAO_DOADAS` tem que ser aplicado também ali, na mesma forma.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd scripts/validate-acervo && python3 -B -m pytest tests -q`
Expected: tudo verde.

- [ ] **Step 5: Mutation check (obrigatório neste arquivo)**

Reverta só a linha `if c == "author" and ...: continue` (comente-a) e rode `python3 -B -m pytest tests/test_apply.py -q -k author`. Expected: `test_fusao_nao_doa_author_que_e_a_primeira_linha_da_letra` FALHA. Descomente. Repita com `if nome_da_tag.get(t) in TAGS_NAO_DOADAS: continue` e `-k avulsos`. Expected: `test_fusao_nao_doa_a_tag_avulsos_mas_doa_as_outras` FALHA. Restaure e rode a suíte inteira verde.

- [ ] **Step 6: Commit**

```bash
git add scripts/validate-acervo/core/apply.py scripts/validate-acervo/tests/test_apply.py
git commit -m "fix(apply): fusão não doa author que é letra nem a tag Avulsos"
```

---

### Task 3 [S → ops]: promover as 11 da Fase 1 e simular

Sem código novo. O subagent **para na simulação**; o `--execute` é do orquestrador.

**Files:**
- Create: `scripts/validate-acervo/gabaritos/youtube_merge/execucao/promovidos.jsonl` (cópia, fora do `out/`)

- [ ] **Step 1: Snapshot fresco e detector**

```bash
cd scripts/validate-acervo
python3 -B -m core.snapshot
python3 -B -m detectors.youtube_merge
```
Expected: `25 louvores só-YouTube` — **menos os 3 já fundidos**: agora são 22 órfãos; findings `media 29` menos os que tinham por fonte os 3 aplicados. Anote os números que saírem; se `alta` for diferente de 0, **pare e reporte** (os 3 alta já foram aplicados e não devem reaparecer, porque as fontes não existem mais).

- [ ] **Step 2: Medir e promover**

```bash
python3 -B -m core.gold --from out/youtube_merge/findings.jsonl \
  --gabarito gabaritos/youtube_merge/gabarito.preenchido.tsv \
  --promover out/youtube_merge/promovidos.jsonl; echo "EXIT=$?"
```
Expected: `promovidos pelo gabarito: 11`. O EXIT pode ser 3 (`PORTÃO NÃO AVALIADO`, porque não há mais finding alta para medir) — **isso não bloqueia**: a promoção é por veredito, não pelo portão da alta, e os promovidos passam a ser o lote alta.

- [ ] **Step 3: Simular**

```bash
python3 -B -m core.apply --from out/youtube_merge/promovidos.jsonl --faixa alta 2>&1 | tee out/youtube_merge/simulacao-promovidos.txt
grep -c "SET author" out/youtube_merge/simulacao-promovidos.txt
grep -c "45ab58b2-d293-45c7-aa75-090fcd968b24" out/youtube_merge/simulacao-promovidos.txt
```
Expected: `{'recebidos': 11, ..., 'simulado': 11, 'falhou': 0}`; **0** linhas `SET author`; **0** linhas com o id da tag Avulsos (`45ab58b2-…`). Se qualquer contagem for diferente de 0, a Task 2 não está fazendo efeito — pare e reporte.

- [ ] **Step 4: Preservar e commitar**

```bash
mkdir -p gabaritos/youtube_merge/execucao
cp out/youtube_merge/promovidos.jsonl out/youtube_merge/simulacao-promovidos.txt gabaritos/youtube_merge/execucao/
git add gabaritos/youtube_merge/execucao/promovidos.jsonl gabaritos/youtube_merge/execucao/simulacao-promovidos.txt
git commit -m "docs(validate-acervo): as 11 fusões promovidas pelo gabarito, simuladas"
```

Reporte ao orquestrador: os 11 pares (fonte → keeper), os números do Step 1, e as duas contagens zero. **[ops] O orquestrador roda** `python3 -B -m core.apply --from out/youtube_merge/promovidos.jsonl --faixa alta --execute`, confere em produção (fontes apagadas, keepers +1 material, total de louvores 1693 − 11 = 1682, materiais 20862) e copia `out/apply_log.jsonl` e `out/sql/<run_id>/` para `gabaritos/youtube_merge/execucao/`.

---

## Raia A — api

### Task 4 [A]: migração `017_validation_findings.sql`, `schema.sql`, e o teste que mantém os dois iguais

**Files:**
- Create: `api/migrations/017_validation_findings.sql`
- Modify: `api/schema.sql` (ao final, depois da última instrução)
- Test: `api/src/__tests__/schemaSync.test.ts`

**Interfaces:**
- Produces: a tabela `validation_findings` (spec §6, DDL verbatim) e os índices `idx_vf_status_conf`, `idx_vf_detector`, `idx_vf_praise`. Colunas que as Tasks 5-7 usam pelo nome: `id, run_id, detector, target_type, target_id, praise_id, action, field, current_value, proposed_value, confidence, evidence, status, decided_at, decided_by, decision_note, created_at`.

- [ ] **Step 1: Write the failing test**

`api/src/__tests__/schemaSync.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * schema.sql é o bootstrap de um D1 novo e migrations/ é a história; nada os
 * compara. A 015 e a 016 foram sincronizadas à mão. Este teste faz a 017 (e as
 * próximas que forem listadas aqui) não depender de memória.
 */
const RAIZ = resolve(__dirname, '..', '..');
const normal = (s: string) => s.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();

describe('schema.sql acompanha as migrações', () => {
  it('017: a tabela validation_findings e os três índices estão nos dois', () => {
    const schema = normal(readFileSync(resolve(RAIZ, 'schema.sql'), 'utf8'));
    const mig = normal(readFileSync(resolve(RAIZ, 'migrations', '017_validation_findings.sql'), 'utf8'));
    for (const trecho of [
      'CREATE TABLE IF NOT EXISTS validation_findings (',
      'CREATE INDEX IF NOT EXISTS idx_vf_status_conf ON validation_findings(status, confidence)',
      'CREATE INDEX IF NOT EXISTS idx_vf_detector ON validation_findings(detector)',
      'CREATE INDEX IF NOT EXISTS idx_vf_praise ON validation_findings(praise_id)',
    ]) {
      expect(mig, `migração sem: ${trecho}`).toContain(trecho);
      expect(schema, `schema.sql sem: ${trecho}`).toContain(trecho);
    }
    const colunas = ['id TEXT PRIMARY KEY', 'run_id TEXT NOT NULL', 'detector TEXT NOT NULL',
      'target_type TEXT NOT NULL', 'target_id TEXT NOT NULL', 'praise_id TEXT', 'action TEXT NOT NULL',
      'field TEXT', 'current_value TEXT', 'proposed_value TEXT', 'confidence TEXT NOT NULL',
      'evidence TEXT NOT NULL', "status TEXT NOT NULL DEFAULT 'pendente'", 'decided_at TEXT',
      'decided_by TEXT', 'decision_note TEXT', "created_at TEXT DEFAULT (datetime('now'))"];
    for (const c of colunas) {
      expect(mig).toContain(c);
      expect(schema).toContain(c);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npx vitest run src/__tests__/schemaSync.test.ts`
Expected: FAIL — `ENOENT ... 017_validation_findings.sql`.

- [ ] **Step 3: Write the migration and sync schema.sql**

`api/migrations/017_validation_findings.sql`:

```sql
-- Fila de revisão da validação do acervo (spec docs/superpowers/specs/2026-09-02-validacao-do-acervo-design.md §6).
--
-- O detector (scripts/validate-acervo) só escreve sozinho na faixa alta. As
-- faixas média e baixa não tinham onde pousar: na Fase 1 ficaram num JSONL
-- que o dono só conseguia julgar por um formulário fora do app. Esta tabela
-- é o lugar delas. A tela do web lê daqui e grava a decisão; o script
-- scripts/validate-acervo/core/queue.py puxa os 'aprovado' de volta e o
-- apply.py de sempre escreve — a API nunca toca praises/praise_materials.
--
-- id é o finding_id determinístico do detector (sha1 de detector|target|field),
-- por isso é chave e por isso o push é INSERT OR IGNORE: rodar o detector de
-- novo não duplica nem sobrescreve uma decisão já tomada.
--
-- decision_note não é decorativa: a rejeição é o dado de treino do detector.
--
-- Aplicar: cd api && npx wrangler d1 execute coldigom --remote --file=migrations/017_validation_findings.sql

CREATE TABLE IF NOT EXISTS validation_findings (
  id             TEXT PRIMARY KEY,        -- finding_id determinístico
  run_id         TEXT NOT NULL,
  detector       TEXT NOT NULL,
  target_type    TEXT NOT NULL,           -- material | praise
  target_id      TEXT NOT NULL,
  praise_id      TEXT,                    -- para agrupar na tela
  action         TEXT NOT NULL,
  field          TEXT,
  current_value  TEXT,
  proposed_value TEXT,
  confidence     TEXT NOT NULL,           -- alta | media | baixa | discussao
  evidence       TEXT NOT NULL,           -- JSON
  status         TEXT NOT NULL DEFAULT 'pendente',  -- pendente|discussao|aprovado|rejeitado|aplicado
  decided_at     TEXT,
  decided_by     TEXT,
  decision_note  TEXT,
  created_at     TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_vf_status_conf ON validation_findings(status, confidence);
CREATE INDEX IF NOT EXISTS idx_vf_detector ON validation_findings(detector);
CREATE INDEX IF NOT EXISTS idx_vf_praise ON validation_findings(praise_id);
```

Em `api/schema.sql`, ao final, acrescente exatamente o mesmo bloco `CREATE TABLE IF NOT EXISTS validation_findings (...)` e os três `CREATE INDEX IF NOT EXISTS`, precedidos do comentário de uma linha `-- Fila de revisão da validação (migração 017). Ver migrations/017_validation_findings.sql.`

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api && npx vitest run src/__tests__/schemaSync.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/migrations/017_validation_findings.sql api/schema.sql api/src/__tests__/schemaSync.test.ts
git commit -m "feat(api): migração 017, a tabela da fila de revisão"
```

---

### Task 5 [A]: `GET /api/validation/findings`

**Files:**
- Create: `api/src/routes/validation.ts`
- Modify: `api/src/index.ts` (import na lista das linhas 11-17; chamada depois de `registerTagsRoutes(app)` na linha 66)
- Modify: `api/src/__tests__/routes.inventory.test.ts` (inserir depois do segundo `'POST /api/tags'`, linha 63)
- Test: `api/src/__tests__/validationFindings.test.ts`

**Interfaces:**
- Consumes: `requireAuth` (`../middleware`), `App` (`../env`), `parseListNumbers` (`../queryParams`), `AuthUser` (`../auth`).
- Produces (contrato que a Task 8 do web consome):
  - `GET /api/validation/findings?detector=&confidence=&status=&praise_id=&page=&limit=` → `200 { data: FindingRow[], pagination: { page, limit, total, totalPages } }`. Filtros por igualdade; `confidence` fora de `alta|media|baixa|discussao` e `status` fora de `pendente|discussao|aprovado|rejeitado|aplicado` → `400 { error }`. `limit` respeita `MAX_PAGE_SIZE = 100` via `parseListNumbers`. Ordem: `praise_id, id` (os candidatos concorrentes do mesmo louvor saem juntos).
  - `FindingRow` = todas as colunas da tabela, com `evidence` já **desserializada** (objeto; se o JSON estiver quebrado, a string crua), mais `target_name` (nome do louvor quando `target_type='praise'`) e `proposed_name` (nome do louvor apontado por `proposed_value` quando `action` é `merge_praise` ou `set_group_id`); os dois `null` quando não se aplicam.
  - Exige sessão (`requireAuth`): a fila é gestão, não leitura pública.
- Exporta também, para a Task 6 no mesmo arquivo: `const FAIXAS`, `const STATUS`, `type FindingRow`, `function lerFinding(db, id): Promise<FindingRow | null>`.

- [ ] **Step 1: Write the failing test**

`api/src/__tests__/validationFindings.test.ts` — o cabeçalho (JWT, env, D1 espião) é compartilhado com a Task 6, escreva-o inteiro agora:

```ts
import { describe, expect, it, vi } from 'vitest';

import { app } from '../index';

const TEST_JWT_SECRET = '0123456789abcdef0123456789abcdef';
const TEST_WEB_ORIGIN = 'https://web.example';

async function sessaoValida() {
  const { SignJWT } = await import('jose');
  return new SignJWT({ email: 'admin@test.com', jti: 'j-fila' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('sub-admin')
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(new TextEncoder().encode(TEST_JWT_SECRET));
}

const envAuth = {
  AUTH_JWT_SECRET: TEST_JWT_SECRET,
  AUTH_ALLOWED_EMAILS: '*',
  WEB_ORIGIN: TEST_WEB_ORIGIN,
};

type Linha = Record<string, unknown>;

/** D1 falso que guarda cada SQL com os bindings e responde por trecho do SQL. */
function dbFila(opts: { linhas?: Linha[]; total?: number; changes?: number; depois?: Linha | null } = {}) {
  const chamadas: { sql: string; bindings: unknown[] }[] = [];
  const stmt = (sql: string, bindings: unknown[]) => ({
    all: vi.fn(async () => ({ results: opts.linhas ?? [] })),
    first: vi.fn(async () => {
      if (sql.includes('COUNT(*)')) return { total: opts.total ?? (opts.linhas?.length ?? 0) };
      return opts.depois === undefined ? (opts.linhas?.[0] ?? null) : opts.depois;
    }),
    run: vi.fn(async () => ({ meta: { changes: opts.changes ?? 1 } })),
  });
  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...bindings: unknown[]) => {
        chamadas.push({ sql, bindings });
        return stmt(sql, bindings);
      }),
      ...stmt(sql, []),
    })),
    batch: vi.fn(async (stmts: unknown[]) => stmts.map(() => ({ meta: { changes: opts.changes ?? 1 } }))),
  };
  return { db, chamadas };
}

async function pedir(url: string, init: RequestInit, db: unknown, comSessao = true) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    origin: TEST_WEB_ORIGIN,
  };
  if (comSessao) headers.cookie = `coldigom_access=${encodeURIComponent(await sessaoValida())}`;
  return app.request(url, { ...init, headers }, { ...envAuth, DB: db, ASSETS: {} } as never);
}

const FINDING = {
  id: 'f1', run_id: 'r1', detector: 'youtube_merge', target_type: 'praise', target_id: 'p-fonte',
  praise_id: 'p-fonte', action: 'merge_praise', field: 'keeper:p-keeper', current_value: null,
  proposed_value: 'p-keeper', confidence: 'media', evidence: '{"letra":true,"nome":false}',
  status: 'pendente', decided_at: null, decided_by: null, decision_note: null,
  created_at: '2026-09-03 20:00:00', target_name: 'Medo tens', proposed_name: 'Medo tens que o tentador',
};

describe('GET /api/validation/findings', () => {
  it('exige sessão', async () => {
    const { db } = dbFila();
    const res = await pedir('/api/validation/findings', {}, db, false);
    expect(res.status).toBe(401);
  });

  it('lista com paginação e devolve a evidência como objeto', async () => {
    const { db, chamadas } = dbFila({ linhas: [FINDING], total: 1 });
    const res = await pedir('/api/validation/findings?status=pendente&detector=youtube_merge&page=1&limit=50', {}, db);
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as { data: Linha[]; pagination: Linha };
    expect(corpo.pagination).toEqual({ page: 1, limit: 50, total: 1, totalPages: 1 });
    expect(corpo.data[0].evidence).toEqual({ letra: true, nome: false });
    expect(corpo.data[0].target_name).toBe('Medo tens');
    const lista = chamadas.find((c) => c.sql.includes('ORDER BY'))!;
    expect(lista.sql).toContain('vf.status = ?');
    expect(lista.sql).toContain('vf.detector = ?');
    expect(lista.sql).toContain('ORDER BY vf.praise_id, vf.id');
    expect(lista.bindings).toEqual(['youtube_merge', 'pendente', 50, 0]);
  });

  it('recusa faixa e status desconhecidos', async () => {
    const { db } = dbFila();
    expect((await pedir('/api/validation/findings?confidence=altissima', {}, db)).status).toBe(400);
    expect((await pedir('/api/validation/findings?status=feito', {}, db)).status).toBe(400);
  });

  it('evidência com JSON quebrado volta como a string crua, não como 500', async () => {
    const { db } = dbFila({ linhas: [{ ...FINDING, evidence: '{nao é json' }], total: 1 });
    const res = await pedir('/api/validation/findings', {}, db);
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as { data: Linha[] };
    expect(corpo.data[0].evidence).toBe('{nao é json');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npx vitest run src/__tests__/validationFindings.test.ts`
Expected: FAIL — 404 em vez de 401/200 (rota não existe).

- [ ] **Step 3: Implement**

`api/src/routes/validation.ts`:

```ts
import type { AuthUser } from '../auth';
import type { App } from '../env';
import { requireAuth } from '../middleware';
import { parseListNumbers } from '../queryParams';

/**
 * Fila de revisão da validação do acervo (spec §6).
 *
 * Esta rota grava SÓ em validation_findings. Quem escreve no acervo é o
 * scripts/validate-acervo/core/apply.py, depois de queue.py puxar os
 * 'aprovado' daqui — por isso 'aplicado' é recusado na API: é o script que
 * marca, quando a escrita de fato aconteceu.
 */
export const FAIXAS = ['alta', 'media', 'baixa', 'discussao'] as const;
export const STATUS = ['pendente', 'discussao', 'aprovado', 'rejeitado', 'aplicado'] as const;
export type Faixa = (typeof FAIXAS)[number];
export type Status = (typeof STATUS)[number];

export type FindingRow = {
  id: string;
  run_id: string;
  detector: string;
  target_type: string;
  target_id: string;
  praise_id: string | null;
  action: string;
  field: string | null;
  current_value: string | null;
  proposed_value: string | null;
  confidence: Faixa;
  evidence: unknown;
  status: Status;
  decided_at: string | null;
  decided_by: string | null;
  decision_note: string | null;
  created_at: string;
  target_name: string | null;
  proposed_name: string | null;
};

const SELECT = `SELECT vf.*, pt.name AS target_name, pp.name AS proposed_name
  FROM validation_findings vf
  LEFT JOIN praises pt ON vf.target_type = 'praise' AND pt.id = vf.target_id
  LEFT JOIN praises pp ON vf.action IN ('merge_praise', 'set_group_id') AND pp.id = vf.proposed_value`;

/** A evidência é JSON por detector; se estiver quebrada, a string crua vale mais que um 500. */
function desserializar(linha: Record<string, unknown>): FindingRow {
  let evidence: unknown = linha.evidence;
  if (typeof evidence === 'string') {
    try { evidence = JSON.parse(evidence); } catch { /* fica a string */ }
  }
  return { ...(linha as Omit<FindingRow, 'evidence'>), evidence };
}

export async function lerFinding(db: D1Database, id: string): Promise<FindingRow | null> {
  const linha = await db.prepare(`${SELECT} WHERE vf.id = ?`).bind(id).first<Record<string, unknown>>();
  return linha ? desserializar(linha) : null;
}

export function registerValidationRoutes(app: App): void {
  // GET /api/validation/findings — a fila, filtrável, paginada (admin)
  app.get('/api/validation/findings', requireAuth, async (c) => {
    const numeros = parseListNumbers({ page: c.req.query('page'), limit: c.req.query('limit') });
    if (!numeros.ok) return c.json({ error: numeros.error }, 400);
    const { page, limit, offset } = numeros;

    const where: string[] = [];
    const bindings: (string | number)[] = [];
    const igual = (coluna: string, valor: string | undefined) => {
      if (valor) { where.push(`vf.${coluna} = ?`); bindings.push(valor); }
    };
    const confidence = c.req.query('confidence');
    if (confidence && !(FAIXAS as readonly string[]).includes(confidence)) {
      return c.json({ error: `Parâmetro 'confidence' deve ser um de: ${FAIXAS.join(', ')}` }, 400);
    }
    const status = c.req.query('status');
    if (status && !(STATUS as readonly string[]).includes(status)) {
      return c.json({ error: `Parâmetro 'status' deve ser um de: ${STATUS.join(', ')}` }, 400);
    }
    igual('detector', c.req.query('detector'));
    igual('confidence', confidence);
    igual('status', status);
    igual('praise_id', c.req.query('praise_id'));
    const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';

    try {
      const lista = await c.env.DB.prepare(`${SELECT}${clause} ORDER BY vf.praise_id, vf.id LIMIT ? OFFSET ?`)
        .bind(...bindings, limit, offset)
        .all<Record<string, unknown>>();
      const contagem = await c.env.DB.prepare(`SELECT COUNT(*) AS total FROM validation_findings vf${clause}`)
        .bind(...bindings)
        .first<{ total: number }>();
      const total = contagem?.total ?? 0;
      return c.json({
        data: (lista.results ?? []).map(desserializar),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (error) {
      console.error('Error listing validation findings:', error);
      return c.json({ error: 'Failed to list validation findings' }, 500);
    }
  });
}

/** Quem decidiu: o mesmo critério de reviewed_by em materials.ts. */
export function ator(c: { get: (k: 'user') => AuthUser | undefined }): string | null {
  const u = c.get('user');
  return u?.email ?? u?.name ?? u?.sub ?? null;
}
```

`api/src/index.ts`: acrescente `import { registerValidationRoutes } from './routes/validation';` na lista de imports (ordem alfabética: depois de `tags`), e `registerValidationRoutes(app);` logo depois de `registerTagsRoutes(app);`.

`api/src/__tests__/routes.inventory.test.ts`: depois da segunda linha `'POST /api/tags',` insira:

```ts
  'GET /api/validation/findings',
  'GET /api/validation/findings',
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && npx vitest run src/__tests__/validationFindings.test.ts src/__tests__/routes.inventory.test.ts`
Expected: PASS. Depois `npx tsc --noEmit` na pasta `api` limpo.

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/validation.ts api/src/index.ts api/src/__tests__/validationFindings.test.ts api/src/__tests__/routes.inventory.test.ts
git commit -m "feat(api): GET /api/validation/findings, a fila de revisão"
```

---

### Task 6 [A]: `PATCH /api/validation/findings/:id` e `POST /api/validation/findings/bulk`

**Files:**
- Modify: `api/src/routes/validation.ts` (dentro de `registerValidationRoutes`, depois do GET — **bulk antes do `:id`**)
- Modify: `api/src/__tests__/routes.inventory.test.ts` (depois das duas linhas do GET)
- Test: `api/src/__tests__/validationFindings.test.ts`

**Interfaces:**
- `PATCH /api/validation/findings/:id` body `{ status: 'pendente'|'discussao'|'aprovado'|'rejeitado', decision_note?: string }` → `200 { data: FindingRow }` (a linha relida, com nomes). `status: 'aplicado'` → `400 { error: "O status 'aplicado' é gravado pelo apply, não pela tela" }`. Linha inexistente → `404`. Linha já `aplicado` → `409 { error: 'Este achado já foi aplicado no acervo; não há mais o que decidir' }`. Grava `decided_at = datetime('now')` e `decided_by = ator`. `decision_note` ausente → `NULL` (a nota anterior é substituída, não acumulada — a decisão é a última).
- `POST /api/validation/findings/bulk` body `{ ids: string[] (1..100), status: 'aprovado'|'rejeitado'|'discussao'|'pendente', decision_note?: string }` → `200 { data: { atualizados: number } }` (linhas efetivamente mudadas; as `aplicado` são puladas em silêncio pelo `WHERE`). Roda em `DB.batch` — ou tudo ou nada.

- [ ] **Step 1: Write the failing tests**

Acrescente ao `validationFindings.test.ts`:

```ts
describe('PATCH /api/validation/findings/:id', () => {
  it('grava status, nota, quem e quando, e devolve a linha relida', async () => {
    const depois = { ...FINDING, status: 'rejeitado', decision_note: 'não é o mesmo louvor', decided_by: 'admin@test.com', decided_at: '2026-09-03 21:00:00' };
    const { db, chamadas } = dbFila({ linhas: [FINDING], changes: 1, depois });
    const res = await pedir('/api/validation/findings/f1', {
      method: 'PATCH', body: JSON.stringify({ status: 'rejeitado', decision_note: 'não é o mesmo louvor' }),
    }, db);
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as { data: Linha };
    expect(corpo.data.status).toBe('rejeitado');
    expect(corpo.data.decision_note).toBe('não é o mesmo louvor');
    const update = chamadas.find((c) => c.sql.startsWith('UPDATE validation_findings'))!;
    expect(update.sql).toContain("decided_at = datetime('now')");
    expect(update.sql).toContain("status <> 'aplicado'");
    expect(update.bindings).toEqual(['rejeitado', 'não é o mesmo louvor', 'admin@test.com', 'f1']);
  });

  it("recusa 'aplicado': é o script que marca, quando a escrita aconteceu", async () => {
    const { db, chamadas } = dbFila({ linhas: [FINDING] });
    const res = await pedir('/api/validation/findings/f1', { method: 'PATCH', body: JSON.stringify({ status: 'aplicado' }) }, db);
    expect(res.status).toBe(400);
    expect(chamadas.some((c) => c.sql.startsWith('UPDATE'))).toBe(false);
  });

  it('status desconhecido e nota que não é string dão 400', async () => {
    const { db } = dbFila({ linhas: [FINDING] });
    expect((await pedir('/api/validation/findings/f1', { method: 'PATCH', body: JSON.stringify({ status: 'feito' }) }, db)).status).toBe(400);
    expect((await pedir('/api/validation/findings/f1', { method: 'PATCH', body: JSON.stringify({ status: 'aprovado', decision_note: 7 }) }, db)).status).toBe(400);
  });

  it('linha inexistente é 404; linha já aplicada é 409', async () => {
    const sumiu = dbFila({ linhas: [], changes: 0, depois: null });
    expect((await pedir('/api/validation/findings/nada', { method: 'PATCH', body: JSON.stringify({ status: 'aprovado' }) }, sumiu.db)).status).toBe(404);
    const aplicada = dbFila({ linhas: [{ ...FINDING, status: 'aplicado' }], changes: 0, depois: { ...FINDING, status: 'aplicado' } });
    expect((await pedir('/api/validation/findings/f1', { method: 'PATCH', body: JSON.stringify({ status: 'aprovado' }) }, aplicada.db)).status).toBe(409);
  });
});

describe('POST /api/validation/findings/bulk', () => {
  it('decide em lote num batch só e conta o que mudou', async () => {
    const { db, chamadas } = dbFila({ changes: 1 });
    const res = await pedir('/api/validation/findings/bulk', {
      method: 'POST', body: JSON.stringify({ ids: ['f1', 'f2', 'f3'], status: 'rejeitado', decision_note: 'lote' }),
    }, db);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { atualizados: 3 } });
    expect(db.batch).toHaveBeenCalledTimes(1);
    expect(chamadas.filter((c) => c.sql.startsWith('UPDATE validation_findings'))).toHaveLength(3);
    expect(chamadas[0].bindings).toEqual(['rejeitado', 'lote', 'admin@test.com', 'f1']);
  });

  it('valida ids (1..100, strings) e recusa aplicado', async () => {
    const { db } = dbFila();
    const post = (body: unknown) => pedir('/api/validation/findings/bulk', { method: 'POST', body: JSON.stringify(body) }, db);
    expect((await post({ ids: [], status: 'aprovado' })).status).toBe(400);
    expect((await post({ ids: [1], status: 'aprovado' })).status).toBe(400);
    expect((await post({ ids: Array.from({ length: 101 }, (_, i) => `f${i}`), status: 'aprovado' })).status).toBe(400);
    expect((await post({ ids: ['f1'], status: 'aplicado' })).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && npx vitest run src/__tests__/validationFindings.test.ts`
Expected: os novos FAIL com 404.

- [ ] **Step 3: Implement**

Dentro de `registerValidationRoutes`, depois do GET. Primeiro um helper de validação acima da função (nível do módulo):

```ts
const DECIDIVEIS = ['pendente', 'discussao', 'aprovado', 'rejeitado'] as const;
type Decisao = { status: (typeof DECIDIVEIS)[number]; decision_note: string | null };

/** Lê e valida { status, decision_note } de um corpo JSON; devolve a mensagem de erro ou a decisão. */
function lerDecisao(body: Record<string, unknown>): { ok: true; decisao: Decisao } | { ok: false; error: string } {
  const status = body.status;
  if (status === 'aplicado') {
    return { ok: false, error: "O status 'aplicado' é gravado pelo apply, não pela tela" };
  }
  if (typeof status !== 'string' || !(DECIDIVEIS as readonly string[]).includes(status)) {
    return { ok: false, error: `Field 'status' must be one of: ${DECIDIVEIS.join(', ')}` };
  }
  let decision_note: string | null = null;
  if ('decision_note' in body && body.decision_note != null) {
    if (typeof body.decision_note !== 'string') return { ok: false, error: "Field 'decision_note' must be a string" };
    decision_note = body.decision_note.trim() || null;
  }
  return { ok: true, decisao: { status: status as Decisao['status'], decision_note } };
}

const UPDATE = `UPDATE validation_findings
  SET status = ?, decision_note = ?, decided_by = ?, decided_at = datetime('now')
  WHERE id = ? AND status <> 'aplicado'`;
```

Depois, as rotas (bulk **antes** de `:id`):

```ts
  // POST /api/validation/findings/bulk — a mesma decisão para vários achados (admin)
  app.post('/api/validation/findings/bulk', requireAuth, async (c) => {
    const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') return c.json({ error: 'Invalid JSON body' }, 400);
    const ids = body.ids;
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 100 || !ids.every((i) => typeof i === 'string' && i)) {
      return c.json({ error: "Field 'ids' must be a list of 1 to 100 ids" }, 400);
    }
    const lida = lerDecisao(body);
    if (!lida.ok) return c.json({ error: lida.error }, 400);
    const quem = ator(c);
    try {
      // Um batch: ou o lote inteiro decide, ou nada — meio lote decidido é o
      // pior estado para quem está olhando 7 candidatos do mesmo louvor.
      const resultados = await c.env.DB.batch(
        (ids as string[]).map((id) => c.env.DB.prepare(UPDATE).bind(lida.decisao.status, lida.decisao.decision_note, quem, id))
      );
      const atualizados = resultados.reduce((n, r) => n + (r.meta?.changes ?? 0), 0);
      return c.json({ data: { atualizados } });
    } catch (error) {
      console.error('Error bulk-deciding validation findings:', error);
      return c.json({ error: 'Failed to decide validation findings' }, 500);
    }
  });

  // PATCH /api/validation/findings/:id — decidir um achado (admin)
  app.patch('/api/validation/findings/:id', requireAuth, async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') return c.json({ error: 'Invalid JSON body' }, 400);
    const lida = lerDecisao(body);
    if (!lida.ok) return c.json({ error: lida.error }, 400);
    try {
      const escrita = await c.env.DB.prepare(UPDATE)
        .bind(lida.decisao.status, lida.decisao.decision_note, ator(c), id)
        .run();
      const linha = await lerFinding(c.env.DB, id);
      if (!linha) return c.json({ error: 'Finding not found' }, 404);
      if ((escrita.meta?.changes ?? 0) === 0) {
        // Existe mas o UPDATE não pegou: só o WHERE status <> 'aplicado' explica.
        return c.json({ error: 'Este achado já foi aplicado no acervo; não há mais o que decidir' }, 409);
      }
      return c.json({ data: linha });
    } catch (error) {
      console.error('Error deciding validation finding:', error);
      return c.json({ error: 'Failed to decide validation finding' }, 500);
    }
  });
```

Inventário, depois das duas linhas do GET:

```ts
  'POST /api/validation/findings/bulk',
  'POST /api/validation/findings/bulk',
  'PATCH /api/validation/findings/:id',
  'PATCH /api/validation/findings/:id',
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && npx vitest run src/__tests__/validationFindings.test.ts src/__tests__/routes.inventory.test.ts && npx tsc --noEmit`
Expected: PASS; typecheck limpo. Depois `npm run test:api` na raiz, tudo verde.

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/validation.ts api/src/__tests__/validationFindings.test.ts api/src/__tests__/routes.inventory.test.ts
git commit -m "feat(api): decidir achados da fila, um por vez ou em lote"
```

---

### Task 7 [S]: `core/queue.py` — empurrar para a fila, puxar os aprovados, marcar os aplicados

**Files:**
- Create: `scripts/validate-acervo/core/queue.py`
- Test: `scripts/validate-acervo/tests/test_queue.py`
- Modify: `scripts/validate-acervo/README.md` (seção "Rodar": o ciclo da fila; tabela de arquivos: a linha do `queue.py`)

**Interfaces:**
- Consumes: `core.findings.Finding`, `read_findings`, `write_findings`, `promovido`; `core.gold.ler_gabarito`, `NENHUM`; `core.d1.sql_str`, `write_sql_chunks`, `run_sql_files`, `query`; `core.paths.OUT`.
- Produces:
  - `linha_de(f: Finding, decisao: tuple[str, str, str] | None) -> dict` — a linha da tabela; `decisao = (status, decision_note, decided_by)` ou `None` (→ `pendente`, sem nota). `evidence` é `json.dumps(..., ensure_ascii=False)`; `current`→`current_value`, `proposed`→`proposed_value`.
  - `decisoes_do_gabarito(findings, gabarito: dict[str,str], origem: str) -> dict[str, tuple[str,str,str]]` — por `finding_id`: `proposed == veredito` → `("aprovado", f"gabarito {origem}: dono confirmou", "gabarito")`; veredito `NENHUM` → `("rejeitado", f"gabarito {origem}: dono respondeu NENHUM", "gabarito")`; veredito outro → `("rejeitado", f"gabarito {origem}: dono apontou {veredito}", "gabarito")`; sem veredito → ausente do dict.
  - `aplicados_do_log(log_path: str) -> set[str]` — `finding_id` das entradas com `ok` verdadeiro **e** `escreveu` verdadeiro (a mesma regra do `--undo`: a última entrada que escreveu).
  - `sql_insert(linhas: list[dict]) -> list[str]` — um `INSERT OR IGNORE INTO validation_findings (...) VALUES (...)` por linha, com `sql_str` em tudo (`None` → `NULL`).
  - `empurrar(findings, decisoes, aplicados, run=run_sql_files, out_dir=OUT/"sql"/"fila", remote=True) -> dict` — pula faixa alta (a alta passa pelo portão, não pela fila); quem está em `aplicados` entra como `("aplicado", "aplicado pelo apply", "apply")` mesmo que tenha decisão de gabarito; grava `.sql` em chunks e chama `run`. Devolve `{"empurrados": n, "por_status": {...}}`.
  - `puxar_aprovados(q=query, remote=True) -> list[Finding]` — `SELECT * FROM validation_findings WHERE status = 'aprovado'`, reconstrói `Finding` (evidence de volta a dict; `current_value`→`current`, `proposed_value`→`proposed`) e passa por `promovido(f, {"por": "fila", "decided_by": ..., "decided_at": ..., "decision_note": ...})`. **Guarda de conflito:** dois aprovados com o mesmo `(target_id, action)` e `proposed` diferentes são os dois pulados, com aviso em stderr — o dono aprovou dois keepers para a mesma fonte, e o apply não pode escolher.
  - `marcar_aplicados(log_path, run=run_sql_files, out_dir=..., remote=True) -> int` — para cada id de `aplicados_do_log`: `UPDATE validation_findings SET status = 'aplicado', decided_at = datetime('now') WHERE id = ... AND status = 'aprovado';`. Devolve quantos UPDATEs foram emitidos.
  - CLI: `python3 -B -m core.queue --empurrar F.jsonl [--gabarito G.tsv] [--apply-log out/apply_log.jsonl] [--local]` · `--puxar-aprovados SAIDA.jsonl` · `--marcar-aplicados out/apply_log.jsonl`. `--local` usa o D1 local (`remote=False`) — é o que os testes de ponta a ponta manuais usam.

- [ ] **Step 1: Write the failing tests**

`tests/test_queue.py`:

```python
from __future__ import annotations

import json

from core.findings import Finding, write_findings
from core.queue import (aplicados_do_log, decisoes_do_gabarito, empurrar, linha_de,
                        marcar_aplicados, puxar_aprovados, sql_insert)


def _f(tid, faixa, proposto, detector="youtube_merge"):
    return Finding(run_id="r1", detector=detector, target_type="praise", target_id=tid,
                   praise_id=tid, action="merge_praise", confidence=faixa, proposed=proposto,
                   field=f"keeper:{proposto}", evidence={"letra": True, "nome_fonte": "Medo tens"})


def test_linha_de_traduz_o_finding_para_as_colunas_da_tabela():
    l = linha_de(_f("t1", "media", "k1"), None)
    assert l["id"] == _f("t1", "media", "k1").finding_id
    assert l["proposed_value"] == "k1" and l["current_value"] is None
    assert json.loads(l["evidence"]) == {"letra": True, "nome_fonte": "Medo tens"}
    assert (l["status"], l["decision_note"], l["decided_by"]) == ("pendente", None, None)
    d = linha_de(_f("t1", "media", "k1"), ("rejeitado", "nao e o mesmo", "gabarito"))
    assert (d["status"], d["decision_note"], d["decided_by"]) == ("rejeitado", "nao e o mesmo", "gabarito")


def test_decisoes_do_gabarito_confirmado_nenhum_outro_e_sem_veredito():
    fs = [_f("t1", "media", "k1"), _f("t2", "media", "k2"), _f("t3", "media", "k3"), _f("t4", "media", "k4")]
    gab = {"t1": "k1", "t2": "NENHUM", "t3": "k9"}
    d = decisoes_do_gabarito(fs, gab, origem="g.tsv")
    assert d[fs[0].finding_id] == ("aprovado", "gabarito g.tsv: dono confirmou", "gabarito")
    assert d[fs[1].finding_id] == ("rejeitado", "gabarito g.tsv: dono respondeu NENHUM", "gabarito")
    assert d[fs[2].finding_id] == ("rejeitado", "gabarito g.tsv: dono apontou k9", "gabarito")
    assert fs[3].finding_id not in d


def test_aplicados_do_log_segue_a_regra_do_undo(tmp_path):
    log = tmp_path / "apply_log.jsonl"
    log.write_text("\n".join(json.dumps(e) for e in [
        {"finding_id": "a", "ok": None, "escreveu": False},
        {"finding_id": "a", "ok": True, "escreveu": True},
        {"finding_id": "b", "ok": False, "escreveu": True},
        {"finding_id": "c", "ok": True, "escreveu": False},
    ]) + "\n", encoding="utf-8")
    assert aplicados_do_log(str(log)) == {"a"}


def test_sql_insert_e_insert_or_ignore_com_null_de_verdade():
    sql = sql_insert([linha_de(_f("t1", "media", "k1"), None)])
    assert len(sql) == 1
    assert sql[0].startswith("INSERT OR IGNORE INTO validation_findings (")
    assert "NULL" in sql[0]              # current_value
    assert "'pendente'" in sql[0]
    assert "\"letra\": true" in sql[0] or '"letra":true' in sql[0]


def test_empurrar_pula_a_alta_e_aplicado_vence_o_gabarito(tmp_path):
    fs = [_f("t0", "alta", "k0"), _f("t1", "media", "k1"), _f("t2", "media", "k2")]
    decisoes = {fs[1].finding_id: ("aprovado", "gabarito g: dono confirmou", "gabarito")}
    rodados = []
    r = empurrar(fs, decisoes, aplicados={fs[1].finding_id},
                 run=lambda arquivos, remote=True: rodados.extend(arquivos),
                 out_dir=str(tmp_path / "sql"), remote=False)
    assert r == {"empurrados": 2, "por_status": {"aplicado": 1, "pendente": 1}}
    texto = "\n".join(open(a, encoding="utf-8").read() for a in rodados)
    assert "'aplicado'" in texto and "'pendente'" in texto
    assert fs[0].finding_id not in texto


def test_puxar_aprovados_promove_e_pula_o_conflito(capsys):
    linhas = [
        {"id": "x1", "run_id": "r1", "detector": "youtube_merge", "target_type": "praise", "target_id": "t1",
         "praise_id": "t1", "action": "merge_praise", "field": "keeper:k1", "current_value": None,
         "proposed_value": "k1", "confidence": "media", "evidence": '{"letra": true}', "status": "aprovado",
         "decided_at": "2026-09-04 10:00:00", "decided_by": "jairo@x", "decision_note": None, "created_at": "..."},
        # conflito: duas aprovacoes para a mesma fonte, keepers diferentes
        {"id": "x2", "run_id": "r1", "detector": "youtube_merge", "target_type": "praise", "target_id": "t2",
         "praise_id": "t2", "action": "merge_praise", "field": "keeper:k2", "current_value": None,
         "proposed_value": "k2", "confidence": "media", "evidence": "{}", "status": "aprovado",
         "decided_at": "d", "decided_by": "u", "decision_note": None, "created_at": "..."},
        {"id": "x3", "run_id": "r1", "detector": "youtube_merge", "target_type": "praise", "target_id": "t2",
         "praise_id": "t2", "action": "merge_praise", "field": "keeper:k3", "current_value": None,
         "proposed_value": "k3", "confidence": "media", "evidence": "{}", "status": "aprovado",
         "decided_at": "d", "decided_by": "u", "decision_note": None, "created_at": "..."},
    ]
    out = puxar_aprovados(q=lambda sql, remote=True: linhas, remote=False)
    assert [f.finding_id for f in out] == ["x1"]
    assert out[0].confidence == "alta" and out[0].proposed == "k1"
    assert out[0].evidence == {"letra": True, "promocao": {
        "por": "fila", "decided_by": "jairo@x", "decided_at": "2026-09-04 10:00:00", "decision_note": None}}
    assert "conflito" in capsys.readouterr().err


def test_marcar_aplicados_so_quem_estava_aprovado(tmp_path):
    log = tmp_path / "apply_log.jsonl"
    log.write_text(json.dumps({"finding_id": "x1", "ok": True, "escreveu": True}) + "\n", encoding="utf-8")
    rodados = []
    n = marcar_aplicados(str(log), run=lambda arquivos, remote=True: rodados.extend(arquivos),
                         out_dir=str(tmp_path / "sql"), remote=False)
    assert n == 1
    texto = open(rodados[0], encoding="utf-8").read()
    assert "SET status = 'aplicado'" in texto
    assert "WHERE id = 'x1' AND status = 'aprovado'" in texto
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd scripts/validate-acervo && python3 -B -m pytest tests/test_queue.py -q`
Expected: `ModuleNotFoundError: core.queue`.

- [ ] **Step 3: Implement**

`core/queue.py`:

```python
from __future__ import annotations

import argparse
import json
import os
import sys
import time

from core.d1 import query, run_sql_files, sql_str, write_sql_chunks
from core.findings import Finding, promovido, read_findings, write_findings
from core.gold import NENHUM, ler_gabarito
from core.paths import OUT, ensure_out

FAIXA_QUE_NAO_ENTRA = "alta"   # a alta passa pelo portão (gold) e pelo apply, não pela fila

COLUNAS = ("id", "run_id", "detector", "target_type", "target_id", "praise_id", "action",
           "field", "current_value", "proposed_value", "confidence", "evidence", "status",
           "decided_at", "decided_by", "decision_note")


def linha_de(f: Finding, decisao: tuple[str, str, str] | None) -> dict:
    """A linha de validation_findings para um finding. decisao = (status, nota, quem)."""
    status, nota, quem = decisao or ("pendente", None, None)
    return {
        "id": f.finding_id, "run_id": f.run_id, "detector": f.detector,
        "target_type": f.target_type, "target_id": f.target_id, "praise_id": f.praise_id,
        "action": f.action, "field": f.field,
        "current_value": f.current, "proposed_value": f.proposed,
        "confidence": f.confidence,
        "evidence": json.dumps(f.evidence, ensure_ascii=False),
        "status": status,
        "decided_at": time.strftime("%Y-%m-%d %H:%M:%S") if decisao else None,
        "decided_by": quem, "decision_note": nota,
    }


def decisoes_do_gabarito(findings: list[Finding], gabarito: dict[str, str], origem: str) -> dict[str, tuple[str, str, str]]:
    """O veredito do dono, traduzido em decisão por finding. Sem veredito, sem decisão."""
    out: dict[str, tuple[str, str, str]] = {}
    for f in findings:
        v = gabarito.get(f.target_id)
        if v is None:
            continue
        if v == f.proposed:
            out[f.finding_id] = ("aprovado", f"gabarito {origem}: dono confirmou", "gabarito")
        elif v == NENHUM:
            out[f.finding_id] = ("rejeitado", f"gabarito {origem}: dono respondeu NENHUM", "gabarito")
        else:
            out[f.finding_id] = ("rejeitado", f"gabarito {origem}: dono apontou {v}", "gabarito")
    return out


def aplicados_do_log(log_path: str) -> set[str]:
    """finding_id das entradas que escreveram de verdade (ok e escreveu), a regra do --undo."""
    ids: set[str] = set()
    if not os.path.exists(log_path):
        return ids
    with open(log_path, encoding="utf-8") as fh:
        for linha in fh:
            linha = linha.strip()
            if not linha:
                continue
            e = json.loads(linha)
            if e.get("ok") and e.get("escreveu"):
                ids.add(e["finding_id"])
    return ids


def sql_insert(linhas: list[dict]) -> list[str]:
    cols = ", ".join(COLUNAS)
    return [
        f"INSERT OR IGNORE INTO validation_findings ({cols}) VALUES ("
        + ", ".join(sql_str(l[c]) for c in COLUNAS) + ");"
        for l in linhas
    ]


def empurrar(findings: list[Finding], decisoes: dict[str, tuple[str, str, str]], aplicados: set[str],
             run=run_sql_files, out_dir: str | None = None, remote: bool = True) -> dict:
    """Leva para o D1 tudo que não é faixa alta. INSERT OR IGNORE: decisão já tomada fica."""
    out_dir = out_dir or os.path.join(OUT, "sql", "fila")
    linhas: list[dict] = []
    por_status: dict[str, int] = {}
    for f in findings:
        if f.confidence == FAIXA_QUE_NAO_ENTRA:
            continue
        if f.finding_id in aplicados:
            decisao: tuple[str, str, str] | None = ("aplicado", "aplicado pelo apply", "apply")
        else:
            decisao = decisoes.get(f.finding_id)
        l = linha_de(f, decisao)
        por_status[l["status"]] = por_status.get(l["status"], 0) + 1
        linhas.append(l)
    arquivos = write_sql_chunks(sql_insert(linhas), out_dir, time.strftime("%Y-%m-%dT%H%MZ-fila"))
    if arquivos:
        run(arquivos, remote=remote)
    return {"empurrados": len(linhas), "por_status": dict(sorted(por_status.items()))}


def _finding_de(l: dict) -> Finding:
    ev = l.get("evidence")
    if isinstance(ev, str):
        try:
            ev = json.loads(ev)
        except ValueError:
            ev = {"bruto": ev}
    return Finding(
        run_id=l["run_id"], detector=l["detector"], target_type=l["target_type"],
        target_id=l["target_id"], praise_id=l.get("praise_id"), action=l["action"],
        field=l.get("field"), current=l.get("current_value"), proposed=l.get("proposed_value"),
        confidence=l["confidence"], evidence=ev or {}, finding_id=l["id"],
    )


def puxar_aprovados(q=query, remote: bool = True) -> list[Finding]:
    """Os 'aprovado' da fila, promovidos à faixa alta. Conflito (dois keepers para a
    mesma fonte) é pulado inteiro — o apply não pode escolher pelo dono."""
    linhas = q("SELECT * FROM validation_findings WHERE status = 'aprovado' ORDER BY praise_id, id", remote=remote)
    por_alvo: dict[tuple[str, str], set[str]] = {}
    for l in linhas:
        por_alvo.setdefault((l["target_id"], l["action"]), set()).add(l.get("proposed_value") or "")
    out: list[Finding] = []
    for l in linhas:
        if len(por_alvo[(l["target_id"], l["action"])]) > 1:
            print(f"conflito: {l['target_id']} ({l['action']}) tem mais de um aprovado — pulando {l['id']}",
                  file=sys.stderr)
            continue
        out.append(promovido(_finding_de(l), {
            "por": "fila", "decided_by": l.get("decided_by"), "decided_at": l.get("decided_at"),
            "decision_note": l.get("decision_note"),
        }))
    return out


def marcar_aplicados(log_path: str, run=run_sql_files, out_dir: str | None = None, remote: bool = True) -> int:
    out_dir = out_dir or os.path.join(OUT, "sql", "fila")
    stmts = [
        f"UPDATE validation_findings SET status = 'aplicado', decided_at = datetime('now') "
        f"WHERE id = {sql_str(i)} AND status = 'aprovado';"
        for i in sorted(aplicados_do_log(log_path))
    ]
    arquivos = write_sql_chunks(stmts, out_dir, time.strftime("%Y-%m-%dT%H%MZ-aplicados"))
    if arquivos:
        run(arquivos, remote=remote)
    return len(stmts)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="a fila de revisão: empurra findings, puxa aprovados, marca aplicados")
    ap.add_argument("--empurrar", nargs="+", help="findings.jsonl a levar para o D1 (a faixa alta fica de fora)")
    ap.add_argument("--gabarito", default="", help="TSV preenchido: veredito vira decisão na fila")
    ap.add_argument("--apply-log", default="", help="apply_log.jsonl: quem já escreveu entra como 'aplicado'")
    ap.add_argument("--puxar-aprovados", default="", help="grava aqui os 'aprovado', como findings de faixa alta")
    ap.add_argument("--marcar-aplicados", default="", help="apply_log.jsonl: marca na fila o que escreveu")
    ap.add_argument("--local", action="store_true", help="D1 local em vez do remoto")
    args = ap.parse_args(argv)
    ensure_out()
    remote = not args.local

    if args.empurrar:
        findings: list[Finding] = []
        for c in args.empurrar:
            findings.extend(read_findings(c))
        decisoes = (decisoes_do_gabarito(findings, ler_gabarito(args.gabarito), os.path.basename(args.gabarito))
                    if args.gabarito else {})
        aplicados = aplicados_do_log(args.apply_log) if args.apply_log else set()
        r = empurrar(findings, decisoes, aplicados, remote=remote)
        print(f"empurrados: {r['empurrados']}  por status: {r['por_status']}")
    if args.puxar_aprovados:
        fs = puxar_aprovados(remote=remote)
        write_findings(fs, args.puxar_aprovados)
        print(f"aprovados puxados: {len(fs)} -> {args.puxar_aprovados}")
    if args.marcar_aplicados:
        n = marcar_aplicados(args.marcar_aplicados, remote=remote)
        print(f"marcados como aplicados: {n}")
    if not (args.empurrar or args.puxar_aprovados or args.marcar_aplicados):
        ap.print_help()
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

No `README.md`, na seção "Rodar", depois do bloco do `--undo`:

```bash
# a fila de revisão (P2): média e baixa vão para o D1, a tela decide, o apply escreve
python3 -m core.queue --empurrar out/youtube_merge/findings.jsonl \
                      --gabarito gabaritos/youtube_merge/gabarito.preenchido.tsv \
                      --apply-log out/apply_log.jsonl
python3 -m core.queue --puxar-aprovados out/fila/aprovados.jsonl
python3 -m core.apply --from out/fila/aprovados.jsonl --faixa alta            # simula
python3 -m core.apply --from out/fila/aprovados.jsonl --faixa alta --execute  # escreve
python3 -m core.queue --marcar-aplicados out/apply_log.jsonl
```

e na tabela "Arquivos" a linha `| core/queue.py | a fila de revisão: empurra findings para o D1, puxa os aprovados como faixa alta, marca os aplicados |`. Na lista de regras, um item: **"Uma decisão humana é a única promoção para a faixa alta.** O veredito do gabarito e o `aprovado` da fila passam pela mesma `findings.promovido()`, e o `finding_id` não muda. `aplicado` na fila é marcado só pelo `--marcar-aplicados`, lendo o log do apply."

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd scripts/validate-acervo && python3 -B -m pytest tests -q`
Expected: tudo verde.

- [ ] **Step 5: Commit**

```bash
git add scripts/validate-acervo/core/queue.py scripts/validate-acervo/tests/test_queue.py scripts/validate-acervo/README.md
git commit -m "feat(queue): a fila de revisão — empurrar, puxar aprovados, marcar aplicados"
```

---

## Raia W — web

### Task 8 [W]: tipos e cliente HTTP da fila

**Files:**
- Modify: `web/src/types/index.ts` (depois de `ApiError`)
- Modify: `web/src/services/api.ts` (ao final, antes das funções de auth — depois de `createTag`)
- Test: `web/src/__tests__/validationApi.test.ts`

**Interfaces:**
- Produces (tipos):

```ts
export type FindingConfidence = 'alta' | 'media' | 'baixa' | 'discussao';
export type FindingStatus = 'pendente' | 'discussao' | 'aprovado' | 'rejeitado' | 'aplicado';
export interface ValidationFinding {
  id: string; run_id: string; detector: string;
  target_type: 'material' | 'praise'; target_id: string; praise_id: string | null;
  action: string; field: string | null;
  current_value: string | null; proposed_value: string | null;
  confidence: FindingConfidence;
  evidence: Record<string, unknown> | string;
  status: FindingStatus;
  decided_at: string | null; decided_by: string | null; decision_note: string | null;
  created_at: string;
  target_name?: string | null; proposed_name?: string | null;
}
export interface FindingDecision { status: Exclude<FindingStatus, 'aplicado'>; decision_note?: string }
export interface FindingListParams {
  detector?: string; confidence?: FindingConfidence; status?: FindingStatus; praise_id?: string;
  page?: number; limit?: number;
}
```

- Produces (funções em `api.ts`, todas por `fetchJson`, que injeta Bearer, `credentials: 'include'` e renova a sessão no 401):
  - `listValidationFindings(params: FindingListParams = {}, signal?: AbortSignal): Promise<{ data: ValidationFinding[]; pagination: PaginationInfo }>`
  - `decideValidationFinding(id: string, decision: FindingDecision): Promise<ValidationFinding>`
  - `bulkDecideValidationFindings(body: { ids: string[] } & FindingDecision): Promise<{ atualizados: number }>`

- [ ] **Step 1: Write the failing test**

`web/src/__tests__/validationApi.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  API_BASE_URL,
  bulkDecideValidationFindings,
  decideValidationFinding,
  listValidationFindings,
} from '../services/api';

function respostaJson(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
}

describe('cliente da fila de revisão', () => {
  const fetchMock = vi.fn();
  beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('lista com os filtros na query string e devolve data + pagination', async () => {
    fetchMock.mockResolvedValueOnce(respostaJson({ data: [{ id: 'f1' }], pagination: { page: 2, limit: 50, total: 60, totalPages: 2 } }));
    const r = await listValidationFindings({ detector: 'youtube_merge', status: 'pendente', page: 2, limit: 50 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE_URL}/api/validation/findings?detector=youtube_merge&status=pendente&page=2&limit=50`);
    expect(init.credentials).toBe('include');
    expect(r.data).toEqual([{ id: 'f1' }]);
    expect(r.pagination.totalPages).toBe(2);
  });

  it('decide um achado com PATCH e corpo JSON', async () => {
    fetchMock.mockResolvedValueOnce(respostaJson({ data: { id: 'f1', status: 'rejeitado' } }));
    const r = await decideValidationFinding('f1', { status: 'rejeitado', decision_note: 'não é' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE_URL}/api/validation/findings/f1`);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ status: 'rejeitado', decision_note: 'não é' });
    expect(r.status).toBe('rejeitado');
  });

  it('decide em lote com POST /bulk', async () => {
    fetchMock.mockResolvedValueOnce(respostaJson({ data: { atualizados: 2 } }));
    const r = await bulkDecideValidationFindings({ ids: ['a', 'b'], status: 'rejeitado' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE_URL}/api/validation/findings/bulk`);
    expect(init.method).toBe('POST');
    expect(r).toEqual({ atualizados: 2 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/__tests__/validationApi.test.ts`
Expected: FAIL — exports inexistentes.

- [ ] **Step 3: Implement**

Em `web/src/types/index.ts`, depois de `ApiError`, cole o bloco de tipos de **Interfaces** acima.

Em `web/src/services/api.ts`, acrescente aos imports de tipos `FindingDecision, FindingListParams, ValidationFinding` e, depois de `createTag`:

```ts
// ---------- fila de revisão da validação (spec §6) ----------

export async function listValidationFindings(
  params: FindingListParams = {},
  signal?: AbortSignal
): Promise<{ data: ValidationFinding[]; pagination: PaginationInfo }> {
  const q = new URLSearchParams();
  if (params.detector) q.set('detector', params.detector);
  if (params.confidence) q.set('confidence', params.confidence);
  if (params.status) q.set('status', params.status);
  if (params.praise_id) q.set('praise_id', params.praise_id);
  q.set('page', String(params.page ?? 1));
  q.set('limit', String(params.limit ?? 100));
  const r = await fetchJson<ApiResponse<ValidationFinding[]>>(
    `${API_BASE_URL}/api/validation/findings?${q}`,
    signal ? { signal } : undefined
  );
  return { data: r.data, pagination: r.pagination! };
}

export async function decideValidationFinding(id: string, decision: FindingDecision): Promise<ValidationFinding> {
  const r = await fetchJson<ApiResponse<ValidationFinding>>(
    `${API_BASE_URL}/api/validation/findings/${encodeURIComponent(id)}`,
    { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(decision) }
  );
  return r.data;
}

export async function bulkDecideValidationFindings(
  body: { ids: string[] } & FindingDecision
): Promise<{ atualizados: number }> {
  const r = await fetchJson<ApiResponse<{ atualizados: number }>>(
    `${API_BASE_URL}/api/validation/findings/bulk`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
  );
  return r.data;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/__tests__/validationApi.test.ts && npx tsc -b --force`
Expected: PASS; typecheck limpo.

- [ ] **Step 5: Commit**

```bash
git add web/src/types/index.ts web/src/services/api.ts web/src/__tests__/validationApi.test.ts
git commit -m "feat(web): tipos e cliente da fila de revisão"
```

---

### Task 9 [W]: a tela `/validacao` — lista agrupada por louvor, decisão com nota, lote

**Files:**
- Create: `web/src/pages/ValidationQueuePage.tsx`
- Modify: `web/src/App.tsx` (linha 15, antes de `/praise/...`: `<Route path="/validacao" element={<ValidationQueuePage />} />`)
- Modify: `web/src/styles/global.css` (bloco `.vf-*` ao final)
- Test: `web/src/__tests__/ValidationQueuePage.test.tsx`

**Interfaces:**
- Consumes: Task 8 (`listValidationFindings`, `decideValidationFinding`, `bulkDecideValidationFindings`, tipos); `useAuth` (`../context/useAuth`: `{ isAuthenticated, ready }`); `AuthControl` (`../components/AuthControl`); `Pagination` (`../components/Pagination`, props `{ pagination, onPageChange }`); `FindingEvidence` (Task 10 — **crie um stub** `web/src/components/FindingEvidence.tsx` nesta task se a 10 ainda não existir: `export function FindingEvidence({ finding }: { finding: ValidationFinding }) { return <pre className="vf-evidence-raw">{JSON.stringify(finding.evidence, null, 2)}</pre>; }` — a Task 10 o substitui).
- Produces: `export function agruparPorAlvo(findings: ValidationFinding[]): Grupo[]` com `type Grupo = { chave: string; titulo: string; itens: ValidationFinding[] }` — agrupa por `praise_id ?? target_id`, na ordem de chegada; `titulo = itens[0].target_name ?? itens[0].target_id`. E `export function ValidationQueuePage()`.
- Comportamento fixado:
  - Sem sessão resolvida (`!ready`): `.loading-state` "Carregando sessão…". Sem sessão (`!isAuthenticated`): `.error-state` com título "Fila de revisão", texto "Entre para revisar os achados do acervo." e `<AuthControl />`. **Nenhuma chamada à API nesses dois estados.**
  - Filtros: `<select>` nativos para faixa e status (status inicial `pendente`), `<input>` para detector. Mudar filtro volta à página 1.
  - Tabela densa. Cabeçalho de grupo por louvor-alvo: `titulo` + `N candidato(s)`. Linha por achado: checkbox, detector, proposta (`proposed_name ?? proposed_value`, com `field` em `<code>` embaixo), faixa (`.vf-pill.vf-pill--{confidence}`), status (`.vf-status.vf-status--{status}`), decisão (`decided_by · decided_at · decision_note`), ações.
  - Ações de um achado `pendente`/`discussao`: **Aprovar**, **Rejeitar**, **Discussão**, **Evidência** (abre/fecha `<FindingEvidence>` numa linha abaixo). Se o grupo tem outros pendentes, o botão Aprovar diz **"Aprovar e rejeitar os outros N"** e faz: `decideValidationFinding(id, {status:'aprovado', decision_note})` e depois `bulkDecideValidationFindings({ ids: irmãosPendentes, status: 'rejeitado', decision_note: 'concorrente do aprovado <id>' })`. Achado `aprovado`/`rejeitado`: só **Reabrir** (→ `pendente`). `aplicado`: sem ações.
  - Uma caixa de texto "Nota da decisão" acima da tabela; o valor vai em toda decisão feita enquanto estiver preenchida (é a nota de treino — spec §6).
  - Lote: com N selecionados, uma barra `.vf-bulk` com **Rejeitar N**, **Aprovar N**, **Discussão N** → `bulkDecideValidationFindings`. Depois de qualquer decisão, recarrega a lista e limpa a seleção.
  - Erros da API aparecem em `.error-state` acima da tabela, sem derrubar a lista já carregada.

- [ ] **Step 1: Write the failing tests**

`web/src/__tests__/ValidationQueuePage.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { ValidationQueuePage, agruparPorAlvo } from '../pages/ValidationQueuePage';
import type { ValidationFinding } from '../types';

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    getMe: vi.fn().mockResolvedValue(null),
    refreshSession: vi.fn().mockResolvedValue(false),
    listValidationFindings: vi.fn(),
    decideValidationFinding: vi.fn(),
    bulkDecideValidationFindings: vi.fn(),
    getPraise: vi.fn(),
  };
});

import {
  getMe, listValidationFindings, decideValidationFinding, bulkDecideValidationFindings,
} from '../services/api';

function achado(extra: Partial<ValidationFinding>): ValidationFinding {
  return {
    id: 'f1', run_id: 'r1', detector: 'youtube_merge', target_type: 'praise', target_id: 'p-fonte',
    praise_id: 'p-fonte', action: 'merge_praise', field: 'keeper:p-k1', current_value: null,
    proposed_value: 'p-k1', confidence: 'media', evidence: { letra: true }, status: 'pendente',
    decided_at: null, decided_by: null, decision_note: null, created_at: '2026-09-03 20:00:00',
    target_name: 'Medo tens', proposed_name: 'Medo tens que o tentador', ...extra,
  };
}

const DOIS_CANDIDATOS = [
  achado({ id: 'f1', proposed_value: 'p-k1', proposed_name: 'Medo tens que o tentador', field: 'keeper:p-k1' }),
  achado({ id: 'f2', proposed_value: 'p-k2', proposed_name: 'Medo tens (coro)', field: 'keeper:p-k2' }),
];

function renderPage() {
  return render(<MemoryRouter><AuthProvider><ValidationQueuePage /></AuthProvider></MemoryRouter>);
}

beforeEach(() => {
  vi.mocked(listValidationFindings).mockReset();
  vi.mocked(decideValidationFinding).mockReset();
  vi.mocked(bulkDecideValidationFindings).mockReset();
});

describe('agruparPorAlvo', () => {
  it('junta os candidatos concorrentes do mesmo louvor e mantém a ordem', () => {
    const outro = achado({ id: 'f9', praise_id: 'p-outro', target_id: 'p-outro', target_name: 'Algemas' });
    const grupos = agruparPorAlvo([DOIS_CANDIDATOS[0], outro, DOIS_CANDIDATOS[1]]);
    expect(grupos.map((g) => [g.titulo, g.itens.map((i) => i.id)])).toEqual([
      ['Medo tens', ['f1', 'f2']],
      ['Algemas', ['f9']],
    ]);
  });
});

describe('ValidationQueuePage', () => {
  it('sem sessão, pede login e não chama a API', async () => {
    vi.mocked(getMe).mockResolvedValueOnce(null);
    renderPage();
    expect(await screen.findByText('Entre para revisar os achados do acervo.')).toBeInTheDocument();
    expect(listValidationFindings).not.toHaveBeenCalled();
  });

  it('com sessão, lista agrupada por louvor com a contagem de candidatos', async () => {
    vi.mocked(getMe).mockResolvedValueOnce({ sub: 'u1', email: 'admin@test.com' });
    vi.mocked(listValidationFindings).mockResolvedValue({
      data: DOIS_CANDIDATOS, pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
    });
    renderPage();
    expect(await screen.findByText('Medo tens')).toBeInTheDocument();
    expect(screen.getByText('2 candidatos')).toBeInTheDocument();
    expect(screen.getByText('Medo tens que o tentador')).toBeInTheDocument();
    expect(screen.getByText('Medo tens (coro)')).toBeInTheDocument();
    expect(listValidationFindings).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pendente', page: 1 }), expect.anything()
    );
  });

  it('aprovar um candidato rejeita os irmãos pendentes e recarrega', async () => {
    const user = userEvent.setup();
    vi.mocked(getMe).mockResolvedValueOnce({ sub: 'u1', email: 'admin@test.com' });
    vi.mocked(listValidationFindings).mockResolvedValue({
      data: DOIS_CANDIDATOS, pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
    });
    vi.mocked(decideValidationFinding).mockResolvedValue({ ...DOIS_CANDIDATOS[0], status: 'aprovado' });
    vi.mocked(bulkDecideValidationFindings).mockResolvedValue({ atualizados: 1 });
    renderPage();
    const linha = (await screen.findByText('Medo tens que o tentador')).closest('tr')!;
    await user.type(screen.getByLabelText('Nota da decisão'), 'a letra bate');
    await user.click(within(linha).getByRole('button', { name: 'Aprovar e rejeitar os outros 1' }));
    await waitFor(() => expect(decideValidationFinding).toHaveBeenCalledWith('f1', { status: 'aprovado', decision_note: 'a letra bate' }));
    expect(bulkDecideValidationFindings).toHaveBeenCalledWith({ ids: ['f2'], status: 'rejeitado', decision_note: 'concorrente do aprovado f1' });
    await waitFor(() => expect(listValidationFindings).toHaveBeenCalledTimes(2));
  });

  it('lote: selecionar dois e rejeitar chama o bulk', async () => {
    const user = userEvent.setup();
    vi.mocked(getMe).mockResolvedValueOnce({ sub: 'u1', email: 'admin@test.com' });
    vi.mocked(listValidationFindings).mockResolvedValue({
      data: DOIS_CANDIDATOS, pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
    });
    vi.mocked(bulkDecideValidationFindings).mockResolvedValue({ atualizados: 2 });
    renderPage();
    await screen.findByText('Medo tens');
    await user.click(screen.getByLabelText('Selecionar f1'));
    await user.click(screen.getByLabelText('Selecionar f2'));
    await user.click(screen.getByRole('button', { name: 'Rejeitar 2' }));
    await waitFor(() => expect(bulkDecideValidationFindings).toHaveBeenCalledWith({ ids: ['f1', 'f2'], status: 'rejeitado', decision_note: undefined }));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run src/__tests__/ValidationQueuePage.test.tsx`
Expected: FAIL — módulo `../pages/ValidationQueuePage` não existe.

- [ ] **Step 3: Implement**

`web/src/pages/ValidationQueuePage.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthControl } from '../components/AuthControl';
import { FindingEvidence } from '../components/FindingEvidence';
import { Pagination } from '../components/Pagination';
import { useAuth } from '../context/useAuth';
import {
  bulkDecideValidationFindings,
  decideValidationFinding,
  listValidationFindings,
} from '../services/api';
import type { FindingConfidence, FindingDecision, FindingStatus, PaginationInfo, ValidationFinding } from '../types';

const FAIXAS: FindingConfidence[] = ['alta', 'media', 'baixa', 'discussao'];
const STATUS: FindingStatus[] = ['pendente', 'discussao', 'aprovado', 'rejeitado', 'aplicado'];
const ROTULO_FAIXA: Record<FindingConfidence, string> = { alta: 'alta', media: 'média', baixa: 'baixa', discussao: 'discussão' };
const ROTULO_STATUS: Record<FindingStatus, string> = {
  pendente: 'pendente', discussao: 'em discussão', aprovado: 'aprovado', rejeitado: 'rejeitado', aplicado: 'aplicado',
};

export type Grupo = { chave: string; titulo: string; itens: ValidationFinding[] };

/**
 * Os candidatos concorrentes do mesmo louvor ficam juntos. É a resposta ao
 * teto estrutural da faixa média (RESIDUOS-P2.md): uma fonte com 7 candidatos
 * gera 7 achados, e só um pode estar certo — decidir um de cada vez, sem ver
 * os outros, é o que a tela não pode permitir.
 */
export function agruparPorAlvo(findings: ValidationFinding[]): Grupo[] {
  const grupos = new Map<string, ValidationFinding[]>();
  for (const f of findings) {
    const chave = f.praise_id ?? f.target_id;
    const lista = grupos.get(chave);
    if (lista) lista.push(f);
    else grupos.set(chave, [f]);
  }
  return [...grupos.entries()].map(([chave, itens]) => ({
    chave,
    titulo: itens[0].target_name ?? itens[0].target_id,
    itens,
  }));
}

type Filtros = { detector: string; confidence: '' | FindingConfidence; status: '' | FindingStatus; page: number };

function decidivel(f: ValidationFinding): boolean {
  return f.status === 'pendente' || f.status === 'discussao';
}

export function ValidationQueuePage() {
  const { isAuthenticated, ready } = useAuth();
  const [filtros, setFiltros] = useState<Filtros>({ detector: '', confidence: '', status: 'pendente', page: 1 });
  const [findings, setFindings] = useState<ValidationFinding[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [nota, setNota] = useState('');

  const carregar = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const r = await listValidationFindings({
        detector: filtros.detector || undefined,
        confidence: filtros.confidence || undefined,
        status: filtros.status || undefined,
        page: filtros.page,
        limit: 100,
      }, signal);
      setFindings(r.data);
      setPagination(r.pagination);
      setSelecionados(new Set());
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : 'Falha ao carregar a fila');
    } finally {
      setLoading(false);
    }
  }, [filtros]);

  useEffect(() => {
    if (!ready || !isAuthenticated) return;
    const ac = new AbortController();
    void carregar(ac.signal);
    return () => ac.abort();
  }, [ready, isAuthenticated, carregar]);

  const grupos = useMemo(() => agruparPorAlvo(findings), [findings]);

  const decisao = (status: FindingDecision['status']): FindingDecision =>
    nota.trim() ? { status, decision_note: nota.trim() } : { status };

  async function executar(acao: () => Promise<unknown>) {
    setError(null);
    try {
      await acao();
      await carregar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao gravar a decisão');
    }
  }

  function decidir(f: ValidationFinding, status: FindingDecision['status']) {
    return executar(() => decideValidationFinding(f.id, decisao(status)));
  }

  function aprovarERejeitarIrmaos(f: ValidationFinding, irmaos: ValidationFinding[]) {
    const outros = irmaos.filter((o) => o.id !== f.id && decidivel(o)).map((o) => o.id);
    return executar(async () => {
      await decideValidationFinding(f.id, decisao('aprovado'));
      if (outros.length) {
        await bulkDecideValidationFindings({ ids: outros, status: 'rejeitado', decision_note: `concorrente do aprovado ${f.id}` });
      }
    });
  }

  function decidirLote(status: FindingDecision['status']) {
    const ids = [...selecionados];
    return executar(() => bulkDecideValidationFindings({ ids, ...decisao(status) }));
  }

  function alternar(set: Set<string>, id: string): Set<string> {
    const novo = new Set(set);
    if (novo.has(id)) novo.delete(id);
    else novo.add(id);
    return novo;
  }

  if (!ready) {
    return <div className="page-container"><div className="loading-state" role="status">Carregando sessão…</div></div>;
  }
  if (!isAuthenticated) {
    return (
      <div className="page-container">
        <div className="error-state" role="alert">
          <div className="error-state-title">Fila de revisão</div>
          <div className="error-state-desc">Entre para revisar os achados do acervo.</div>
          <AuthControl />
        </div>
      </div>
    );
  }

  return (
    <div className="page-container vf-page">
      <div className="vf-head">
        <Link to="/" className="back-link">← Início</Link>
        <h1 className="vf-title">Fila de revisão</h1>
        <AuthControl />
      </div>

      <div className="vf-filters">
        <label>Detector
          <input value={filtros.detector} placeholder="ex.: youtube_merge"
            onChange={(e) => setFiltros({ ...filtros, detector: e.target.value, page: 1 })} />
        </label>
        <label>Faixa
          <select value={filtros.confidence}
            onChange={(e) => setFiltros({ ...filtros, confidence: e.target.value as Filtros['confidence'], page: 1 })}>
            <option value="">todas</option>
            {FAIXAS.map((f) => <option key={f} value={f}>{ROTULO_FAIXA[f]}</option>)}
          </select>
        </label>
        <label>Status
          <select value={filtros.status}
            onChange={(e) => setFiltros({ ...filtros, status: e.target.value as Filtros['status'], page: 1 })}>
            <option value="">todos</option>
            {STATUS.map((s) => <option key={s} value={s}>{ROTULO_STATUS[s]}</option>)}
          </select>
        </label>
        <label className="vf-nota">Nota da decisão
          <input value={nota} placeholder="vai junto com a próxima decisão — é o dado de treino"
            onChange={(e) => setNota(e.target.value)} aria-label="Nota da decisão" />
        </label>
        {pagination && <span className="vf-total">{pagination.total} achado(s)</span>}
      </div>

      {error && <div className="error-state" role="alert"><div className="error-state-desc">{error}</div></div>}

      {selecionados.size > 0 && (
        <div className="vf-bulk">
          <span>{selecionados.size} selecionado(s)</span>
          <button type="button" className="vf-btn vf-btn--rejeitar" onClick={() => void decidirLote('rejeitado')}>Rejeitar {selecionados.size}</button>
          <button type="button" className="vf-btn vf-btn--aprovar" onClick={() => void decidirLote('aprovado')}>Aprovar {selecionados.size}</button>
          <button type="button" className="vf-btn" onClick={() => void decidirLote('discussao')}>Discussão {selecionados.size}</button>
          <button type="button" className="vf-btn" onClick={() => setSelecionados(new Set())}>Limpar</button>
        </div>
      )}

      {loading && findings.length === 0 ? (
        <div className="loading-state" role="status">Carregando a fila…</div>
      ) : grupos.length === 0 ? (
        <div className="no-results">Nada na fila com esses filtros.</div>
      ) : (
        <div className="vf-tablewrap">
          <table className="vf-table">
            <thead>
              <tr>
                <th></th><th>detector</th><th>proposta</th><th>faixa</th><th>status</th><th>decisão</th><th>ações</th>
              </tr>
            </thead>
            {grupos.map((g) => (
              <tbody key={g.chave}>
                <tr className="vf-group-row">
                  <td colSpan={7}>
                    <strong>{g.titulo}</strong>
                    <span className="vf-count">{g.itens.length === 1 ? '1 candidato' : `${g.itens.length} candidatos`}</span>
                    {g.itens[0].target_type === 'praise' && (
                      <Link to={`/praise/${g.chave}`} className="vf-link">abrir louvor ↗</Link>
                    )}
                  </td>
                </tr>
                {g.itens.map((f) => {
                  const irmaosPendentes = g.itens.filter((o) => o.id !== f.id && decidivel(o)).length;
                  const aberto = abertos.has(f.id);
                  return [
                    <tr key={f.id} className={`vf-row vf-row--${f.status}`}>
                      <td>
                        <input type="checkbox" aria-label={`Selecionar ${f.id}`} checked={selecionados.has(f.id)}
                          disabled={f.status === 'aplicado'}
                          onChange={() => setSelecionados((s) => alternar(s, f.id))} />
                      </td>
                      <td><code>{f.detector}</code></td>
                      <td>
                        <div>{f.proposed_name ?? f.proposed_value ?? '—'}</div>
                        {f.field && <code className="vf-field">{f.field}</code>}
                      </td>
                      <td><span className={`vf-pill vf-pill--${f.confidence}`}>{ROTULO_FAIXA[f.confidence]}</span></td>
                      <td><span className={`vf-status vf-status--${f.status}`}>{ROTULO_STATUS[f.status]}</span></td>
                      <td className="vf-decisao">
                        {f.decided_by && <div>{f.decided_by} · {f.decided_at}</div>}
                        {f.decision_note && <div className="vf-note">{f.decision_note}</div>}
                      </td>
                      <td className="vf-actions">
                        {decidivel(f) && (
                          <>
                            <button type="button" className="vf-btn vf-btn--aprovar"
                              onClick={() => void (irmaosPendentes ? aprovarERejeitarIrmaos(f, g.itens) : decidir(f, 'aprovado'))}>
                              {irmaosPendentes ? `Aprovar e rejeitar os outros ${irmaosPendentes}` : 'Aprovar'}
                            </button>
                            <button type="button" className="vf-btn vf-btn--rejeitar" onClick={() => void decidir(f, 'rejeitado')}>Rejeitar</button>
                            {f.status !== 'discussao' && (
                              <button type="button" className="vf-btn" onClick={() => void decidir(f, 'discussao')}>Discussão</button>
                            )}
                          </>
                        )}
                        {(f.status === 'aprovado' || f.status === 'rejeitado') && (
                          <button type="button" className="vf-btn" onClick={() => void decidir(f, 'pendente')}>Reabrir</button>
                        )}
                        <button type="button" className="vf-btn vf-btn--ghost" aria-expanded={aberto}
                          onClick={() => setAbertos((a) => alternar(a, f.id))}>
                          {aberto ? 'Fechar' : 'Evidência'}
                        </button>
                      </td>
                    </tr>,
                    aberto ? (
                      <tr key={`${f.id}-ev`} className="vf-evidence-row">
                        <td colSpan={7}><FindingEvidence finding={f} /></td>
                      </tr>
                    ) : null,
                  ];
                })}
              </tbody>
            ))}
          </table>
        </div>
      )}

      {pagination && <Pagination pagination={pagination} onPageChange={(page) => setFiltros({ ...filtros, page })} />}
    </div>
  );
}
```

`web/src/App.tsx`: importe `ValidationQueuePage` de `./pages/ValidationQueuePage` e acrescente, **antes** das rotas `/praise/...`:

```tsx
            <Route path="/validacao" element={<ValidationQueuePage />} />
```

`web/src/styles/global.css`, ao final:

```css
/* ---------- fila de revisão da validação (/validacao) ---------- */
.vf-page { padding-bottom: var(--space-16); }
.vf-head { display: flex; align-items: center; gap: var(--space-4); margin-bottom: var(--space-4); }
.vf-title { font-family: var(--font-display); font-size: var(--text-2xl); margin: 0; flex: 1; }
.vf-filters { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: end; margin-bottom: var(--space-3); }
.vf-filters label { display: flex; flex-direction: column; gap: var(--space-1); font-size: var(--text-xs); color: var(--text-secondary); }
.vf-filters input, .vf-filters select {
  background: var(--bg-inset); color: var(--text-primary); border: 1px solid var(--border-default);
  border-radius: var(--radius-md); padding: var(--space-2) var(--space-3); font: inherit; font-size: var(--text-sm);
}
.vf-nota { flex: 1 1 320px; }
.vf-total { font-size: var(--text-sm); color: var(--text-tertiary); padding-bottom: var(--space-2); }
.vf-bulk { display: flex; gap: var(--space-2); align-items: center; padding: var(--space-2) var(--space-3);
  background: var(--bg-elevated); border: 1px solid var(--border-accent); border-radius: var(--radius-md); margin-bottom: var(--space-3); font-size: var(--text-sm); }
.vf-tablewrap { overflow-x: auto; border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); }
.vf-table { width: 100%; border-collapse: collapse; font-size: var(--text-sm); }
.vf-table th { text-align: left; font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--text-tertiary); padding: var(--space-2) var(--space-3); background: var(--bg-surface); border-bottom: 1px solid var(--border-default); }
.vf-table td { padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--border-subtle); vertical-align: top; }
.vf-group-row td { background: var(--bg-elevated); font-size: var(--text-base); }
.vf-count { margin-left: var(--space-3); color: var(--text-tertiary); font-size: var(--text-xs); }
.vf-link { margin-left: var(--space-3); font-size: var(--text-xs); }
.vf-field { display: block; font-size: var(--text-xs); color: var(--text-tertiary); }
.vf-decisao { font-size: var(--text-xs); color: var(--text-secondary); max-width: 28ch; }
.vf-note { color: var(--text-primary); }
.vf-actions { white-space: nowrap; }
.vf-btn { font: inherit; font-size: var(--text-xs); padding: 0.25rem 0.55rem; margin-right: var(--space-1);
  border-radius: var(--radius-md); border: 1px solid var(--border-default); background: var(--bg-surface); color: var(--text-primary); cursor: pointer; }
.vf-btn:hover { background: var(--bg-surface-hover); }
.vf-btn--aprovar { border-color: var(--c-success); color: var(--c-success); }
.vf-btn--rejeitar { border-color: var(--c-error); color: var(--c-error); }
.vf-btn--ghost { border-color: transparent; color: var(--text-secondary); }
.vf-pill, .vf-status { display: inline-flex; align-items: center; padding: 0.15rem 0.55rem; border-radius: var(--radius-full);
  font-size: var(--text-xs); font-weight: var(--weight-medium); letter-spacing: 0.01em; }
.vf-pill--alta { color: var(--c-success); background: rgba(34, 197, 94, 0.14); }
.vf-pill--media { color: var(--c-warning); background: rgba(234, 179, 8, 0.14); }
.vf-pill--baixa { color: var(--text-secondary); background: rgba(148, 163, 184, 0.14); }
.vf-pill--discussao { color: var(--c-info); background: rgba(56, 189, 248, 0.14); }
.vf-status--pendente { color: var(--text-secondary); background: rgba(148, 163, 184, 0.14); }
.vf-status--discussao { color: var(--c-info); background: rgba(56, 189, 248, 0.14); }
.vf-status--aprovado { color: var(--c-success); background: rgba(34, 197, 94, 0.14); }
.vf-status--rejeitado { color: var(--c-error); background: rgba(248, 113, 113, 0.14); }
.vf-status--aplicado { color: var(--c-accent-300); background: rgba(201, 169, 110, 0.14); }
.vf-row--aplicado td { color: var(--text-tertiary); }
.vf-evidence-row td { background: var(--bg-inset); }
.vf-evidence-raw { margin: 0; font-family: var(--font-mono); font-size: var(--text-xs); white-space: pre-wrap; }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npx vitest run src/__tests__/ValidationQueuePage.test.tsx && npx tsc -b --force`
Expected: PASS; typecheck limpo. Depois `npm run test:web` na raiz, tudo verde.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/ValidationQueuePage.tsx web/src/components/FindingEvidence.tsx web/src/App.tsx web/src/styles/global.css web/src/__tests__/ValidationQueuePage.test.tsx
git commit -m "feat(web): /validacao — a fila de revisão, agrupada por louvor"
```

---

### Task 10 [W]: `FindingEvidence` — chave/valor genérico, e os dois louvores lado a lado para `merge_praise`

**Files:**
- Create (ou substitua o stub da Task 9): `web/src/components/FindingEvidence.tsx`
- Modify: `web/src/styles/global.css` (ao final, depois do bloco `.vf-*`)
- Test: `web/src/components/__tests__/FindingEvidence.test.tsx`

**Interfaces:**
- Consumes: `getPraise(id): Promise<PraiseDetail>` (`../services/api`, linha ~234), `PraiseDetail` (`../types`: `name, number, author, tonality, category, lyrics, tag_names`).
- Produces: `export function FindingEvidence({ finding }: { finding: ValidationFinding })`.
  - Sempre: `<dl className="vf-ev">` com um par por chave da evidência (valor string como está; outros via `JSON.stringify`); se `evidence` for string (JSON quebrado), mostra-a num `<pre>`. Chave `url` vira link (`target="_blank"`, `rel="noopener noreferrer"`).
  - Se `finding.action === 'merge_praise'` e há `proposed_value`: além do `<dl>`, busca `getPraise(target_id)` e `getPraise(proposed_value)` e desenha duas colunas `.vf-compare` — **fonte** (some) e **keeper** (fica) — com `name`, `number`, `author`, `tonality`, `category`, `tag_names` e `lyrics` em `<pre>`. Falha em qualquer uma: a coluna mostra "não foi possível carregar" e a outra segue.

- [ ] **Step 1: Write the failing test**

`web/src/components/__tests__/FindingEvidence.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FindingEvidence } from '../FindingEvidence';
import type { ValidationFinding } from '../../types';

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/api')>();
  return { ...actual, getPraise: vi.fn() };
});
import { getPraise } from '../../services/api';

const BASE: ValidationFinding = {
  id: 'f1', run_id: 'r1', detector: 'youtube_merge', target_type: 'praise', target_id: 'p-fonte',
  praise_id: 'p-fonte', action: 'merge_praise', field: 'keeper:p-k1', current_value: null,
  proposed_value: 'p-k1', confidence: 'media', status: 'pendente', decided_at: null, decided_by: null,
  decision_note: null, created_at: 'x',
  evidence: { letra: true, nome: false, candidatos: 2, url: 'https://www.youtube.com/watch?v=abc' },
};

beforeEach(() => vi.mocked(getPraise).mockReset());

describe('FindingEvidence', () => {
  it('genérico: um par por chave, url vira link', async () => {
    vi.mocked(getPraise).mockResolvedValue({ id: 'x', name: 'x', number: '', author: '', rhythm: '', tonality: '', category: '', lyrics: '', group_id: null, tag_ids: null, tag_names: null, materials: [] } as never);
    render(<FindingEvidence finding={{ ...BASE, action: 'set_praise_field', proposed_value: null }} />);
    expect(screen.getByText('letra')).toBeInTheDocument();
    expect(screen.getByText('true')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'https://www.youtube.com/watch?v=abc' })).toHaveAttribute('target', '_blank');
    expect(getPraise).not.toHaveBeenCalled();
  });

  it('merge_praise: busca fonte e keeper e mostra os dois lado a lado', async () => {
    vi.mocked(getPraise).mockImplementation(async (id: string) => ({
      id, name: id === 'p-fonte' ? 'Medo tens' : 'Medo tens que o tentador', number: id === 'p-k1' ? '306' : '',
      author: '', rhythm: '', tonality: '', category: '', lyrics: `letra de ${id}`, group_id: null, tag_ids: null,
      tag_names: id === 'p-k1' ? 'Coletânea' : 'Avulsos', materials: [],
    }) as never);
    render(<FindingEvidence finding={BASE} />);
    expect(await screen.findByText('Medo tens que o tentador')).toBeInTheDocument();
    expect(screen.getByText('Medo tens')).toBeInTheDocument();
    expect(screen.getByText('letra de p-fonte')).toBeInTheDocument();
    expect(screen.getByText('letra de p-k1')).toBeInTheDocument();
    expect(getPraise).toHaveBeenCalledTimes(2);
  });

  it('evidência que veio como string crua é mostrada como está', () => {
    render(<FindingEvidence finding={{ ...BASE, action: 'set_praise_field', proposed_value: null, evidence: '{quebrado' }} />);
    expect(screen.getByText('{quebrado')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/components/__tests__/FindingEvidence.test.tsx`
Expected: FAIL (stub não faz nada disso, ou módulo ausente).

- [ ] **Step 3: Implement**

`web/src/components/FindingEvidence.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { getPraise } from '../services/api';
import type { PraiseDetail, ValidationFinding } from '../types';

function Valor({ chave, valor }: { chave: string; valor: unknown }) {
  if (chave === 'url' && typeof valor === 'string') {
    return <a href={valor} target="_blank" rel="noopener noreferrer">{valor}</a>;
  }
  return <>{typeof valor === 'string' ? valor : JSON.stringify(valor)}</>;
}

/** A evidência é JSON livre, por detector: o renderizador genérico é o piso. */
function EvidenciaGenerica({ evidence }: { evidence: ValidationFinding['evidence'] }) {
  if (typeof evidence === 'string') return <pre className="vf-evidence-raw">{evidence}</pre>;
  return (
    <dl className="vf-ev">
      {Object.entries(evidence).map(([k, v]) => (
        <div key={k} className="vf-ev-par">
          <dt>{k}</dt>
          <dd><Valor chave={k} valor={v} /></dd>
        </div>
      ))}
    </dl>
  );
}

type Carregado = { ok: true; praise: PraiseDetail } | { ok: false } | null;

function ColunaLouvor({ id, papel }: { id: string; papel: string }) {
  const [estado, setEstado] = useState<Carregado>(null);
  useEffect(() => {
    let vivo = true;
    getPraise(id)
      .then((praise) => { if (vivo) setEstado({ ok: true, praise }); })
      .catch(() => { if (vivo) setEstado({ ok: false }); });
    return () => { vivo = false; };
  }, [id]);
  return (
    <div className="vf-compare-col">
      <div className="vf-compare-papel">{papel}</div>
      {estado === null && <div className="loading-state" role="status">carregando…</div>}
      {estado?.ok === false && <div className="vf-compare-erro">não foi possível carregar {id}</div>}
      {estado?.ok && (
        <>
          <div className="vf-compare-nome">{estado.praise.name}</div>
          <div className="vf-compare-meta">
            {estado.praise.number && <span>nº {estado.praise.number}</span>}
            {estado.praise.author && <span>{estado.praise.author}</span>}
            {estado.praise.tonality && <span>{estado.praise.tonality}</span>}
            {estado.praise.category && <span>{estado.praise.category}</span>}
            {estado.praise.tag_names && <span>{estado.praise.tag_names}</span>}
          </div>
          <pre className="vf-compare-letra">{estado.praise.lyrics || '(sem letra)'}</pre>
        </>
      )}
    </div>
  );
}

export function FindingEvidence({ finding }: { finding: ValidationFinding }) {
  const fusao = finding.action === 'merge_praise' && finding.proposed_value;
  return (
    <div className="vf-evidence">
      <EvidenciaGenerica evidence={finding.evidence} />
      {fusao && (
        <div className="vf-compare">
          <ColunaLouvor id={finding.target_id} papel="fonte — some" />
          <ColunaLouvor id={finding.proposed_value as string} papel="keeper — fica" />
        </div>
      )}
    </div>
  );
}
```

`global.css`, depois do bloco `.vf-*`:

```css
.vf-evidence { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-2) 0; }
.vf-ev { display: grid; grid-template-columns: max-content 1fr; gap: var(--space-1) var(--space-4); margin: 0; font-size: var(--text-xs); }
.vf-ev-par { display: contents; }
.vf-ev dt { color: var(--text-tertiary); }
.vf-ev dd { margin: 0; color: var(--text-primary); word-break: break-word; }
.vf-compare { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); }
@media (max-width: 720px) { .vf-compare { grid-template-columns: 1fr; } }
.vf-compare-col { background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: var(--space-3); min-width: 0; }
.vf-compare-papel { font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-tertiary); margin-bottom: var(--space-1); }
.vf-compare-nome { font-family: var(--font-display); font-size: var(--text-lg); }
.vf-compare-meta { display: flex; flex-wrap: wrap; gap: var(--space-2); font-size: var(--text-xs); color: var(--text-secondary); margin: var(--space-1) 0 var(--space-2); }
.vf-compare-letra { margin: 0; white-space: pre-wrap; font-family: var(--font-body); font-size: var(--text-sm); line-height: var(--leading-relaxed); max-height: 320px; overflow: auto; }
.vf-compare-erro { color: var(--c-error); font-size: var(--text-xs); }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npx vitest run src/components/__tests__/FindingEvidence.test.tsx src/__tests__/ValidationQueuePage.test.tsx && npx tsc -b --force`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/FindingEvidence.tsx web/src/components/__tests__/FindingEvidence.test.tsx web/src/styles/global.css
git commit -m "feat(web): evidência do achado — genérica, e os dois louvores lado a lado na fusão"
```

---

## Fecho

### Task 11: catraca de cobertura, docs e dívida

**Files:**
- Modify: `api/vitest.config.ts` (bloco `thresholds`, linhas 26-31, e o comentário datado acima)
- Modify: `web/vitest.config.ts` (bloco `thresholds`, linhas 20-25, e o comentário datado acima)
- Modify: `docs/INGESTION.md` (na sequência de aplicação de migrações)
- Modify: `docs/DIVIDA-TECNICA.md`

- [ ] **Step 1: Medir**

Run na raiz: `npm run verify`
Expected: EXIT 0. Anote os quatro percentuais de `api` e os quatro de `web` que o relatório de cobertura imprime (`All files`).

- [ ] **Step 2: Subir a catraca**

Em cada `vitest.config.ts`, troque os quatro números por `Math.floor` do medido — **nunca menor que o atual**. Acima do bloco, acrescente uma linha ao histórico, no mesmo formato das existentes, por exemplo `// P2 (2026-09-04): fila de revisão — 71.2 / 66.0 / 74.1 / 73.0`.

- [ ] **Step 3: Docs**

`docs/INGESTION.md`, onde as migrações são aplicadas (linhas ~18-28), acrescente a linha:

```bash
npx wrangler d1 execute coldigom --remote --file=migrations/017_validation_findings.sql   # fila de revisão da validação
```

`docs/DIVIDA-TECNICA.md`, uma entrada nova na seção de fragilidades que não quebram hoje:

```markdown
### Fila de revisão: candidatos do mesmo louvor podem cair em páginas diferentes

`GET /api/validation/findings` ordena por `praise_id, id` e pagina por 100. Um louvor com N candidatos
cuja posição atravessa a fronteira da página aparece cortado na tela `/validacao` — o botão
"Aprovar e rejeitar os outros" só vê os irmãos da página atual. Hoje a maior fila (Fase 1) tem 29
achados e cabe numa página. **Retomar quando:** alguma fase empurrar mais de 100 achados de uma vez
(Fase 3 vai). Correção provável: paginar por louvor, não por achado.
```

- [ ] **Step 4: Verificar e commitar**

Run: `npm run verify` — EXIT 0 com os novos pisos.

```bash
git add api/vitest.config.ts web/vitest.config.ts docs/INGESTION.md docs/DIVIDA-TECNICA.md
git commit -m "chore: catraca de cobertura sobe com o P2; docs da fila"
```

---

### Task 12 [ops]: a fila nasce com a Fase 1 dentro

Do orquestrador. Pré-requisitos: Tasks 4 e 7 mergeadas; a Task 3 aplicada (`--execute` das 11).

- [ ] **Step 1: Aplicar a migração no D1 remoto**

```bash
cd api && npx wrangler d1 execute coldigom --remote --file=migrations/017_validation_findings.sql
npx wrangler d1 execute coldigom --remote --json --command "SELECT COUNT(*) n FROM validation_findings"
```
Expected: `n = 0`.

- [ ] **Step 2: Empurrar a Fase 1 com as decisões do gabarito e do log**

```bash
cd scripts/validate-acervo
python3 -B -m core.queue --empurrar gabaritos/youtube_merge/execucao/findings.jsonl \
  --gabarito gabaritos/youtube_merge/gabarito.preenchido.tsv \
  --apply-log out/apply_log.jsonl
```
Usa o `findings.jsonl` **original** (o que tinha as 29 da média, guardado na execução da Fase 1), não o do snapshot atual. Expected: `empurrados: 29  por status: {'aplicado': 11, 'rejeitado': 18}` — 11 confirmadas e aplicadas na Task 3, 18 rejeitadas pelo gabarito (11 com veredito NENHUM ou outro alvo + 7 concorrentes das confirmadas). Se `pendente` aparecer, algum veredito não casou: pare e olhe.

- [ ] **Step 3: Conferir na tela**

Abrir `https://coldigom-web.pages.dev/validacao` (ou o preview do branch), filtro status = todos: 29 achados, agrupados por louvor, com nota `gabarito gabarito.preenchido.tsv: …` em cada um. Nenhum botão de decisão nos `aplicado`.

- [ ] **Step 4: Registrar**

Copiar `out/sql/fila/*.sql` para `gabaritos/youtube_merge/execucao/fila/` e commitar como `docs(validate-acervo): a fila nasce com a Fase 1 dentro`.

---

## Self-review (feito ao escrever)

**Cobertura da spec §6:** migração 017 (Task 4) · `GET` com filtro por detector, faixa, status (Task 5) · `PATCH` aprovar/rejeitar com nota (Task 6) · `POST bulk` (Task 6) · tela agrupada com evidência renderizada, PDF/áudio lado a lado (Task 10 cobre `merge_praise`, que é a única ação com achados hoje; PDF e áudio ganham renderizador nas fases que os produzirem — Tasks 3 e 6 do horizonte) · "a rejeição é o dado de treino" — `decision_note` gravada, devolvida e visível (Tasks 6, 9) · `queue.py` da spec §4 linha 96 (Task 7). **§5.2 portão:** promoção só por decisão humana (Tasks 1, 7). **RESIDUOS-P2 "teto estrutural":** agrupamento por louvor e "aprovar e rejeitar os outros" (Task 9). **RESIDUOS-P2 "author = primeira linha da letra":** guarda (Task 2).

**Fora deste plano, de propósito:** os detectores novos sugeridos em RESIDUOS-P2 (`Salmo 130`, `author_e_letra`) — são detectores, não fila; entram no P3. Renderizadores de evidência para PDF e áudio — sem achado que os use ainda.

**Consistência de nomes entre tarefas:** `promovido` (T1 → T7), `FAIXAS`/`STATUS`/`lerFinding`/`ator` (T5 → T6), `ValidationFinding`/`FindingDecision`/`FindingListParams` (T8 → T9, T10), `agruparPorAlvo` (T9, testado), `FindingEvidence({ finding })` (T9 stub → T10), colunas `current_value`/`proposed_value` (T4 → T5, T7), status `aplicado` recusado na API (T6) e gravado só por `marcar_aplicados` (T7).
