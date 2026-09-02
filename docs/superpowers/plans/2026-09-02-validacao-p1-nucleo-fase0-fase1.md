# Validação do acervo — P1: núcleo + Fase 0 + Fase 1

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o arnês de validação do acervo (`scripts/validate-acervo/`) e prová-lo de ponta a ponta com a Fase 0 (reconciliação com a árvore original) e a Fase 1 (os 25 louvores cujo único material é do YouTube).

**Architecture:** Pacote Python que espelha as convenções de `scripts/pdf-to-chordpro/geom/` e `scripts/cifras-agent/`. Um núcleo (`core/`) faz snapshot do D1, reconcilia cada material com o arquivo original em `assets2`, define o contrato de `finding`, sorteia gabarito e aplica escritas de forma reversível. Cada fase é um detector em `detectors/` que consome o snapshot e emite findings — nenhum detector escreve no acervo; quem escreve é `core/apply.py`, e só com `--execute`.

**Tech Stack:** Python 3.9.6 (system, sem venv), stdlib (`sqlite3`, `urllib`, `argparse`, `hashlib`, `csv`, `subprocess`), `pytest` 8.4.2 do sistema, `wrangler` 4.x para falar com o D1.

**Spec:** `docs/superpowers/specs/2026-09-02-validacao-do-acervo-design.md`

## Global Constraints

Todas verificadas contra o repositório em 2026-09-02. Nenhuma é negociável.

- **Python é 3.9.6 do sistema.** Todo `.py` começa com `from __future__ import annotations`, senão `list[str]`, `str | None` e `dict[str, str]` quebram.
- **Não criar `requirements.txt`, `pyproject.toml` nem venv.** O repo não tem nenhum, de propósito. Dependências são stdlib + o que já está no site-packages do sistema.
- **HTTP é `urllib.request`, nunca `requests`.** O repo inteiro segue isso.
- **CLI é `argparse`, sem subcomandos.** Um módulo = um verbo. Assinatura `def main(argv=None) -> int:`, terminando em `if __name__ == "__main__": sys.exit(main())`.
- **`--execute` é o único portão de escrita.** O *early return* da simulação vem **antes** de ler qualquer credencial ou abrir qualquer conexão de escrita.
- **`json.dump(..., ensure_ascii=False, indent=1)`** em todo lugar.
- **`ROOT` derivado de `__file__`**, nunca hardcoded. Copie o gesto de `scripts/cifras-agent/agent/acervo.py:11`.
- **Log append-only `.jsonl` com `flush()` por item.** Releitura filtrando `ok: true` dá retomada.
- **Exclusões contadas num `Counter` com frase-motivo em português**, impressas como tabela no início de toda execução.
- **Comentários em português explicando o *porquê* da regra**, não o que o código faz. É a marca do repo.
- **Escrita no D1 é `.sql` gerado + `subprocess` do `wrangler`**, com `cwd` em `api/` (é lá que está o `wrangler.toml`) e `--remote` como default. Nome do banco é literal `coldigom`.
- **Testes:** `scripts/validate-acervo/tests/test_*.py`, pytest puro (funções `test_*`, `assert`), rodados com `cd scripts/validate-acervo && python3 -m pytest tests/ -v`. Import absoluto do pacote (`from core.x import y`) resolve porque o cwd está no `sys.path`.
- **`out/` é gitignored.** Nenhum artefato de execução entra no git.

### Constantes do domínio, medidas e verificadas

| Constante | Valor | Onde foi medido |
|---|---|---|
| Árvore original | `/Volumes/SSD 2TB SD/assets2` | 18.317 arquivos, 26 GB |
| Mapa material→arquivo | `assets2/files_classification.csv` | 18.160 linhas; coluna `praise_material_id` |
| Cobertura do mapa | 17.810 de 20.862 materiais | join contra o D1 |
| Sem casamento | 3.052 | 2.271 `chord` + 402 `youtube` + 254 `gestures` + 125 órfãos |
| Louvores só-YouTube | 25 | 1 material cada, `r2_key` NULL, tag `Avulsos`, kind `Audio` |
| Louvores com letra utilizável | 1.397 | `length(trim(lyrics)) > 20` |

### Fatos que mudam decisões de implementação

- **A Fase 1 não toca em R2.** Os 25 louvores têm `r2_key` NULL e `url` preenchida. Por isso é seguro escrever por `wrangler d1 execute --remote` sem replicar a limpeza de órfãos que o endpoint `POST /api/praises/:keeperId/merge` faz.
- **Só `PUT /api/materials/:id/content` aceita o `COLDIGOM_UPLOAD_TOKEN`.** `merge`, `PATCH` e `DELETE` exigem JWT de sessão (`api/src/middleware.ts:88`). Por isso o P1 escreve por SQL, não por HTTP.
- **A faixa alta da Fase 1 tem só 5 casos** (medido contra os 25 reais, com a regra D2 estrita). Portanto o gabarito da Fase 1 é **os 25 inteiros**, não uma amostra de 50, e o portão é **zero erro na faixa alta** — não os ≥98% de D10, que precisam de amostra maior. Isto está registrado como desvio deliberado de D10 e vale só para esta fase.
- **`scripts/pdf-to-chordpro/geom/` não está no working tree** — existe só em `stash@{0}` (commit de untracked `824cecf`). O P1 não depende dele. As Fases 2 e 5a dependem, e extrair o `geom/` para um lugar estável é **pré-requisito daquelas fases**, não desta.

---

## File Structure

```
scripts/validate-acervo/
  .gitignore              out/  __pycache__/  *.pyc  .pytest_cache/
  README.md               PT-BR, bloco bash "Rodar" no topo + tabela "arquivo | papel"
  core/
    __init__.py           docstring-manifesto
    paths.py              ROOT, ASSETS2, OUT, API_DIR, CSV_MAP — derivados de __file__
    normalize.py          norm_nome, norm_letra, shingles — a base do casamento
    d1.py                 export de tabela, sql_str, write_sql_chunks, run_wrangler
    snapshot.py           monta out/snapshot.sqlite (D1) + índice da árvore + csvmap
    findings.py           Finding, finding_id, read/write jsonl, Motivos (Counter)
    reconcile.py          Fase 0: material → arquivo local, 3 passes, relatório
    apply.py              dry-run/execute, apply_log.jsonl, --undo
    gold.py               sorteio estratificado, formulário cego, métrica por faixa
  detectors/
    __init__.py
    youtube_merge.py      Fase 1
  tests/
    test_normalize.py
    test_d1.py
    test_findings.py
    test_snapshot.py
    test_reconcile.py
    test_apply.py
    test_gold.py
    test_youtube_merge.py
  out/                    gitignored
```

Responsabilidade de cada arquivo, para não haver dúvida na hora de decidir onde algo mora:

- `paths.py` só sabe **onde as coisas estão**. Nenhuma lógica.
- `normalize.py` só sabe **transformar texto**. Sem I/O, sem banco. É por isso que é o primeiro a ser escrito: é o mais testável e já mordeu uma vez (descartar o conteúdo dos parênteses quebrou o casamento de `Quão grande amor (Vigiai)` com `Vigiai (Quão grande amor)`).
- `d1.py` só sabe **falar com o wrangler**. Não conhece finding nem detector.
- `snapshot.py` **monta o mundo** que os detectores leem, e nada mais.
- `findings.py` é o **contrato**. Não conhece nenhuma fase específica.
- `apply.py` é o **único** que escreve no acervo.
- `gold.py` é o **único** que fala com o humano.
- `detectors/*.py` só **leem** o snapshot e **emitem** findings.

---

## Task 1: Esqueleto do pacote, `paths.py` e `normalize.py`

**Files:**
- Create: `scripts/validate-acervo/.gitignore`
- Create: `scripts/validate-acervo/core/__init__.py`
- Create: `scripts/validate-acervo/detectors/__init__.py`
- Create: `scripts/validate-acervo/core/paths.py`
- Create: `scripts/validate-acervo/core/normalize.py`
- Test: `scripts/validate-acervo/tests/test_normalize.py`

**Interfaces:**
- Consumes: nada (primeira task)
- Produces:
  - `core.paths.ROOT: str` — raiz do repositório
  - `core.paths.ASSETS2: str` — `/Volumes/SSD 2TB SD/assets2`
  - `core.paths.CSV_MAP: str` — `<ASSETS2>/files_classification.csv`
  - `core.paths.OUT: str` — `<ROOT>/scripts/validate-acervo/out`
  - `core.paths.API_DIR: str` — `<ROOT>/api`
  - `core.paths.resolve(p: str) -> str` — aceita absoluto, relativo ao cwd, ou relativo à ROOT
  - `core.normalize.norm_nome(s: str | None) -> str`
  - `core.normalize.norm_letra(s: str | None) -> str`
  - `core.normalize.shingles(texto: str, k: int = 8) -> set[str]`

- [ ] **Step 1: Write the failing test**

Crie `scripts/validate-acervo/tests/test_normalize.py`:

```python
from __future__ import annotations

from core.normalize import norm_nome, norm_letra, shingles


def test_norm_nome_tira_acento_e_pontuacao():
    assert norm_nome("Regozijai-vos!") == "regozijai vos"
    assert norm_nome("Regozijai - vos") == "regozijai vos"
    assert norm_nome("Regozijai-vos -") == "regozijai vos"


def test_norm_nome_preserva_o_conteudo_dos_parenteses():
    # Descartar os parenteses fazia estes dois nao se acharem, e eles sao o
    # mesmo louvor. Foi o erro que derrubou a primeira versao do casamento.
    a = norm_nome("Quão grande amor (Vigiai)")
    b = norm_nome("Vigiai (Quão grande amor)")
    assert set(a.split()) == set(b.split())
    assert "vigiai" in a


def test_norm_nome_aceita_none_e_vazio():
    assert norm_nome(None) == ""
    assert norm_nome("") == ""
    assert norm_nome("   ") == ""


def test_norm_letra_colapsa_espaco_e_quebra_de_linha():
    letra = "Estevão avistou\n  os céus abertos;\n\nO Filho do Deus Pai!"
    assert norm_letra(letra) == "estevao avistou os ceus abertos o filho do deus pai"


def test_shingles_tem_janela_deslizante():
    assert shingles("a b c d", k=2) == {"a b", "b c", "c d"}


def test_shingles_de_texto_curto_devolve_vazio():
    # Texto menor que a janela nao produz shingle nenhum: e isso que impede
    # um louvor de duas palavras de casar com meio acervo.
    assert shingles("a b", k=8) == set()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Volumes/SSD 2TB SD/dev/coldigom/scripts/validate-acervo" && python3 -m pytest tests/test_normalize.py -v`
Expected: FAIL com `ModuleNotFoundError: No module named 'core'`

- [ ] **Step 3: Write the package skeleton**

`scripts/validate-acervo/.gitignore`:

```
out/
__pycache__/
*.pyc
.pytest_cache/
```

`scripts/validate-acervo/core/__init__.py`:

```python
"""Arnês de validação do acervo.

O detector propõe, o gabarito mede, e só `apply` escreve.
Nenhum detector toca no acervo.
"""
```

`scripts/validate-acervo/detectors/__init__.py`:

```python
"""Um detector por problema. Lê o snapshot, emite findings, não escreve nada."""
```

`scripts/validate-acervo/core/paths.py`:

```python
from __future__ import annotations

import os

# Derivado de __file__ e nunca hardcoded: o geom/ fixou o caminho absoluto e
# isso amarrou o pacote a uma máquina só.
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))

PKG = os.path.join(ROOT, "scripts", "validate-acervo")
OUT = os.path.join(PKG, "out")
API_DIR = os.path.join(ROOT, "api")

# A árvore de arquivos original que gerou a ingestão. Fora do repo, 26 GB.
ASSETS2 = os.environ.get("COLDIGOM_ASSETS2", "/Volumes/SSD 2TB SD/assets2")
CSV_MAP = os.path.join(ASSETS2, "files_classification.csv")

SNAPSHOT_DB = os.path.join(OUT, "snapshot.sqlite")


def resolve(p: str) -> str:
    """Aceita caminho absoluto, relativo ao cwd, ou relativo à raiz do repo."""
    if os.path.isabs(p):
        return p
    if os.path.exists(p):
        return os.path.abspath(p)
    return os.path.join(ROOT, p)


def ensure_out() -> str:
    os.makedirs(OUT, exist_ok=True)
    return OUT
```

`scripts/validate-acervo/core/normalize.py`:

```python
from __future__ import annotations

import re
import unicodedata

_NAO_ALFANUM = re.compile(r"[^a-z0-9\s]")


def _base(s: str | None) -> str:
    """Minúsculas, sem acento, sem pontuação, espaço colapsado."""
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return " ".join(_NAO_ALFANUM.sub(" ", s.lower()).split())


def norm_nome(s: str | None) -> str:
    """Normaliza nome de louvor.

    O conteúdo dos parênteses É PRESERVADO. Descartá-lo fazia
    'Quão grande amor (Vigiai)' e 'Vigiai (Quão grande amor)' — que são o
    mesmo louvor — não se acharem.
    """
    return _base(s)


def norm_letra(s: str | None) -> str:
    """Normaliza letra para comparação. Quebra de linha vira espaço."""
    return _base(s)


def shingles(texto: str, k: int = 8) -> set[str]:
    """Janelas deslizantes de k palavras.

    Texto menor que a janela devolve conjunto vazio de propósito: é o que
    impede um louvor de título curto de casar com meio acervo.
    """
    palavras = texto.split()
    if len(palavras) < k:
        return set()
    return {" ".join(palavras[i:i + k]) for i in range(len(palavras) - k + 1)}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Volumes/SSD 2TB SD/dev/coldigom/scripts/validate-acervo" && python3 -m pytest tests/test_normalize.py -v`
