# Migração PLPCG — Fase C (apply das decisões) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `python3 -m core.plpcg_apply` lê `gabaritos/plpcg_crosswalk/decisoes.jsonl` + o `findings.jsonl` da rodada 1 e escreve no coldigom (D1 + R2) as quatro ações do spec §7 — `link_plpcg`, `import_plpcg_material`, `replace_plpcg_material`, `create_praise_plpcg` — simulando por padrão, com `.sql` em `out/sql/<run_id>/`, log com estado anterior e `--undo <run_id>`.

**Architecture:** Um módulo novo, `core/plpcg_apply.py`, separado do `core/apply.py` da Fase 1 (que é finding-driven e só faz `merge_praise`): aqui a entrada são decisões humanas por `pdf_id`, e a escrita tem um lado fora do SQL (upload no R2) que precisa entrar no log e no undo. Três camadas puras e testáveis sem rede — **plano** (decisões + findings + snapshot → lista de `Op`), **SQL** (`Op` + ids gerados → statements) — e uma camada de **execução** que só fala com o mundo por quatro funções injetáveis (`query`, `run_sql_files`, `r2_put`, `r2_delete`), todas do `core/d1.py`, todas via `wrangler` (mesma autenticação que o resto do arnês; nada de credencial S3 em variável de ambiente). Simulação não chama nenhuma das quatro.

**Tech Stack:** Python 3.11 stdlib (json, sqlite3, uuid, hashlib, subprocess), pytest; `wrangler` 4.x para D1 e R2 (`wrangler r2 object put|delete coldigom-assets/<key> --remote`).

**Spec:** `docs/superpowers/specs/2026-09-15-migracao-plpcg-design.md` — §3 (D4, D9, D10, D11), §6 (tipos de decisão), §7 (as ações, pré-condições, regras de leitura), §8.1 (tabela `plpcg_crosswalk`), §9 (ordem dentro de C), §12.

## Global Constraints

- Tudo vive em `scripts/validate-acervo/`; **nada** em `api/` ou `web/` (D11). Comandos rodam com `cd scripts/validate-acervo`.
- Só stdlib + pytest (padrão do arnês). Sem boto3.
- Simulação (sem `--execute`) **não lê credencial nem toca rede**: nenhuma chamada a `query`, `run_sql_files`, `r2_put`, `r2_delete`.
- `--execute` exige `--tipo` explícito (`link` | `importar` | `substituir` | `criar`); a ordem do spec §9 é link → importar/substituir → criar, com `python3 -m core.snapshot` entre um tipo e outro.
- Cada `--execute` é um `run_id` (`<UTC>-plpcg_apply-<tipo>`), grava em `out/plpcg_apply_log.jsonl` **e** copia as linhas do run para `gabaritos/plpcg_crosswalk/execucao/<run_id>.jsonl` (git; `out/` é git-ignored e já morreu com um worktree).
- Regras de leitura do spec §7, copiadas: *alta sem decisão = `link`*; *`nao_levar`/`descartar` = nenhuma escrita, mas a `pdf_id` fica no log como decidida-sem-escrita*; *`junto_com` resolvido em cadeia até uma entrada com `praise_id` ou `criar`; ciclo ou ponta solta = recusa*; *`criar` repetido para o mesmo nome normalizado = um praise só*; *kind = campo `kind` da decisão*; *`is_reviewed = 0`* (D4).
- Pré-condições (recusa em vez de escrever): `praise_id`/`material_id` ainda existem em produção; `pdf_id` ainda não está em `plpcg_crosswalk`; para importar, o sha256 do PDF local confere com `evidence.sha256` do finding; para criar, nenhum praise com o mesmo `norm_nome` **e** mesma tag-base existe em produção.
- `r2_key` de material novo: `assets/praises/<praise_id>/<material_id>.pdf`; objeto no bucket `coldigom-assets` em `storage/<r2_key>` (é o que `api/src/driveImport.ts:104-105` faz).
- Colunas exatas (snapshot `.schema`): `praises(id, name, number)`; `praise_materials(id, praise_id, material_kind, type, r2_key, file_path_legacy, source_material_id, merged_from_praise_id, url, is_reviewed)`; `praise_tags(praise_id, tag_id)`; `plpcg_crosswalk(pdf_id, short_id, group_id, praise_id, praise_material_id, evidencia, confianca, decidido_por, run_id)`.
- Undo nunca apaga objeto R2 que **não** foi criado pelo run; no `substituir` o objeto antigo fica (spec §7).

---

## Arquivos

| arquivo | responsabilidade |
|---|---|
| `core/d1.py` (modificar) | `BUCKET`, `r2_put(key, arquivo, content_type)`, `r2_delete(key)` — o único lugar que chama `wrangler r2` |
| `core/plpcg_apply.py` (criar) | `Op`/`Plano`, `montar_plano`, `sql_op`, `executar`, `desfazer`, `main` |
| `tests/test_plpcg_apply.py` (criar) | fixture `mundo` (snapshot + findings + decisões em tmp), testes por camada, execução com stubs |
| `README.md` (modificar) | seção "Migração PLPCG": os comandos da Fase C, o log, o undo |
| `gabaritos/plpcg_crosswalk/execucao/.gitkeep` (criar) | destino das cópias por run |

Interfaces entre tarefas (o implementador de uma tarefa só vê a dela):

```python
# core/plpcg_apply.py
@dataclass
class Entrada:            # um PDF do PLPCG dentro de uma Op
    pdf_id: str; short_id: str; group_id: str; path: str; sha256: str
    kind: str | None      # nome do material_kind (decisão ou KIND_PADRAO)
    arquivo: str | None   # caminho local (None = recusa)
    evidencia: str        # "num+slug+hash" | "site:adicionar" …

@dataclass
class Op:
    op_id: str            # sha256(tipo + pdf_ids ordenados)[:16] — estável entre runs
    tipo: str             # "link" | "importar" | "substituir" | "criar" | "nada"
    entradas: list[Entrada]
    praise_id: str | None = None      # existente (link/importar/substituir)
    material_id: str | None = None    # link: o material que já é o arquivo; substituir: o que sai
    nome: str | None = None           # criar
    numero: str | None = None         # criar
    tags: list[str] = field(default_factory=list)   # criar, nomes de tag
    confianca: str = "humano"         # "alta" (detector) | "humano"
    decidido_por: str = "jairo"       # "detector" | "jairo"
    motivo: str | None = None         # nada: nao_levar/descartar

@dataclass
class Plano:
    ops: list[Op]
    recusas: list[dict]   # {"pdf_id", "short_id", "motivo"}
    def por_tipo(self, tipo: str) -> list[Op]

def montar_plano(decisoes: dict[str, dict], findings: list[dict], conn: sqlite3.Connection,
                 plpcjf: str, baixados: str) -> Plano
def sql_op(op: Op, ids: dict, kinds: dict[str, str], tags: dict[str, str], run_id: str) -> list[str]
    # ids = {"praise_id": str | None, "material_ids": {pdf_id: str}}
def executar(plano: Plano, tipo: str, execute: bool, run_id: str, log_path: str, conn, remote=True,
             sql_dir=None, execucao_dir=None, novo_id=lambda: str(uuid.uuid4())) -> dict
def desfazer(run_id: str, log_path: str, remote=True, sql_dir=None, execucao_dir=None) -> dict

# core/d1.py
BUCKET = "coldigom-assets"
def r2_put(key: str, arquivo: str, content_type: str = "application/pdf") -> None
def r2_delete(key: str) -> None
```

---

### Task 1: `r2_put` / `r2_delete` no `core/d1.py`

**Files:**
- Modify: `scripts/validate-acervo/core/d1.py`
- Test: `scripts/validate-acervo/tests/test_d1_r2.py`

**Interfaces:**
- Produces: `BUCKET = "coldigom-assets"`, `r2_put(key, arquivo, content_type="application/pdf") -> None`, `r2_delete(key) -> None`. Ambas chamam `subprocess.run(["wrangler", "r2", "object", ...], cwd=API_DIR, capture_output=True, text=True, check=True)`. `key` é a chave **dentro** do bucket já com o prefixo `storage/` (`storage/assets/praises/<p>/<m>.pdf`).

- [ ] **Step 1: Write the failing test**

```python
# tests/test_d1_r2.py
from __future__ import annotations

import subprocess

import pytest

from core import d1


def test_r2_put_e_delete_chamam_wrangler_r2_object(monkeypatch, tmp_path):
    chamadas = []

    def falso_run(args, **kw):
        chamadas.append((args, kw.get("cwd"), kw.get("check")))
        return subprocess.CompletedProcess(args, 0, "", "")

    monkeypatch.setattr(d1.subprocess, "run", falso_run)
    pdf = tmp_path / "x.pdf"
    pdf.write_bytes(b"%PDF")
    d1.r2_put("storage/assets/praises/p/m.pdf", str(pdf))
    d1.r2_delete("storage/assets/praises/p/m.pdf")
    assert chamadas[0][0] == ["wrangler", "r2", "object", "put", "coldigom-assets/storage/assets/praises/p/m.pdf",
                              "--file", str(pdf), "--content-type", "application/pdf", "--remote"]
    assert chamadas[1][0] == ["wrangler", "r2", "object", "delete", "coldigom-assets/storage/assets/praises/p/m.pdf", "--remote"]
    assert all(c[1] == d1.API_DIR and c[2] is True for c in chamadas)


def test_r2_put_recusa_arquivo_inexistente(monkeypatch, tmp_path):
    monkeypatch.setattr(d1.subprocess, "run", lambda *a, **k: pytest.fail("não devia chamar wrangler"))
    with pytest.raises(FileNotFoundError):
        d1.r2_put("storage/x.pdf", str(tmp_path / "nao-existe.pdf"))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts/validate-acervo && python3 -m pytest tests/test_d1_r2.py -v`
Expected: FAIL — `AttributeError: module 'core.d1' has no attribute 'r2_put'`

- [ ] **Step 3: Write minimal implementation**

Acrescentar ao fim de `core/d1.py`:

```python
BUCKET = "coldigom-assets"  # api/wrangler.toml [[r2_buckets]] bucket_name


def _wrangler_r2(args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["wrangler", "r2", "object", *args],
        cwd=API_DIR,
        capture_output=True,
        text=True,
        check=True,
    )


def r2_put(key: str, arquivo: str, content_type: str = "application/pdf") -> None:
    """Sobe um arquivo para o bucket do coldigom. `key` já traz o prefixo
    `storage/` (é como o app grava: storage/assets/praises/<praise>/<material>.pdf).
    Mesma autenticação do D1 — o wrangler logado — nada de chave S3 em env."""
    if not os.path.isfile(arquivo):
        raise FileNotFoundError(arquivo)
    _wrangler_r2(["put", f"{BUCKET}/{key}", "--file", arquivo, "--content-type", content_type, "--remote"])


def r2_delete(key: str) -> None:
    _wrangler_r2(["delete", f"{BUCKET}/{key}", "--remote"])
```