Expected: PASS — 6 passed

- [ ] **Step 5: Commit**

```bash
cd "/Volumes/SSD 2TB SD/dev/coldigom"
git add scripts/validate-acervo/
git commit -m "feat(validate-acervo): esqueleto do pacote, paths e normalização

A normalização preserva o conteúdo dos parênteses de propósito:
descartá-lo fazia 'Quão grande amor (Vigiai)' e 'Vigiai (Quão grande
amor)' não se acharem, e são o mesmo louvor."
```

---

## Task 2: `core/d1.py` — falar com o D1 pelo wrangler

**Files:**
- Create: `scripts/validate-acervo/core/d1.py`
- Test: `scripts/validate-acervo/tests/test_d1.py`

**Interfaces:**
- Consumes: `core.paths.API_DIR`, `core.paths.ensure_out`
- Produces:
  - `core.d1.sql_str(s: str | None) -> str` — literal SQL com aspas escapadas, ou `NULL`
  - `core.d1.write_sql_chunks(statements: list[str], out_dir: str, prefix: str, per_file: int = 300) -> list[str]` — devolve os caminhos escritos
  - `core.d1.export_table(tabela: str, destino: str, remote: bool = True) -> None`
  - `core.d1.run_sql_files(arquivos: list[str], remote: bool = True) -> None`
  - `core.d1.query(sql: str, remote: bool = True) -> list[dict]` — leitura pontual via `--json`

- [ ] **Step 1: Write the failing test**

Crie `scripts/validate-acervo/tests/test_d1.py`:

```python
from __future__ import annotations

import os

from core.d1 import sql_str, write_sql_chunks


def test_sql_str_escapa_aspas_simples():
    assert sql_str("Regozijai-vos") == "'Regozijai-vos'"
    assert sql_str("Ouvi, ó céus") == "'Ouvi, ó céus'"
    assert sql_str("d'água") == "'d''água'"


def test_sql_str_none_vira_null_sem_aspas():
    assert sql_str(None) == "NULL"


def test_sql_str_string_vazia_nao_vira_null():
    # Campo vazio e campo ausente sao coisas diferentes no acervo: number=''
    # existe em 484 louvores e nao e o mesmo que number IS NULL.
    assert sql_str("") == "''"


def test_write_sql_chunks_quebra_por_tamanho(tmp_path):
    stmts = [f"UPDATE praises SET name = 'n{i}' WHERE id = 'i{i}';" for i in range(7)]
    arquivos = write_sql_chunks(stmts, str(tmp_path), prefix="teste", per_file=3)
    assert len(arquivos) == 3
    assert [os.path.basename(a) for a in arquivos] == [
        "teste_000.sql", "teste_001.sql", "teste_002.sql"
    ]
    primeiro = open(arquivos[0], encoding="utf-8").read().splitlines()
    assert len(primeiro) == 3
    assert primeiro[0].startswith("UPDATE praises SET name = 'n0'")
    ultimo = open(arquivos[2], encoding="utf-8").read().splitlines()
    assert len(ultimo) == 1


def test_write_sql_chunks_lista_vazia_nao_cria_arquivo(tmp_path):
    assert write_sql_chunks([], str(tmp_path), prefix="teste") == []
    assert os.listdir(tmp_path) == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Volumes/SSD 2TB SD/dev/coldigom/scripts/validate-acervo" && python3 -m pytest tests/test_d1.py -v`
Expected: FAIL com `ModuleNotFoundError: No module named 'core.d1'`

- [ ] **Step 3: Write the implementation**

`scripts/validate-acervo/core/d1.py`:

```python
from __future__ import annotations

import json
import os
import subprocess

from core.paths import API_DIR

DB_NAME = "coldigom"


def sql_str(s: str | None) -> str:
    """Literal SQL. None vira NULL; string vazia continua string vazia.

    A distinção importa: 484 louvores têm number = '' e isso não é o mesmo
    que number IS NULL — a Fase 4 decide entre preencher e não tocar com base
    nisso.
    """
    if s is None:
        return "NULL"
    return "'" + s.replace("'", "''") + "'"


def write_sql_chunks(
    statements: list[str],
    out_dir: str,
    prefix: str,
    per_file: int = 300,
) -> list[str]:
    """Quebra os statements em arquivos .sql numerados.

    O wrangler engasga com arquivo muito grande, e arquivo menor também torna
    a retomada mais barata: um chunk que falhou é rodado de novo sozinho.
    """
    if not statements:
        return []
    os.makedirs(out_dir, exist_ok=True)
    arquivos: list[str] = []
    for i in range(0, len(statements), per_file):
        caminho = os.path.join(out_dir, f"{prefix}_{len(arquivos):03d}.sql")
        with open(caminho, "w", encoding="utf-8") as f:
            f.write("\n".join(statements[i:i + per_file]) + "\n")
        arquivos.append(caminho)
    return arquivos


def _wrangler(args: list[str]) -> subprocess.CompletedProcess:
    # cwd em api/ porque é lá que está o wrangler.toml, que é gitignored.
    return subprocess.run(
        ["wrangler", "d1", *args],
        cwd=API_DIR,
        capture_output=True,
        text=True,
        check=True,
    )


def export_table(tabela: str, destino: str, remote: bool = True) -> None:
    """Baixa uma tabela do D1 como .sql de INSERTs."""
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    args = ["export", DB_NAME, "--table", tabela, "--output", destino]
    if remote:
        args.append("--remote")
    _wrangler(args)


def run_sql_files(arquivos: list[str], remote: bool = True) -> None:
    """Executa arquivos .sql no D1, em ordem."""
    for caminho in arquivos:
        args = ["execute", DB_NAME, f"--file={caminho}"]
        if remote:
            args.append("--remote")
        print("wrangler:", os.path.basename(caminho))
        _wrangler(args)


def query(sql: str, remote: bool = True) -> list[dict]:
    """Leitura pontual. Para leitura em volume use o snapshot local."""
    args = ["execute", DB_NAME, "--json", "--command", sql]
    if remote:
        args.append("--remote")
    saida = _wrangler(args).stdout
    return json.loads(saida)[0].get("results", [])
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Volumes/SSD 2TB SD/dev/coldigom/scripts/validate-acervo" && python3 -m pytest tests/test_d1.py -v`
Expected: PASS — 5 passed

- [ ] **Step 5: Commit**

```bash
cd "/Volumes/SSD 2TB SD/dev/coldigom"
git add scripts/validate-acervo/core/d1.py scripts/validate-acervo/tests/test_d1.py
git commit -m "feat(validate-acervo): camada de acesso ao D1 pelo wrangler

Escrita é .sql gerado + subprocess com cwd em api/, seguindo o padrão de
scripts/pdf-to-chordpro/upload_raw.py. sql_str distingue NULL de string
vazia porque 484 louvores têm number = '' e isso não é ausência."
```

---

## Task 3: `core/findings.py` — o contrato

**Files:**
- Create: `scripts/validate-acervo/core/findings.py`
- Test: `scripts/validate-acervo/tests/test_findings.py`

**Interfaces:**
- Consumes: nada de tasks anteriores
- Produces:
  - `core.findings.Finding` — dataclass com campos `finding_id, run_id, detector, target_type, target_id, praise_id, action, field, current, proposed, confidence, evidence`
  - `core.findings.finding_id(detector: str, target_id: str, field: str | None) -> str` — sha1 hex, 16 chars
  - `core.findings.write_findings(findings: list[Finding], caminho: str) -> None`
  - `core.findings.read_findings(caminho: str) -> list[Finding]`
  - `core.findings.Motivos` — wrapper de `Counter` com `.excluir(motivo)` e `.tabela() -> str`
  - `core.findings.FAIXAS: tuple[str, ...]` — `("alta", "media", "baixa", "discussao")`

- [ ] **Step 1: Write the failing test**

Crie `scripts/validate-acervo/tests/test_findings.py`:

```python
from __future__ import annotations

import json
import os

from core.findings import (
    FAIXAS,
    Finding,
    Motivos,
    finding_id,
    read_findings,
    write_findings,
)


def _finding(**kw) -> Finding:
    base = dict(
        run_id="2026-09-02T00:00Z-teste",
        detector="youtube_merge",
        target_type="praise",
        target_id="p1",
        praise_id="p1",
        action="merge_praise",
        field=None,
        current=None,
        proposed="p2",
        confidence="alta",
        evidence={"motivo": "letra e nome"},
    )
    base.update(kw)
    return Finding(**base)


def test_finding_id_e_deterministico():
    a = finding_id("youtube_merge", "p1", None)
    b = finding_id("youtube_merge", "p1", None)
    assert a == b
    assert len(a) == 16


def test_finding_id_muda_com_qualquer_componente():
    base = finding_id("youtube_merge", "p1", None)
    assert finding_id("praise_dup", "p1", None) != base
    assert finding_id("youtube_merge", "p2", None) != base
    assert finding_id("youtube_merge", "p1", "lyrics") != base


def test_finding_preenche_o_id_sozinho():
    f = _finding()
    assert f.finding_id == finding_id("youtube_merge", "p1", None)


def test_roundtrip_preserva_tudo(tmp_path):
    caminho = str(tmp_path / "findings.jsonl")
    originais = [_finding(target_id="p1"), _finding(target_id="p2", confidence="media")]
    write_findings(originais, caminho)
    lidos = read_findings(caminho)
    assert [f.target_id for f in lidos] == ["p1", "p2"]
    assert [f.confidence for f in lidos] == ["alta", "media"]
    assert lidos[0].evidence == {"motivo": "letra e nome"}


def test_arquivo_escrito_e_uma_linha_por_finding_com_acento_intacto(tmp_path):
    caminho = str(tmp_path / "findings.jsonl")
    write_findings([_finding(evidence={"nota": "Regozijai-vos é o mesmo"})], caminho)
    linhas = open(caminho, encoding="utf-8").read().strip().split("\n")
    assert len(linhas) == 1
    # ensure_ascii=False: acento tem que sobreviver no arquivo, para o arquivo
    # ser legível por humano sem ferramenta.
    assert "é o mesmo" in linhas[0]
    assert json.loads(linhas[0])["detector"] == "youtube_merge"


def test_faixa_invalida_e_recusada():
    try:
        _finding(confidence="talvez")
    except ValueError as e:
        assert "talvez" in str(e)
    else:
        raise AssertionError("faixa inválida deveria ter sido recusada")


def test_faixas_conhecidas():
    assert FAIXAS == ("alta", "media", "baixa", "discussao")


def test_motivos_conta_e_tabela_mostra_o_porque():
    m = Motivos()
    m.excluir("já revisado por humano")
    m.excluir("já revisado por humano")
    m.excluir("sem arquivo local")
    tabela = m.tabela()
    assert "já revisado por humano" in tabela
    assert "2" in tabela
    assert m.total() == 3
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Volumes/SSD 2TB SD/dev/coldigom/scripts/validate-acervo" && python3 -m pytest tests/test_findings.py -v`
Expected: FAIL com `ModuleNotFoundError: No module named 'core.findings'`

- [ ] **Step 3: Write the implementation**

`scripts/validate-acervo/core/findings.py`:

```python
from __future__ import annotations

import hashlib
import json
import os
from collections import Counter
from dataclasses import asdict, dataclass, field as dc_field

FAIXAS = ("alta", "media", "baixa", "discussao")

ACOES = (
    "delete_material",
    "set_material_kind",
    "set_praise_field",
    "merge_praise",
    "set_group_id",
    "move_material",
)


def finding_id(detector: str, target_id: str, field: str | None) -> str:
    """Id determinístico: rodar o mesmo detector de novo não duplica finding."""
    chave = f"{detector}|{target_id}|{field or ''}"
    return hashlib.sha1(chave.encode("utf-8")).hexdigest()[:16]


@dataclass
class Finding:
    run_id: str
    detector: str
    target_type: str          # material | praise
    target_id: str
    action: str
    confidence: str
    evidence: dict
    praise_id: str | None = None
    field: str | None = None
    current: str | None = None
    proposed: str | None = None
    finding_id: str = dc_field(default="")

    def __post_init__(self) -> None:
        if self.confidence not in FAIXAS:
            raise ValueError(f"faixa desconhecida: {self.confidence}")
        if self.action not in ACOES:
            raise ValueError(f"ação desconhecida: {self.action}")
        if not self.finding_id:
            self.finding_id = finding_id(self.detector, self.target_id, self.field)


def write_findings(findings: list[Finding], caminho: str) -> None:
    os.makedirs(os.path.dirname(caminho) or ".", exist_ok=True)
    with open(caminho, "w", encoding="utf-8") as f:
        for x in findings:
            f.write(json.dumps(asdict(x), ensure_ascii=False) + "\n")


def read_findings(caminho: str) -> list[Finding]:
    out: list[Finding] = []
    if not os.path.exists(caminho):
        return out
    with open(caminho, encoding="utf-8") as f:
        for linha in f:
            linha = linha.strip()
            if not linha:
                continue
            out.append(Finding(**json.loads(linha)))
    return out


class Motivos:
    """Contador de exclusões, com a frase-motivo em português.

    Existe para que toda execução comece dizendo quem ficou de fora e por quê.
    Sem isso, um detector que exclui 90% do lote parece um detector que não
    achou nada.
    """

    def __init__(self) -> None:
        self._c: Counter = Counter()

    def excluir(self, motivo: str) -> None:
        self._c[motivo] += 1

    def total(self) -> int:
        return sum(self._c.values())

    def tabela(self) -> str:
        if not self._c:
            return "  (nenhuma exclusão)"
        largura = max(len(k) for k in self._c)
        return "\n".join(
            f"  {k.ljust(largura)}  {v}" for k, v in self._c.most_common()
        )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Volumes/SSD 2TB SD/dev/coldigom/scripts/validate-acervo" && python3 -m pytest tests/test_findings.py -v`
Expected: PASS — 8 passed

- [ ] **Step 5: Commit**

```bash
cd "/Volumes/SSD 2TB SD/dev/coldigom"
git add scripts/validate-acervo/core/findings.py scripts/validate-acervo/tests/test_findings.py
git commit -m "feat(validate-acervo): contrato do finding e contador de exclusões

finding_id é sha1(detector|target|field) para que rodar o mesmo detector
de novo não duplique. Motivos existe para toda execução começar dizendo
quem ficou de fora e por quê."
```

---

## Task 4: `core/snapshot.py` — o mundo que os detectores leem

**Files:**
- Create: `scripts/validate-acervo/core/snapshot.py`
- Test: `scripts/validate-acervo/tests/test_snapshot.py`

**Interfaces:**
- Consumes: `core.paths.{OUT, SNAPSHOT_DB, ASSETS2, CSV_MAP, ensure_out}`, `core.d1.export_table`
- Produces:
  - `core.snapshot.TABELAS: tuple[str, ...]` — as tabelas exportadas do D1
  - `core.snapshot.PM_SCHEMA: str` — `CREATE TABLE praise_materials (...)` escrito à mão
  - `core.snapshot.carregar_csvmap(conn, csv_path: str) -> int` — cria e popula `csvmap`, devolve nº de linhas
  - `core.snapshot.indexar_arvore(conn, raiz: str) -> int` — cria e popula `arquivos(caminho, tamanho)`, devolve nº de arquivos
  - `core.snapshot.md5(caminho: str) -> str`
  - `core.snapshot.conectar(db: str = SNAPSHOT_DB) -> sqlite3.Connection` — com `row_factory = sqlite3.Row`
  - `core.snapshot.main(argv=None) -> int`

- [ ] **Step 1: Write the failing test**

Crie `scripts/validate-acervo/tests/test_snapshot.py`:

```python
from __future__ import annotations

import hashlib
import os
import sqlite3

from core.snapshot import carregar_csvmap, conectar, indexar_arvore, md5


def _conn(tmp_path) -> sqlite3.Connection:
    return conectar(str(tmp_path / "snap.sqlite"))


def test_md5_bate_com_hashlib(tmp_path):
    p = tmp_path / "a.pdf"
    p.write_bytes(b"conteudo")
    assert md5(str(p)) == hashlib.md5(b"conteudo").hexdigest()


def test_carregar_csvmap_le_as_colunas_certas(tmp_path):
    csv_path = tmp_path / "files_classification.csv"
    csv_path.write_text(
        "file_path,material_kind,praise_tags,praise_number,praise_name,praise_id,to_convert,praise_material_id\n"
        "GLTM/Louvor/Flute.pdf,Flute,\"Avulsos,Diversos\",012,Louvor,pra-1,false,mat-1\n"
        "GLTM/Louvor/Cello.pdf,Cello,\"Avulsos\",012,Louvor,pra-1,false,mat-2\n",
        encoding="utf-8",
    )
    conn = _conn(tmp_path)
    n = carregar_csvmap(conn, str(csv_path))
    assert n == 2
    linhas = conn.execute(
        "SELECT praise_material_id, file_path, material_kind_csv, praise_id FROM csvmap ORDER BY 1"
    ).fetchall()
    assert linhas[0]["praise_material_id"] == "mat-1"
    assert linhas[0]["file_path"] == "GLTM/Louvor/Flute.pdf"
    assert linhas[0]["material_kind_csv"] == "Flute"
    assert linhas[0]["praise_id"] == "pra-1"


def test_indexar_arvore_ignora_ocultos_e_extensao_fora_da_lista(tmp_path):
    raiz = tmp_path / "assets"
    (raiz / "Louvor").mkdir(parents=True)
    (raiz / "Louvor" / "a.pdf").write_bytes(b"x" * 10)
    (raiz / "Louvor" / "b.mp3").write_bytes(b"y" * 20)
    (raiz / "Louvor" / ".DS_Store").write_bytes(b"z")
    (raiz / "Louvor" / "notas.docx").write_bytes(b"w")
    conn = _conn(tmp_path)
    n = indexar_arvore(conn, str(raiz))
    assert n == 2
    caminhos = [r["caminho"] for r in conn.execute("SELECT caminho FROM arquivos ORDER BY 1")]
    assert caminhos == ["Louvor/a.pdf", "Louvor/b.mp3"]


def test_indexar_arvore_guarda_caminho_relativo_e_tamanho(tmp_path):
    raiz = tmp_path / "assets"
    (raiz / "X").mkdir(parents=True)
    (raiz / "X" / "a.pdf").write_bytes(b"x" * 42)
    conn = _conn(tmp_path)
    indexar_arvore(conn, str(raiz))
    r = conn.execute("SELECT caminho, tamanho FROM arquivos").fetchone()
    assert r["caminho"] == "X/a.pdf"
    assert r["tamanho"] == 42


def test_conectar_devolve_linhas_acessiveis_por_nome(tmp_path):
    conn = _conn(tmp_path)
    conn.execute("CREATE TABLE t (a TEXT)")
    conn.execute("INSERT INTO t VALUES ('v')")
    assert conn.execute("SELECT a FROM t").fetchone()["a"] == "v"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Volumes/SSD 2TB SD/dev/coldigom/scripts/validate-acervo" && python3 -m pytest tests/test_snapshot.py -v`
Expected: FAIL com `ModuleNotFoundError: No module named 'core.snapshot'`

- [ ] **Step 3: Write the implementation**

`scripts/validate-acervo/core/snapshot.py`:

```python
from __future__ import annotations

import argparse
import csv
import hashlib
import os
import sqlite3
import sys

from core.d1 import export_table
from core.paths import ASSETS2, CSV_MAP, OUT, SNAPSHOT_DB, ensure_out

TABELAS = (
    "praises",
    "material_kinds",
    "material_kind_translations",
    "tags",
    "praise_tags",
    "praise_materials",
)

# O export do praise_materials sai sem schema porque a tabela é grande; o
# CREATE tem que vir à mão, na mesma ordem de colunas de api/schema.sql.
PM_SCHEMA = """
CREATE TABLE IF NOT EXISTS praise_materials (
  id TEXT PRIMARY KEY, praise_id TEXT, material_kind TEXT, type TEXT,
  r2_key TEXT, file_path_legacy TEXT, source_material_id TEXT,
  merged_from_praise_id TEXT, url TEXT, created_at TEXT,
  is_reviewed INTEGER, reviewed_at TEXT, reviewed_by TEXT
);
"""

EXTENSOES = (".pdf", ".mp3", ".mid", ".midi", ".wav", ".m4a", ".wma", ".mpeg")


def conectar(db: str = SNAPSHOT_DB) -> sqlite3.Connection:
    os.makedirs(os.path.dirname(db) or ".", exist_ok=True)
    conn = sqlite3.connect(db)
    conn.row_factory = sqlite3.Row
    return conn


def md5(caminho: str) -> str:
    h = hashlib.md5()
    with open(caminho, "rb") as f:
        while True:
            b = f.read(1 << 20)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def carregar_csvmap(conn: sqlite3.Connection, csv_path: str) -> int:
    """Carrega files_classification.csv.

    É a testemunha que liga cada material do banco ao arquivo original — mas
    NÃO é gabarito: o próprio CSV chutou o kind a partir do nome do arquivo.
    """
    conn.execute("DROP TABLE IF EXISTS csvmap")
    conn.execute(
        """CREATE TABLE csvmap (
             file_path TEXT, material_kind_csv TEXT, praise_tags TEXT,
             praise_number TEXT, praise_name TEXT, praise_id TEXT,
             to_convert TEXT, praise_material_id TEXT)"""
    )
    linhas = []
    with open(csv_path, newline="", encoding="utf-8") as f:
        for d in csv.DictReader(f):
            linhas.append((
                d.get("file_path"), d.get("material_kind"), d.get("praise_tags"),
                d.get("praise_number"), d.get("praise_name"), d.get("praise_id"),
                d.get("to_convert"), d.get("praise_material_id"),
            ))
    conn.executemany("INSERT INTO csvmap VALUES (?,?,?,?,?,?,?,?)", linhas)
    conn.execute("CREATE INDEX ix_csvmap_mid ON csvmap(praise_material_id)")
    conn.execute("CREATE INDEX ix_csvmap_path ON csvmap(file_path)")
    conn.commit()
    return len(linhas)


def indexar_arvore(conn: sqlite3.Connection, raiz: str) -> int:
    """Indexa a árvore original por caminho relativo e tamanho.

    O md5 NÃO é calculado aqui: são 26 GB. Hash só entra nos candidatos, que
    são os arquivos de mesmo tamanho.
    """
    conn.execute("DROP TABLE IF EXISTS arquivos")
    conn.execute("CREATE TABLE arquivos (caminho TEXT PRIMARY KEY, tamanho INTEGER, md5 TEXT)")
    linhas = []
    for dp, _dn, fn in os.walk(raiz):
        for nome in fn:
            if nome.startswith("."):
                continue
            if os.path.splitext(nome)[1].lower() not in EXTENSOES:
                continue
            absoluto = os.path.join(dp, nome)
            try:
                tam = os.path.getsize(absoluto)
            except OSError:
                continue
            linhas.append((os.path.relpath(absoluto, raiz), tam, None))
    conn.executemany("INSERT OR REPLACE INTO arquivos VALUES (?,?,?)", linhas)
    conn.execute("CREATE INDEX ix_arquivos_tam ON arquivos(tamanho)")
    conn.commit()
    return len(linhas)


def baixar_d1(destino_dir: str, remote: bool = True) -> None:
    for t in TABELAS:
        alvo = os.path.join(destino_dir, f"{t}.sql")
        print(f"  exportando {t}...")
        export_table(t, alvo, remote=remote)


def montar_db(dumps_dir: str, db: str) -> sqlite3.Connection:
    if os.path.exists(db):
        os.remove(db)
    conn = conectar(db)
    conn.executescript(PM_SCHEMA)
    for t in TABELAS:
        caminho = os.path.join(dumps_dir, f"{t}.sql")
        with open(caminho, encoding="utf-8") as f:
            conn.executescript(f.read())
    conn.commit()
    return conn


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--local", action="store_true", help="usa o D1 local em vez do remoto")
    ap.add_argument("--pular-download", action="store_true",
                    help="reusa os dumps já baixados em out/dumps")
    ap.add_argument("--assets2", default=ASSETS2)
    args = ap.parse_args(argv)

    ensure_out()
    dumps = os.path.join(OUT, "dumps")
    os.makedirs(dumps, exist_ok=True)

    if not args.pular_download:
        print("baixando o D1:")
        baixar_d1(dumps, remote=not args.local)

    print("montando snapshot.sqlite...")
    conn = montar_db(dumps, SNAPSHOT_DB)
    p = conn.execute("SELECT COUNT(*) n FROM praises").fetchone()["n"]
    m = conn.execute("SELECT COUNT(*) n FROM praise_materials").fetchone()["n"]
    print(f"  {p} louvores, {m} materiais")

    if os.path.exists(CSV_MAP):
        n = carregar_csvmap(conn, CSV_MAP)
        print(f"  csvmap: {n} linhas")
    else:
        print(f"  csvmap AUSENTE em {CSV_MAP} — a Fase 0 vai depender só do legacy e do hash")

    if os.path.isdir(args.assets2):
        n = indexar_arvore(conn, args.assets2)
        print(f"  árvore: {n} arquivos indexados")
    else:
        print(f"  árvore AUSENTE em {args.assets2}")

    print(f"\nsnapshot: {SNAPSHOT_DB}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Volumes/SSD 2TB SD/dev/coldigom/scripts/validate-acervo" && python3 -m pytest tests/test_snapshot.py -v`
Expected: PASS — 5 passed

- [ ] **Step 5: Rodar de verdade contra o D1 remoto**

Run: `cd "/Volumes/SSD 2TB SD/dev/coldigom/scripts/validate-acervo" && python3 -m core.snapshot`
Expected: imprime `1696 louvores, 20862 materiais`, `csvmap: 18160 linhas`, `árvore: ~18181 arquivos indexados`.