(`import os` já existe no topo do módulo? Verificar; se não, acrescentar `import os`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts/validate-acervo && python3 -m pytest tests/test_d1_r2.py -v`
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add scripts/validate-acervo/core/d1.py scripts/validate-acervo/tests/test_d1_r2.py
git commit -m "feat(validate-acervo): core.d1 ganha r2_put/r2_delete via wrangler r2 object (bucket coldigom-assets)"
```

---

### Task 2: `montar_plano` — decisões + findings + snapshot → `Op`s

**Files:**
- Create: `scripts/validate-acervo/core/plpcg_apply.py`
- Test: `scripts/validate-acervo/tests/test_plpcg_apply.py`

**Interfaces:**
- Consumes: `revisao.decisoes.ler(caminho) -> dict[pdf_id, dict]` (última decisão), `revisao.decisoes.KIND_PADRAO`, `core.normalize.norm_nome`, `core.plpcg.arquivo_local(path, plpcjf, baixados)`, `detectors.plpcg_crosswalk.tags_propostas(classificacao)`, `numero_int`.
- Produces: `Entrada`, `Op`, `Plano`, `montar_plano(...)` como no bloco de interfaces acima. Ordem de `plano.ops`: `link` (detector primeiro, por `short_id`), depois `importar`, `substituir`, `criar` (por `nome`), depois `nada`.

Regras (do spec §7, aqui viram código):

1. Findings `target_type == "plpcg"` indexados por `target_id`. Grupos (`plpcg_grupo`) são ignorados: a decisão é por entrada.
2. Para cada finding: `d = decisoes.get(pdf_id)`.
   - Sem `d` ou `d["tipo"] is None`: se `faixa == "alta"` e `evidence.material_id` → `link` com `confianca="alta"`, `decidido_por="detector"`, `evidencia="+".join(evidencias)`. Senão → recusa `"sem decisão"`.
   - `link` → `Op(link, praise_id=d.praise_id, material_id=d.material_id)`. Recusa se o material não existe no snapshot ou não é daquele praise.
   - `adicionar` → `importar` com `praise_id` (direto ou via `junto_com`).
   - `substituir` → `substituir` com `praise_id`, `material_id` (o que sai).
   - `criar` → agrupado por `norm_nome(d.nome or evidence.nome)`: uma `Op(criar)` por nome, `entradas` = todas as decisões `criar` com esse nome **mais** as `adicionar` cujo `junto_com` resolve para uma delas. `nome` = `d.nome` da primeira (ordem por `short_id`), `numero` = `evidence.numero` se `classificacao` começa com "Coletânea" e o número é dígito, senão `""`; `tags` = `tags_propostas(classificacao)` da primeira entrada.
   - `nao_levar` / `descartar` → `Op(nada, motivo=tipo)`.
3. `junto_com`: seguir `decisoes[junto_com]` até achar `praise_id` (→ `importar` nesse praise) ou `tipo == "criar"` (→ entra na `Op(criar)` daquele nome). Mais de 20 saltos ou volta a uma `pdf_id` já vista = recusa `"junto_com em ciclo"`; alvo sem decisão/praise = recusa `"junto_com sem destino"`.
4. `Entrada.arquivo = arquivo_local(evidence.path, plpcjf, baixados)`; se `None` **e** a Op escreve arquivo (importar/substituir/criar) → recusa `"PDF não está no disco"`. `link` e `nada` não precisam do arquivo.
5. `Entrada.kind = d.kind or KIND_PADRAO[categoria]`; recusa se o nome não existe em `material_kinds` do snapshot.
6. `op_id = hashlib.sha256((tipo + "|" + "|".join(sorted(pdf_ids))).encode()).hexdigest()[:16]`.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_plpcg_apply.py
from __future__ import annotations

import json
import sqlite3

import pytest

from core import plpcg_apply as pa
from revisao import decisoes as dec


def _finding(short, faixa, nome, path, categoria="Cifra", numero="", classificacao="Avulsos Diversos",
             praise_id=None, material_id=None, evid=("nome",), sha="s"):
    return {
        "run_id": "r1", "detector": "plpcg_crosswalk", "target_type": "plpcg", "target_id": "pdf-" + short,
        "action": "link_plpcg", "confidence": faixa, "praise_id": praise_id,
        "evidence": {"faixa": faixa, "evidencias": list(evid), "nome": nome, "numero": numero,
                     "classificacao": classificacao, "categoria": categoria, "group_id": "avulso:" + short,
                     "short_id": short, "path": path, "sha256": sha, "kind_esperado": "Chord Chart",
                     "kind_coldigom": None, "material_id": material_id, "nota": "", "candidatos": [], "checksum": "c"},
        "field": None, "current": None, "proposed": None, "finding_id": "f" + short,
    }


@pytest.fixture
def mundo(tmp_path):
    db = tmp_path / "snapshot.sqlite"
    conn = sqlite3.connect(db)
    conn.row_factory = sqlite3.Row
    conn.executescript("""
        CREATE TABLE praises (id TEXT PRIMARY KEY, name TEXT, number TEXT);
        CREATE TABLE praise_materials (id TEXT PRIMARY KEY, praise_id TEXT, material_kind TEXT, type TEXT,
            r2_key TEXT, file_path_legacy TEXT, source_material_id TEXT, merged_from_praise_id TEXT, url TEXT,
            is_reviewed INTEGER DEFAULT 0);
        CREATE TABLE material_kinds (id TEXT PRIMARY KEY, name TEXT);
        CREATE TABLE tags (id TEXT PRIMARY KEY, name TEXT, parent_id TEXT);
        CREATE TABLE praise_tags (praise_id TEXT, tag_id TEXT);
        INSERT INTO material_kinds VALUES ('k-choir', 'Choir'), ('k-cc', 'Chord Chart'), ('k-cc1', 'Chord Chart I');
        INSERT INTO praises VALUES ('p1', 'Aleluia', '001'), ('p2', 'Gadareno', '');
        INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES
            ('m1', 'p1', 'k-cc1', 'pdf', 'assets/praises/p1/m1.pdf'),
            ('m2', 'p1', 'k-choir', 'pdf', 'assets/praises/p1/m2.pdf');
        INSERT INTO tags VALUES ('t-col', 'Coletânea', NULL), ('t-avu', 'Avulsos', NULL), ('t-pes', 'PES', NULL);
        INSERT INTO praise_tags VALUES ('p1', 't-col');
    """)
    conn.commit()
    plpcjf = tmp_path / "plpcjf"
    for p in ("ColAdultos/001/Cifra I.pdf", "Avulsos/a.pdf", "Avulsos/b.pdf", "Avulsos/c.pdf", "Avulsos/d.pdf"):
        (plpcjf / p).parent.mkdir(parents=True, exist_ok=True)
        (plpcjf / p).write_bytes(b"%PDF " + p.encode())
    findings = [
        _finding("0001", "alta", "Aleluia", "ColAdultos/001/Cifra I.pdf", "Cifra nível I", "001", "Coletânea Adultos",
                 praise_id="p1", material_id="m1", evid=("num", "slug", "hash")),
        _finding("0002", "media", "Aleluia", "Avulsos/a.pdf", "Partitura", praise_id="p1", evid=("nome",)),
        _finding("0003", "sem_louvor", "A palavra de poder", "Avulsos/b.pdf", "Cifra"),
        _finding("0004", "sem_louvor", "A Palavra de Poder", "Avulsos/c.pdf", "Partitura"),
        _finding("0005", "sem_louvor", "Lixo", "Avulsos/d.pdf", "Cifra"),
        _finding("0006", "sem_louvor", "Sem arquivo", "Avulsos/nao-existe.pdf", "Cifra"),
        _finding("0007", "alta", "Aleluia II", "Avulsos/zz.pdf", "Cifra", praise_id="p1", material_id="m1", evid=("hash",)),
    ]
    decisoes = {
        "pdf-0002": {"pdf_id": "pdf-0002", "tipo": "substituir", "praise_id": "p1", "material_id": "m2", "kind": "Choir"},
        "pdf-0003": {"pdf_id": "pdf-0003", "tipo": "criar", "nome": "A palavra de poder", "kind": "Chord Chart"},
        "pdf-0004": {"pdf_id": "pdf-0004", "tipo": "adicionar", "kind": "Choir", "junto_com": "pdf-0003"},
        "pdf-0005": {"pdf_id": "pdf-0005", "tipo": "descartar"},
        "pdf-0006": {"pdf_id": "pdf-0006", "tipo": "criar", "nome": "Sem arquivo", "kind": "Chord Chart"},
    }
    return {"conn": conn, "findings": findings, "decisoes": decisoes, "plpcjf": str(plpcjf),
            "baixados": str(tmp_path / "baixados"), "tmp": tmp_path}


def test_plano_alta_sem_decisao_vira_link_do_detector(mundo):
    plano = pa.montar_plano(mundo["decisoes"], mundo["findings"], mundo["conn"], mundo["plpcjf"], mundo["baixados"])
    links = plano.por_tipo("link")
    assert [(o.entradas[0].short_id, o.praise_id, o.material_id, o.confianca, o.decidido_por) for o in links] == [
        ("0001", "p1", "m1", "alta", "detector"), ("0007", "p1", "m1", "alta", "detector")]
    assert links[0].entradas[0].evidencia == "num+slug+hash"
    assert links[1].entradas[0].arquivo is None  # link não precisa do PDF no disco


def test_plano_substituir_e_nada(mundo):
    plano = pa.montar_plano(mundo["decisoes"], mundo["findings"], mundo["conn"], mundo["plpcjf"], mundo["baixados"])
    (s,) = plano.por_tipo("substituir")
    assert (s.praise_id, s.material_id, s.entradas[0].kind, s.entradas[0].evidencia) == ("p1", "m2", "Choir", "site:substituir")
    assert s.entradas[0].arquivo.endswith("Avulsos/a.pdf")
    (n,) = plano.por_tipo("nada")
    assert (n.entradas[0].short_id, n.motivo) == ("0005", "descartar")


def test_plano_criar_agrupa_por_nome_e_resolve_junto_com(mundo):
    plano = pa.montar_plano(mundo["decisoes"], mundo["findings"], mundo["conn"], mundo["plpcjf"], mundo["baixados"])
    (c,) = plano.por_tipo("criar")
    assert c.nome == "A palavra de poder" and c.numero == "" and c.tags == ["Avulsos"]
    assert [(e.short_id, e.kind) for e in c.entradas] == [("0003", "Chord Chart"), ("0004", "Choir")]
    assert c.op_id == pa.op_id("criar", ["pdf-0003", "pdf-0004"])


def test_plano_recusa_pdf_ausente_e_junto_com_solto(mundo):
    d = dict(mundo["decisoes"])
    d["pdf-0004"] = {"pdf_id": "pdf-0004", "tipo": "adicionar", "kind": "Choir", "junto_com": "pdf-0005"}
    d["pdf-0005"] = {"pdf_id": "pdf-0005", "tipo": "adicionar", "kind": "Chord Chart", "junto_com": "pdf-0004"}
    plano = pa.montar_plano(d, mundo["findings"], mundo["conn"], mundo["plpcjf"], mundo["baixados"])
    motivos = {r["short_id"]: r["motivo"] for r in plano.recusas}
    assert "ciclo" in motivos["0004"] and "ciclo" in motivos["0005"]
    assert motivos["0006"].startswith("PDF não está no disco")          # criar sem o PDF
    assert [e.short_id for e in plano.por_tipo("criar")[0].entradas] == ["0003"]
    d["pdf-0005"] = {"pdf_id": "pdf-0005", "tipo": "adicionar", "kind": "Chord Chart", "junto_com": "pdf-0006"}
    d["pdf-0004"] = {"pdf_id": "pdf-0004", "tipo": "adicionar", "kind": "Choir", "junto_com": "pdf-0003"}
    plano = pa.montar_plano(d, mundo["findings"], mundo["conn"], mundo["plpcjf"], mundo["baixados"])
    assert {r["short_id"]: r["motivo"] for r in plano.recusas}["0005"] == "junto_com aponta para um 'criar' que foi recusado"


def test_plano_recusa_kind_desconhecido_e_material_de_outro_praise(mundo):
    d = dict(mundo["decisoes"])
    d["pdf-0002"] = {"pdf_id": "pdf-0002", "tipo": "adicionar", "praise_id": "p1", "kind": "Banjo"}
    d["pdf-0001"] = {"pdf_id": "pdf-0001", "tipo": "link", "praise_id": "p2", "material_id": "m1"}
    plano = pa.montar_plano(d, mundo["findings"], mundo["conn"], mundo["plpcjf"], mundo["baixados"])
    motivos = {r["short_id"]: r["motivo"] for r in plano.recusas}
    assert "Banjo" in motivos["0002"] and "m1" in motivos["0001"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd scripts/validate-acervo && python3 -m pytest tests/test_plpcg_apply.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'core.plpcg_apply'`

- [ ] **Step 3: Write the implementation**

```python
# core/plpcg_apply.py
"""Fase C da migração PLPCG (spec §7): escreve no coldigom o que o dono
decidiu no site (`gabaritos/plpcg_crosswalk/decisoes.jsonl`).

    python3 -m core.plpcg_apply                      # simula tudo: plano, recusas, exemplos de SQL
    python3 -m core.plpcg_apply --tipo link --execute
    python3 -m core.plpcg_apply --undo <run_id>

Separado do core.apply da Fase 1 de propósito: lá a entrada é finding e a
escrita é só SQL; aqui a entrada é decisão humana por pdf_id e a escrita tem
um lado no R2 que precisa entrar no log e no undo. As três camadas — plano,
SQL, execução — são puras até a última, que só fala com o mundo por
query/run_sql_files/r2_put/r2_delete (core.d1), todas via wrangler.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sqlite3
import sys
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone

from core.d1 import query, r2_delete, r2_put, run_sql_files, sql_str, write_sql_chunks
from core.normalize import norm_nome
from core.paths import OUT, PKG, PLPCG_BAIXADOS, PLPCJF_ASSETS, SNAPSHOT_DB
from core.plpcg import arquivo_local, sha256_arquivo
from core.snapshot import conectar
from detectors.plpcg_crosswalk import tags_propostas
from revisao import decisoes as dec

LOG_PADRAO = os.path.join(OUT, "plpcg_apply_log.jsonl")
EXECUCAO_PADRAO = os.path.join(PKG, "gabaritos", "plpcg_crosswalk", "execucao")
DECISOES_PADRAO = os.path.join(PKG, "gabaritos", "plpcg_crosswalk", "decisoes.jsonl")
FINDINGS_PADRAO = os.path.join(PKG, "gabaritos", "plpcg_crosswalk", "rodada1", "findings.jsonl")

TIPOS = ("link", "importar", "substituir", "criar")   # os que escrevem, na ordem do spec §9
ORDEM = {"link": 0, "importar": 1, "substituir": 2, "criar": 3, "nada": 4}
MAX_SALTOS = 20


@dataclass
class Entrada:
    pdf_id: str
    short_id: str
    group_id: str
    path: str
    sha256: str
    kind: str | None
    arquivo: str | None
    evidencia: str


@dataclass
class Op:
    op_id: str
    tipo: str
    entradas: list[Entrada]
    praise_id: str | None = None
    material_id: str | None = None
    nome: str | None = None
    numero: str | None = None
    tags: list[str] = field(default_factory=list)
    confianca: str = "humano"
    decidido_por: str = "jairo"
    motivo: str | None = None

    @property
    def pdf_ids(self) -> list[str]:
        return [e.pdf_id for e in self.entradas]


@dataclass
class Plano:
    ops: list[Op]
    recusas: list[dict]

    def por_tipo(self, tipo: str) -> list[Op]:
        return [o for o in self.ops if o.tipo == tipo]


def op_id(tipo: str, pdf_ids: list[str]) -> str:
    return hashlib.sha256((tipo + "|" + "|".join(sorted(pdf_ids))).encode("utf-8")).hexdigest()[:16]


def _acervo(conn: sqlite3.Connection) -> dict:
    kinds = {r[1]: r[0] for r in conn.execute("SELECT id, name FROM material_kinds")}
    praises = {r[0] for r in conn.execute("SELECT id FROM praises")}
    materiais = {r[0]: r[1] for r in conn.execute("SELECT id, praise_id FROM praise_materials")}
    return {"kinds": kinds, "praises": praises, "materiais": materiais}


def _resolver_junto(pdf_id: str, decisoes: dict[str, dict]) -> tuple[str, str] | tuple[None, str]:
    """Segue junto_com até uma decisão que cria ('criar', pdf_id de quem cria)
    ou que tem praise ('praise', praise_id). Ciclo/ponta solta → (None, motivo).
    Só é chamada quando a decisão de `pdf_id` tem junto_com."""
    vistos = [pdf_id]
    atual = decisoes.get(pdf_id, {})
    while atual.get("junto_com"):
        alvo = atual["junto_com"]
        if alvo in vistos:
            return None, f"junto_com em ciclo ({' → '.join(v[:12] for v in vistos + [alvo])})"
        if len(vistos) > MAX_SALTOS:
            return None, f"junto_com com mais de {MAX_SALTOS} saltos"
        vistos.append(alvo)
        atual = decisoes.get(alvo, {})
        if atual.get("tipo") == "criar":
            return "criar", alvo
        if atual.get("tipo") in ("adicionar", "substituir", "link") and atual.get("praise_id") and not atual.get("junto_com"):
            return "praise", atual["praise_id"]
    return None, "junto_com sem destino (a entrada apontada não tem praise nem cria)"


def montar_plano(decisoes: dict[str, dict], findings: list[dict], conn: sqlite3.Connection,
                 plpcjf: str = PLPCJF_ASSETS, baixados: str = PLPCG_BAIXADOS) -> Plano:
    acervo = _acervo(conn)
    ops: list[Op] = []
    recusas: list[dict] = []
    criar_por_nome: dict[str, Op] = {}
    criar_por_pdf: dict[str, str] = {}   # pdf_id que cria → nome normalizado

    def recusar(e: dict, motivo: str) -> None:
        recusas.append({"pdf_id": e["target_id"], "short_id": e["evidence"]["short_id"], "motivo": motivo})

    def entrada(f: dict, d: dict | None, evidencia: str) -> Entrada:
        e = f["evidence"]
        kind = (d or {}).get("kind") or dec.KIND_PADRAO.get(e["categoria"])
        return Entrada(pdf_id=f["target_id"], short_id=e["short_id"], group_id=e["group_id"], path=e["path"],
                       sha256=e["sha256"], kind=kind, arquivo=arquivo_local(e["path"], plpcjf, baixados),
                       evidencia=evidencia)

    plpcg = sorted((f for f in findings if f["target_type"] == "plpcg"), key=lambda f: f["evidence"]["short_id"])
    # 1ª passada: quem cria o quê (para o junto_com achar o grupo certo)
    for f in plpcg:
        d = decisoes.get(f["target_id"])
        if d and d.get("tipo") == "criar":
            criar_por_pdf[f["target_id"]] = norm_nome(d.get("nome") or f["evidence"]["nome"])

    for f in plpcg:
        e = f["evidence"]
        d = decisoes.get(f["target_id"])
        tipo = (d or {}).get("tipo")

        if not tipo:
            if e["faixa"] == "alta" and e.get("material_id") and f.get("praise_id"):
                ent = entrada(f, None, "+".join(e["evidencias"]))
                ops.append(Op(op_id("link", [ent.pdf_id]), "link", [ent], praise_id=f["praise_id"],
                              material_id=e["material_id"], confianca="alta", decidido_por="detector"))
            else:
                recusar(f, "sem decisão")
            continue

        if tipo in ("nao_levar", "descartar"):
            ent = entrada(f, d, f"site:{tipo}")
            ops.append(Op(op_id("nada", [ent.pdf_id]), "nada", [ent], motivo=tipo))
            continue

        ent = entrada(f, d, f"site:{tipo}")
        if tipo != "link" and ent.kind not in acervo["kinds"]:
            recusar(f, f"kind não existe no coldigom: {ent.kind!r}")
            continue
        if tipo != "link" and ent.arquivo is None:
            recusar(f, f"PDF não está no disco: {e['path']}")
            continue

        if tipo == "link":
            if acervo["materiais"].get(d["material_id"]) != d["praise_id"]:
                recusar(f, f"material {d['material_id']} não é do praise {d['praise_id']} no snapshot")
                continue
            ops.append(Op(op_id("link", [ent.pdf_id]), "link", [ent], praise_id=d["praise_id"],
                          material_id=d["material_id"]))
            continue

        if tipo == "substituir":
            if acervo["materiais"].get(d["material_id"]) != d["praise_id"]:
                recusar(f, f"material {d['material_id']} não é do praise {d['praise_id']} no snapshot")
                continue
            ops.append(Op(op_id("substituir", [ent.pdf_id]), "substituir", [ent], praise_id=d["praise_id"],
                          material_id=d["material_id"]))
            continue

        if tipo == "adicionar":
            praise = d.get("praise_id")
            if d.get("junto_com"):
                onde, alvo = _resolver_junto(f["target_id"], decisoes)
                if onde is None:
                    recusar(f, alvo)
                    continue
                if onde == "criar":
                    nome_n = criar_por_pdf[alvo]
                    grupo = criar_por_nome.get(nome_n)
                    if grupo is None:
                        # o criador ainda não passou (short_id maior): cria o grupo já, ele preenche depois
                        grupo = criar_por_nome[nome_n] = Op("", "criar", [])
                    grupo.entradas.append(ent)
                    continue
                praise = alvo
            if not praise or praise not in acervo["praises"]:
                recusar(f, f"praise {praise!r} não existe no snapshot")
                continue
            ops.append(Op(op_id("importar", [ent.pdf_id]), "importar", [ent], praise_id=praise))
            continue

        if tipo == "criar":
            nome_n = criar_por_pdf[f["target_id"]]
            grupo = criar_por_nome.get(nome_n)
            if grupo is None:
                grupo = criar_por_nome[nome_n] = Op("", "criar", [])
            if grupo.nome is None:
                grupo.nome = d.get("nome") or e["nome"]
                grupo.numero = e["numero"] if e["classificacao"].startswith("Coletânea") and str(e["numero"]).isdigit() else ""
                grupo.tags = tags_propostas(e["classificacao"])
            grupo.entradas.append(ent)
            continue

        recusar(f, f"tipo desconhecido: {tipo!r}")

    for grupo in criar_por_nome.values():
        if grupo.nome is None:
            for ent in grupo.entradas:
                recusas.append({"pdf_id": ent.pdf_id, "short_id": ent.short_id,
                                "motivo": "junto_com aponta para um 'criar' que foi recusado"})
            continue
        grupo.entradas.sort(key=lambda x: x.short_id)
        grupo.op_id = op_id("criar", grupo.pdf_ids)
        ops.append(grupo)

    ops.sort(key=lambda o: (ORDEM[o.tipo], o.entradas[0].short_id))
    recusas.sort(key=lambda r: r["short_id"])
    return Plano(ops, recusas)
```

Observação para o implementador: em `_resolver_junto`, quando o `junto_com` aponta para uma entrada que **cria** mas cuja decisão de criar foi recusada (kind/arquivo), o grupo fica sem `nome` e a limpeza final recusa as entradas dependentes — é o caso testado em `test_plano_recusa_pdf_ausente_e_junto_com_solto` (0006 recusado por PDF ausente).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd scripts/validate-acervo && python3 -m pytest tests/test_plpcg_apply.py -v`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add scripts/validate-acervo/core/plpcg_apply.py scripts/validate-acervo/tests/test_plpcg_apply.py
git commit -m "feat(validate-acervo): plpcg_apply.montar_plano — decisões + findings + snapshot viram Ops (link/importar/substituir/criar/nada) com recusas"
```

---

### Task 3: `sql_op` — statements por tipo de Op

**Files:**
- Modify: `scripts/validate-acervo/core/plpcg_apply.py`
- Test: `scripts/validate-acervo/tests/test_plpcg_apply.py`

**Interfaces:**
- Consumes: `Op`, `Entrada` (Task 2); `core.d1.sql_str`.
- Produces: `r2_key(praise_id, material_id) -> str` (sem `storage/`: é o valor da coluna), `chave_bucket(r2_key) -> str` (`"storage/" + r2_key`), `sql_op(op, ids, kinds, tags, run_id) -> list[str]` com `ids = {"praise_id": str | None, "material_ids": {pdf_id: str}}`, `kinds = {nome: id}`, `tags = {nome: id}`.

Statements, nesta ordem:

- `link`: `INSERT INTO plpcg_crosswalk (pdf_id, short_id, group_id, praise_id, praise_material_id, evidencia, confianca, decidido_por, run_id) VALUES (...)`.
- `importar`: para a entrada, `INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key, file_path_legacy, source_material_id, merged_from_praise_id, url, is_reviewed) VALUES (<mid>, <praise>, <kind_id>, 'pdf', <r2_key>, 'plpcg:<path>', NULL, NULL, NULL, 0)` + o INSERT do crosswalk apontando `<mid>`.
- `substituir`: os dois do importar + `DELETE FROM praise_materials WHERE id = <material_id> AND praise_id = <praise_id>` (guarda otimista: se o material já mudou de praise, o DELETE no-opa e a pós-condição pega).
- `criar`: `INSERT INTO praises (id, name, number) VALUES (<pid>, <nome>, <numero>)`; um `INSERT INTO praise_tags (praise_id, tag_id) VALUES (...)` por tag (recusa `ValueError` se a tag não existe em `tags`); depois, por entrada, os dois statements do importar.
- `nada`: `[]`.

- [ ] **Step 1: Write the failing tests**

```python
def test_sql_link_e_importar(mundo):
    plano = pa.montar_plano(mundo["decisoes"], mundo["findings"], mundo["conn"], mundo["plpcjf"], mundo["baixados"])
    kinds = {"Choir": "k-choir", "Chord Chart": "k-cc", "Chord Chart I": "k-cc1"}
    tags = {"Avulsos": "t-avu", "Coletânea": "t-col"}
    link = plano.por_tipo("link")[0]
    (s,) = pa.sql_op(link, {"praise_id": None, "material_ids": {}}, kinds, tags, "run-x")
    assert s.startswith("INSERT INTO plpcg_crosswalk (pdf_id, short_id, group_id, praise_id, praise_material_id, evidencia, confianca, decidido_por, run_id) VALUES ('pdf-0001', '0001', 'avulso:0001', 'p1', 'm1', 'num+slug+hash', 'alta', 'detector', 'run-x')")
    sub = plano.por_tipo("substituir")[0]
    stmts = pa.sql_op(sub, {"praise_id": None, "material_ids": {"pdf-0002": "m-novo"}}, kinds, tags, "run-x")
    assert stmts[0] == ("INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key, file_path_legacy, "
                        "source_material_id, merged_from_praise_id, url, is_reviewed) VALUES ('m-novo', 'p1', 'k-choir', 'pdf', "
                        "'assets/praises/p1/m-novo.pdf', 'plpcg:Avulsos/a.pdf', NULL, NULL, NULL, 0);")
    assert "'pdf-0002', '0002', 'avulso:0002', 'p1', 'm-novo', 'site:substituir', 'humano', 'jairo', 'run-x'" in stmts[1]
    assert stmts[2] == "DELETE FROM praise_materials WHERE id = 'm2' AND praise_id = 'p1';"


def test_sql_criar_praise_tags_e_materiais(mundo):
    plano = pa.montar_plano(mundo["decisoes"], mundo["findings"], mundo["conn"], mundo["plpcjf"], mundo["baixados"])
    kinds = {"Choir": "k-choir", "Chord Chart": "k-cc"}
    (c,) = plano.por_tipo("criar")
    ids = {"praise_id": "p-novo", "material_ids": {"pdf-0003": "m3", "pdf-0004": "m4"}}
    stmts = pa.sql_op(c, ids, kinds, {"Avulsos": "t-avu"}, "run-x")
    assert stmts[0] == "INSERT INTO praises (id, name, number) VALUES ('p-novo', 'A palavra de poder', '');"
    assert stmts[1] == "INSERT INTO praise_tags (praise_id, tag_id) VALUES ('p-novo', 't-avu');"
    assert "('m3', 'p-novo', 'k-cc', 'pdf', 'assets/praises/p-novo/m3.pdf'" in stmts[2]
    assert "'pdf-0003', '0003'" in stmts[3] and "('m4', 'p-novo', 'k-choir'" in stmts[4] and "'pdf-0004'" in stmts[5]
    assert len(stmts) == 6
    with pytest.raises(ValueError, match="tag"):
        pa.sql_op(c, ids, kinds, {}, "run-x")
    assert pa.sql_op(plano.por_tipo("nada")[0], ids, kinds, {}, "run-x") == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd scripts/validate-acervo && python3 -m pytest tests/test_plpcg_apply.py -k sql -v`
Expected: FAIL — `AttributeError: module 'core.plpcg_apply' has no attribute 'sql_op'`

- [ ] **Step 3: Write the implementation**

Acrescentar a `core/plpcg_apply.py`, depois de `montar_plano`:

```python
# --- SQL ---------------------------------------------------------------------

def r2_key(praise_id: str, material_id: str) -> str:
    """Valor da coluna praise_materials.r2_key (api/src/driveImport.ts:104)."""
    return f"assets/praises/{praise_id}/{material_id}.pdf"


def chave_bucket(r2_key_: str) -> str:
    """A chave do objeto no bucket: o app prefixa 'storage/' (driveImport.ts:105)."""
    return f"storage/{r2_key_}"


def _sql_crosswalk(e: Entrada, praise_id: str, material_id: str, op: Op, run_id: str) -> str:
    return ("INSERT INTO plpcg_crosswalk (pdf_id, short_id, group_id, praise_id, praise_material_id, "
            "evidencia, confianca, decidido_por, run_id) VALUES ("
            + ", ".join(sql_str(v) for v in (e.pdf_id, e.short_id, e.group_id, praise_id, material_id,
                                             e.evidencia, op.confianca, op.decidido_por, run_id)) + ");")


def _sql_material(e: Entrada, praise_id: str, material_id: str, kinds: dict[str, str]) -> str:
    return ("INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key, file_path_legacy, "
            "source_material_id, merged_from_praise_id, url, is_reviewed) VALUES ("
            f"{sql_str(material_id)}, {sql_str(praise_id)}, {sql_str(kinds[e.kind])}, 'pdf', "
            f"{sql_str(r2_key(praise_id, material_id))}, {sql_str('plpcg:' + e.path)}, NULL, NULL, NULL, 0);")


def sql_op(op: Op, ids: dict, kinds: dict[str, str], tags: dict[str, str], run_id: str) -> list[str]:
    if op.tipo == "nada":
        return []
    if op.tipo == "link":
        e = op.entradas[0]
        return [_sql_crosswalk(e, op.praise_id, op.material_id, op, run_id)]
    if op.tipo in ("importar", "substituir"):
        e = op.entradas[0]
        mid = ids["material_ids"][e.pdf_id]
        stmts = [_sql_material(e, op.praise_id, mid, kinds), _sql_crosswalk(e, op.praise_id, mid, op, run_id)]
        if op.tipo == "substituir":
            stmts.append(f"DELETE FROM praise_materials WHERE id = {sql_str(op.material_id)} "
                         f"AND praise_id = {sql_str(op.praise_id)};")
        return stmts
    if op.tipo == "criar":
        pid = ids["praise_id"]
        faltam = [t for t in op.tags if t not in tags]
        if faltam:
            raise ValueError(f"tag não existe no coldigom: {', '.join(faltam)}")
        stmts = [f"INSERT INTO praises (id, name, number) VALUES ({sql_str(pid)}, {sql_str(op.nome)}, {sql_str(op.numero or '')});"]
        stmts += [f"INSERT INTO praise_tags (praise_id, tag_id) VALUES ({sql_str(pid)}, {sql_str(tags[t])});" for t in op.tags]
        for e in op.entradas:
            mid = ids["material_ids"][e.pdf_id]
            stmts += [_sql_material(e, pid, mid, kinds), _sql_crosswalk(e, pid, mid, op, run_id)]
        return stmts
    raise ValueError(f"tipo desconhecido: {op.tipo}")
```

Verificar em `core/d1.py` que `sql_str(None)` devolve `NULL` (é usado acima só com strings; se não devolver, não importa).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd scripts/validate-acervo && python3 -m pytest tests/test_plpcg_apply.py -v`
Expected: 7 passed

- [ ] **Step 5: Commit**

```bash
git add scripts/validate-acervo/core/plpcg_apply.py scripts/validate-acervo/tests/test_plpcg_apply.py
git commit -m "feat(validate-acervo): plpcg_apply.sql_op — statements de link/importar/substituir/criar com r2_key e crosswalk"
```

---

### Task 4: `executar` — simulação, pré-condições, R2, SQL, log, pós-condição

**Files:**
- Modify: `scripts/validate-acervo/core/plpcg_apply.py`
- Test: `scripts/validate-acervo/tests/test_plpcg_apply.py`

**Interfaces:**
- Consumes: `Plano`, `sql_op`, `r2_key`, `chave_bucket` (Tasks 2–3); `core.d1.query`, `run_sql_files`, `write_sql_chunks`, `r2_put` (Task 1); `core.plpcg.sha256_arquivo`.
- Produces: `executar(plano, tipo, execute, run_id, log_path, conn, remote=True, sql_dir=None, execucao_dir=None, novo_id=...) -> dict` com `{"ops": n, "recusadas_no_plano": n, "ja_aplicadas": n, "simuladas": n, "aplicadas": n, "falharam": n, "sem_escrita": n}`; `ja_aplicadas(log_path) -> set[op_id]`; `estado_producao(remote, praises_snapshot) -> dict` (`{"crosswalk": set[pdf_id], "praises": set[id], "materiais": dict[id, praise_id], "nomes": dict[norm_nome, set[tag]]}`, quatro `query` no total, nunca uma por op); `copiar_execucao(run_id, log_path, execucao_dir)`.

Comportamento:

1. `tipo="todos"` só na simulação; `execute=True` exige `tipo in TIPOS` (`ValueError`).
2. Fila = ops do tipo pedido (`nada` entra em qualquer tipo, só para o log) menos `ja_aplicadas(log_path)` (op_id com `ok:true` e sem `estado: desfeito` posterior — mesma regra do `core.apply._ja_aplicados`).
3. Simulação: para cada op, gera `sql_op` com ids fictícios (`novo_id`) só para mostrar; imprime as 3 primeiras; **nenhuma** chamada a `query`/`r2_put`/`run_sql_files`. Também confere o sha256 do PDF local contra `entrada.sha256` (é disco, não rede) e conta como `falharam` se divergir.
4. Execução:
   - `estado = estado_producao(remote)` uma vez.
   - Por op: pré-condições → `praise_id` (link/importar/substituir) em `estado["praises"]`; `material_id` (link/substituir) em `estado["materiais"]` e do praise certo; nenhuma `pdf_id` da op em `estado["crosswalk"]`; sha256 confere; para `criar`, nenhum praise **que apareceu depois do snapshot** com o mesmo `norm_nome` e mesma tag-base — os homônimos que já estavam no snapshot o dono viu na Revisão 3 e confirmou `criar`; recusar por eles seria desfazer a decisão dele. `estado["nomes"]: dict[norm_nome, set[tag]]` vem de uma 4ª `query` (`SELECT p.id, p.name, t.name AS tag FROM praises p LEFT JOIN praise_tags pt ON pt.praise_id = p.id LEFT JOIN tags t ON t.id = pt.tag_id`) filtrada para `p.id` fora do snapshot; tag-base = `"Coletânea"` se tiver essa tag, senão `"Avulsos"`. Falha de pré-condição → linha `{ok:false, escreveu:false, estado:"pre_condicao", motivo}`.
   - `ids = {"praise_id": novo_id() if criar else op.praise_id, "material_ids": {e.pdf_id: novo_id() for e in entradas}}` (link: `material_ids = {}`).
   - Linha `pendente` no log **antes** de qualquer escrita: `{op_id, run_id, tipo, pdf_ids, ts, estado:"pendente", escreveu:false, ids, r2: [], antes}` onde `antes` = para `substituir`, a linha inteira do material removido lida do **snapshot** (`SELECT * FROM praise_materials WHERE id = ?`, como dict); para os outros `{}`.
   - Uploads: para cada entrada com arquivo, `r2_put(chave_bucket(r2_key(pid, mid)), entrada.arquivo)`; cada chave subida entra em `r2` da entrada final (mesmo se o SQL falhar depois — é o que o undo apaga).
   - SQL: `write_sql_chunks(stmts, os.path.join(sql_dir or OUT/sql, run_id), prefix=op.op_id)` + `run_sql_files`; `escreveu=True` **antes** da chamada (mesma razão do core.apply: tentou escrever = reversível).
   - Ops `link` são baratas e muitas (3588): acumular em lotes de 300 statements — uma lista de ops "abertas" cujo SQL vai para o mesmo chunk; `run_sql_files` uma vez por chunk; cada op do chunk recebe a mesma sorte (todas `escreveu=True`; se o wrangler levantar, todas `ok:false, erro`). Ops com upload (importar/substituir/criar) são sempre um chunk próprio.
   - Pós-condição, **uma** vez no fim do run: `query("SELECT pdf_id FROM plpcg_crosswalk WHERE run_id = <run_id>")` → conjunto; op com todas as `pdf_id` presentes → `ok:true`; senão `ok:false, estado:"guarda_barrou"`. (Para `substituir`, também `SELECT id FROM praise_materials WHERE id IN (<removidos>)` → se ainda existe, `guarda_barrou`.)
   - `nada`: linha `{ok:true, escreveu:false, estado:"sem_escrita", motivo}` — conta em `sem_escrita`.
   - No fim, `copiar_execucao(run_id, log_path, execucao_dir)`: copia todas as linhas do run para `<execucao_dir>/<run_id>.jsonl`.
5. Cada linha do log é um JSON por linha; a **última** linha de um `op_id` no run é a que vale.

- [ ] **Step 1: Write the failing tests**

```python
@pytest.fixture
def stubs(monkeypatch):
    """Substitui as quatro portas para o mundo. `prod` é o estado que `query` responde."""
    prod = {"praises": {"p1", "p2"}, "materiais": {"m1": "p1", "m2": "p1"}, "crosswalk": set(),
            "nomes": [("p1", "Aleluia", "Coletânea"), ("p2", "Gadareno", None)]}
    chamadas = {"query": [], "sql": [], "put": [], "delete": []}
    falhar = {"sql": False}

    def query(sql, remote=True):
        chamadas["query"].append(sql)
        if "FROM plpcg_crosswalk WHERE run_id" in sql:
            return [{"pdf_id": p} for p in sorted(prod["crosswalk"])]
        if sql.startswith("SELECT pdf_id FROM plpcg_crosswalk"):
            return [{"pdf_id": p} for p in sorted(prod["crosswalk"])]
        if sql.startswith("SELECT id FROM praises"):
            return [{"id": p} for p in sorted(prod["praises"])]
        if sql.startswith("SELECT id, praise_id FROM praise_materials"):
            return [{"id": m, "praise_id": p} for m, p in sorted(prod["materiais"].items())]
        if sql.startswith("SELECT id FROM praise_materials WHERE id IN"):
            return [{"id": m} for m in sorted(prod["materiais"]) if m in sql]
        if "AS tag FROM praises" in sql:
            return [{"id": i, "name": n, "tag": t} for i, n, t in prod["nomes"]]
        raise AssertionError("query inesperada: " + sql)

    def run_sql_files(arquivos, remote=True):
        chamadas["sql"].extend(arquivos)
        if falhar["sql"]:
            raise RuntimeError("wrangler caiu")
        for a in arquivos:
            for linha in open(a, encoding="utf-8"):
                if linha.startswith("INSERT INTO plpcg_crosswalk"):
                    prod["crosswalk"].add(linha.split("VALUES ('")[1].split("'")[0])
                if linha.startswith("DELETE FROM praise_materials WHERE id = '"):
                    prod["materiais"].pop(linha.split("'")[1], None)
                if linha.startswith("INSERT INTO praise_materials"):
                    mid, pid = linha.split("VALUES ('")[1].split("'")[0], linha.split("', '")[1]
                    prod["materiais"][mid] = pid
                if linha.startswith("INSERT INTO praises "):
                    prod["praises"].add(linha.split("VALUES ('")[1].split("'")[0])

    monkeypatch.setattr(pa, "query", query)
    monkeypatch.setattr(pa, "run_sql_files", run_sql_files)
    monkeypatch.setattr(pa, "r2_put", lambda key, arquivo, content_type="application/pdf": chamadas["put"].append(key))
    monkeypatch.setattr(pa, "r2_delete", lambda key: chamadas["delete"].append(key))
    return {"prod": prod, "chamadas": chamadas, "falhar": falhar}


def _ids():
    n = iter(range(1, 100))
    return lambda: f"id-{next(n):02d}"


def _log(path):
    return [json.loads(l) for l in open(path, encoding="utf-8") if l.strip()]


def test_simulacao_nao_toca_rede_e_confere_sha(mundo, stubs, capsys):
    plano = pa.montar_plano(mundo["decisoes"], mundo["findings"], mundo["conn"], mundo["plpcjf"], mundo["baixados"])
    r = pa.executar(plano, "todos", execute=False, run_id="run-s", log_path=str(mundo["tmp"] / "log.jsonl"),
                    conn=mundo["conn"], sql_dir=str(mundo["tmp"] / "sql"), execucao_dir=str(mundo["tmp"] / "exec"))
    assert stubs["chamadas"] == {"query": [], "sql": [], "put": [], "delete": []}
    assert r["simuladas"] == 2 and r["falharam"] == 2 and r["sem_escrita"] == 1  # 0002/0004+0003 têm sha 's' ≠ real
    assert not (mundo["tmp"] / "log.jsonl").exists()
    assert "INSERT INTO plpcg_crosswalk" in capsys.readouterr().out


def test_execute_exige_tipo(mundo, stubs):
    plano = pa.montar_plano(mundo["decisoes"], mundo["findings"], mundo["conn"], mundo["plpcjf"], mundo["baixados"])
    with pytest.raises(ValueError, match="--tipo"):
        pa.executar(plano, "todos", execute=True, run_id="r", log_path=str(mundo["tmp"] / "l"), conn=mundo["conn"])


def _com_sha_real(mundo):
    """Os findings da fixture têm sha 's'; aqui os alinhamos com o disco para a execução passar."""
    from core.plpcg import arquivo_local, sha256_arquivo
    for f in mundo["findings"]:
        p = arquivo_local(f["evidence"]["path"], mundo["plpcjf"], mundo["baixados"])
        if p:
            f["evidence"]["sha256"] = sha256_arquivo(p)


def test_execute_link_em_lote_e_pos_condicao(mundo, stubs):
    _com_sha_real(mundo)
    plano = pa.montar_plano(mundo["decisoes"], mundo["findings"], mundo["conn"], mundo["plpcjf"], mundo["baixados"])
    log = str(mundo["tmp"] / "log.jsonl")
    r = pa.executar(plano, "link", execute=True, run_id="run-l", log_path=log, conn=mundo["conn"],
                    sql_dir=str(mundo["tmp"] / "sql"), execucao_dir=str(mundo["tmp"] / "exec"), novo_id=_ids())
    assert (r["aplicadas"], r["falharam"], r["sem_escrita"]) == (2, 0, 1)
    assert len(stubs["chamadas"]["sql"]) == 1 and stubs["chamadas"]["put"] == []   # 2 links num chunk só
    assert stubs["prod"]["crosswalk"] == {"pdf-0001", "pdf-0007"}
    finais = {l["op_id"]: l for l in _log(log)}
    assert all(l["ok"] for l in finais.values()) and finais[plano.por_tipo("nada")[0].op_id]["estado"] == "sem_escrita"
    assert (mundo["tmp"] / "exec" / "run-l.jsonl").read_text().count("\n") == len(_log(log))
    # retomada: nada a fazer
    r2 = pa.executar(plano, "link", execute=True, run_id="run-l2", log_path=log, conn=mundo["conn"],
                     sql_dir=str(mundo["tmp"] / "sql"), execucao_dir=str(mundo["tmp"] / "exec"), novo_id=_ids())
    assert r2["ja_aplicadas"] == 3 and r2["aplicadas"] == 0


def test_execute_criar_e_substituir_sobem_r2_antes_do_sql(mundo, stubs):
    _com_sha_real(mundo)
    plano = pa.montar_plano(mundo["decisoes"], mundo["findings"], mundo["conn"], mundo["plpcjf"], mundo["baixados"])
    log = str(mundo["tmp"] / "log.jsonl")
    r = pa.executar(plano, "criar", execute=True, run_id="run-c", log_path=log, conn=mundo["conn"],
                    sql_dir=str(mundo["tmp"] / "sql"), execucao_dir=str(mundo["tmp"] / "exec"), novo_id=_ids())
    assert r["aplicadas"] == 1
    assert stubs["chamadas"]["put"] == ["storage/assets/praises/id-01/id-02.pdf", "storage/assets/praises/id-01/id-03.pdf"]
    (c,) = plano.por_tipo("criar")
    fim = [l for l in _log(log) if l["op_id"] == c.op_id][-1]
    assert fim["ids"] == {"praise_id": "id-01", "material_ids": {"pdf-0003": "id-02", "pdf-0004": "id-03"}}
    assert fim["r2"] == stubs["chamadas"]["put"] and fim["escreveu"] and fim["ok"]
    r = pa.executar(plano, "substituir", execute=True, run_id="run-r", log_path=log, conn=mundo["conn"],
                    sql_dir=str(mundo["tmp"] / "sql"), execucao_dir=str(mundo["tmp"] / "exec"), novo_id=_ids())
    assert r["aplicadas"] == 1 and "m2" not in stubs["prod"]["materiais"]
    fim = [l for l in _log(log) if l["run_id"] == "run-r" and l["tipo"] == "substituir"][-1]
    assert fim["antes"]["id"] == "m2" and fim["antes"]["r2_key"] == "assets/praises/p1/m2.pdf"


def test_execute_pre_condicao_e_falha_do_wrangler(mundo, stubs):
    _com_sha_real(mundo)
    stubs["prod"]["crosswalk"].add("pdf-0001")            # já vinculado em produção
    stubs["prod"]["nomes"].append(("p-alheio", "A palavra de poder", None))  # homônimo Avulsos criado DEPOIS do snapshot
    plano = pa.montar_plano(mundo["decisoes"], mundo["findings"], mundo["conn"], mundo["plpcjf"], mundo["baixados"])
    log = str(mundo["tmp"] / "log.jsonl")
    r = pa.executar(plano, "link", execute=True, run_id="run-1", log_path=log, conn=mundo["conn"],
                    sql_dir=str(mundo["tmp"] / "sql"), execucao_dir=str(mundo["tmp"] / "exec"), novo_id=_ids())
    assert (r["aplicadas"], r["falharam"]) == (1, 1)
    ruim = [l for l in _log(log) if l["pdf_ids"] == ["pdf-0001"]][-1]
    assert ruim["estado"] == "pre_condicao" and "plpcg_crosswalk" in ruim["motivo"] and not ruim["escreveu"]
    r = pa.executar(plano, "criar", execute=True, run_id="run-2", log_path=log, conn=mundo["conn"],
                    sql_dir=str(mundo["tmp"] / "sql"), execucao_dir=str(mundo["tmp"] / "exec"), novo_id=_ids())
    assert r["falharam"] == 1 and "mesmo nome" in _log(log)[-1]["motivo"] and stubs["chamadas"]["put"] == []
    # Gadareno já estava no snapshot: um 'criar' homônimo dele NÃO é recusado (Revisão 3 já cobriu)
    assert "gadareno" not in pa.estado_producao(praises_snapshot={"p1", "p2"})["nomes"]
    stubs["falhar"]["sql"] = True
    r = pa.executar(plano, "substituir", execute=True, run_id="run-3", log_path=log, conn=mundo["conn"],
                    sql_dir=str(mundo["tmp"] / "sql"), execucao_dir=str(mundo["tmp"] / "exec"), novo_id=_ids())
    fim = _log(log)[-1]
    assert r["falharam"] == 1 and fim["escreveu"] and not fim["ok"] and "wrangler caiu" in fim["erro"] and len(fim["r2"]) == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd scripts/validate-acervo && python3 -m pytest tests/test_plpcg_apply.py -k "execut or simulacao" -v`
Expected: FAIL — `AttributeError: module 'core.plpcg_apply' has no attribute 'executar'`

- [ ] **Step 3: Write the implementation**

Acrescentar a `core/plpcg_apply.py`:

```python
# --- execução ------------------------------------------------------------------

LOTE_SQL = 300  # statements por chunk (o wrangler engasga com arquivo grande)


def ja_aplicadas(log_path: str) -> set[str]:
    """op_id com ok:true, descontando as desfeitas depois — mesma regra do core.apply."""
    feitas: set[str] = set()
    if not os.path.exists(log_path):
        return feitas
    with open(log_path, encoding="utf-8") as f:
        for linha in f:
            if not linha.strip():
                continue
            r = json.loads(linha)
            if r.get("estado") == "desfeito":
                if r.get("ok"):          # undo que falhou no SQL deixa a escrita em produção
                    feitas.discard(r["op_id"])
            elif r.get("ok"):
                feitas.add(r["op_id"])
    return feitas


def estado_producao(remote: bool = True, praises_snapshot: set[str] = frozenset()) -> dict:
    """Quatro leituras, uma vez por run — nunca uma por op (3588 links).
    `nomes` só tem os praises que não estavam no snapshot: os outros o dono
    já viu na Revisão 3 quando confirmou 'criar'."""
    nomes: dict[str, set[str]] = {}
    for r in query("SELECT p.id AS id, p.name AS name, t.name AS tag FROM praises p "
                   "LEFT JOIN praise_tags pt ON pt.praise_id = p.id LEFT JOIN tags t ON t.id = pt.tag_id", remote=remote):
        if r["id"] not in praises_snapshot:
            nomes.setdefault(norm_nome(r["name"]), set()).add(r["tag"] or "")
    return {
        "crosswalk": {r["pdf_id"] for r in query("SELECT pdf_id FROM plpcg_crosswalk", remote=remote)},
        "praises": {r["id"] for r in query("SELECT id FROM praises", remote=remote)},
        "materiais": {r["id"]: r["praise_id"] for r in query("SELECT id, praise_id FROM praise_materials", remote=remote)},
        "nomes": nomes,
    }


def _tag_base(tags: set[str]) -> str:
    return "Coletânea" if "Coletânea" in tags else "Avulsos"


def _pre_condicao(op: Op, estado: dict) -> str | None:
    """Motivo da recusa, ou None. Lê o estado de PRODUÇÃO, não o snapshot."""
    ja = [e.pdf_id for e in op.entradas if e.pdf_id in estado["crosswalk"]]
    if ja:
        return f"pdf_id já está em plpcg_crosswalk: {', '.join(p[:16] for p in ja)}"
    if op.tipo in ("link", "importar", "substituir") and op.praise_id not in estado["praises"]:
        return f"praise {op.praise_id} não existe mais em produção"
    if op.tipo in ("link", "substituir") and estado["materiais"].get(op.material_id) != op.praise_id:
        return f"material {op.material_id} não existe em produção ou não é do praise {op.praise_id}"
    if op.tipo == "criar":
        bases = estado["nomes"].get(norm_nome(op.nome), set())
        if bases and _tag_base(set(op.tags)) in {_tag_base({b}) for b in bases}:
            return f"apareceu em produção, depois do snapshot, um praise com o mesmo nome e tag-base: {op.nome!r}"
    for e in op.entradas:
        if op.tipo != "link" and e.arquivo and sha256_arquivo(e.arquivo) != e.sha256:
            return f"sha256 do PDF local difere do finding: {e.short_id} {e.path}"
    return None


def _antes(op: Op, conn: sqlite3.Connection) -> dict:
    if op.tipo != "substituir":
        return {}
    r = conn.execute("SELECT * FROM praise_materials WHERE id = ?", (op.material_id,)).fetchone()
    return dict(r) if r else {}


def copiar_execucao(run_id: str, log_path: str, execucao_dir: str) -> str:
    os.makedirs(execucao_dir, exist_ok=True)
    destino = os.path.join(execucao_dir, f"{run_id}.jsonl")
    with open(log_path, encoding="utf-8") as origem, open(destino, "w", encoding="utf-8") as saida:
        for linha in origem:
            if linha.strip() and json.loads(linha).get("run_id") == run_id:
                saida.write(linha)
    return destino


def _catalogos(conn: sqlite3.Connection) -> tuple[dict[str, str], dict[str, str], set[str]]:
    kinds = {r[1]: r[0] for r in conn.execute("SELECT id, name FROM material_kinds")}
    tags = {r[1]: r[0] for r in conn.execute("SELECT id, name FROM tags")}
    praises = {r[0] for r in conn.execute("SELECT id FROM praises")}
    return kinds, tags, praises


def executar(plano: Plano, tipo: str, execute: bool, run_id: str, log_path: str,
             conn: sqlite3.Connection, remote: bool = True, sql_dir: str | None = None,
             execucao_dir: str | None = None, novo_id=lambda: str(uuid.uuid4())) -> dict:
    if execute and tipo not in TIPOS:
        raise ValueError(f"--execute exige --tipo explícito ({' | '.join(TIPOS)}); a ordem do spec §9 é link → "
                         "importar/substituir → criar, com core.snapshot entre eles")
    kinds, tags, praises_snapshot = _catalogos(conn)
    feitas = ja_aplicadas(log_path)
    fila = [o for o in plano.ops if (tipo == "todos" or o.tipo in (tipo, "nada")) and o.op_id not in feitas]
    resumo = {"ops": len(plano.ops), "recusadas_no_plano": len(plano.recusas),
              "ja_aplicadas": len(plano.ops) - len(fila) if tipo == "todos"
              else sum(1 for o in plano.ops if o.tipo in (tipo, "nada")) - len(fila),
              "simuladas": 0, "aplicadas": 0, "falharam": 0, "sem_escrita": 0}

    if not execute:
        # Portão da simulação: sem rede, sem credencial. O sha é disco.
        mostrados = 0
        for op in fila:
            if op.tipo == "nada":
                resumo["sem_escrita"] += 1
                continue
            ids = {"praise_id": novo_id() if op.tipo == "criar" else op.praise_id,
                   "material_ids": {} if op.tipo == "link" else {e.pdf_id: novo_id() for e in op.entradas}}
            ruim = next((f"sha256 difere: {e.short_id}" for e in op.entradas
                         if op.tipo != "link" and e.arquivo and sha256_arquivo(e.arquivo) != e.sha256), None)
            try:
                stmts = sql_op(op, ids, kinds, tags, run_id)
            except ValueError as erro:
                ruim = str(erro)
            if ruim:
                print(f"  RECUSADO {op.tipo} {','.join(e.short_id for e in op.entradas)}: {ruim}")
                resumo["falharam"] += 1
                continue
            resumo["simuladas"] += 1
            if mostrados < 3:
                mostrados += 1
                print(f"\n--- exemplo: {op.tipo} {','.join(e.short_id for e in op.entradas)} ---")
                for e in op.entradas:
                    if op.tipo != "link":
                        print(f"    R2 put {chave_bucket(r2_key(ids['praise_id'], ids['material_ids'][e.pdf_id]))} ← {e.arquivo}")
                for s in stmts:
                    print("   ", s)
        return resumo

    estado = estado_producao(remote, praises_snapshot)
    base_sql = os.path.join(sql_dir or os.path.join(OUT, "sql"), run_id)
    os.makedirs(os.path.dirname(log_path) or ".", exist_ok=True)
    log = open(log_path, "a", encoding="utf-8")

    def gravar(linha: dict) -> None:
        log.write(json.dumps(linha, ensure_ascii=False) + "\n")
        log.flush()

    abertas: list[tuple[Op, dict]] = []   # ops de link acumuladas no chunk corrente
    pendencias: list[tuple[Op, dict]] = []  # tudo que escreveu e espera a pós-condição
    removidos: list[str] = []
    chunk: list[str] = []
    n_chunk = 0

    def fechar_chunk() -> None:
        nonlocal chunk, abertas, n_chunk
        if not chunk:
            return
        arquivos = write_sql_chunks(chunk, base_sql, prefix=f"lote_{n_chunk:03d}", per_file=LOTE_SQL)
        n_chunk += 1
        for _, linha in abertas:
            linha["escreveu"] = True
        try:
            run_sql_files(arquivos, remote=remote)
            pendencias.extend(abertas)
        except Exception as erro:  # o wrangler levantou: todas do chunk falharam, todas reversíveis
            for op, linha in abertas:
                gravar(dict(linha, ts=time.time(), ok=False, erro=f"{type(erro).__name__}: {erro}"))
                resumo["falharam"] += 1
        chunk, abertas = [], []

    try:
        for op in fila:
            base = {"op_id": op.op_id, "run_id": run_id, "tipo": op.tipo, "pdf_ids": op.pdf_ids}
            if op.tipo == "nada":
                gravar(dict(base, ts=time.time(), ok=True, escreveu=False, estado="sem_escrita", motivo=op.motivo))
                resumo["sem_escrita"] += 1
                continue
            motivo = _pre_condicao(op, estado)
            if motivo:
                gravar(dict(base, ts=time.time(), ok=False, escreveu=False, estado="pre_condicao", motivo=motivo))
                resumo["falharam"] += 1
                continue
            ids = {"praise_id": novo_id() if op.tipo == "criar" else op.praise_id,
                   "material_ids": {} if op.tipo == "link" else {e.pdf_id: novo_id() for e in op.entradas}}
            linha = dict(base, ts=time.time(), estado="pendente", escreveu=False, ids=ids, r2=[], antes=_antes(op, conn))
            gravar(linha)
            try:
                stmts = sql_op(op, ids, kinds, tags, run_id)
            except ValueError as erro:
                gravar(dict(linha, ts=time.time(), ok=False, estado="pre_condicao", motivo=str(erro)))
                resumo["falharam"] += 1
                continue
            if op.tipo == "link":
                chunk.extend(stmts)
                abertas.append((op, linha))
                if len(chunk) >= LOTE_SQL:
                    fechar_chunk()
                continue
            fechar_chunk()
            # A partir daqui o R2 pode ter objeto novo: cada chave entra na linha antes do SQL.
            try:
                for e in op.entradas:
                    chave = chave_bucket(r2_key(ids["praise_id"], ids["material_ids"][e.pdf_id]))
                    r2_put(chave, e.arquivo)
                    linha["r2"].append(chave)
                arquivos = write_sql_chunks(stmts, base_sql, prefix=op.op_id, per_file=LOTE_SQL)
                linha["escreveu"] = True
                run_sql_files(arquivos, remote=remote)
                if op.tipo == "substituir":
                    removidos.append(op.material_id)
                pendencias.append((op, linha))
            except Exception as erro:
                gravar(dict(linha, ts=time.time(), ok=False, erro=f"{type(erro).__name__}: {erro}"))
                resumo["falharam"] += 1
        fechar_chunk()

        # Pós-condição, uma vez: o que entrou no crosswalk neste run e o que devia ter saído.
        if pendencias:
            no_crosswalk = {r["pdf_id"] for r in query(
                f"SELECT pdf_id FROM plpcg_crosswalk WHERE run_id = {sql_str(run_id)}", remote=remote)}
            ainda = set()
            if removidos:
                lista = ", ".join(sql_str(m) for m in removidos)
                ainda = {r["id"] for r in query(f"SELECT id FROM praise_materials WHERE id IN ({lista})", remote=remote)}
            for op, linha in pendencias:
                ok = all(p in no_crosswalk for p in op.pdf_ids) and (op.tipo != "substituir" or op.material_id not in ainda)
                if ok:
                    gravar(dict(linha, ts=time.time(), ok=True, estado="ok"))
                    resumo["aplicadas"] += 1
                else:
                    gravar(dict(linha, ts=time.time(), ok=False, estado="guarda_barrou"))
                    resumo["falharam"] += 1
    finally:
        log.close()
    copiar_execucao(run_id, log_path, execucao_dir or EXECUCAO_PADRAO)
    return resumo
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd scripts/validate-acervo && python3 -m pytest tests/test_plpcg_apply.py -v`
Expected: 12 passed. Se `test_simulacao_nao_toca_rede_e_confere_sha` discordar nas contagens, conferir: a fixture tem sha `'s'` em todos os findings, então `substituir` (0002) e `criar` (0003+0004) falham no sha; `link` (0001, 0007) não confere sha; `nada` (0005) é sem_escrita; `0006` foi recusado no plano. Logo `simuladas=2, falharam=2, sem_escrita=1`.

- [ ] **Step 5: Commit**

```bash
git add scripts/validate-acervo/core/plpcg_apply.py scripts/validate-acervo/tests/test_plpcg_apply.py
git commit -m "feat(validate-acervo): plpcg_apply.executar — simulação sem rede, pré-condições contra produção, R2 antes do SQL, links em lote, pós-condição por run, log + cópia em gabaritos/execucao"
```

---

### Task 5: `desfazer` — `--undo <run_id>`

**Files:**
- Modify: `scripts/validate-acervo/core/plpcg_apply.py`
- Test: `scripts/validate-acervo/tests/test_plpcg_apply.py`

**Interfaces:**
- Consumes: formato das linhas do log (Task 4: `op_id, run_id, tipo, pdf_ids, ids, r2, antes, escreveu, ok, estado`), `r2_delete`, `run_sql_files`, `write_sql_chunks`, `copiar_execucao`.
- Produces: `desfazer(run_id, log_path, remote=True, sql_dir=None, execucao_dir=None) -> dict` com `{"desfeitas": n, "puladas": n, "falharam": n}`.

Regras:

1. Para cada `op_id` do run, vale a **última** linha. Só entra quem tem `escreveu: true` (ok ou não — "tentou escrever" é o critério, como no `core.apply._reversivel`). `sem_escrita`, `pre_condicao` e `pendente` sem escrita são puladas.
2. Já desfeita (existe linha `estado: desfeito` para o `op_id` depois da última escrita) → pulada.
3. Ordem inversa da aplicação. Por op, SQL de undo:
   - `link`: `DELETE FROM plpcg_crosswalk WHERE pdf_id = ? AND run_id = ?`.
   - `importar`: crosswalk (idem) + `DELETE FROM praise_materials WHERE id = <mid>` para cada `ids.material_ids`.
   - `substituir`: os do importar + re-`INSERT INTO praise_materials (<colunas de antes>) VALUES (...)` com os valores de `antes` (`sql_str` para texto, `NULL` para None, inteiro para `is_reviewed`).
   - `criar`: crosswalk + `DELETE FROM praise_materials WHERE praise_id = <pid>` + `DELETE FROM praise_tags WHERE praise_id = <pid>` + `DELETE FROM praises WHERE id = <pid>`.
4. Depois do SQL, `r2_delete(chave)` para cada chave em `r2` (só o que o run subiu; o objeto antigo do substituir nunca é tocado). Falha de um delete no R2 não invalida o undo do SQL: fica registrada em `erros_r2` na linha.
5. Linha no log: `{op_id, run_id, tipo, pdf_ids, ts, estado: "desfeito", ok, undo_run: "<UTC>-undo", statements, r2_apagados, erros_r2}`; e `copiar_execucao` do `run_id` original de novo (a cópia em `gabaritos/` passa a ter as linhas de undo).

- [ ] **Step 1: Write the failing test**

```python
def test_undo_reverte_criar_e_substituir_e_apaga_so_o_r2_do_run(mundo, stubs):
    _com_sha_real(mundo)
    plano = pa.montar_plano(mundo["decisoes"], mundo["findings"], mundo["conn"], mundo["plpcjf"], mundo["baixados"])
    log = str(mundo["tmp"] / "log.jsonl")
    kw = dict(log_path=log, conn=mundo["conn"], sql_dir=str(mundo["tmp"] / "sql"), execucao_dir=str(mundo["tmp"] / "exec"))
    pa.executar(plano, "link", execute=True, run_id="run-1", novo_id=_ids(), **kw)
    pa.executar(plano, "substituir", execute=True, run_id="run-2", novo_id=_ids(), **kw)
    pa.executar(plano, "criar", execute=True, run_id="run-3", novo_id=_ids(), **kw)
    stubs["chamadas"]["sql"].clear()
    r = pa.desfazer("run-3", log, sql_dir=str(mundo["tmp"] / "sql"), execucao_dir=str(mundo["tmp"] / "exec"))
    assert r == {"desfeitas": 1, "puladas": 1, "falharam": 0}   # a op 'nada' do run é pulada
    sql = "".join(open(a).read() for a in stubs["chamadas"]["sql"])
    assert "DELETE FROM plpcg_crosswalk WHERE pdf_id = 'pdf-0003' AND run_id = 'run-3';" in sql
    assert "DELETE FROM praise_materials WHERE praise_id = 'id-01';" in sql
    assert "DELETE FROM praise_tags WHERE praise_id = 'id-01';" in sql and "DELETE FROM praises WHERE id = 'id-01';" in sql
    assert stubs["chamadas"]["delete"] == ["storage/assets/praises/id-01/id-02.pdf", "storage/assets/praises/id-01/id-03.pdf"]
    ultima = _log(log)[-1]
    assert ultima["estado"] == "desfeito" and ultima["ok"] and ultima["run_id"] == "run-3"
    assert pa.ja_aplicadas(log) == {o.op_id for o in plano.por_tipo("link")} | {plano.por_tipo("substituir")[0].op_id} | {plano.por_tipo("nada")[0].op_id}
    # undo do substituir devolve a linha antiga do material e apaga só o objeto novo
    stubs["chamadas"]["sql"].clear(); stubs["chamadas"]["delete"].clear()
    r = pa.desfazer("run-2", log, sql_dir=str(mundo["tmp"] / "sql"), execucao_dir=str(mundo["tmp"] / "exec"))
    sql = "".join(open(a).read() for a in stubs["chamadas"]["sql"])
    assert r["desfeitas"] == 1
    assert "INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key" in sql and "'m2', 'p1', 'k-choir', 'pdf', 'assets/praises/p1/m2.pdf'" in sql
    assert stubs["chamadas"]["delete"] == ["storage/assets/praises/p1/id-01.pdf"]
    # segundo undo do mesmo run: nada a fazer
    assert pa.desfazer("run-2", log, sql_dir=str(mundo["tmp"] / "sql"), execucao_dir=str(mundo["tmp"] / "exec"))["desfeitas"] == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts/validate-acervo && python3 -m pytest tests/test_plpcg_apply.py -k undo -v`
Expected: FAIL — `AttributeError: module 'core.plpcg_apply' has no attribute 'desfazer'`

- [ ] **Step 3: Write the implementation**

```python
# --- undo ----------------------------------------------------------------------

def _lit(v) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, (int, float)):
        return str(v)
    return sql_str(str(v))


def _sql_undo(linha: dict) -> list[str]:
    run_id, ids = linha["run_id"], linha.get("ids") or {}
    stmts = [f"DELETE FROM plpcg_crosswalk WHERE pdf_id = {sql_str(p)} AND run_id = {sql_str(run_id)};" for p in linha["pdf_ids"]]
    if linha["tipo"] in ("importar", "substituir"):
        stmts += [f"DELETE FROM praise_materials WHERE id = {sql_str(m)};" for m in ids.get("material_ids", {}).values()]
    if linha["tipo"] == "substituir" and linha.get("antes"):
        antes = linha["antes"]
        stmts.append(f"INSERT INTO praise_materials ({', '.join(antes)}) VALUES ({', '.join(_lit(v) for v in antes.values())});")
    if linha["tipo"] == "criar":
        pid = sql_str(ids["praise_id"])
        stmts += [f"DELETE FROM praise_materials WHERE praise_id = {pid};",
                  f"DELETE FROM praise_tags WHERE praise_id = {pid};",
                  f"DELETE FROM praises WHERE id = {pid};"]
    return stmts


def desfazer(run_id: str, log_path: str, remote: bool = True, sql_dir: str | None = None,
             execucao_dir: str | None = None) -> dict:
    ultimas: dict[str, dict] = {}
    desfeitas: set[str] = set()
    ordem: list[str] = []
    with open(log_path, encoding="utf-8") as f:
        for linha in f:
            if not linha.strip():
                continue
            r = json.loads(linha)
            if r.get("run_id") != run_id:
                continue
            if r.get("estado") == "desfeito":
                desfeitas.add(r["op_id"])
                continue
            if r["op_id"] not in ultimas:
                ordem.append(r["op_id"])
            ultimas[r["op_id"]] = r
            desfeitas.discard(r["op_id"])
    resumo = {"desfeitas": 0, "puladas": 0, "falharam": 0}
    undo_run = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%MZ") + "-undo"
    base_sql = os.path.join(sql_dir or os.path.join(OUT, "sql"), undo_run)
    with open(log_path, "a", encoding="utf-8") as log:
        for op_id_ in reversed(ordem):
            r = ultimas[op_id_]
            if not r.get("escreveu") or op_id_ in desfeitas:
                resumo["puladas"] += 1
                continue
            saida = {"op_id": op_id_, "run_id": run_id, "tipo": r["tipo"], "pdf_ids": r["pdf_ids"],
                     "ts": time.time(), "estado": "desfeito", "undo_run": undo_run, "r2_apagados": [], "erros_r2": []}
            try:
                stmts = _sql_undo(r)
                arquivos = write_sql_chunks(stmts, base_sql, prefix=op_id_, per_file=LOTE_SQL)
                run_sql_files(arquivos, remote=remote)
                saida["statements"] = len(stmts)
                for chave in r.get("r2") or []:
                    try:
                        r2_delete(chave)
                        saida["r2_apagados"].append(chave)
                    except Exception as erro:
                        saida["erros_r2"].append(f"{chave}: {type(erro).__name__}: {erro}")
                saida["ok"] = True
                resumo["desfeitas"] += 1
            except Exception as erro:
                saida["ok"] = False
                saida["erro"] = f"{type(erro).__name__}: {erro}"
                resumo["falharam"] += 1
            log.write(json.dumps(saida, ensure_ascii=False) + "\n")
            log.flush()
    copiar_execucao(run_id, log_path, execucao_dir or EXECUCAO_PADRAO)
    return resumo
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd scripts/validate-acervo && python3 -m pytest tests/test_plpcg_apply.py -v`
Expected: 13 passed

- [ ] **Step 5: Commit**

```bash
git add scripts/validate-acervo/core/plpcg_apply.py scripts/validate-acervo/tests/test_plpcg_apply.py
git commit -m "feat(validate-acervo): plpcg_apply.desfazer — --undo por run_id: crosswalk, materiais, praise, re-INSERT do substituído, só o R2 do run"
```

---

### Task 6: CLI, simulação real e README

**Files:**
- Modify: `scripts/validate-acervo/core/plpcg_apply.py` (`main`)
- Create: `scripts/validate-acervo/gabaritos/plpcg_crosswalk/execucao/.gitkeep`
- Modify: `scripts/validate-acervo/README.md` (seção "Migração PLPCG")
- Test: `scripts/validate-acervo/tests/test_plpcg_apply.py`

**Interfaces:**
- Consumes: tudo acima; `revisao.decisoes.ler`; `core.snapshot.conectar`.
- Produces: `main(argv) -> int` com flags `--decisoes` (padrão `DECISOES_PADRAO`), `--findings` (padrão `FINDINGS_PADRAO` = gabarito da rodada 1 — **não** o `out/`, que é o que pode mudar), `--snapshot`, `--plpcjf`, `--baixados`, `--tipo {todos,link,importar,substituir,criar}` (padrão `todos`), `--execute`, `--undo RUN_ID`, `--log`, `--sql-dir`, `--limite N` (só as N primeiras ops do tipo — para o primeiro `--execute` de verdade ser pequeno), `--local` (wrangler `--local`; `remote=False`).

- [ ] **Step 1: Write the failing test**

```python
def test_main_simula_e_imprime_plano(mundo, stubs, capsys, monkeypatch):
    import json as _json
    _com_sha_real(mundo)
    dpath = mundo["tmp"] / "decisoes.jsonl"
    with open(dpath, "w", encoding="utf-8") as f:
        for d in mundo["decisoes"].values():
            f.write(_json.dumps(d) + "\n")
    fpath = mundo["tmp"] / "findings.jsonl"
    with open(fpath, "w", encoding="utf-8") as f:
        for x in mundo["findings"]:
            f.write(_json.dumps(x) + "\n")
    rc = pa.main(["--decisoes", str(dpath), "--findings", str(fpath), "--snapshot", str(mundo["tmp"] / "snapshot.sqlite"),
                  "--plpcjf", mundo["plpcjf"], "--baixados", mundo["baixados"], "--log", str(mundo["tmp"] / "log.jsonl"),
                  "--sql-dir", str(mundo["tmp"] / "sql")])
    out = capsys.readouterr().out
    assert rc == 0 and "link 2" in out and "criar 1" in out and "recusas: 1" in out and "0006" in out
    assert stubs["chamadas"]["sql"] == []
    with pytest.raises(SystemExit):
        pa.main(["--execute", "--decisoes", str(dpath), "--findings", str(fpath), "--snapshot", str(mundo["tmp"] / "snapshot.sqlite")])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts/validate-acervo && python3 -m pytest tests/test_plpcg_apply.py -k main -v`
Expected: FAIL — `AttributeError: ... 'main'`

- [ ] **Step 3: Write the implementation**

```python
# --- CLI -------------------------------------------------------------------------

def _ler_jsonl(caminho: str) -> list[dict]:
    with open(caminho, encoding="utf-8") as f:
        return [json.loads(l) for l in f if l.strip()]


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--decisoes", default=DECISOES_PADRAO)
    ap.add_argument("--findings", default=FINDINGS_PADRAO, help="findings.jsonl da rodada decidida (padrão: gabarito da rodada 1)")
    ap.add_argument("--snapshot", default=SNAPSHOT_DB)
    ap.add_argument("--plpcjf", default=PLPCJF_ASSETS)
    ap.add_argument("--baixados", default=PLPCG_BAIXADOS)
    ap.add_argument("--tipo", default="todos", choices=("todos", *TIPOS))
    ap.add_argument("--execute", action="store_true", help="escreve em produção (exige --tipo)")
    ap.add_argument("--undo", metavar="RUN_ID")
    ap.add_argument("--log", default=LOG_PADRAO)
    ap.add_argument("--sql-dir", default=None)
    ap.add_argument("--execucao-dir", default=EXECUCAO_PADRAO)
    ap.add_argument("--limite", type=int, default=None, help="só as N primeiras ops do tipo")
    ap.add_argument("--local", action="store_true", help="wrangler --local (D1/R2 locais)")
    a = ap.parse_args(argv)
    remote = not a.local

    if a.undo:
        r = desfazer(a.undo, a.log, remote=remote, sql_dir=a.sql_dir, execucao_dir=a.execucao_dir)
        print(f"undo {a.undo}: " + " · ".join(f"{k} {v}" for k, v in r.items()))
        return 0 if not r["falharam"] else 1

    if a.execute and a.tipo == "todos":
        ap.error("--execute exige --tipo link|importar|substituir|criar (ordem do spec §9; core.snapshot entre eles)")
    for caminho, nome in ((a.decisoes, "decisoes"), (a.findings, "findings"), (a.snapshot, "snapshot")):
        if not os.path.exists(caminho):
            print(f"sem {nome}: {caminho}", file=sys.stderr)
            return 1

    conn = conectar(a.snapshot)
    plano = montar_plano(dec.ler(a.decisoes), _ler_jsonl(a.findings), conn, a.plpcjf, a.baixados)
    if a.limite is not None:
        vistos = 0
        ops = []
        for op in plano.ops:
            if op.tipo == a.tipo or a.tipo == "todos":
                if vistos >= a.limite:
                    continue
                vistos += 1
            ops.append(op)
        plano = Plano(ops, plano.recusas)
    contagem = {}
    for op in plano.ops:
        contagem[op.tipo] = contagem.get(op.tipo, 0) + 1
    print("plano: " + " · ".join(f"{k} {contagem.get(k, 0)}" for k in (*TIPOS, "nada")) + f" · recusas: {len(plano.recusas)}")
    for r in plano.recusas[:30]:
        print(f"  recusa {r['short_id']}: {r['motivo']}")
    if len(plano.recusas) > 30:
        print(f"  … e mais {len(plano.recusas) - 30}")

    run_id = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%MZ") + f"-plpcg_apply-{a.tipo}"
    r = executar(plano, a.tipo, a.execute, run_id, a.log, conn, remote=remote, sql_dir=a.sql_dir,
                 execucao_dir=a.execucao_dir)
    print(f"\n{'EXECUTADO' if a.execute else 'simulado'} {run_id}: " + " · ".join(f"{k} {v}" for k, v in r.items()))
    if a.execute:
        print(f"log: {a.log}\ncópia: {os.path.join(a.execucao_dir, run_id + '.jsonl')}\nundo: python3 -m core.plpcg_apply --undo {run_id}")
    return 0 if not r["falharam"] else 1


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd scripts/validate-acervo && python3 -m pytest -q`
Expected: toda a suíte verde (antes desta fase eram 191; agora 191 + 2 + 14).

- [ ] **Step 5: Simulação com dados reais**

Run (do worktree, com os caminhos explícitos porque `out/` fica no checkout principal):

```bash
cd scripts/validate-acervo && M="/Volumes/SSD 2TB SD/dev/coldigom/scripts/validate-acervo" && \
python3 -m core.plpcg_apply --snapshot "$M/out/snapshot.sqlite" --baixados "$M/out/plpcg/baixados" \
  --plpcjf "/Volumes/SSD 2TB SD/dev/plpcjf/assets" --log "$M/out/plpcg_apply_log.jsonl"
```

Expected: `plano: link ~3658 · importar ~370 · substituir 1 · criar ~330 · nada ~198 · recusas: N`, nenhuma chamada de rede, três exemplos de SQL/R2 impressos. Anotar `N` e os motivos das recusas no relatório da tarefa — cada recusa é ou uma decisão a fechar no site (Revisão 2) ou um PDF fora do disco.

- [ ] **Step 6: README e `.gitkeep`**

Em `README.md`, na seção "Migração PLPCG" (depois do parágrafo do `revisao.migrar_anotacoes`), acrescentar:

````markdown
**Fase C — escrever no coldigom** (`core/plpcg_apply.py`, spec §7):

```bash
python3 -m core.plpcg_apply                          # simula tudo: plano por tipo, recusas, 3 exemplos de SQL/R2
python3 -m core.plpcg_apply --tipo link --execute    # 1º: só o crosswalk (alta do detector + "já existe" do site)
python3 -m core.snapshot
python3 -m core.plpcg_apply --tipo importar --execute   # "adicionar": upload no R2 + praise_materials + crosswalk
python3 -m core.plpcg_apply --tipo substituir --execute # idem + DELETE do material trocado (objeto R2 antigo fica)
python3 -m core.snapshot
python3 -m core.plpcg_apply --tipo criar --execute      # praises novos (um por nome) + materiais + crosswalk
python3 -m core.plpcg_apply --undo <run_id>             # desfaz um run inteiro, na ordem inversa
```

Lê `gabaritos/plpcg_crosswalk/decisoes.jsonl` (última linha por `pdf_id`) e o
`findings.jsonl` da rodada 1 (hash, path). Alta sem decisão vira `link` do
detector; `nao_levar`/`descartar` não escrevem mas entram no log como
decididas-sem-escrita; `junto_com` é resolvido em cadeia; `criar` repetido
para o mesmo nome vira um praise só. Simulação não toca rede nem lê
credencial. `--execute` exige `--tipo`; cada run grava em
`out/plpcg_apply_log.jsonl` e copia as suas linhas para
`gabaritos/plpcg_crosswalk/execucao/<run_id>.jsonl` (git). Pré-condições
lidas de produção uma vez por run (praise/material existem, `pdf_id` ainda
não está no crosswalk, sha256 do PDF confere, nenhum homônimo com a mesma
tag-base para criar); pós-condição por run (`plpcg_crosswalk WHERE run_id`).
R2 via `wrangler r2 object put|delete coldigom-assets/storage/…` — mesma
autenticação do D1. `--limite N` para o primeiro `--execute` ser pequeno.
````

E na tabela "Arquivos": `| core/plpcg_apply.py | Fase C: decisões → link/importar/substituir/criar no D1 + R2, simulação, log, undo |`.

```bash
touch scripts/validate-acervo/gabaritos/plpcg_crosswalk/execucao/.gitkeep
```

- [ ] **Step 7: Commit**

```bash
git add scripts/validate-acervo/core/plpcg_apply.py scripts/validate-acervo/tests/test_plpcg_apply.py scripts/validate-acervo/README.md scripts/validate-acervo/gabaritos/plpcg_crosswalk/execucao/.gitkeep
git commit -m "feat(validate-acervo): core.plpcg_apply CLI — simulação com plano/recusas, --tipo/--execute/--undo/--limite, README da Fase C"
```

---

## Fora deste plano (e por quê)

- **Executar em produção.** Cada `--execute` é decisão do dono, um tipo por vez, com `core.snapshot` entre eles (spec §9) e o primeiro com `--limite 5` + `--undo` de verdade para provar o caminho de volta (portão da Fase C: "undo testado numa corrida real e desfeita").
- **Fase D** (endpoints `resolve`/`manifest`, coldigui) — spec §8.2/§8.3, plano próprio.
- **Limpeza do material do 507** ("Tu que estás assentado" arquivado em "O Sol Escurecerá") — anotada no spec §7, fica para depois do `criar` do 506, como `delete_material` normal do coldigom.
- **Grupos "Louvores novos" (`group_id`) no `decisoes.jsonl`** — o apply ignora decisões por `group_id`: cada entrada dos grupos já tem a sua decisão por `pdf_id` (343/343 sem_louvor decididas).

## Self-review

- **Cobertura do spec §7**: quatro ações (Tasks 3–4), simulação/.sql/log/undo (4–5), regras de leitura (2), pré-condições (4: praise/material em produção, pdf_id fora do crosswalk, sha256, homônimo por tag-base), credenciais só via wrangler (1). §8.1 colunas (3). §9 ordem (6: `--tipo` + README). §12 "zero decisão sem aplicação" — o `nada` no log com `sem_escrita` (4).
- **Placeholders**: nenhum "TBD"; cada tarefa tem teste e código completos.
- **Tipos**: `Op.entradas`/`pdf_ids`/`op_id`/`Plano.por_tipo` iguais em 2–6; `ids = {"praise_id", "material_ids"}` igual em 3–5; linhas do log com `op_id, run_id, tipo, pdf_ids, ids, r2, antes, escreveu, ok, estado` iguais em 4–5; `chave_bucket(r2_key(...))` em 3–5.