Se os números divergirem, **pare e reporte** — o acervo mudou desde a medição de 2026-09-02 e o resto do plano assume esses números.

- [ ] **Step 6: Commit**

```bash
cd "/Volumes/SSD 2TB SD/dev/coldigom"
git add scripts/validate-acervo/core/snapshot.py scripts/validate-acervo/tests/test_snapshot.py
git commit -m "feat(validate-acervo): snapshot do D1 + índice da árvore original

O md5 não é calculado no índice: são 26 GB. Hash entra só nos candidatos
de mesmo tamanho, o que reduz de 18 mil para ~8,9 mil arquivos."
```

---

## Task 5: `core/reconcile.py` — a Fase 0

**Files:**
- Create: `scripts/validate-acervo/core/reconcile.py`
- Test: `scripts/validate-acervo/tests/test_reconcile.py`

**Interfaces:**
- Consumes: `core.snapshot.conectar`, `core.paths.{OUT, SNAPSHOT_DB, ensure_out}`
- Produces:
  - `core.reconcile.reconciliar(conn) -> dict` — cria a tabela `reconciliacao` e devolve o resumo
  - `core.reconcile.RECON_SCHEMA: str`
  - `core.reconcile.main(argv=None) -> int`

A tabela `reconciliacao` é o que todas as fases seguintes leem:

```sql
CREATE TABLE reconciliacao (
  material_id TEXT PRIMARY KEY,
  praise_id   TEXT,       -- praise_id no BANCO (não o do CSV)
  type        TEXT,
  kind_id     TEXT,
  caminho     TEXT,       -- relativo a ASSETS2, ou NULL
  nome_arquivo TEXT,      -- basename sem extensão, ou NULL
  pasta       TEXT,       -- dirname, ou NULL
  tamanho     INTEGER,
  kind_csv    TEXT,
  praise_csv  TEXT,       -- praise_id segundo o CSV
  passe       TEXT        -- csv | legacy | sem_origem
);
```

- [ ] **Step 1: Write the failing test**

Crie `scripts/validate-acervo/tests/test_reconcile.py`:

```python
from __future__ import annotations

from core.reconcile import reconciliar
from core.snapshot import conectar


def _mundo(tmp_path):
    """Monta um snapshot minúsculo à mão, sem tocar no D1 nem na árvore real."""
    conn = conectar(str(tmp_path / "snap.sqlite"))
    conn.executescript(
        """
        CREATE TABLE praises (id TEXT PRIMARY KEY, name TEXT, number TEXT, author TEXT,
                              rhythm TEXT, tonality TEXT, category TEXT, lyrics TEXT,
                              group_id TEXT, created_at TEXT, updated_at TEXT);
        CREATE TABLE praise_materials (id TEXT PRIMARY KEY, praise_id TEXT, material_kind TEXT,
                              type TEXT, r2_key TEXT, file_path_legacy TEXT,
                              source_material_id TEXT, merged_from_praise_id TEXT, url TEXT,
                              created_at TEXT, is_reviewed INTEGER, reviewed_at TEXT,
                              reviewed_by TEXT);
        CREATE TABLE csvmap (file_path TEXT, material_kind_csv TEXT, praise_tags TEXT,
                              praise_number TEXT, praise_name TEXT, praise_id TEXT,
                              to_convert TEXT, praise_material_id TEXT);
        CREATE TABLE arquivos (caminho TEXT PRIMARY KEY, tamanho INTEGER, md5 TEXT);
        """
    )
    return conn


def test_passe_csv_casa_pelo_praise_material_id(tmp_path):
    conn = _mundo(tmp_path)
    conn.execute("INSERT INTO praise_materials (id, praise_id, type, material_kind) VALUES ('m1','p1','pdf','k1')")
    conn.execute("INSERT INTO csvmap (file_path, material_kind_csv, praise_id, praise_material_id) "
                 "VALUES ('GLTM/Louvor/Flute.pdf','Flute','p1','m1')")
    conn.execute("INSERT INTO arquivos VALUES ('GLTM/Louvor/Flute.pdf', 100, NULL)")
    conn.commit()
    resumo = reconciliar(conn)
    r = conn.execute("SELECT * FROM reconciliacao WHERE material_id='m1'").fetchone()
    assert r["passe"] == "csv"
    assert r["caminho"] == "GLTM/Louvor/Flute.pdf"
    assert r["nome_arquivo"] == "Flute"
    assert r["pasta"] == "GLTM/Louvor"
    assert r["kind_csv"] == "Flute"
    assert resumo["csv"] == 1


def test_passe_legacy_quando_o_csv_nao_cobre(tmp_path):
    conn = _mundo(tmp_path)
    conn.execute("INSERT INTO praise_materials (id, praise_id, type, material_kind, file_path_legacy) "
                 "VALUES ('m2','p1','pdf','k1','GLTM/Louvor/Cello.pdf')")
    conn.execute("INSERT INTO arquivos VALUES ('GLTM/Louvor/Cello.pdf', 200, NULL)")
    conn.commit()
    resumo = reconciliar(conn)
    r = conn.execute("SELECT * FROM reconciliacao WHERE material_id='m2'").fetchone()
    assert r["passe"] == "legacy"
    assert r["caminho"] == "GLTM/Louvor/Cello.pdf"
    assert resumo["legacy"] == 1


def test_material_sem_arquivo_fica_sem_origem(tmp_path):
    conn = _mundo(tmp_path)
    conn.execute("INSERT INTO praise_materials (id, praise_id, type, material_kind, url) "
                 "VALUES ('m3','p1','youtube','k1','https://youtu.be/x')")
    conn.commit()
    resumo = reconciliar(conn)
    r = conn.execute("SELECT * FROM reconciliacao WHERE material_id='m3'").fetchone()
    assert r["passe"] == "sem_origem"
    assert r["caminho"] is None
    assert resumo["sem_origem"] == 1


def test_legacy_que_aponta_arquivo_inexistente_nao_casa(tmp_path):
    # Casar com um caminho que nao existe na arvore seria pior que nao casar:
    # as fases seguintes tentariam abrir o arquivo e falhariam longe daqui.
    conn = _mundo(tmp_path)
    conn.execute("INSERT INTO praise_materials (id, praise_id, type, material_kind, file_path_legacy) "
                 "VALUES ('m4','p1','pdf','k1','GLTM/Sumiu/Viola.pdf')")
    conn.commit()
    reconciliar(conn)
    r = conn.execute("SELECT * FROM reconciliacao WHERE material_id='m4'").fetchone()
    assert r["passe"] == "sem_origem"


def test_csv_ganha_do_legacy_quando_os_dois_existem(tmp_path):
    conn = _mundo(tmp_path)
    conn.execute("INSERT INTO praise_materials (id, praise_id, type, material_kind, file_path_legacy) "
                 "VALUES ('m5','p1','pdf','k1','GLTM/Louvor/Legado.pdf')")
    conn.execute("INSERT INTO csvmap (file_path, praise_id, praise_material_id) "
                 "VALUES ('GLTM/Louvor/Csv.pdf','p1','m5')")
    conn.execute("INSERT INTO arquivos VALUES ('GLTM/Louvor/Legado.pdf', 1, NULL)")
    conn.execute("INSERT INTO arquivos VALUES ('GLTM/Louvor/Csv.pdf', 2, NULL)")
    conn.commit()
    reconciliar(conn)
    r = conn.execute("SELECT * FROM reconciliacao WHERE material_id='m5'").fetchone()
    assert r["passe"] == "csv"
    assert r["caminho"] == "GLTM/Louvor/Csv.pdf"


def test_praise_csv_guarda_o_praise_do_csv_mesmo_divergindo(tmp_path):
    # O banco manda; mas guardar a divergencia e o que permite a Fase 6 achar
    # material no louvor errado.
    conn = _mundo(tmp_path)
    conn.execute("INSERT INTO praise_materials (id, praise_id, type, material_kind) VALUES ('m6','p_banco','pdf','k1')")
    conn.execute("INSERT INTO csvmap (file_path, praise_id, praise_material_id) "
                 "VALUES ('GLTM/X/a.pdf','p_csv','m6')")
    conn.execute("INSERT INTO arquivos VALUES ('GLTM/X/a.pdf', 1, NULL)")
    conn.commit()
    reconciliar(conn)
    r = conn.execute("SELECT * FROM reconciliacao WHERE material_id='m6'").fetchone()
    assert r["praise_id"] == "p_banco"
    assert r["praise_csv"] == "p_csv"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Volumes/SSD 2TB SD/dev/coldigom/scripts/validate-acervo" && python3 -m pytest tests/test_reconcile.py -v`
Expected: FAIL com `ModuleNotFoundError: No module named 'core.reconcile'`

- [ ] **Step 3: Write the implementation**

`scripts/validate-acervo/core/reconcile.py`:

```python
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys

from core.paths import OUT, SNAPSHOT_DB, ensure_out
from core.snapshot import conectar

RECON_SCHEMA = """
DROP TABLE IF EXISTS reconciliacao;
CREATE TABLE reconciliacao (
  material_id  TEXT PRIMARY KEY,
  praise_id    TEXT,
  type         TEXT,
  kind_id      TEXT,
  caminho      TEXT,
  nome_arquivo TEXT,
  pasta        TEXT,
  tamanho      INTEGER,
  kind_csv     TEXT,
  praise_csv   TEXT,
  passe        TEXT
);
CREATE INDEX ix_recon_praise ON reconciliacao(praise_id);
CREATE INDEX ix_recon_passe ON reconciliacao(passe);
CREATE INDEX ix_recon_tam ON reconciliacao(tamanho);
"""


def reconciliar(conn: sqlite3.Connection) -> dict:
    """Liga cada material do banco ao arquivo original, em dois passes.

    Passe 1 — praise_material_id do CSV. É o mais forte: é o mesmo UUID.
    Passe 2 — file_path_legacy, quando o CSV não cobre.

    Um caminho que não existe na árvore NÃO casa: casar com arquivo ausente é
    pior que não casar, porque a falha apareceria longe daqui, dentro de outra
    fase, já fora do contexto.

    O praise_id gravado é sempre o do BANCO. O do CSV vai em praise_csv, e a
    divergência entre os dois é o que permite achar material no louvor errado.
    """
    conn.executescript(RECON_SCHEMA)

    existe = {r["caminho"] for r in conn.execute("SELECT caminho FROM arquivos")}
    tamanho = {r["caminho"]: r["tamanho"] for r in conn.execute("SELECT caminho, tamanho FROM arquivos")}

    csv_por_mid = {}
    for r in conn.execute("SELECT praise_material_id, file_path, material_kind_csv, praise_id FROM csvmap"):
        if r["praise_material_id"]:
            csv_por_mid[r["praise_material_id"]] = r

    linhas = []
    resumo = {"csv": 0, "legacy": 0, "sem_origem": 0}

    for m in conn.execute(
        "SELECT id, praise_id, type, material_kind, file_path_legacy FROM praise_materials"
    ):
        c = csv_por_mid.get(m["id"])
        caminho = None
        passe = "sem_origem"
        kind_csv = c["material_kind_csv"] if c else None
        praise_csv = c["praise_id"] if c else None

        if c and c["file_path"] in existe:
            caminho, passe = c["file_path"], "csv"
        elif m["file_path_legacy"] and m["file_path_legacy"] in existe:
            caminho, passe = m["file_path_legacy"], "legacy"

        resumo[passe] += 1
        linhas.append((
            m["id"], m["praise_id"], m["type"], m["material_kind"],
            caminho,
            os.path.splitext(os.path.basename(caminho))[0] if caminho else None,
            os.path.dirname(caminho) if caminho else None,
            tamanho.get(caminho) if caminho else None,
            kind_csv, praise_csv, passe,
        ))

    conn.executemany(
        "INSERT INTO reconciliacao VALUES (?,?,?,?,?,?,?,?,?,?,?)", linhas
    )
    conn.commit()
    resumo["total"] = len(linhas)
    return resumo


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=SNAPSHOT_DB)
    args = ap.parse_args(argv)

    ensure_out()
    conn = conectar(args.db)
    resumo = reconciliar(conn)

    # Materiais que nunca tiveram arquivo na árvore não são falha de
    # reconciliação: nasceram depois dela.
    sem_arquivo_por_natureza = conn.execute(
        "SELECT COUNT(*) n FROM praise_materials WHERE type IN ('chord','youtube','gestures')"
    ).fetchone()["n"]
    orfaos = resumo["sem_origem"] - sem_arquivo_por_natureza

    print("\nreconciliação:")
    print(f"  total de materiais           {resumo['total']}")
    print(f"  casados pelo CSV             {resumo['csv']}")
    print(f"  casados pelo legacy          {resumo['legacy']}")
    print(f"  sem origem                   {resumo['sem_origem']}")
    print(f"    dos quais chord/youtube/gestures (esperado)  {sem_arquivo_por_natureza}")
    print(f"    órfãos de verdade                            {orfaos}")

    com_arquivo = resumo["csv"] + resumo["legacy"]
    elegiveis = resumo["total"] - sem_arquivo_por_natureza
    cobertura = 100.0 * com_arquivo / elegiveis if elegiveis else 0.0
    print(f"\n  cobertura sobre os elegíveis: {cobertura:.1f}%")

    caminho = os.path.join(OUT, "reconciliacao.json")
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump({**resumo, "orfaos": orfaos, "cobertura": round(cobertura, 2)},
                  f, ensure_ascii=False, indent=1)
    print(f"  relatório: {caminho}")

    # 99% é o critério de pronto da Fase 0, fixado no spec §7.1.
    return 0 if cobertura >= 99.0 else 1


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Volumes/SSD 2TB SD/dev/coldigom/scripts/validate-acervo" && python3 -m pytest tests/test_reconcile.py -v`
Expected: PASS — 6 passed

- [ ] **Step 5: Rodar a Fase 0 de verdade**

Run: `cd "/Volumes/SSD 2TB SD/dev/coldigom/scripts/validate-acervo" && python3 -m core.reconcile`
Expected: `casados pelo CSV` ≈ 17.810, `chord/youtube/gestures` = 2.927, `órfãos de verdade` ≈ 125, e **cobertura ≥ 99%** (saída 0).

Se a cobertura ficar abaixo de 99%, **pare e reporte com o número** — não siga para a Task 6. O critério de pronto da Fase 0 é este.

- [ ] **Step 6: Commit**

```bash
cd "/Volumes/SSD 2TB SD/dev/coldigom"
git add scripts/validate-acervo/core/reconcile.py scripts/validate-acervo/tests/test_reconcile.py
git commit -m "feat(validate-acervo): Fase 0, reconciliação com a árvore original

Dois passes: praise_material_id do CSV, depois file_path_legacy. Caminho
que não existe na árvore não casa — casar com arquivo ausente faria a
falha aparecer dentro de outra fase, longe daqui.

O praise_id gravado é o do banco; o do CSV vai em praise_csv, e a
divergência entre os dois é o que acha material no louvor errado."
```

---

## Task 6: `core/apply.py` — a única porta de escrita

**Files:**
- Create: `scripts/validate-acervo/core/apply.py`
- Test: `scripts/validate-acervo/tests/test_apply.py`

**Interfaces:**
- Consumes: `core.findings.{Finding, read_findings}`, `core.d1.{sql_str, write_sql_chunks, run_sql_files}`, `core.snapshot.conectar`, `core.paths.OUT`
- Produces:
  - `core.apply.sql_para(f: Finding, conn) -> list[str]` — os statements de um finding
  - `core.apply.estado_anterior(f: Finding, conn) -> dict` — o que o log guarda para desfazer
  - `core.apply.aplicar(findings, conn, execute: bool, log_path: str, remote: bool = True) -> dict`
  - `core.apply.desfazer(run_id: str, log_path: str, execute: bool, remote: bool = True) -> dict`
  - `core.apply.main(argv=None) -> int`

**Escopo deliberado:** o P1 implementa só `merge_praise` e `set_praise_field`. As outras quatro ações levantam `NotImplementedError` com o nome da fase que as traz. Implementar as seis agora seria escrever código sem teste de aceitação — nenhum detector do P1 as emite.

- [ ] **Step 1: Write the failing test**

Crie `scripts/validate-acervo/tests/test_apply.py`:

```python
from __future__ import annotations

import json
import os

import pytest

from core.apply import aplicar, estado_anterior, sql_para
from core.findings import Finding
from core.snapshot import conectar


def _mundo(tmp_path):
    conn = conectar(str(tmp_path / "snap.sqlite"))
    conn.executescript(
        """
        CREATE TABLE praises (id TEXT PRIMARY KEY, name TEXT, number TEXT, author TEXT,
                              rhythm TEXT, tonality TEXT, category TEXT, lyrics TEXT,
                              group_id TEXT, created_at TEXT, updated_at TEXT);
        CREATE TABLE praise_materials (id TEXT PRIMARY KEY, praise_id TEXT, material_kind TEXT,
                              type TEXT, r2_key TEXT, file_path_legacy TEXT,
                              source_material_id TEXT, merged_from_praise_id TEXT, url TEXT,
                              created_at TEXT, is_reviewed INTEGER, reviewed_at TEXT,
                              reviewed_by TEXT);
        CREATE TABLE tags (id TEXT PRIMARY KEY, name TEXT, parent_id TEXT);
        CREATE TABLE praise_tags (praise_id TEXT, tag_id TEXT, PRIMARY KEY (praise_id, tag_id));
        """
    )
    conn.execute("INSERT INTO praises (id,name,lyrics) VALUES ('keeper','Medo tens',NULL)")
    conn.execute("INSERT INTO praises (id,name,lyrics) VALUES ('fonte','Medo tens','Medo tens que o tentador')")
    conn.execute("INSERT INTO praise_materials (id,praise_id,type,material_kind,url) "
                 "VALUES ('mat-yt','fonte','youtube','k-audio','https://youtu.be/x')")
    conn.execute("INSERT INTO tags VALUES ('t-av','Avulsos',NULL)")
    conn.execute("INSERT INTO praise_tags VALUES ('fonte','t-av')")
    conn.commit()
    return conn


def _merge() -> Finding:
    return Finding(
        run_id="r1", detector="youtube_merge", target_type="praise",
        target_id="fonte", praise_id="fonte", action="merge_praise",
        confidence="alta", proposed="keeper",
        evidence={"keeper": "keeper", "motivo": "letra e nome"},
    )


def test_sql_de_merge_move_material_apaga_fonte_e_marca_a_origem(tmp_path):
    conn = _mundo(tmp_path)
    stmts = sql_para(_merge(), conn)
    junto = "\n".join(stmts)
    assert "UPDATE praise_materials" in junto
    assert "merged_from_praise_id = 'fonte'" in junto
    assert "praise_id = 'keeper'" in junto
    assert "DELETE FROM praises WHERE id = 'fonte'" in junto


def test_merge_doa_letra_quando_o_keeper_esta_vazio(tmp_path):
    # D3: o keeper manda, a fonte so preenche campo vazio.
    conn = _mundo(tmp_path)
    junto = "\n".join(sql_para(_merge(), conn))
    assert "lyrics = 'Medo tens que o tentador'" in junto


def test_merge_nao_sobrescreve_campo_preenchido_do_keeper(tmp_path):
    conn = _mundo(tmp_path)
    conn.execute("UPDATE praises SET lyrics = 'letra do keeper' WHERE id='keeper'")
    conn.commit()
    junto = "\n".join(sql_para(_merge(), conn))
    assert "letra do keeper" not in junto
    assert "Medo tens que o tentador" not in junto


def test_merge_leva_as_tags_da_fonte_em_uniao(tmp_path):
    conn = _mundo(tmp_path)
    junto = "\n".join(sql_para(_merge(), conn))
    assert "INSERT OR IGNORE INTO praise_tags" in junto
    assert "'keeper', 't-av'" in junto


def test_merge_recusa_fonte_com_material_em_r2(tmp_path):
    # O SQL nao limpa o R2. Fundir algo com r2_key deixaria objeto orfao no
    # bucket, e por isso e recusado aqui em vez de silenciosamente vazar.
    conn = _mundo(tmp_path)
    conn.execute("UPDATE praise_materials SET r2_key='assets/x.pdf', url=NULL WHERE id='mat-yt'")
    conn.commit()
    with pytest.raises(ValueError, match="r2_key"):
        sql_para(_merge(), conn)


def test_acao_de_fase_futura_diz_qual_fase(tmp_path):
    conn = _mundo(tmp_path)
    f = Finding(run_id="r1", detector="material_dup", target_type="material",
                target_id="mat-yt", action="delete_material", confidence="alta",
                evidence={})
    with pytest.raises(NotImplementedError, match="Fase 3"):
        sql_para(f, conn)


def test_estado_anterior_guarda_o_suficiente_para_desfazer(tmp_path):
    conn = _mundo(tmp_path)
    antes = estado_anterior(_merge(), conn)
    assert antes["praise"]["id"] == "fonte"
    assert antes["praise"]["lyrics"] == "Medo tens que o tentador"
    assert antes["materiais"][0]["id"] == "mat-yt"
    assert antes["tags"] == ["t-av"]
    assert antes["keeper"]["id"] == "keeper"


def test_dry_run_nao_escreve_arquivo_sql_nem_log(tmp_path):
    conn = _mundo(tmp_path)
    log = str(tmp_path / "apply_log.jsonl")
    r = aplicar([_merge()], conn, execute=False, log_path=log, remote=False)
    assert r["simulado"] == 1
    assert r["aplicado"] == 0
    assert not os.path.exists(log)


def test_execute_escreve_uma_linha_de_log_por_finding(tmp_path, monkeypatch):
    conn = _mundo(tmp_path)
    executados = []
    monkeypatch.setattr("core.apply.run_sql_files", lambda arqs, remote=True: executados.extend(arqs))
    log = str(tmp_path / "apply_log.jsonl")
    r = aplicar([_merge()], conn, execute=True, log_path=log, remote=False)
    assert r["aplicado"] == 1
    assert len(executados) == 1
    linhas = open(log, encoding="utf-8").read().strip().split("\n")
    assert len(linhas) == 1
    entrada = json.loads(linhas[0])
    assert entrada["ok"] is True
    assert entrada["run_id"] == "r1"
    assert entrada["antes"]["praise"]["id"] == "fonte"


def test_rodar_de_novo_pula_o_que_ja_foi_aplicado(tmp_path, monkeypatch):
    conn = _mundo(tmp_path)
    monkeypatch.setattr("core.apply.run_sql_files", lambda arqs, remote=True: None)
    log = str(tmp_path / "apply_log.jsonl")
    aplicar([_merge()], conn, execute=True, log_path=log, remote=False)
    r = aplicar([_merge()], conn, execute=True, log_path=log, remote=False)
    assert r["aplicado"] == 0
    assert r["ja_aplicado"] == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Volumes/SSD 2TB SD/dev/coldigom/scripts/validate-acervo" && python3 -m pytest tests/test_apply.py -v`
Expected: FAIL com `ModuleNotFoundError: No module named 'core.apply'`

- [ ] **Step 3: Write the implementation**

`scripts/validate-acervo/core/apply.py`:

```python
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
import time

from core.d1 import run_sql_files, sql_str, write_sql_chunks
from core.findings import Finding, read_findings
from core.paths import OUT, SNAPSHOT_DB, ensure_out
from core.snapshot import conectar

LOG_PADRAO = os.path.join(OUT, "apply_log.jsonl")

# Campos que a fonte pode doar ao keeper numa fusão. 'name' fica de fora: o
# nome do keeper é o nome que o acervo já usa.
DOAVEIS = ("number", "author", "rhythm", "tonality", "category", "lyrics")

FASE_DA_ACAO = {
    "delete_material": "Fase 3",
    "set_material_kind": "Fase 2",
    "move_material": "Fase 3B",
    "set_group_id": "Fase 7",
}


def _vazio(v) -> bool:
    return v is None or str(v).strip() == ""


def _sql_merge(f: Finding, conn: sqlite3.Connection) -> list[str]:
    """Funde a fonte no keeper, em SQL.

    Por que SQL e não o endpoint POST /api/praises/:id/merge: aquele endpoint
    exige JWT de sessão (api/src/middleware.ts:88), e o único token que um
    script tem é o COLDIGOM_UPLOAD_TOKEN, aceito só em PUT .../content.

    O endpoint também apaga objetos órfãos do R2, coisa que SQL não faz. Por
    isso a fusão é recusada se algum material da fonte tiver r2_key: na Fase 1
    nenhum tem (os 25 são links de YouTube), e deixar isso implícito seria um
    vazamento silencioso quando outra fase reusar esta função.
    """
    fonte = f.target_id
    keeper = f.proposed
    if not keeper:
        raise ValueError("merge_praise sem keeper em 'proposed'")

    materiais = conn.execute(
        "SELECT id, r2_key FROM praise_materials WHERE praise_id = ?", (fonte,)
    ).fetchall()
    com_r2 = [m["id"] for m in materiais if not _vazio(m["r2_key"])]
    if com_r2:
        raise ValueError(
            f"fusão recusada: {len(com_r2)} material(is) da fonte têm r2_key "
            f"({com_r2[0]}...). SQL não limpa o R2 — use o endpoint com JWT."
        )

    k = conn.execute("SELECT * FROM praises WHERE id = ?", (keeper,)).fetchone()
    s = conn.execute("SELECT * FROM praises WHERE id = ?", (fonte,)).fetchone()
    if k is None or s is None:
        raise ValueError(f"louvor ausente no snapshot: keeper={keeper} fonte={fonte}")

    stmts: list[str] = []

    # D3 — o keeper manda; a fonte só preenche campo vazio.
    doacoes = {c: s[c] for c in DOAVEIS if _vazio(k[c]) and not _vazio(s[c])}
    if doacoes:
        sets = ", ".join(f"{c} = {sql_str(v)}" for c, v in doacoes.items())
        stmts.append(
            f"UPDATE praises SET {sets}, updated_at = datetime('now') "
            f"WHERE id = {sql_str(keeper)};"
        )

    # Tags em união: o keeper mantém as dele e recebe as da fonte.
    for t in conn.execute("SELECT tag_id FROM praise_tags WHERE praise_id = ?", (fonte,)):
        stmts.append(
            "INSERT OR IGNORE INTO praise_tags (praise_id, tag_id) VALUES "
            f"({sql_str(keeper)}, {sql_str(t['tag_id'])});"
        )

    for m in materiais:
        stmts.append(
            f"UPDATE praise_materials SET praise_id = {sql_str(keeper)}, "
            f"merged_from_praise_id = {sql_str(fonte)} "
            f"WHERE id = {sql_str(m['id'])} AND praise_id = {sql_str(fonte)};"
        )

    # A cascata do praise_tags da fonte é resolvida pelo ON DELETE CASCADE.
    stmts.append(f"DELETE FROM praises WHERE id = {sql_str(fonte)};")
    return stmts


def _sql_set_praise_field(f: Finding, conn: sqlite3.Connection) -> list[str]:
    if not f.field:
        raise ValueError("set_praise_field sem 'field'")
    if f.field not in DOAVEIS + ("name", "group_id"):
        raise ValueError(f"campo não permitido: {f.field}")
    return [
        f"UPDATE praises SET {f.field} = {sql_str(f.proposed)}, "
        f"updated_at = datetime('now') WHERE id = {sql_str(f.target_id)};"
    ]


def sql_para(f: Finding, conn: sqlite3.Connection) -> list[str]:
    if f.action == "merge_praise":
        return _sql_merge(f, conn)
    if f.action == "set_praise_field":
        return _sql_set_praise_field(f, conn)
    fase = FASE_DA_ACAO.get(f.action, "uma fase futura")
    raise NotImplementedError(
        f"ação '{f.action}' chega com a {fase}; o P1 implementa só "
        f"merge_praise e set_praise_field"
    )


def estado_anterior(f: Finding, conn: sqlite3.Connection) -> dict:
    """Tudo que é preciso para reconstituir o que a escrita desfez."""
    def linha(r) -> dict | None:
        return dict(r) if r is not None else None

    antes: dict = {
        "praise": linha(conn.execute(
            "SELECT * FROM praises WHERE id = ?", (f.target_id,)).fetchone()),
        "materiais": [dict(r) for r in conn.execute(
            "SELECT * FROM praise_materials WHERE praise_id = ?", (f.target_id,))],
        "tags": [r["tag_id"] for r in conn.execute(
            "SELECT tag_id FROM praise_tags WHERE praise_id = ?", (f.target_id,))],
    }
    if f.action == "merge_praise" and f.proposed:
        antes["keeper"] = linha(conn.execute(
            "SELECT * FROM praises WHERE id = ?", (f.proposed,)).fetchone())
        antes["keeper_tags"] = [r["tag_id"] for r in conn.execute(
            "SELECT tag_id FROM praise_tags WHERE praise_id = ?", (f.proposed,))]
    return antes


def _ja_aplicados(log_path: str) -> set[str]:
    """Só finding_id com ok:true conta como aplicado.

    Falha é reenviada de propósito: a retomada tem que consertar o que quebrou,
    não pular por cima dele.
    """
    feitos: set[str] = set()
    if not os.path.exists(log_path):
        return feitos
    with open(log_path, encoding="utf-8") as f:
        for linha in f:
            linha = linha.strip()
            if not linha:
                continue
            try:
                r = json.loads(linha)
            except json.JSONDecodeError:
                continue
            if r.get("ok") and r.get("finding_id"):
                feitos.add(r["finding_id"])
    return feitos


def aplicar(
    findings: list[Finding],
    conn: sqlite3.Connection,
    execute: bool,
    log_path: str = LOG_PADRAO,
    remote: bool = True,
) -> dict:
    feitos = _ja_aplicados(log_path)
    fila = [f for f in findings if f.finding_id not in feitos]
    resumo = {
        "recebidos": len(findings),
        "ja_aplicado": len(findings) - len(fila),
        "simulado": 0,
        "aplicado": 0,
        "falhou": 0,
    }

    if not execute:
        # Portão da simulação: nada é escrito, e nenhuma credencial é lida.
        # O SQL é gerado assim mesmo, para o dry-run mostrar o payload real.
        for f in fila:
            try:
                stmts = sql_para(f, conn)
            except (ValueError, NotImplementedError) as e:
                print(f"  RECUSADO {f.finding_id} ({f.action}): {e}")
                resumo["falhou"] += 1
                continue
            resumo["simulado"] += 1
            if resumo["simulado"] <= 3:
                print(f"\n--- exemplo: {f.detector} / {f.target_id} ({f.confidence}) ---")
                for s in stmts:
                    print("   ", s)
        return resumo

    os.makedirs(os.path.dirname(log_path) or ".", exist_ok=True)
    with open(log_path, "a", encoding="utf-8") as log:
        for f in fila:
            entrada = {
                "finding_id": f.finding_id, "run_id": f.run_id,
                "detector": f.detector, "action": f.action,
                "target_id": f.target_id, "ts": time.time(),
            }
            try:
                antes = estado_anterior(f, conn)
                stmts = sql_para(f, conn)
                arquivos = write_sql_chunks(
                    stmts, os.path.join(OUT, "sql", f.run_id),
                    prefix=f.finding_id, per_file=300,
                )
                run_sql_files(arquivos, remote=remote)
                entrada["antes"] = antes
                entrada["statements"] = len(stmts)
                entrada["ok"] = True
                resumo["aplicado"] += 1
            except Exception as e:
                entrada["ok"] = False
                entrada["erro"] = f"{type(e).__name__}: {e}"
                resumo["falhou"] += 1
            log.write(json.dumps(entrada, ensure_ascii=False) + "\n")
            log.flush()
    return resumo


def desfazer(run_id: str, log_path: str, execute: bool, remote: bool = True) -> dict:
    """Reconstitui o estado anterior das escritas de um run_id.

    Reinsere o louvor apagado, devolve os materiais e repõe as tags. Não
    restaura arquivo do R2 — nenhuma ação do P1 toca no R2, por construção.
    """
    entradas = []
    with open(log_path, encoding="utf-8") as f:
        for linha in f:
            linha = linha.strip()
            if not linha:
                continue
            r = json.loads(linha)
            if r.get("ok") and r.get("run_id") == run_id:
                entradas.append(r)

    stmts: list[str] = []
    for r in reversed(entradas):
        antes = r.get("antes") or {}
        p = antes.get("praise")
        if p:
            cols = ", ".join(p.keys())
            vals = ", ".join(sql_str(v) if not isinstance(v, int) else str(v) for v in p.values())
            stmts.append(f"INSERT OR REPLACE INTO praises ({cols}) VALUES ({vals});")
        for m in antes.get("materiais", []):
            stmts.append(
                f"UPDATE praise_materials SET praise_id = {sql_str(m['praise_id'])}, "
                f"merged_from_praise_id = NULL WHERE id = {sql_str(m['id'])};"
            )
        for t in antes.get("tags", []):
            stmts.append(
                "INSERT OR IGNORE INTO praise_tags (praise_id, tag_id) VALUES "
                f"({sql_str(p['id'] if p else '')}, {sql_str(t)});"
            )

    print(f"desfazer {run_id}: {len(entradas)} escritas, {len(stmts)} statements")
    if not execute:
        for s in stmts[:10]:
            print("   ", s)
        return {"entradas": len(entradas), "statements": len(stmts), "executado": False}

    arquivos = write_sql_chunks(stmts, os.path.join(OUT, "sql", f"undo-{run_id}"),
                               prefix="undo", per_file=300)
    run_sql_files(arquivos, remote=remote)
    return {"entradas": len(entradas), "statements": len(stmts), "executado": True}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="src", nargs="+", help="arquivos findings.jsonl")
    ap.add_argument("--execute", action="store_true")
    ap.add_argument("--undo", dest="undo", default="", help="run_id a desfazer")
    ap.add_argument("--faixa", default="alta",
                    help="só aplica esta faixa; 'todas' ignora o filtro")
    ap.add_argument("--log", default=LOG_PADRAO)
    ap.add_argument("--db", default=SNAPSHOT_DB)
    ap.add_argument("--local", action="store_true")
    args = ap.parse_args(argv)

    ensure_out()
    remote = not args.local

    if args.undo:
        desfazer(args.undo, args.log, args.execute, remote=remote)
        return 0

    if not args.src:
        print("faltou --from <findings.jsonl>", file=sys.stderr)
        return 2

    findings: list[Finding] = []
    for caminho in args.src:
        findings.extend(read_findings(caminho))
    if args.faixa != "todas":
        findings = [f for f in findings if f.confidence == args.faixa]

    conn = conectar(args.db)
    modo = "APLICANDO" if args.execute else "SIMULAÇÃO — nada será escrito"
    print(f"{modo}: {len(findings)} findings na faixa '{args.faixa}'")
    resumo = aplicar(findings, conn, args.execute, args.log, remote=remote)
    print(f"\n{resumo}")
    return 1 if resumo["falhou"] else 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Volumes/SSD 2TB SD/dev/coldigom/scripts/validate-acervo" && python3 -m pytest tests/test_apply.py -v`
Expected: PASS — 10 passed

- [ ] **Step 5: Commit**

```bash
cd "/Volumes/SSD 2TB SD/dev/coldigom"
git add scripts/validate-acervo/core/apply.py scripts/validate-acervo/tests/test_apply.py
git commit -m "feat(validate-acervo): aplicação reversível, dry-run por padrão

Escreve por SQL e não pelo endpoint de merge porque aquele exige JWT de
sessão e um script só tem o COLDIGOM_UPLOAD_TOKEN, aceito apenas em
PUT .../content.

O endpoint também limpa órfãos do R2, coisa que SQL não faz — por isso a
fusão é recusada quando algum material da fonte tem r2_key. Na Fase 1
nenhum tem, mas deixar implícito viraria vazamento silencioso na
primeira fase que reusasse a função."
```

---

## Task 7: `core/gold.py` — gabarito cego e métrica

**Files:**
- Create: `scripts/validate-acervo/core/gold.py`
- Test: `scripts/validate-acervo/tests/test_gold.py`

**Interfaces:**
- Consumes: `core.findings.{Finding, read_findings, FAIXAS}`, `core.paths.OUT`
- Produces:
  - `core.gold.sortear(findings, n: int, seed: int = 42) -> list[Finding]` — estratificado por faixa
  - `core.gold.escrever_formulario(alvos: list[dict], caminho: str) -> None` — TSV que o dono preenche
  - `core.gold.ler_gabarito(caminho: str) -> dict[str, str]` — `target_id -> veredito`
  - `core.gold.medir(gabarito: dict[str, str], findings: list[Finding]) -> dict` — precisão por faixa
  - `core.gold.main(argv=None) -> int`

**O formulário é cego por construção:** ele lista o alvo e a evidência bruta (nome, letra, URL), e **nunca** a proposta do detector. A coluna `veredito` chega vazia.

**Nota sobre `sortear()`:** a Fase 1 **não** o exercita — são 25 casos e o dono rotula todos. Ele é construído aqui mesmo assim porque é o mecanismo do portão de promoção do spec (§5.2), que as Fases 2, 3 e seguintes usam com lotes de milhares. Fica testado e pronto, sem consumidor no P1.

- [ ] **Step 1: Write the failing test**

Crie `scripts/validate-acervo/tests/test_gold.py`:

```python
from __future__ import annotations

from core.findings import Finding
from core.gold import escrever_formulario, ler_gabarito, medir, sortear


def _f(tid: str, faixa: str, proposto: str) -> Finding:
    return Finding(
        run_id="r1", detector="youtube_merge", target_type="praise",
        target_id=tid, action="merge_praise", confidence=faixa,
        proposed=proposto, evidence={},
    )


def test_sorteio_e_estratificado_por_faixa():
    fs = ([_f(f"a{i}", "alta", "k") for i in range(10)]
          + [_f(f"m{i}", "media", "k") for i in range(10)]
          + [_f(f"b{i}", "baixa", "k") for i in range(10)])
    amostra = sortear(fs, n=9, seed=42)
    por_faixa = {}
    for f in amostra:
        por_faixa[f.confidence] = por_faixa.get(f.confidence, 0) + 1
    assert por_faixa == {"alta": 3, "media": 3, "baixa": 3}


def test_sorteio_e_reprodutivel_com_a_mesma_semente():
    fs = [_f(f"a{i}", "alta", "k") for i in range(20)]
    a = [f.target_id for f in sortear(fs, n=5, seed=42)]
    b = [f.target_id for f in sortear(fs, n=5, seed=42)]
    c = [f.target_id for f in sortear(fs, n=5, seed=7)]
    assert a == b
    assert a != c


def test_sorteio_pede_mais_do_que_existe_devolve_tudo():
    fs = [_f("a1", "alta", "k"), _f("m1", "media", "k")]
    assert len(sortear(fs, n=50, seed=42)) == 2


def test_formulario_nao_vaza_a_proposta_do_detector(tmp_path):
    # O gabarito so vale se o dono decidir sem ver a resposta. Se a proposta
    # aparecer no formulario, a medicao vira concordancia, nao precisao.
    caminho = str(tmp_path / "gold.tsv")
    escrever_formulario([{
        "target_id": "fonte-1",
        "nome": "Medo tens",
        "letra": "Medo tens que o tentador te va vencer",
        "url": "https://youtu.be/x",
    }], caminho)
    texto = open(caminho, encoding="utf-8").read()
    assert "veredito" in texto.splitlines()[0]
    assert "Medo tens" in texto
    assert "keeper" not in texto
    assert "proposed" not in texto


def test_ler_gabarito_ignora_linha_em_branco_e_cabecalho(tmp_path):
    caminho = str(tmp_path / "gold.tsv")
    open(caminho, "w", encoding="utf-8").write(
        "target_id\tnome\tletra\turl\tveredito\n"
        "fonte-1\tMedo tens\t...\t...\tkeeper-1\n"
        "fonte-2\tGadareno\t...\t...\t\n"
        "\n"
    )
    g = ler_gabarito(caminho)
    assert g == {"fonte-1": "keeper-1"}


def test_medir_calcula_precisao_por_faixa():
    gabarito = {"a1": "k1", "a2": "k2", "m1": "k9"}
    findings = [_f("a1", "alta", "k1"), _f("a2", "alta", "k_errado"), _f("m1", "media", "k9")]
    r = medir(gabarito, findings)
    assert r["alta"]["acertos"] == 1
    assert r["alta"]["total"] == 2
    assert r["alta"]["precisao"] == 50.0
    assert r["media"]["precisao"] == 100.0


def test_medir_conta_alvo_que_o_dono_disse_nenhum_e_o_detector_propos():
    # O pior erro possivel: propor fusao onde o dono disse que nao ha alvo.
    gabarito = {"a1": "NENHUM"}
    r = medir(gabarito, [_f("a1", "alta", "k1")])
    assert r["alta"]["acertos"] == 0
    assert r["alta"]["falso_positivo"] == 1


def test_medir_ignora_finding_que_nao_esta_no_gabarito():
    r = medir({"a1": "k1"}, [_f("a1", "alta", "k1"), _f("zz", "alta", "k2")])
    assert r["alta"]["total"] == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Volumes/SSD 2TB SD/dev/coldigom/scripts/validate-acervo" && python3 -m pytest tests/test_gold.py -v`
Expected: FAIL com `ModuleNotFoundError: No module named 'core.gold'`

- [ ] **Step 3: Write the implementation**

`scripts/validate-acervo/core/gold.py`:

```python
from __future__ import annotations

import argparse
import csv
import json
import os
import random
import sys

from core.findings import FAIXAS, Finding, read_findings
from core.paths import OUT, ensure_out

COLUNAS = ("target_id", "nome", "letra", "url", "veredito")

NENHUM = "NENHUM"


def sortear(findings: list[Finding], n: int, seed: int = 42) -> list[Finding]:
    """Amostra estratificada por faixa, reprodutível pela semente.

    Estratificar importa porque as faixas têm tamanhos muito diferentes: uma
    amostra uniforme de 50 sobre um lote onde a faixa alta tem 5 casos não
    mede a faixa alta.
    """
    por_faixa: dict[str, list[Finding]] = {f: [] for f in FAIXAS}
    for x in findings:
        por_faixa[x.confidence].append(x)
    presentes = [f for f in FAIXAS if por_faixa[f]]
    if not presentes:
        return []

    rnd = random.Random(seed)
    cota = max(1, n // len(presentes))
    out: list[Finding] = []
    for faixa in presentes:
        pool = sorted(por_faixa[faixa], key=lambda x: x.finding_id)
        rnd.shuffle(pool)
        out.extend(pool[:cota])
    return out


def escrever_formulario(alvos: list[dict], caminho: str) -> None:
    """TSV para o dono preencher.

    Contém o alvo e a evidência bruta, NUNCA a proposta do detector. Se a
    proposta aparecesse aqui, o que a medição capturaria seria concordância,
    não precisão — e concordar com uma resposta pronta é mais fácil que
    produzi-la.
    """
    os.makedirs(os.path.dirname(caminho) or ".", exist_ok=True)
    with open(caminho, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=COLUNAS, delimiter="\t",
                           extrasaction="ignore", lineterminator="\n")
        w.writeheader()
        for a in alvos:
            linha = {c: (a.get(c) or "") for c in COLUNAS}
            linha["letra"] = " ".join(str(linha["letra"]).split())[:200]
            linha["veredito"] = ""
            w.writerow(linha)


def ler_gabarito(caminho: str) -> dict[str, str]:
    """target_id → veredito. Linha sem veredito é 'ainda não decidida'."""
    out: dict[str, str] = {}
    with open(caminho, newline="", encoding="utf-8") as f:
        for linha in csv.DictReader(f, delimiter="\t"):
            tid = (linha.get("target_id") or "").strip()
            v = (linha.get("veredito") or "").strip()
            if tid and v:
                out[tid] = v
    return out


def medir(gabarito: dict[str, str], findings: list[Finding]) -> dict:
    """Precisão por faixa, contando o falso positivo separado.

    Falso positivo é propor uma ação onde o dono disse NENHUM — na Fase 1 é
    propor fundir dois louvores que não são o mesmo, que é o erro destrutivo
    que o portão existe para barrar.
    """
    r: dict[str, dict] = {
        faixa: {"total": 0, "acertos": 0, "erros": 0, "falso_positivo": 0, "precisao": 0.0}
        for faixa in FAIXAS
    }
    for f in findings:
        esperado = gabarito.get(f.target_id)
        if esperado is None:
            continue
        b = r[f.confidence]
        b["total"] += 1
        if esperado == NENHUM:
            b["falso_positivo"] += 1
            b["erros"] += 1
        elif esperado == f.proposed:
            b["acertos"] += 1
        else:
            b["erros"] += 1
    for b in r.values():
        b["precisao"] = round(100.0 * b["acertos"] / b["total"], 1) if b["total"] else 0.0
    return r


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="src", nargs="+", required=True)
    ap.add_argument("--gabarito", default="", help="TSV preenchido; sem ele, só mede o que houver")
    args = ap.parse_args(argv)

    ensure_out()
    findings: list[Finding] = []
    for c in args.src:
        findings.extend(read_findings(c))

    if not args.gabarito:
        print("nenhum gabarito informado — nada a medir")
        return 2

    gabarito = ler_gabarito(args.gabarito)
    r = medir(gabarito, findings)
    print(f"\ngabarito: {len(gabarito)} vereditos")
    print(f"{'faixa':12} {'total':>6} {'acertos':>8} {'erros':>6} {'falso+':>7} {'precisão':>9}")
    for faixa in FAIXAS:
        b = r[faixa]
        if not b["total"]:
            continue
        print(f"{faixa:12} {b['total']:6} {b['acertos']:8} {b['erros']:6} "
              f"{b['falso_positivo']:7} {b['precisao']:8.1f}%")

    caminho = os.path.join(OUT, "metrica.json")
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(r, f, ensure_ascii=False, indent=1)
    print(f"\nmétrica: {caminho}")

    # Portão da Fase 1 (desvio deliberado de D10, registrado no plano): a
    # faixa alta tem 5 casos, então o critério é zero erro, não >=98%.
    alta = r["alta"]
    return 0 if alta["erros"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Volumes/SSD 2TB SD/dev/coldigom/scripts/validate-acervo" && python3 -m pytest tests/test_gold.py -v`
Expected: PASS — 8 passed

- [ ] **Step 5: Commit**

```bash
cd "/Volumes/SSD 2TB SD/dev/coldigom"
git add scripts/validate-acervo/core/gold.py scripts/validate-acervo/tests/test_gold.py
git commit -m "feat(validate-acervo): gabarito cego e métrica por faixa

O formulário mostra o alvo e a evidência bruta, nunca a proposta do
detector. Com a proposta à vista, a medição capturaria concordância em
vez de precisão — concordar com resposta pronta é mais fácil que
produzi-la."
```

---

## Task 8: `detectors/youtube_merge.py` — a Fase 1

**Files:**
- Create: `scripts/validate-acervo/detectors/youtube_merge.py`
- Test: `scripts/validate-acervo/tests/test_youtube_merge.py`

**Interfaces:**
- Consumes: `core.normalize.{norm_nome, norm_letra, shingles}`, `core.findings.{Finding, Motivos, write_findings}`, `core.snapshot.conectar`, `core.gold.escrever_formulario`, `core.paths.{OUT, SNAPSHOT_DB}`
- Produces:
  - `detectors.youtube_merge.SHINGLE: int` — 8
  - `detectors.youtube_merge.so_youtube(conn) -> list[sqlite3.Row]`
  - `detectors.youtube_merge.candidatos(conn) -> list[sqlite3.Row]`
  - `detectors.youtube_merge.detectar(conn, run_id: str) -> tuple[list[Finding], Motivos, list[dict]]` — findings, exclusões, e os alvos para o formulário de gabarito
  - `detectors.youtube_merge.main(argv=None) -> int`

**As regras, todas fixadas no spec:**
- alta = letra **e** nome apontam o **mesmo** alvo, e é **um só** (D2)
- média = só letra, ou só nome, ou mais de um alvo
- nenhum candidato = **não emite finding**; entra no formulário e no `Motivos` como "sem candidato — precisa de olho humano"

- [ ] **Step 1: Write the failing test**

Crie `scripts/validate-acervo/tests/test_youtube_merge.py`:

```python
from __future__ import annotations

from core.snapshot import conectar
from detectors.youtube_merge import detectar


def _mundo(tmp_path):
    conn = conectar(str(tmp_path / "snap.sqlite"))
    conn.executescript(
        """
        CREATE TABLE praises (id TEXT PRIMARY KEY, name TEXT, number TEXT, author TEXT,
                              rhythm TEXT, tonality TEXT, category TEXT, lyrics TEXT,
                              group_id TEXT, created_at TEXT, updated_at TEXT);
        CREATE TABLE praise_materials (id TEXT PRIMARY KEY, praise_id TEXT, material_kind TEXT,
                              type TEXT, r2_key TEXT, file_path_legacy TEXT,
                              source_material_id TEXT, merged_from_praise_id TEXT, url TEXT,
                              created_at TEXT, is_reviewed INTEGER, reviewed_at TEXT,
                              reviewed_by TEXT);
        """
    )
    return conn


def _so_yt(conn, pid, nome, letra=None):
    conn.execute("INSERT INTO praises (id,name,lyrics) VALUES (?,?,?)", (pid, nome, letra))
    conn.execute(
        "INSERT INTO praise_materials (id,praise_id,type,material_kind,url) VALUES (?,?,?,?,?)",
        (f"mat-{pid}", pid, "youtube", "k-audio", f"https://youtu.be/{pid}"),
    )


def _acervo(conn, pid, nome, letra=None):
    conn.execute("INSERT INTO praises (id,name,lyrics) VALUES (?,?,?)", (pid, nome, letra))
    conn.execute(
        "INSERT INTO praise_materials (id,praise_id,type,material_kind,r2_key) VALUES (?,?,?,?,?)",
        (f"mat-{pid}", pid, "pdf", "k-part", f"assets/{pid}.pdf"),
    )


LETRA = ("Medo tens que o tentador te va vencer nesta batalha "
         "mas o Senhor esta contigo e nao ha de te esquecer jamais")


def test_letra_e_nome_no_mesmo_alvo_e_faixa_alta(tmp_path):
    conn = _mundo(tmp_path)
    _so_yt(conn, "yt1", "Medo tens", LETRA)
    _acervo(conn, "ac1", "Medo tens", LETRA)
    conn.commit()
    findings, _motivos, _alvos = detectar(conn, run_id="r1")
    assert len(findings) == 1
    f = findings[0]
    assert f.confidence == "alta"
    assert f.action == "merge_praise"
    assert f.target_id == "yt1"
    assert f.proposed == "ac1"
    assert "letra" in f.evidence and "nome" in f.evidence


def test_so_nome_e_faixa_media(tmp_path):
    conn = _mundo(tmp_path)
    _so_yt(conn, "yt1", "O amor de Deus é grande", None)
    _acervo(conn, "ac1", "O amor de Deus e grande", "letra diferente qualquer coisa aqui agora")
    conn.commit()
    findings, _m, _a = detectar(conn, run_id="r1")
    assert len(findings) == 1
    assert findings[0].confidence == "media"
    assert findings[0].proposed == "ac1"


def test_so_letra_e_faixa_media(tmp_path):
    conn = _mundo(tmp_path)
    _so_yt(conn, "yt1", "Salmo 130", LETRA)
    _acervo(conn, "ac1", "Das profundezas clamo a ti", LETRA)
    conn.commit()
    findings, _m, _a = detectar(conn, run_id="r1")
    assert len(findings) == 1
    assert findings[0].confidence == "media"


def test_dois_alvos_pela_letra_desce_para_media(tmp_path):
    # Ambiguidade nunca e alta: e exatamente onde a fusao erraria.
    conn = _mundo(tmp_path)
    _so_yt(conn, "yt1", "Medo tens", LETRA)
    _acervo(conn, "ac1", "Medo tens", LETRA)
    _acervo(conn, "ac2", "Medo tens", LETRA)
    conn.commit()
    findings, _m, _a = detectar(conn, run_id="r1")
    assert all(f.confidence == "media" for f in findings)
    assert {f.proposed for f in findings} == {"ac1", "ac2"}


def test_sem_candidato_nao_emite_finding_mas_entra_no_formulario(tmp_path):
    conn = _mundo(tmp_path)
    _so_yt(conn, "yt1", "Gadareno", None)
    _acervo(conn, "ac1", "Outro louvor sem relacao nenhuma", "texto totalmente diferente disso")
    conn.commit()
    findings, motivos, alvos = detectar(conn, run_id="r1")
    assert findings == []
    assert "sem candidato" in motivos.tabela()
    assert [a["target_id"] for a in alvos] == ["yt1"]


def test_louvor_com_pdf_nao_e_so_youtube(tmp_path):
    conn = _mundo(tmp_path)
    _acervo(conn, "ac1", "Medo tens", LETRA)
    conn.execute(
        "INSERT INTO praise_materials (id,praise_id,type,material_kind,url) VALUES "
        "('m9','ac1','youtube','k-audio','https://youtu.be/z')"
    )
    conn.commit()
    _f, _m, alvos = detectar(conn, run_id="r1")
    assert alvos == []


def test_o_alvo_do_formulario_traz_evidencia_bruta_e_nao_a_proposta(tmp_path):
    conn = _mundo(tmp_path)
    _so_yt(conn, "yt1", "Medo tens", LETRA)
    _acervo(conn, "ac1", "Medo tens", LETRA)
    conn.commit()
    _f, _m, alvos = detectar(conn, run_id="r1")
    a = alvos[0]
    assert a["target_id"] == "yt1"
    assert a["nome"] == "Medo tens"
    assert a["url"].startswith("https://youtu.be/")
    assert "proposed" not in a
    assert "keeper" not in a


def test_finding_id_e_estavel_entre_execucoes(tmp_path):
    conn = _mundo(tmp_path)
    _so_yt(conn, "yt1", "Medo tens", LETRA)
    _acervo(conn, "ac1", "Medo tens", LETRA)
    conn.commit()
    a, _m, _x = detectar(conn, run_id="r1")
    b, _m2, _x2 = detectar(conn, run_id="r2")
    assert a[0].finding_id == b[0].finding_id
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Volumes/SSD 2TB SD/dev/coldigom/scripts/validate-acervo" && python3 -m pytest tests/test_youtube_merge.py -v`
Expected: FAIL com `ModuleNotFoundError: No module named 'detectors.youtube_merge'`

- [ ] **Step 3: Write the implementation**

`scripts/validate-acervo/detectors/youtube_merge.py`:

```python
from __future__ import annotations

import argparse
import os
import sqlite3
import sys
import time

from core.findings import Finding, Motivos, write_findings
from core.gold import escrever_formulario
from core.normalize import norm_letra, norm_nome, shingles
from core.paths import OUT, SNAPSHOT_DB, ensure_out
from core.snapshot import conectar

DETECTOR = "youtube_merge"

# Janela do shingle. 8 palavras é longo o bastante para um trecho de letra ser
# específico de um louvor, e curto o bastante para sobreviver a diferença de
# pontuação e de quebra de verso entre duas transcrições da mesma letra.
SHINGLE = 8

# Nome curto casa por acidente. 'Fé' está dentro de dezenas de títulos.
NOME_MINIMO = 8


def so_youtube(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    """Louvores que têm material e cujo único type é youtube."""
    return conn.execute(
        """SELECT p.id, p.name, p.lyrics,
                  (SELECT m.url FROM praise_materials m
                    WHERE m.praise_id = p.id LIMIT 1) AS url
             FROM praises p
            WHERE EXISTS (SELECT 1 FROM praise_materials m WHERE m.praise_id = p.id)
              AND NOT EXISTS (SELECT 1 FROM praise_materials m
                               WHERE m.praise_id = p.id AND m.type <> 'youtube')
            ORDER BY p.name"""
    ).fetchall()


def candidatos(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    """Todo louvor que NÃO é só-YouTube é candidato a keeper."""
    return conn.execute(
        """SELECT p.id, p.name, p.lyrics FROM praises p
            WHERE EXISTS (SELECT 1 FROM praise_materials m
                           WHERE m.praise_id = p.id AND m.type <> 'youtube')"""
    ).fetchall()


def detectar(conn: sqlite3.Connection, run_id: str):
    fontes = so_youtube(conn)
    alvos_possiveis = candidatos(conn)

    nome_de = {c["id"]: norm_nome(c["name"]) for c in alvos_possiveis}
    sh_de = {}
    for c in alvos_possiveis:
        s = shingles(norm_letra(c["lyrics"]), SHINGLE)
        if s:
            sh_de[c["id"]] = s

    findings: list[Finding] = []
    motivos = Motivos()
    formulario: list[dict] = []

    for fonte in fontes:
        formulario.append({
            "target_id": fonte["id"],
            "nome": fonte["name"],
            "letra": fonte["lyrics"] or "",
            "url": fonte["url"] or "",
        })

        n = norm_nome(fonte["name"])
        s = shingles(norm_letra(fonte["lyrics"]), SHINGLE)

        por_letra = {cid for cid, sh in sh_de.items() if s and (s & sh)}
        por_nome = {
            cid for cid, cn in nome_de.items()
            if cn and (cn == n or (len(cn) >= NOME_MINIMO and (cn in n or n in cn)))
        }

        ambos = por_letra & por_nome
        if len(ambos) == 1:
            # D2: letra manda, nome confirma. Um alvo só, as duas testemunhas
            # de acordo — é a única configuração que funde sozinha.
            alvo = next(iter(ambos))
            findings.append(_finding(run_id, fonte, alvo, "alta",
                                     {"letra": True, "nome": True}))
            continue

        uniao = por_letra | por_nome
        if not uniao:
            # Sem candidato NÃO quer dizer louvor novo. 'Qual suspira a corça
            # inquieta' é hino clássico e pode estar no acervo com outro
            # título. Reportar e parar aqui é a resposta certa.
            motivos.excluir("sem candidato — precisa de olho humano")
            continue

        for alvo in sorted(uniao):
            findings.append(_finding(run_id, fonte, alvo, "media", {
                "letra": alvo in por_letra,
                "nome": alvo in por_nome,
                "candidatos": len(uniao),
            }))

    return findings, motivos, formulario


def _finding(run_id: str, fonte: sqlite3.Row, alvo: str, faixa: str, ev: dict) -> Finding:
    return Finding(
        run_id=run_id,
        detector=DETECTOR,
        target_type="praise",
        target_id=fonte["id"],
        praise_id=fonte["id"],
        action="merge_praise",
        confidence=faixa,
        proposed=alvo,
        # O 'field' entra no finding_id: sem ele, dois candidatos do mesmo
        # louvor colidiriam no mesmo id e um sumiria.
        field=f"keeper:{alvo}",
        evidence={**ev, "nome_fonte": fonte["name"], "url": fonte["url"]},
    )


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=SNAPSHOT_DB)
    ap.add_argument("--out", default=os.path.join(OUT, "youtube_merge"))
    args = ap.parse_args(argv)

    ensure_out()
    os.makedirs(args.out, exist_ok=True)
    run_id = time.strftime("%Y-%m-%dT%H%MZ-") + DETECTOR

    conn = conectar(args.db)
    findings, motivos, formulario = detectar(conn, run_id)

    print(f"\n{DETECTOR} — {len(formulario)} louvores só-YouTube")
    print("exclusões:")
    print(motivos.tabela())

    por_faixa: dict[str, int] = {}
    for f in findings:
        por_faixa[f.confidence] = por_faixa.get(f.confidence, 0) + 1
    print("\nfindings por faixa:")
    for faixa, n in sorted(por_faixa.items()):
        print(f"  {faixa:12} {n}")

    fj = os.path.join(args.out, "findings.jsonl")
    write_findings(findings, fj)
    print(f"\nfindings: {fj}")

    form = os.path.join(args.out, "gabarito.tsv")
    escrever_formulario(formulario, form)
    print(f"formulário de gabarito (preencher a coluna 'veredito'): {form}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Volumes/SSD 2TB SD/dev/coldigom/scripts/validate-acervo" && python3 -m pytest tests/test_youtube_merge.py -v`
Expected: PASS — 8 passed

- [ ] **Step 5: Rodar contra o acervo real e conferir os números**

Run: `cd "/Volumes/SSD 2TB SD/dev/coldigom/scripts/validate-acervo" && python3 -m detectors.youtube_merge`

Expected, medido em 2026-09-02 sobre os 25 reais:
- `25 louvores só-YouTube`
- exclusões: `sem candidato — precisa de olho humano  8`
- findings: `alta 5`, `media` entre 12 e 20 (mais de um candidato gera mais de um finding)

Se `alta` não for 5, **pare e reporte a diferença** antes de aplicar qualquer coisa.

- [ ] **Step 6: Simular a aplicação da faixa alta**

Run: `cd "/Volumes/SSD 2TB SD/dev/coldigom/scripts/validate-acervo" && python3 -m core.apply --from out/youtube_merge/findings.jsonl --faixa alta`

Expected: `SIMULAÇÃO — nada será escrito: 5 findings na faixa 'alta'`, com 3 exemplos de SQL impressos e `{'recebidos': 5, ..., 'simulado': 5, 'aplicado': 0, 'falhou': 0}`. Nenhum arquivo `.sql` executado, nenhum log criado.

- [ ] **Step 7: Commit**

```bash
cd "/Volumes/SSD 2TB SD/dev/coldigom"
git add scripts/validate-acervo/detectors/youtube_merge.py scripts/validate-acervo/tests/test_youtube_merge.py
git commit -m "feat(validate-acervo): Fase 1, detector dos louvores só-YouTube

Alta exige letra E nome no mesmo alvo, e um alvo só — ambiguidade nunca
é alta, porque é exatamente onde a fusão erraria.

Sem candidato não emite finding: 'Qual suspira a corça inquieta' é hino
clássico e pode estar no acervo com outro título. Reportar e parar é a
resposta certa."
```

---

## Task 9: README e a rodada de gabarito

**Files:**
- Create: `scripts/validate-acervo/README.md`
- Modify: nenhum código

**Interfaces:**
- Consumes: tudo das Tasks 1-8
- Produces: nada de código; produz o gabarito preenchido e a métrica da Fase 1

- [ ] **Step 1: Write the README**

`scripts/validate-acervo/README.md`:

````markdown
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
````

- [ ] **Step 2: Rodar a suíte inteira**

Run: `cd "/Volumes/SSD 2TB SD/dev/coldigom/scripts/validate-acervo" && python3 -m pytest tests/ -v`
Expected: PASS — **56 passed** (normalize 6, d1 5, findings 8, snapshot 5, reconcile 6, apply 10, gold 8, youtube_merge 8)

- [ ] **Step 3: Commit**

```bash
cd "/Volumes/SSD 2TB SD/dev/coldigom"
git add scripts/validate-acervo/README.md
git commit -m "docs(validate-acervo): README com os comandos e as regras não óbvias"
```

- [ ] **Step 4: Entregar o formulário de gabarito ao dono e PARAR**

Este passo não é código. Apresente ao dono:

- `out/youtube_merge/gabarito.tsv` — 25 linhas, coluna `veredito` vazia
- A instrução: para cada linha, escrever na coluna `veredito` **o id do louvor
  do acervo que é o mesmo** — o id aparece na URL do Coldigom, em
  `/praise/<id>` — ou a palavra `NENHUM` se não houver nenhum.
  Tem que ser o id, não o nome: `medir()` compara o veredito com o
  `proposed` do finding, que é um id. Nome não casaria.
- O aviso de que o arquivo **não contém** a proposta do detector, de propósito

**Não aplique nada antes do gabarito voltar preenchido.** O portão da Fase 1 é
zero erro na faixa alta, e ele não pode ser avaliado sem o gabarito.

- [ ] **Step 5: Medir, e só então aplicar**

Depois que o gabarito voltar:

```bash
cd "/Volumes/SSD 2TB SD/dev/coldigom/scripts/validate-acervo"
python3 -m core.gold --from out/youtube_merge/findings.jsonl \
                     --gabarito out/youtube_merge/gabarito.tsv
```

- Saída 0 (zero erro na faixa alta) → aplique com
  `python3 -m core.apply --from out/youtube_merge/findings.jsonl --faixa alta --execute`
- Saída 1 (houve erro na faixa alta) → **não aplique**. Reporte o caso que
  errou, e a correção da regra vira uma task nova.

Os findings de faixa **média** ficam parados em `findings.jsonl` ao fim do P1,
de propósito: a fila de revisão no web é o P2. Não os aplique à mão — o que o
gabarito medir sobre eles é o dado que dimensiona a tela do P2.

Em ambos os casos, reporte a tabela de precisão por faixa — ela é o primeiro
número real do arnês e é o que autoriza (ou não) as fases seguintes.

---

## Definition of Done do P1

- [ ] `python3 -m pytest tests/ -v` passa inteiro
- [ ] `python3 -m core.snapshot` reproduz 1.696 louvores e 20.862 materiais
- [ ] `python3 -m core.reconcile` reporta **cobertura ≥ 99%** sobre os elegíveis
- [ ] `python3 -m detectors.youtube_merge` produz 5 findings de faixa alta
- [ ] O gabarito dos 25 está preenchido pelo dono
- [ ] `python3 -m core.gold` reporta a precisão por faixa
- [ ] A faixa alta foi aplicada **ou** o motivo de não aplicar está registrado
- [ ] O log de aplicação permite `--undo` da corrida
