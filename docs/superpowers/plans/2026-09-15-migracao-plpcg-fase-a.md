# Migração PLPCG → Coldigom — Fase A (arnês) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o arnês `scripts/validate-acervo` exportar o catálogo do PLPCG, hashear os PDFs dos dois lados e emitir um finding por entrada do PLPCG (e um por louvor que só existe lá) com faixa, evidência e candidatos — reproduzindo a tabela do §2.3 do spec — e criar a tabela `plpcg_crosswalk` no D1.

**Architecture:** Dois módulos novos no arnês existente. `core/plpcg.py` é a fonte: exporta o D1 `plpcg-catalog` pelo wrangler do `plpcg-admin`, decodifica `pdf_id`, localiza/baixa cada PDF, e mantém um cache incremental de sha256 (`out/hashes.sqlite`) dos PDFs do PLPCG e do espelho local do coldigom. `detectors/plpcg_crosswalk.py` é o cruzamento: Camada L (louvor por número → slug → classe; avulso por nome exato → continência → similaridade), Camada H (hash), Camada P (caminho do csvmap), corroboração dentro do louvor, faixas do §5.1, até 5 candidatos por entrada. Nada escreve no D1 nesta fase; as três ações novas só entram no contrato (`ACOES`) para o `apply` recusá-las nominalmente até a Fase C.

**Tech Stack:** Python 3 stdlib (sqlite3, hashlib, base64, difflib, urllib), pytest, wrangler (D1 export), SQL do D1 (migração 019).

**Spec:** `docs/superpowers/specs/2026-09-15-migracao-plpcg-design.md` (§2, §4, §5, §8.1, §9 fase A).

## Global Constraints

- Tudo vive em `scripts/validate-acervo/`; nada entra no coldigom web nem na catraca de cobertura do `api/`/`web/`.
- Só stdlib do Python. Sem dependência nova.
- Testes: `cd scripts/validate-acervo && python3 -m pytest tests/ -v`. A suíte está verde com 122 testes antes deste plano; termina verde com mais.
- Nenhuma escrita no D1 do coldigom por este plano além da migração 019 (`CREATE TABLE`, idempotente com `IF NOT EXISTS`). O D1 do PLPCG é só lido (`wrangler d1 export`).
- Contrato do finding (`core/findings.py`): `confidence ∈ FAIXAS = ("alta","media","baixa","discussao")`. A **faixa do cruzamento** (§5.1: `alta | media | faltante | ambiguo | sem_louvor`) vive em `evidence["faixa"]`; o mapa faixa → (`confidence`, `action`) é a constante `CONTRATO` do detector (Task 5) e está copiado no README (Task 8).
- `finding_id` é determinístico por `(detector, target_id, field)`: `target_id = pdf_id` para a entrada, `target_id = group_id` para o grupo. Re-rodar não duplica.
- Nomes em português, comentários explicando o *porquê* (padrão da casa — ver `core/apply.py`). Mensagens de commit `feat(validate-acervo): …` / `test(validate-acervo): …` / `docs(validate-acervo): …`, terminando com `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- Branch: `feat/migracao-plpcg` (já existe, a partir de `develop`, com o spec commitado em `df2fe13`).
- Caminhos externos (irmãos do repo, sobrescrevíveis por env): `dev/plpcg-admin/worker` (`PLPCG_ADMIN_WORKER`), `dev/plpcjf/assets` (`PLPCJF_ASSETS`). Espelho local do coldigom: `storage/assets/praises/<praise_id>/<material_id>.pdf` (dentro do repo, git-ignored).
- URL pública de um PDF do PLPCG: `https://plpcg.com/assets/<caminho>`; caminhos decodificados que já começam com `assets/` não ganham o prefixo duas vezes (verificado com `curl -I` em 15/09: `/assets/ColAdultos/001.pdf` → 200, `/ColAdultos/001.pdf` → 404).

---

## File Structure

| arquivo | responsabilidade |
|---|---|
| `scripts/validate-acervo/core/paths.py` (modificar) | onde estão o plpcg-admin, o plpcjf/assets, o storage local, e os `out/` novos. Nenhuma lógica |
| `scripts/validate-acervo/core/findings.py` (modificar) | `ACOES` ganha `link_plpcg`, `import_plpcg_material`, `create_praise_plpcg` |
| `scripts/validate-acervo/core/apply.py` (modificar, 4 linhas) | `FASE_DA_ACAO` diz "Fase C da migração PLPCG" para as três ações |
| `scripts/validate-acervo/core/plpcg.py` (criar) | exportação do D1 do PLPCG → `out/plpcg/plpcg.sqlite`; `decodificar`/`codificar` de `pdf_id`; `arquivo_local`/`baixar`; cache de sha256 `out/hashes.sqlite` dos dois lados; `python3 -m core.plpcg` |
| `scripts/validate-acervo/detectors/plpcg_crosswalk.py` (criar) | camadas L/H/P, corroboração, faixas, candidatos, finding por entrada e por grupo, resumo; `python3 -m detectors.plpcg_crosswalk` |
| `scripts/validate-acervo/tests/test_plpcg.py` (criar) | testes de `core/plpcg.py` |
| `scripts/validate-acervo/tests/test_plpcg_crosswalk.py` (criar) | testes do detector, com um acervo de fixture |
| `scripts/validate-acervo/tests/test_findings.py`, `tests/test_apply.py` (modificar) | um teste cada para o contrato |
| `api/migrations/019_plpcg_crosswalk.sql` (criar) | a tabela do §8.1 |
| `scripts/validate-acervo/README.md` (modificar) | seção "Migração PLPCG" |
| `scripts/validate-acervo/gabaritos/plpcg_crosswalk/rodada1/` (criar) | `resumo.md` + `findings.jsonl` da rodada 1 (nada fica só em `out/`) |

Interfaces que atravessam tarefas (todas definidas abaixo, repetidas em cada task que as usa):

```python
# core/plpcg.py
decodificar(pdf_id: str) -> str            # 'Q29sQWR1bHRvcy8wMDEucGRm' -> 'ColAdultos/001.pdf'
codificar(caminho: str) -> str             # inverso, sem '='
caminho_relativo(caminho: str) -> str      # tira o prefixo 'assets/' se houver
url_publica(caminho: str) -> str
arquivo_local(caminho, raiz=PLPCJF_ASSETS, cache=PLPCG_BAIXADOS) -> str | None
baixar(caminho, cache=PLPCG_BAIXADOS, abrir=urllib.request.urlopen) -> str
sha256_arquivo(caminho: str) -> str
pdfs_em(raiz: str) -> dict[str, str]       # {rel: abs}
abrir_hashes(db=HASHES_DB) -> sqlite3.Connection
hashear(conn, lado: str, arquivos: dict[str, str]) -> int
hashes_de(conn, lado: str) -> dict[str, str]           # {rel: sha256}
hashes_coldigom(conn) -> dict[str, set[str]]           # {sha256: {material_id}}
exportar_d1(dumps_dir, remote=True, cwd=PLPCG_ADMIN_WORKER) -> None
montar_db(dumps_dir, db=PLPCG_DB) -> sqlite3.Connection
conectar(db=PLPCG_DB) -> sqlite3.Connection
meta(conn) -> dict[str, str]               # catalog_meta
entradas(conn) -> list[dict]               # linhas de louvores + 'caminho' decodificado
LADO_PLPCG = "plpcg"; LADO_COLDIGOM = "coldigom"

# detectors/plpcg_crosswalk.py
slug(s) -> str; numero_int(s) -> int | None; classe_base(c) -> str
classe_ok(classificacao, tags: set[str]) -> bool
tags_propostas(classificacao) -> list[str]
chaves_csv(file_path) -> list[tuple]; chaves_plpcg(caminho, numero: int | None) -> list[tuple]
Acervo.carregar(conn_snapshot) -> Acervo
candidatos_louvor(group_id, classificacao, numero, acervo) -> tuple[list[str], list[str], bool]
cruzar(entrada: dict, acervo, sha: str | None, hc: dict[str, set[str]]) -> Resultado
detectar(snap, entradas_plpcg: list[dict], checksum: str, hp: dict[str, str], hc, run_id) -> tuple[list[Finding], Motivos]
resumo(findings) -> str
```

---

### Task 1: Contrato — ações novas, fase no apply, caminhos

**Files:**
- Modify: `scripts/validate-acervo/core/findings.py:11-18`
- Modify: `scripts/validate-acervo/core/apply.py:43-48`
- Modify: `scripts/validate-acervo/core/paths.py`
- Test: `scripts/validate-acervo/tests/test_findings.py`, `scripts/validate-acervo/tests/test_apply.py`

**Interfaces:**
- Produces: `ACOES` com `link_plpcg`, `import_plpcg_material`, `create_praise_plpcg`; constantes `PLPCG_ADMIN_WORKER`, `PLPCJF_ASSETS`, `PLPCG_URL`, `STORAGE_PRAISES`, `PLPCG_OUT`, `PLPCG_DB`, `PLPCG_BAIXADOS`, `HASHES_DB` em `core.paths`.

- [ ] **Step 1: Escrever os testes que falham**

Em `tests/test_findings.py`, no fim do arquivo:

```python
def test_acoes_da_migracao_plpcg_sao_aceitas():
    for acao in ("link_plpcg", "import_plpcg_material", "create_praise_plpcg"):
        f = _finding(action=acao, target_type="plpcg", target_id="Q29sQWR1bHRvcy8wMDEucGRm",
                     praise_id=None)
        assert f.action == acao
```

Em `tests/test_apply.py`, logo depois de `test_acao_de_fase_futura_diz_qual_fase`:

```python
def test_acao_da_migracao_plpcg_diz_fase_c(tmp_path):
    conn = _mundo(tmp_path)
    f = Finding(run_id="r1", detector="plpcg_crosswalk", target_type="plpcg",
                target_id="Q29sQWR1bHRvcy8wMDEucGRm", action="link_plpcg",
                confidence="alta", evidence={})
    with pytest.raises(NotImplementedError, match="Fase C"):
        sql_para(f, conn)
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd scripts/validate-acervo && python3 -m pytest tests/test_findings.py::test_acoes_da_migracao_plpcg_sao_aceitas tests/test_apply.py::test_acao_da_migracao_plpcg_diz_fase_c -v`
Expected: os dois FAIL com `ValueError: ação desconhecida: link_plpcg`.

- [ ] **Step 3: Implementar**

`core/findings.py` — trocar o bloco `ACOES`:

```python
ACOES = (
    "delete_material",
    "set_material_kind",
    "set_praise_field",
    "merge_praise",
    "set_group_id",
    "move_material",
    # Migração PLPCG (spec 2026-09-15, §7). Entram no contrato na Fase A para
    # o detector emitir findings com a ação certa; o apply só as implementa
    # na Fase C e até lá recusa nominalmente.
    "link_plpcg",
    "import_plpcg_material",
    "create_praise_plpcg",
)
```

E o comentário do campo: `target_type: str          # material | praise | plpcg | plpcg_grupo`.

`core/apply.py` — o dicionário `FASE_DA_ACAO`:

```python
FASE_DA_ACAO = {
    "delete_material": "Fase 3",
    "set_material_kind": "Fase 2",
    "move_material": "Fase 3B",
    "set_group_id": "Fase 7",
    "link_plpcg": "Fase C da migração PLPCG",
    "import_plpcg_material": "Fase C da migração PLPCG",
    "create_praise_plpcg": "Fase C da migração PLPCG",
}
```

`core/paths.py` — acrescentar depois de `SNAPSHOT_DB`:

```python
# O PLPCG, o app que vai ser desligado (spec 2026-09-15-migracao-plpcg). São
# repos irmãos deste: o admin tem o wrangler do D1 plpcg-catalog, a PWA tem
# os PDFs em assets/. Env para quem tiver os repos em outro lugar.
PLPCG_ADMIN_WORKER = os.environ.get(
    "PLPCG_ADMIN_WORKER",
    os.path.join(os.path.dirname(ROOT), "plpcg-admin", "worker"),
)
PLPCJF_ASSETS = os.environ.get(
    "PLPCJF_ASSETS",
    os.path.join(os.path.dirname(ROOT), "plpcjf", "assets"),
)
PLPCG_URL = "https://plpcg.com/"

# Espelho local pré-R2 dos PDFs do coldigom: <praise_id>/<material_id>.pdf.
# Serve para hash barato; a verdade continua sendo o R2.
STORAGE_PRAISES = os.path.join(ROOT, "storage", "assets", "praises")

PLPCG_OUT = os.path.join(OUT, "plpcg")
PLPCG_DB = os.path.join(PLPCG_OUT, "plpcg.sqlite")
PLPCG_BAIXADOS = os.path.join(PLPCG_OUT, "baixados")
HASHES_DB = os.path.join(OUT, "hashes.sqlite")
```

- [ ] **Step 4: Rodar a suíte inteira**

Run: `cd scripts/validate-acervo && python3 -m pytest tests/ -q`
Expected: 124 passed.

- [ ] **Step 5: Commit**

```bash
git add scripts/validate-acervo/core/findings.py scripts/validate-acervo/core/apply.py scripts/validate-acervo/core/paths.py scripts/validate-acervo/tests/test_findings.py scripts/validate-acervo/tests/test_apply.py
git commit -m "feat(validate-acervo): contrato da migração PLPCG — três ações novas, fase C no apply, caminhos do plpcg

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `core/plpcg.py` — caminho, arquivo local e download

**Files:**
- Create: `scripts/validate-acervo/core/plpcg.py`
- Test: `scripts/validate-acervo/tests/test_plpcg.py`

**Interfaces:**
- Consumes: `core.paths.PLPCJF_ASSETS`, `PLPCG_BAIXADOS`, `PLPCG_URL`.
- Produces: `decodificar`, `codificar`, `caminho_relativo`, `url_publica`, `arquivo_local`, `baixar`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `tests/test_plpcg.py`:

```python
from __future__ import annotations

import io
import os

from core.plpcg import (
    arquivo_local,
    baixar,
    caminho_relativo,
    codificar,
    decodificar,
    url_publica,
)


def test_decodificar_pdf_id_real():
    assert decodificar("Q29sQWR1bHRvcy8wMDEucGRm") == "ColAdultos/001.pdf"


def test_codificar_e_decodificar_sao_inversos_com_acento():
    caminho = "Adicionados/Ainda há tempo/Cifra.pdf"
    pdf_id = codificar(caminho)
    assert "=" not in pdf_id
    assert decodificar(pdf_id) == caminho


def test_caminho_relativo_tira_o_prefixo_assets_uma_vez():
    assert caminho_relativo("ColAdultos/001.pdf") == "ColAdultos/001.pdf"
    assert caminho_relativo("assets/PES/Alto preço - CIFRA.pdf") == "PES/Alto preço - CIFRA.pdf"


def test_url_publica_sempre_debaixo_de_assets():
    assert url_publica("ColAdultos/001.pdf") == "https://plpcg.com/assets/ColAdultos/001.pdf"
    assert url_publica("assets/Coletânea CIAs/110.pdf") == (
        "https://plpcg.com/assets/Colet%C3%A2nea%20CIAs/110.pdf"
    )


def test_arquivo_local_prefere_a_arvore_depois_o_cache(tmp_path):
    raiz = tmp_path / "assets"
    cache = tmp_path / "baixados"
    (raiz / "ColAdultos").mkdir(parents=True)
    (raiz / "ColAdultos" / "001.pdf").write_bytes(b"a")
    (cache / "PES").mkdir(parents=True)
    (cache / "PES" / "x.pdf").write_bytes(b"b")

    assert arquivo_local("ColAdultos/001.pdf", str(raiz), str(cache)) == str(raiz / "ColAdultos" / "001.pdf")
    assert arquivo_local("assets/PES/x.pdf", str(raiz), str(cache)) == str(cache / "PES" / "x.pdf")
    assert arquivo_local("assets/PES/nao-existe.pdf", str(raiz), str(cache)) is None


class _Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.close()


def test_baixar_grava_no_cache_pela_url_publica_e_nao_deixa_part(tmp_path):
    urls = []

    def abrir(url):
        urls.append(url)
        return _Resp(b"%PDF-fake")

    destino = baixar("assets/PES/Alto preço - CIFRA.pdf", cache=str(tmp_path), abrir=abrir)
    assert destino == str(tmp_path / "PES" / "Alto preço - CIFRA.pdf")
    with open(destino, "rb") as f:
        assert f.read() == b"%PDF-fake"
    assert urls == ["https://plpcg.com/assets/PES/Alto%20pre%C3%A7o%20-%20CIFRA.pdf"]
    assert not os.path.exists(destino + ".part")
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd scripts/validate-acervo && python3 -m pytest tests/test_plpcg.py -v`
Expected: FAIL na importação, `ModuleNotFoundError: No module named 'core.plpcg'`.

- [ ] **Step 3: Implementar**

Criar `core/plpcg.py`:

```python
from __future__ import annotations

import base64
import os
import urllib.parse
import urllib.request

from core.paths import PLPCG_BAIXADOS, PLPCG_URL, PLPCJF_ASSETS


# --- caminho e arquivo -------------------------------------------------------

def decodificar(pdf_id: str) -> str:
    """pdf_id é o caminho do PDF em base64 urlsafe, sem o '=' do padding."""
    return base64.urlsafe_b64decode(pdf_id + "=" * (-len(pdf_id) % 4)).decode("utf-8")


def codificar(caminho: str) -> str:
    return base64.urlsafe_b64encode(caminho.encode("utf-8")).decode("ascii").rstrip("=")


def caminho_relativo(caminho: str) -> str:
    """Caminho abaixo de assets/.

    Os pdf_id antigos são 'ColAdultos/001.pdf'; os recentes já vêm com o
    prefixo ('assets/PES/Alto preço - CIFRA.pdf'). Os dois moram debaixo do
    mesmo assets/ — no disco em plpcjf/assets, no site em plpcg.com/assets.
    """
    return caminho[len("assets/"):] if caminho.startswith("assets/") else caminho


def url_publica(caminho: str) -> str:
    return PLPCG_URL + "assets/" + urllib.parse.quote(caminho_relativo(caminho))


def arquivo_local(
    caminho: str, raiz: str = PLPCJF_ASSETS, cache: str = PLPCG_BAIXADOS
) -> str | None:
    """O PDF no disco: primeiro a árvore do plpcjf, depois o que já foi baixado."""
    for base in (raiz, cache):
        p = os.path.join(base, caminho_relativo(caminho))
        if os.path.isfile(p):
            return p
    return None


def baixar(caminho: str, cache: str = PLPCG_BAIXADOS, abrir=urllib.request.urlopen) -> str:
    """Baixa de plpcg.com para o cache.

    Escreve em .part e renomeia no fim: um download interrompido não pode
    passar por arquivo pronto, senão vira um hash errado no cache.
    """
    destino = os.path.join(cache, caminho_relativo(caminho))
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    with abrir(url_publica(caminho)) as resp, open(destino + ".part", "wb") as f:
        while True:
            b = resp.read(1 << 20)
            if not b:
                break
            f.write(b)
    os.replace(destino + ".part", destino)
    return destino
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd scripts/validate-acervo && python3 -m pytest tests/test_plpcg.py -v`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add scripts/validate-acervo/core/plpcg.py scripts/validate-acervo/tests/test_plpcg.py
git commit -m "feat(validate-acervo): core.plpcg — pdf_id, arquivo local e download do PLPCG

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `core/plpcg.py` — cache incremental de sha256

**Files:**
- Modify: `scripts/validate-acervo/core/plpcg.py`
- Test: `scripts/validate-acervo/tests/test_plpcg.py`

**Interfaces:**
- Consumes: `core.paths.HASHES_DB`.
- Produces: `sha256_arquivo`, `pdfs_em`, `abrir_hashes`, `hashear`, `hashes_de`, `hashes_coldigom`, `LADO_PLPCG`, `LADO_COLDIGOM`. Tabela `hashes(lado, rel, tamanho, sha256)` com PK `(lado, rel)`.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar a `tests/test_plpcg.py`:

```python
import hashlib

from core.plpcg import (
    LADO_COLDIGOM,
    LADO_PLPCG,
    abrir_hashes,
    hashear,
    hashes_coldigom,
    hashes_de,
    pdfs_em,
    sha256_arquivo,
)


def test_sha256_arquivo_bate_com_hashlib(tmp_path):
    p = tmp_path / "a.pdf"
    p.write_bytes(b"conteudo")
    assert sha256_arquivo(str(p)) == hashlib.sha256(b"conteudo").hexdigest()


def test_pdfs_em_ignora_ponto_e_nao_pdf(tmp_path):
    (tmp_path / "p1").mkdir()
    (tmp_path / "p1" / "m1.pdf").write_bytes(b"x")
    (tmp_path / "p1" / ".DS_Store").write_bytes(b"x")
    (tmp_path / "p1" / "m2.mp3").write_bytes(b"x")
    (tmp_path / "p2").mkdir()
    (tmp_path / "p2" / "M3.PDF").write_bytes(b"x")
    assert pdfs_em(str(tmp_path)) == {
        os.path.join("p1", "m1.pdf"): str(tmp_path / "p1" / "m1.pdf"),
        os.path.join("p2", "M3.PDF"): str(tmp_path / "p2" / "M3.PDF"),
    }


def test_hashear_e_incremental_por_lado_e_rel(tmp_path):
    (tmp_path / "a.pdf").write_bytes(b"aaa")
    (tmp_path / "b.pdf").write_bytes(b"bbb")
    conn = abrir_hashes(str(tmp_path / "hashes.sqlite"))
    arquivos = {"a.pdf": str(tmp_path / "a.pdf"), "b.pdf": str(tmp_path / "b.pdf")}

    assert hashear(conn, LADO_PLPCG, arquivos) == 2
    assert hashear(conn, LADO_PLPCG, arquivos) == 0

    (tmp_path / "c.pdf").write_bytes(b"ccc")
    arquivos["c.pdf"] = str(tmp_path / "c.pdf")
    assert hashear(conn, LADO_PLPCG, arquivos) == 1

    # o mesmo rel noutro lado é outra linha
    assert hashear(conn, LADO_COLDIGOM, {"a.pdf": str(tmp_path / "a.pdf")}) == 1

    de = hashes_de(conn, LADO_PLPCG)
    assert set(de) == {"a.pdf", "b.pdf", "c.pdf"}
    assert de["a.pdf"] == hashlib.sha256(b"aaa").hexdigest()


def test_hashes_coldigom_agrupa_materiais_pelo_hash(tmp_path):
    for pid, mid, conteudo in (("p1", "m1", b"pagina"), ("p2", "m2", b"pagina"), ("p3", "m3", b"outra")):
        (tmp_path / pid).mkdir()
        (tmp_path / pid / f"{mid}.pdf").write_bytes(conteudo)
    conn = abrir_hashes(str(tmp_path / "hashes.sqlite"))
    hashear(conn, LADO_COLDIGOM, pdfs_em(str(tmp_path)))
    hc = hashes_coldigom(conn)
    assert hc[hashlib.sha256(b"pagina").hexdigest()] == {"m1", "m2"}
    assert hc[hashlib.sha256(b"outra").hexdigest()] == {"m3"}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd scripts/validate-acervo && python3 -m pytest tests/test_plpcg.py -v`
Expected: FAIL na importação, `ImportError: cannot import name 'LADO_COLDIGOM'`.

- [ ] **Step 3: Implementar**

Em `core/plpcg.py`, trocar os imports do topo por:

```python
import base64
import hashlib
import os
import sqlite3
import urllib.parse
import urllib.request
from collections import defaultdict

from core.paths import HASHES_DB, PLPCG_BAIXADOS, PLPCG_URL, PLPCJF_ASSETS

LADO_PLPCG = "plpcg"
LADO_COLDIGOM = "coldigom"
```

e acrescentar no fim do arquivo:

```python
# --- hashes ------------------------------------------------------------------

def sha256_arquivo(caminho: str) -> str:
    h = hashlib.sha256()
    with open(caminho, "rb") as f:
        while True:
            b = f.read(1 << 20)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def pdfs_em(raiz: str) -> dict[str, str]:
    """{caminho relativo: caminho absoluto} de todo .pdf abaixo de raiz."""
    out: dict[str, str] = {}
    for dp, _dn, fns in os.walk(raiz):
        for fn in fns:
            if fn.startswith(".") or not fn.lower().endswith(".pdf"):
                continue
            ab = os.path.join(dp, fn)
            out[os.path.relpath(ab, raiz)] = ab
    return out


def abrir_hashes(db: str = HASHES_DB) -> sqlite3.Connection:
    os.makedirs(os.path.dirname(db) or ".", exist_ok=True)
    conn = sqlite3.connect(db)
    conn.execute(
        """CREATE TABLE IF NOT EXISTS hashes (
             lado TEXT NOT NULL, rel TEXT NOT NULL,
             tamanho INTEGER NOT NULL, sha256 TEXT NOT NULL,
             PRIMARY KEY (lado, rel))"""
    )
    return conn


def hashear(conn: sqlite3.Connection, lado: str, arquivos: dict[str, str]) -> int:
    """Calcula sha256 do que ainda não tem. Devolve quantos calculou agora.

    Incremental por (lado, rel): os 11 mil PDFs do coldigom levam um minuto,
    e re-rodar o detector depois de um ajuste de regra não pode custar isso
    de novo. Arquivo trocado no disco com o mesmo rel NÃO é recalculado —
    apague a linha (ou o out/hashes.sqlite) para forçar.
    """
    feitos = {r[0] for r in conn.execute("SELECT rel FROM hashes WHERE lado = ?", (lado,))}
    n = 0
    for rel, ab in sorted(arquivos.items()):
        if rel in feitos:
            continue
        conn.execute(
            "INSERT OR REPLACE INTO hashes VALUES (?,?,?,?)",
            (lado, rel, os.path.getsize(ab), sha256_arquivo(ab)),
        )
        n += 1
        if n % 500 == 0:
            conn.commit()
    conn.commit()
    return n


def hashes_de(conn: sqlite3.Connection, lado: str) -> dict[str, str]:
    """{rel: sha256} de um lado."""
    return {
        r[0]: r[1]
        for r in conn.execute("SELECT rel, sha256 FROM hashes WHERE lado = ?", (lado,))
    }


def hashes_coldigom(conn: sqlite3.Connection) -> dict[str, set[str]]:
    """{sha256: {material_id}} — rel é '<praise_id>/<material_id>.pdf'.

    É um conjunto porque o coldigom copiou a mesma página da coletânea para
    cada louvor que ela contém: um hash aponta para vários materiais, e só o
    louvor escolhido pela Camada L decide qual deles é o nosso.
    """
    out: dict[str, set[str]] = defaultdict(set)
    for rel, sha in conn.execute(
        "SELECT rel, sha256 FROM hashes WHERE lado = ?", (LADO_COLDIGOM,)
    ):
        out[sha].add(os.path.splitext(os.path.basename(rel))[0])
    return dict(out)
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd scripts/validate-acervo && python3 -m pytest tests/test_plpcg.py -v`
Expected: 10 passed.

- [ ] **Step 5: Commit**

```bash
git add scripts/validate-acervo/core/plpcg.py scripts/validate-acervo/tests/test_plpcg.py
git commit -m "feat(validate-acervo): core.plpcg — cache incremental de sha256 dos dois lados

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `core/plpcg.py` — exportação do D1, `main`, e a rodada real

**Files:**
- Modify: `scripts/validate-acervo/core/plpcg.py`
- Test: `scripts/validate-acervo/tests/test_plpcg.py`

**Interfaces:**
- Consumes: `core.paths.PLPCG_ADMIN_WORKER`, `PLPCG_OUT`, `PLPCG_DB`, `STORAGE_PRAISES`, `ensure_out`; funções das Tasks 2 e 3.
- Produces: `DB_NAME = "plpcg-catalog"`, `TABELAS = ("louvores", "catalog_meta")`, `exportar_d1`, `montar_db`, `conectar`, `meta`, `entradas`, `main`. Cada dict de `entradas()` tem as colunas de `louvores` (`pdf_id, nome, numero, classificacao, categoria, pdf, group_id, short_id`) mais `caminho`.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar a `tests/test_plpcg.py`:

```python
from core.plpcg import TABELAS, entradas, meta, montar_db

DUMP_LOUVORES = """PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE louvores (
  pdf_id        TEXT PRIMARY KEY NOT NULL,
  nome          TEXT NOT NULL,
  numero        TEXT NOT NULL DEFAULT '',
  classificacao TEXT NOT NULL,
  categoria     TEXT NOT NULL,
  pdf           TEXT NOT NULL,
  group_id      TEXT NOT NULL DEFAULT ''
, short_id TEXT);
INSERT INTO "louvores" ("pdf_id","nome","numero","classificacao","categoria","pdf","group_id","short_id") VALUES('Q29sQWR1bHRvcy8wMDEucGRm','O Sangue de Jesus tem poder','001','Coletânea Adultos','Partitura','001.pdf','001:o-sangue-de-jesus-tem-poder','0457');
"""

DUMP_META = """PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE catalog_meta (
  key   TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
INSERT INTO "catalog_meta" ("key","value") VALUES('checksum','0d42d382');
INSERT INTO "catalog_meta" ("key","value") VALUES('row_count','1');
"""


def test_montar_db_le_os_dumps_e_decodifica_o_caminho(tmp_path):
    dumps = tmp_path / "dumps"
    dumps.mkdir()
    (dumps / "louvores.sql").write_text(DUMP_LOUVORES, encoding="utf-8")
    (dumps / "catalog_meta.sql").write_text(DUMP_META, encoding="utf-8")
    assert TABELAS == ("louvores", "catalog_meta")

    conn = montar_db(str(dumps), str(tmp_path / "plpcg.sqlite"))
    assert meta(conn) == {"checksum": "0d42d382", "row_count": "1"}
    es = entradas(conn)
    assert len(es) == 1
    assert es[0]["pdf_id"] == "Q29sQWR1bHRvcy8wMDEucGRm"
    assert es[0]["caminho"] == "ColAdultos/001.pdf"
    assert es[0]["group_id"] == "001:o-sangue-de-jesus-tem-poder"
    assert es[0]["short_id"] == "0457"

    # montar de novo substitui, não acumula
    conn2 = montar_db(str(dumps), str(tmp_path / "plpcg.sqlite"))
    assert len(entradas(conn2)) == 1
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd scripts/validate-acervo && python3 -m pytest tests/test_plpcg.py -v`
Expected: FAIL na importação, `ImportError: cannot import name 'TABELAS'`.

- [ ] **Step 3: Implementar**

Em `core/plpcg.py`, completar os imports:

```python
import argparse
import base64
import hashlib
import os
import sqlite3
import subprocess
import sys
import urllib.parse
import urllib.request
from collections import defaultdict

from core.paths import (
    HASHES_DB,
    PLPCG_ADMIN_WORKER,
    PLPCG_BAIXADOS,
    PLPCG_DB,
    PLPCG_OUT,
    PLPCG_URL,
    PLPCJF_ASSETS,
    STORAGE_PRAISES,
    ensure_out,
)

DB_NAME = "plpcg-catalog"
TABELAS = ("louvores", "catalog_meta")

LADO_PLPCG = "plpcg"
LADO_COLDIGOM = "coldigom"
```

e acrescentar no fim:

```python
# --- o D1 do PLPCG -----------------------------------------------------------

def _wrangler(args: list[str], cwd: str) -> subprocess.CompletedProcess:
    # cwd no worker do plpcg-admin: é lá que está o wrangler.jsonc com o
    # binding do D1 plpcg-catalog. O wrangler do api/ não conhece esse banco.
    return subprocess.run(
        ["wrangler", "d1", *args], cwd=cwd, capture_output=True, text=True, check=True
    )


def exportar_d1(dumps_dir: str, remote: bool = True, cwd: str = PLPCG_ADMIN_WORKER) -> None:
    """Baixa louvores e catalog_meta como .sql de INSERTs. Só leitura."""
    os.makedirs(dumps_dir, exist_ok=True)
    for t in TABELAS:
        args = ["export", DB_NAME, "--table", t, "--output", os.path.join(dumps_dir, f"{t}.sql")]
        if remote:
            args.append("--remote")
        print(f"  exportando {t}...")
        _wrangler(args, cwd)


def conectar(db: str = PLPCG_DB) -> sqlite3.Connection:
    conn = sqlite3.connect(db)
    conn.row_factory = sqlite3.Row
    return conn


def montar_db(dumps_dir: str, db: str = PLPCG_DB) -> sqlite3.Connection:
    if os.path.exists(db):
        os.remove(db)
    os.makedirs(os.path.dirname(db) or ".", exist_ok=True)
    conn = conectar(db)
    for t in TABELAS:
        with open(os.path.join(dumps_dir, f"{t}.sql"), encoding="utf-8") as f:
            conn.executescript(f.read())
    conn.commit()
    return conn


def meta(conn: sqlite3.Connection) -> dict[str, str]:
    """catalog_meta: short_id_next, checksum, row_count. O checksum vai na
    evidência de cada finding — é como se sabe contra qual catálogo a rodada
    foi feita."""
    return {r["key"]: r["value"] for r in conn.execute("SELECT key, value FROM catalog_meta")}


def entradas(conn: sqlite3.Connection) -> list[dict]:
    """Toda linha de louvores, com o caminho já decodificado em 'caminho'."""
    out = []
    for r in conn.execute("SELECT * FROM louvores ORDER BY pdf_id"):
        d = dict(r)
        d["caminho"] = decodificar(d["pdf_id"])
        out.append(d)
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--local", action="store_true",
                    help="usa o D1 local do plpcg-admin em vez do remoto")
    ap.add_argument("--pular-download", action="store_true",
                    help="reusa os dumps já baixados em out/plpcg/dumps")
    ap.add_argument("--sem-rede", action="store_true",
                    help="não baixa de plpcg.com o que falta em plpcjf/assets")
    args = ap.parse_args(argv)

    ensure_out()
    dumps = os.path.join(PLPCG_OUT, "dumps")
    if not args.pular_download:
        print("baixando o D1 plpcg-catalog:")
        exportar_d1(dumps, remote=not args.local)

    print("montando plpcg.sqlite...")
    conn = montar_db(dumps)
    m = meta(conn)
    todas = entradas(conn)
    print(f"  {len(todas)} entradas, checksum {m.get('checksum', '?')}, "
          f"row_count {m.get('row_count', '?')}")

    arquivos: dict[str, str] = {}
    faltam: list[str] = []
    for e in todas:
        p = arquivo_local(e["caminho"])
        if p is None and not args.sem_rede:
            try:
                p = baixar(e["caminho"])
                print(f"  baixado: {e['caminho']}")
            except Exception as exc:  # rede, 404 — o detector segue sem hash
                print(f"  não baixou {e['caminho']}: {exc}")
        if p is None:
            faltam.append(e["caminho"])
        else:
            arquivos[e["caminho"]] = p

    h = abrir_hashes()
    novos = hashear(h, LADO_PLPCG, arquivos)
    print(f"  plpcg: {len(arquivos)} PDFs ({novos} hasheados agora), {len(faltam)} sem arquivo")
    for c in faltam:
        print(f"    sem arquivo: {c}")

    cold = pdfs_em(STORAGE_PRAISES)
    novos = hashear(h, LADO_COLDIGOM, cold)
    print(f"  coldigom: {len(cold)} PDFs em storage/assets/praises ({novos} hasheados agora)")

    print(f"\nplpcg: {PLPCG_DB}\nhashes: {HASHES_DB}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Rodar os testes**

Run: `cd scripts/validate-acervo && python3 -m pytest tests/ -q`
Expected: 135 passed.

- [ ] **Step 5: Rodar de verdade**

Pré-requisito: `wrangler` logado e `dev/plpcg-admin/worker/wrangler.jsonc` existindo (o binding `plpcg-catalog`, database_id `a3dbbf0a-…`).

Run: `cd scripts/validate-acervo && python3 -m core.plpcg`
Expected (números de 15/09; o que importa é a forma):
```
baixando o D1 plpcg-catalog:
  exportando louvores...
  exportando catalog_meta...
montando plpcg.sqlite...
  4633 entradas, checksum 0d42d382…, row_count 4633
  baixado: assets/Coletânea CIAs/110.pdf
  … (uns 40 downloads — os pdf_id com prefixo assets/ não existem em plpcjf/assets)
  plpcg: 4633 PDFs (4633 hasheados agora), 0 sem arquivo
  coldigom: 11110 PDFs em storage/assets/praises (11110 hasheados agora)
```
Leva ~1–2 min (hash dos 11 mil PDFs). Se `sem arquivo` for > 0, listar os caminhos na mensagem de conclusão da task — eles vão cair em faixa sem hash e o dono precisa saber.

Rodar de novo: `python3 -m core.plpcg --pular-download` → `0 hasheados agora` nos dois lados (o cache funciona).

Se o número de downloads divergir dos "27" do spec §2.1, corrigir a frase do spec para o número medido no mesmo commit (o spec diz "27 (prefixo `assets/`…)"; em 15/09 a contagem local deu 40).

- [ ] **Step 6: Commit**

```bash
git add scripts/validate-acervo/core/plpcg.py scripts/validate-acervo/tests/test_plpcg.py docs/superpowers/specs/2026-09-15-migracao-plpcg-design.md
git commit -m "feat(validate-acervo): core.plpcg exporta o D1 do PLPCG e hasheia os PDFs dos dois lados

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Detector — normalização, Camada L (louvor) e Camada P (chaves de caminho)

**Files:**
- Create: `scripts/validate-acervo/detectors/plpcg_crosswalk.py`
- Test: `scripts/validate-acervo/tests/test_plpcg_crosswalk.py`

**Interfaces:**
- Consumes: `core.snapshot.conectar` (o snapshot tem `praises`, `material_kinds`, `tags`, `praise_tags`, `praise_materials`, e opcionalmente `csvmap`).
- Produces: constantes `KIND_ESPERADO`, `FAMILIA`, `PREFIXO_CSV`, `TAGS_POR_CLASSE`, `FAIXAS_CROSSWALK`, `CONTRATO`, `CONTINENCIA_MINIMA`, `SIMILARIDADE_MINIMA`, `MAX_CANDIDATOS`; funções `slug`, `numero_int`, `classe_base`, `classe_ok`, `tags_propostas`, `chaves_csv`, `chaves_plpcg`; `Acervo` (campos `praises`, `slug_de`, `tags`, `materiais`, `praise_do_material`, `por_numero`, `por_slug`, `chave_csv`) com `Acervo.carregar(conn)`; `candidatos_louvor(group_id, classificacao, numero, acervo) -> (praise_ids, evidencias, aproximado)`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `tests/test_plpcg_crosswalk.py`:

```python
from __future__ import annotations

from core.plpcg import codificar
from core.snapshot import conectar
from detectors.plpcg_crosswalk import (
    Acervo,
    candidatos_louvor,
    chaves_csv,
    chaves_plpcg,
    classe_ok,
    numero_int,
    slug,
    tags_propostas,
)


# --- fixture: um acervo do coldigom em miniatura ---------------------------

def _mundo(tmp_path):
    conn = conectar(str(tmp_path / "snap.sqlite"))
    conn.executescript(
        """
        CREATE TABLE praises (id TEXT PRIMARY KEY, name TEXT, number TEXT, author TEXT,
                              rhythm TEXT, tonality TEXT, category TEXT, lyrics TEXT,
                              group_id TEXT, created_at TEXT, updated_at TEXT);
        CREATE TABLE material_kinds (id TEXT PRIMARY KEY, name TEXT);
        CREATE TABLE tags (id TEXT PRIMARY KEY, name TEXT, parent_id TEXT);
        CREATE TABLE praise_tags (praise_id TEXT, tag_id TEXT);
        CREATE TABLE praise_materials (id TEXT PRIMARY KEY, praise_id TEXT, material_kind TEXT,
                              type TEXT, r2_key TEXT, file_path_legacy TEXT,
                              source_material_id TEXT, merged_from_praise_id TEXT, url TEXT,
                              created_at TEXT, is_reviewed INTEGER, reviewed_at TEXT,
                              reviewed_by TEXT);
        CREATE TABLE csvmap (file_path TEXT, material_kind_csv TEXT, praise_tags TEXT,
                             praise_number TEXT, praise_name TEXT, praise_id TEXT,
                             to_convert TEXT, praise_material_id TEXT);
        """
    )
    for nome in ("Sheet Music", "Choir", "Score", "Chord Chart", "Chord Chart I",
                 "Chord Chart II", "CIAs Gestures"):
        conn.execute("INSERT INTO material_kinds VALUES (?,?)", ("k-" + slug(nome), nome))
    for nome in ("Coletânea", "CIAs", "PES", "Avulsos", "GLTM"):
        conn.execute("INSERT INTO tags VALUES (?,?,NULL)", ("t-" + slug(nome), nome))
    return conn


def _praise(conn, pid, nome, numero="", tags=()):
    conn.execute("INSERT INTO praises (id, name, number) VALUES (?,?,?)", (pid, nome, numero))
    for t in tags:
        conn.execute("INSERT INTO praise_tags VALUES (?,?)", (pid, "t-" + slug(t)))


def _material(conn, mid, pid, kind, tipo="pdf"):
    conn.execute(
        "INSERT INTO praise_materials (id, praise_id, material_kind, type) VALUES (?,?,?,?)",
        (mid, pid, "k-" + slug(kind), tipo),
    )


def _csv(conn, file_path, mid):
    conn.execute("INSERT INTO csvmap (file_path, praise_material_id) VALUES (?,?)", (file_path, mid))


def _entrada(caminho, nome, numero, classificacao, categoria, group_id, short_id="0001"):
    """Uma linha de louvores do PLPCG, como core.plpcg.entradas() devolve."""
    return {
        "pdf_id": codificar(caminho), "caminho": caminho, "nome": nome, "numero": numero,
        "classificacao": classificacao, "categoria": categoria,
        "pdf": caminho.split("/")[-1], "group_id": group_id, "short_id": short_id,
    }


# --- normalização -------------------------------------------------------------

def test_slug_tira_acento_pontuacao_e_colapsa():
    assert slug("Clamo a ti [003]") == "clamo-a-ti-003"
    assert slug("Ó profundidade das riquezas!") == "o-profundidade-das-riquezas"
    assert slug("  Regozijai - vos ") == "regozijai-vos"
    assert slug(None) == ""


def test_numero_int_le_o_prefixo_numerico():
    assert numero_int("003") == 3
    assert numero_int("12 A") == 12
    assert numero_int("") is None
    assert numero_int(None) is None
    assert numero_int("Avulso") is None


def test_classe_ok_segue_o_mapa_de_tags():
    assert classe_ok("Coletânea Adultos", {"Coletânea"})
    assert not classe_ok("Coletânea Adultos", {"Coletânea", "CIAs"})
    assert not classe_ok("Coletânea Adultos", {"Coletânea", "PES"})
    assert classe_ok("Coletânea CIAs", {"Coletânea", "CIAs"})
    assert not classe_ok("Coletânea CIAs", {"Coletânea"})
    assert classe_ok("PES (Trombetas e Festas 2025)", {"PES"})
    assert not classe_ok("PES", {"PES", "CIAs"})
    assert classe_ok("PES CIAs", {"PES", "CIAs"})
    assert classe_ok("Avulsos Diversos", {"Avulsos"})
    assert classe_ok("Avulsos Diversos", set())
    assert not classe_ok("Avulsos Diversos", {"Coletânea"})
    assert classe_ok("Avulsos Diversos", {"Coletânea", "Avulsos"})
    assert classe_ok("Avulsos (cifrado)", {"Coletânea"})  # classe fora do mapa: não filtra


def test_tags_propostas_por_classificacao():
    assert tags_propostas("Coletânea Adultos") == ["Coletânea"]
    assert tags_propostas("Coletânea CIAs (Evangelização CIAs Out 2025)") == ["CIAs", "Coletânea"]
    assert tags_propostas("PES CIAs") == ["CIAs", "PES"]
    assert tags_propostas("Avulsos Diversos") == ["Avulsos"]
    assert tags_propostas("Avulsos Diversos (GLTM)") == ["Avulsos", "GLTM"]


# --- Camada P: chaves de caminho ---------------------------------------------

def test_chaves_csv_indexa_por_numero_e_por_nome_da_pasta():
    assert chaves_csv("Coletânea /031 - Meu Deus, meu Pai/Cifra I.pdf") == [
        ("Coletânea", 31, "cifra-i-pdf"),
        ("Coletânea", "meu-deus-meu-pai", "cifra-i-pdf"),
    ]
    assert chaves_csv("Avulsos Diversos/Alto preço/Coro.pdf") == [
        ("Avulsos Diversos", "alto-preco", "coro-pdf"),
    ]
    assert chaves_csv("solto.pdf") == []


def test_chaves_plpcg_traduz_o_caminho_para_a_forma_do_csvmap():
    assert chaves_plpcg("ColAdultos/031.pdf", 31) == [("Coletânea", 31, "partitura-pdf")]
    assert chaves_plpcg("ColCIAs/031.pdf", 31) == [("Coletânea CIAs", 31, "partitura-pdf")]
    assert chaves_plpcg("ColAdultos/000.pdf", None) == []
    assert chaves_plpcg("Louvores Coletânea de Partituras/031 - Meu Deus/Cifra I.pdf", 31) == [
        ("Coletânea", 31, "cifra-i-pdf"),
        ("Coletânea", "meu-deus", "cifra-i-pdf"),
    ]
    avulso = chaves_plpcg("Adicionados/Alto preço/Cifra.pdf", None)
    assert ("Avulsos Diversos", "alto-preco", "cifra-pdf") in avulso
    assert ("GLTM", "alto-preco", "cifra-pdf") in avulso
    assert all(k[1] == "alto-preco" for k in avulso)
    assert chaves_plpcg("assets/PES/Alto preço - CIFRA.pdf", None) == []
    assert chaves_plpcg("04112025/A luz/Cifra.pdf", None) == []


# --- Camada L: o louvor -------------------------------------------------------

def test_acervo_carrega_indices_e_tolera_snapshot_sem_csvmap(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "p31", "Meu Deus, meu Pai", "031", ("Coletânea",))
    _material(conn, "m31", "p31", "Sheet Music")
    _csv(conn, "Coletânea /031 - Meu Deus, meu Pai/Partitura.pdf", "m31")
    conn.commit()
    a = Acervo.carregar(conn)
    assert a.por_numero == {31: ["p31"]}
    assert a.por_slug == {"meu-deus-meu-pai": ["p31"]}
    assert a.tags == {"p31": {"Coletânea"}}
    assert a.materiais == {"p31": [("m31", "Sheet Music", "pdf")]}
    assert a.praise_do_material == {"m31": "p31"}
    assert a.chave_csv[("Coletânea", 31, "partitura-pdf")] == {"m31"}

    conn.execute("DROP TABLE csvmap")
    conn.commit()
    assert Acervo.carregar(conn).chave_csv == {}


def test_louvor_por_numero_desempata_por_slug_e_depois_por_classe(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "pA", "Clamo a ti", "003", ("Coletânea",))
    _praise(conn, "pB", "Clamo a ti", "003", ("Coletânea", "PES"))
    _praise(conn, "pC", "Outro hino", "003", ("Coletânea", "CIAs"))
    conn.commit()
    a = Acervo.carregar(conn)

    P, evid, aprox = candidatos_louvor("003:clamo-a-ti", "PES", "003", a)
    assert P == ["pB"] and evid == ["num", "slug", "classe"] and aprox is False

    P, evid, _ = candidatos_louvor("003:outro-hino", "Coletânea CIAs", "003", a)
    assert P == ["pC"] and evid == ["num", "slug"]

    # o slug deixa pA e pB; a classe (Coletânea sem PES) resolve
    P, evid, _ = candidatos_louvor("003:clamo-a-ti", "Coletânea Adultos", "003", a)
    assert P == ["pA"] and evid == ["num", "slug", "classe"]


def test_avulso_por_nome_exato_continencia_e_similaridade(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "p1", "A ti que habitas entre os querubins", "", ("Avulsos",))
    _praise(conn, "p2", "Regozijai-vos", "", ("Avulsos",))
    _praise(conn, "p3", "Fé", "", ("Avulsos",))
    conn.commit()
    a = Acervo.carregar(conn)

    assert candidatos_louvor("avulso:regozijai-vos", "Avulsos Diversos", "", a) == (["p2"], ["nome"], False)
    # continência: 'a-ti-que-habitas' é prefixo (>= 10 chars) do slug do acervo
    assert candidatos_louvor("avulso:a-ti-que-habitas", "Avulsos Diversos", "", a) == (["p1"], ["nome~"], True)
    # similaridade >= 0.8 (sem continência: o hífen sumiu)
    assert candidatos_louvor("avulso:regozijaivos", "Avulsos Diversos", "", a) == (["p2"], ["nome~"], True)
    # nome curto não casa por continência nem por similaridade
    assert candidatos_louvor("avulso:fe-do-coracao-meu", "Avulsos Diversos", "", a) == ([], [], False)


def test_numero_sem_candidato_cai_para_o_nome(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "p1", "Alto preço", "", ("Avulsos",))
    conn.commit()
    a = Acervo.carregar(conn)
    assert candidatos_louvor("999:alto-preco", "Coletânea Adultos", "999", a) == (["p1"], ["nome"], False)
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd scripts/validate-acervo && python3 -m pytest tests/test_plpcg_crosswalk.py -v`
Expected: FAIL na importação, `ModuleNotFoundError: No module named 'detectors.plpcg_crosswalk'`.

- [ ] **Step 3: Implementar**

Criar `detectors/plpcg_crosswalk.py`:

```python
from __future__ import annotations

import difflib
import re
import sqlite3
import unicodedata
from collections import defaultdict
from dataclasses import dataclass

DETECTOR = "plpcg_crosswalk"

# categoria do PLPCG → kind que a ingestão original deu ao mesmo arquivo
# (medido no spike: Cifra I 1034/1034, Cifra II 1031/1031, Gestos 254/254).
KIND_ESPERADO = {
    "Partitura": "Sheet Music",
    "Cifra nível I": "Chord Chart I",
    "Cifra nível II": "Chord Chart II",
    "Gestos em Gravura": "CIAs Gestures",
    "Cifra": "Chord Chart",
}

# … e a família que ainda conta como "o mesmo tipo de material": a partitura
# avulsa entrou como Choir/Score; uma 'Cifra' sem nível pode ser I ou II.
FAMILIA = {
    "Partitura": {"Sheet Music", "Choir", "Score"},
    "Cifra nível I": {"Chord Chart I"},
    "Cifra nível II": {"Chord Chart II"},
    "Gestos em Gravura": {"CIAs Gestures"},
    "Cifra": {"Chord Chart", "Chord Chart I", "Chord Chart II"},
}

# Prefixo do caminho decodificado do PLPCG → prefixos do csvmap onde o mesmo
# arquivo pode estar. 'assets/…' e as pastas datadas (04112025/…) não têm
# par no csvmap: entram só por número/nome e por hash.
PREFIXO_CSV = {
    "ColAdultos": ("Coletânea",),
    "Louvores Coletânea de Partituras": ("Coletânea",),
    "ColCIAs": ("Coletânea CIAs",),
    "Louvores Coletânea CIAs": ("Coletânea CIAs",),
    "Avulsos": ("Avulsos Diversos", "Avulsos PES", "Coletânea PES",
                "Avulsos PES CIAs", "Avulsos Migrados", "GLTM"),
    "Adicionados": ("Avulsos Diversos", "Avulsos Migrados", "Avulsos PES", "GLTM"),
}

# classificação (sem o parêntese) → tags de um praise criado a partir dela
TAGS_POR_CLASSE = {
    "Coletânea Adultos": ("Coletânea",),
    "Coletânea CIAs": ("Coletânea", "CIAs"),
    "PES": ("PES",),
    "PES CIAs": ("PES", "CIAs"),
}

FAIXAS_CROSSWALK = ("alta", "media", "faltante", "ambiguo", "sem_louvor")

# faixa do cruzamento (spec §5.1) → (confidence do contrato, ação).
# faltante e sem_louvor entram como 'alta' porque o dono decidiu (D4) que
# importação e criação são automáticas; o portão deles é a pré-visualização
# no site e o undo, não a faixa.
CONTRATO = {
    "alta": ("alta", "link_plpcg"),
    "media": ("media", "link_plpcg"),
    "faltante": ("alta", "import_plpcg_material"),
    "ambiguo": ("baixa", "link_plpcg"),
    "sem_louvor": ("media", "import_plpcg_material"),
}

# Continência ('a-ti-que-habitas' dentro de 'a-ti-que-habitas-entre-os-
# querubins') só com 10+ chars: abaixo disso 'deus' está em meio acervo.
CONTINENCIA_MINIMA = 10
SIMILARIDADE_MINIMA = 0.8
MAX_CANDIDATOS = 5


# --- normalização -------------------------------------------------------------

def slug(s: str | None) -> str:
    """Igual ao slug do group_id do PLPCG: ascii, minúsculas, hífens."""
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def numero_int(s: str | None) -> int | None:
    m = re.match(r"\s*(\d+)", s or "")
    return int(m.group(1)) if m else None


def classe_base(classificacao: str) -> str:
    """'PES (Trombetas e Festas 2025)' → 'PES'."""
    return classificacao.split(" (")[0]


def classe_ok(classificacao: str, tags: set[str]) -> bool:
    """A tag é desempate, não chave (spec §2.2): só filtra quando o mapa
    conhece a classe; fora dele, não opina."""
    base = classe_base(classificacao)
    if base == "Coletânea Adultos":
        return "Coletânea" in tags and "CIAs" not in tags and "PES" not in tags
    if base == "Coletânea CIAs":
        return "Coletânea" in tags and "CIAs" in tags
    if base == "PES":
        return "PES" in tags and "CIAs" not in tags
    if base == "PES CIAs":
        return "PES" in tags and "CIAs" in tags
    if base == "Avulsos Diversos":
        return "Coletânea" not in tags or "Avulsos" in tags
    return True


def tags_propostas(classificacao: str) -> list[str]:
    tags = set(TAGS_POR_CLASSE.get(classe_base(classificacao), ("Avulsos",)))
    if "(GLTM)" in classificacao:
        tags.add("GLTM")
    return sorted(tags)


# --- Camada P: chaves de caminho ---------------------------------------------

def _sem_numero(pasta: str) -> str:
    return slug(re.sub(r"^\d+\s*-\s*", "", pasta))


def chaves_csv(file_path: str) -> list[tuple]:
    """Chaves sob as quais uma linha do csvmap fica indexada:
    (prefixo, número da pasta, basename) e (prefixo, slug da pasta, basename)."""
    segs = file_path.split("/")
    if len(segs) < 2:
        return []
    pref, base = segs[0].strip(), slug(segs[-1])
    pasta = segs[1] if len(segs) >= 3 else ""
    chaves: list[tuple] = []
    n = numero_int(pasta)
    if n is not None:
        chaves.append((pref, n, base))
    chaves.append((pref, _sem_numero(pasta), base))
    return chaves


def chaves_plpcg(caminho: str, numero: int | None) -> list[tuple]:
    """As chaves do csvmap que o caminho do PLPCG pode ter.

    'ColAdultos/031.pdf' é a partitura da coletânea, que no csvmap é
    'Coletânea /031 - Nome/Partitura.pdf' — o número vem do louvor, não do
    caminho. Os outros prefixos guardam a pasta do louvor no caminho.
    """
    segs = caminho.split("/")
    prefs = PREFIXO_CSV.get(segs[0], ())
    chaves: list[tuple] = []
    if segs[0] in ("ColAdultos", "ColCIAs"):
        if numero is not None:
            chaves += [(cp, numero, "partitura-pdf") for cp in prefs]
    elif len(segs) >= 3:
        pasta, base, n = segs[1], slug(segs[-1]), numero_int(segs[1])
        for cp in prefs:
            if n is not None:
                chaves.append((cp, n, base))
            chaves.append((cp, _sem_numero(pasta), base))
    return chaves


# --- o acervo do coldigom, indexado ------------------------------------------

@dataclass
class Acervo:
    praises: dict[str, dict]                              # id -> {id, name, number}
    slug_de: dict[str, str]                               # praise_id -> slug(name)
    tags: dict[str, set[str]]                             # praise_id -> nomes de tag
    materiais: dict[str, list[tuple[str, str | None, str]]]  # praise_id -> [(mid, kind, type)]
    praise_do_material: dict[str, str]
    por_numero: dict[int, list[str]]
    por_slug: dict[str, list[str]]
    chave_csv: dict[tuple, set[str]]                      # chave -> {material_id}

    @classmethod
    def carregar(cls, conn: sqlite3.Connection) -> "Acervo":
        kind_nome = {r["id"]: r["name"] for r in conn.execute("SELECT id, name FROM material_kinds")}
        praises = {r["id"]: dict(r) for r in conn.execute("SELECT id, name, number FROM praises")}
        slug_de = {pid: slug(p["name"]) for pid, p in praises.items()}

        tags: dict[str, set[str]] = defaultdict(set)
        for r in conn.execute(
            "SELECT pt.praise_id, t.name FROM praise_tags pt JOIN tags t ON t.id = pt.tag_id"
        ):
            tags[r[0]].add(r[1])

        materiais: dict[str, list] = defaultdict(list)
        praise_do_material: dict[str, str] = {}
        # ORDER BY id: a ordem dos materiais entra na evidência e precisa ser estável
        for r in conn.execute(
            "SELECT id, praise_id, material_kind, type FROM praise_materials ORDER BY id"
        ):
            materiais[r["praise_id"]].append((r["id"], kind_nome.get(r["material_kind"]), r["type"]))
            praise_do_material[r["id"]] = r["praise_id"]

        por_numero: dict[int, list[str]] = defaultdict(list)
        por_slug: dict[str, list[str]] = defaultdict(list)
        for pid, p in sorted(praises.items()):
            n = numero_int(p["number"])
            if n is not None:
                por_numero[n].append(pid)
            por_slug[slug_de[pid]].append(pid)

        chave_csv: dict[tuple, set[str]] = defaultdict(set)
        if conn.execute("SELECT 1 FROM sqlite_master WHERE name = 'csvmap'").fetchone():
            for r in conn.execute(
                "SELECT file_path, praise_material_id FROM csvmap "
                "WHERE praise_material_id IS NOT NULL AND praise_material_id != ''"
            ):
                for k in chaves_csv(r["file_path"]):
                    chave_csv[k].add(r["praise_material_id"])

        return cls(praises, slug_de, dict(tags), dict(materiais), praise_do_material,
                   dict(por_numero), dict(por_slug), dict(chave_csv))


# --- Camada L: o louvor -------------------------------------------------------

def candidatos_louvor(
    group_id: str, classificacao: str, numero: str, acervo: Acervo
) -> tuple[list[str], list[str], bool]:
    """Praises do coldigom para um grupo do PLPCG: (ids, evidências, aproximado).

    Número primeiro, em todas as classes — o arranjo PES do 586 está no
    coldigom só como Coletânea, e filtrar por classe antes do número o
    perdia. Slug e classe são desempate. Só sem número e sem nome exato é
    que o nome aproximado entra, e ele é marcado: nunca vira alta sozinho.
    """
    gnum, gslug = group_id.split(":", 1)
    n = int(gnum) if gnum.isdigit() else numero_int(numero)
    evid: list[str] = []

    def afunilar(c: list[str]) -> list[str]:
        if len(c) > 1:
            s = [p for p in c if acervo.slug_de[p] == gslug]
            if s:
                evid.append("slug")
                c = s
        if len(c) > 1:
            k = [p for p in c if classe_ok(classificacao, acervo.tags.get(p, set()))]
            if k:
                evid.append("classe")
                c = k
        return c

    if n is not None and acervo.por_numero.get(n):
        evid.append("num")
        return afunilar(list(acervo.por_numero[n])), evid, False
    if acervo.por_slug.get(gslug):
        evid.append("nome")
        return afunilar(list(acervo.por_slug[gslug])), evid, False

    proximos: list[str] = []
    if len(gslug) >= CONTINENCIA_MINIMA:
        proximos = [
            s for s in acervo.por_slug
            if len(s) >= CONTINENCIA_MINIMA
            and (s.startswith(gslug + "-") or gslug.startswith(s + "-"))
        ][:3]
    if not proximos:
        proximos = difflib.get_close_matches(
            gslug, list(acervo.por_slug), n=3, cutoff=SIMILARIDADE_MINIMA
        )
    if proximos:
        evid.append("nome~")
        return afunilar([p for s in proximos for p in acervo.por_slug[s]]), evid, True
    return [], evid, False
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd scripts/validate-acervo && python3 -m pytest tests/test_plpcg_crosswalk.py -v`
Expected: 10 passed. Se `test_avulso_por_nome_exato_continencia_e_similaridade` falhar no caso `regozijaivos`, é o `cutoff` do difflib: `SequenceMatcher(None, "regozijaivos", "regozijai-vos").ratio()` = 0.96 — deve passar; se não passar, o erro está na ordem continência → similaridade, não no limiar.

- [ ] **Step 5: Commit**

```bash
git add scripts/validate-acervo/detectors/plpcg_crosswalk.py scripts/validate-acervo/tests/test_plpcg_crosswalk.py
git commit -m "feat(validate-acervo): plpcg_crosswalk — normalização, Camada L (louvor) e chaves da Camada P

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Detector — `cruzar`: corroboração, faixas e candidatos

**Files:**
- Modify: `scripts/validate-acervo/detectors/plpcg_crosswalk.py`
- Test: `scripts/validate-acervo/tests/test_plpcg_crosswalk.py`

**Interfaces:**
- Consumes: `Acervo`, `candidatos_louvor`, `chaves_plpcg`, `FAMILIA`, `numero_int` (Task 5); `hc: dict[str, set[str]]` no formato de `core.plpcg.hashes_coldigom`.
- Produces: `Resultado` (dataclass: `faixa`, `evidencias`, `praise_id`, `material_id`, `kind_coldigom`, `nota`, `candidatos`); `cruzar(entrada, acervo, sha, hc) -> Resultado`. Cada candidato é `{"praise_id", "material_id" | None, "kind" | None, "score": int, "por_que": [str]}`.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar a `tests/test_plpcg_crosswalk.py` (import `cruzar` junto dos outros):

```python
from detectors.plpcg_crosswalk import cruzar


def _cruza(conn, entrada, sha=None, hc=None):
    return cruzar(entrada, Acervo.carregar(conn), sha, hc or {})


def test_numero_mais_hash_e_alta(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "p31", "Meu Deus, meu Pai", "031", ("Coletânea",))
    _material(conn, "m31", "p31", "Sheet Music")
    _material(conn, "a31", "p31", "Audio", tipo="mp3")
    conn.commit()
    e = _entrada("ColAdultos/031.pdf", "Meu Deus, meu Pai", "031", "Coletânea Adultos",
                 "Partitura", "031:meu-deus-meu-pai")
    r = _cruza(conn, e, "sha-31", {"sha-31": {"m31"}})
    assert r.faixa == "alta"
    assert r.evidencias == ["num", "hash"]
    assert (r.praise_id, r.material_id, r.kind_coldigom) == ("p31", "m31", "Sheet Music")
    assert r.nota is None
    assert r.candidatos[0]["material_id"] == "m31" and "hash" in r.candidatos[0]["por_que"]


def test_numero_mais_caminho_e_alta_sem_hash(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "p31", "Meu Deus, meu Pai", "031", ("Coletânea",))
    _material(conn, "c31", "p31", "Chord Chart I")
    _csv(conn, "Coletânea /031 - Meu Deus, meu Pai/Cifra I.pdf", "c31")
    conn.commit()
    e = _entrada("Louvores Coletânea de Partituras/031 - Meu Deus, meu Pai/Cifra I.pdf",
                 "Meu Deus, meu Pai", "031", "Coletânea Adultos", "Cifra nível I",
                 "031:meu-deus-meu-pai")
    r = _cruza(conn, e)
    assert r.faixa == "alta" and r.evidencias == ["num", "path"] and r.material_id == "c31"


def test_pagina_compartilhada_casa_dentro_do_proprio_louvor(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "p31", "Meu Deus, meu Pai", "031", ("Coletânea",))
    _praise(conn, "p32", "Vem, Senhor", "032", ("Coletânea",))
    _material(conn, "m31", "p31", "Sheet Music")
    _material(conn, "m32", "p32", "Sheet Music")
    conn.commit()
    hc = {"sha-pag": {"m31", "m32"}}  # a mesma página copiada para os dois louvores
    r31 = _cruza(conn, _entrada("ColAdultos/031.pdf", "Meu Deus, meu Pai", "031",
                                "Coletânea Adultos", "Partitura", "031:meu-deus-meu-pai"), "sha-pag", hc)
    r32 = _cruza(conn, _entrada("ColAdultos/032.pdf", "Vem, Senhor", "032",
                                "Coletânea Adultos", "Partitura", "032:vem-senhor"), "sha-pag", hc)
    assert (r31.faixa, r31.material_id) == ("alta", "m31")
    assert (r32.faixa, r32.material_id) == ("alta", "m32")


def test_grupo_com_coletanea_e_arranjo_pes_escolhe_o_praise_do_material(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "pA", "Clamo a ti", "003", ("Coletânea",))
    _praise(conn, "pB", "Clamo a ti", "003", ("Coletânea", "PES"))
    _material(conn, "mA", "pA", "Sheet Music")
    _material(conn, "mB", "pB", "Choir")
    conn.commit()
    e = _entrada("Avulsos/Clamo a ti/Coro.pdf", "Clamo a ti", "003", "PES", "Partitura", "003:clamo-a-ti")
    r = _cruza(conn, e, "sha-b", {"sha-b": {"mB"}})
    assert r.faixa == "alta" and r.praise_id == "pB" and r.material_id == "mB"
    assert "classe" in r.evidencias and "hash" in r.evidencias


def test_nome_aproximado_com_hash_fica_em_media(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "p1", "A ti que habitas entre os querubins", "", ("Avulsos",))
    _material(conn, "m1", "p1", "Chord Chart")
    conn.commit()
    e = _entrada("Adicionados/A ti que habitas/Cifra.pdf", "A ti que habitas", "",
                 "Avulsos Diversos", "Cifra", "avulso:a-ti-que-habitas")
    r = _cruza(conn, e, "sha-1", {"sha-1": {"m1"}})
    assert r.faixa == "media" and "nome~" in r.evidencias and r.material_id == "m1"


def test_louvor_unico_com_um_material_do_kind_e_media_kind_unico(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "p1", "Alto preço", "", ("Avulsos",))
    _material(conn, "m1", "p1", "Choir")
    _material(conn, "c1", "p1", "Chord Chart")
    conn.commit()
    e = _entrada("Adicionados/Alto preço/Partitura.pdf", "Alto preço", "", "Avulsos Diversos",
                 "Partitura", "avulso:alto-preco")
    r = _cruza(conn, e)
    assert r.faixa == "media" and r.evidencias == ["nome", "kind-unico"]
    assert r.material_id == "m1" and r.kind_coldigom == "Choir"


def test_louvor_certo_sem_material_do_kind_e_faltante(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "p31", "Meu Deus, meu Pai", "031", ("Coletânea",))
    _material(conn, "a31", "p31", "Audio", tipo="mp3")
    conn.commit()
    e = _entrada("ColAdultos/031.pdf", "Meu Deus, meu Pai", "031", "Coletânea Adultos",
                 "Partitura", "031:meu-deus-meu-pai")
    r = _cruza(conn, e)
    assert r.faixa == "faltante" and r.praise_id == "p31" and r.material_id is None
    assert r.nota == "louvor casado, sem material desse kind"


def test_dois_materiais_do_kind_sem_corroboracao_e_ambiguo_com_candidatos(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "p1", "Alto preço", "", ("Avulsos",))
    _material(conn, "mA", "p1", "Choir")
    _material(conn, "mB", "p1", "Score")
    conn.commit()
    e = _entrada("Adicionados/Alto preço/Partitura.pdf", "Alto preço", "", "Avulsos Diversos",
                 "Partitura", "avulso:alto-preco")
    r = _cruza(conn, e)
    assert r.faixa == "ambiguo" and r.praise_id == "p1" and r.material_id is None
    assert r.nota == "2 materiais do kind, nenhum corroborado"
    assert [c["material_id"] for c in r.candidatos] == ["mA", "mB"]
    assert r.candidatos[0]["por_que"] == ["nome", "kind"]


def test_dois_louvores_sem_desempate_e_ambiguo(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "pA", "Clamo a ti", "003", ("Coletânea",))
    _praise(conn, "pB", "Clamo a ti", "003", ("Coletânea",))
    conn.commit()
    e = _entrada("ColAdultos/003.pdf", "Clamo a ti", "003", "Coletânea Adultos", "Partitura", "003:clamo-a-ti")
    r = _cruza(conn, e)
    assert r.faixa == "ambiguo" and r.praise_id is None and r.nota == "2 louvores candidatos"


def test_kind_divergente_vira_nota_nao_rebaixa(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "p31", "Meu Deus, meu Pai", "031", ("Coletânea",))
    _material(conn, "x31", "p31", "Chord Chart")
    conn.commit()
    e = _entrada("ColAdultos/031.pdf", "Meu Deus, meu Pai", "031", "Coletânea Adultos",
                 "Partitura", "031:meu-deus-meu-pai")
    r = _cruza(conn, e, "sha-31", {"sha-31": {"x31"}})
    assert r.faixa == "alta" and r.material_id == "x31"
    assert r.nota == "kind divergente: coldigom=Chord Chart"


def test_so_hash_num_louvor_unico_e_media_hash_so(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "p1", "Nome completamente outro", "", ("Avulsos",))
    _material(conn, "m1", "p1", "Chord Chart")
    conn.commit()
    e = _entrada("Adicionados/Zzz qqq/Cifra.pdf", "Zzz qqq", "", "Avulsos Diversos", "Cifra", "avulso:zzz-qqq")
    r = _cruza(conn, e, "sha-1", {"sha-1": {"m1"}})
    assert r.faixa == "media" and r.evidencias == ["hash-so"]
    assert r.praise_id == "p1" and r.material_id == "m1"
    assert r.candidatos[0]["por_que"] == ["hash", "kind"]


def test_nada_em_l_nem_em_h_e_sem_louvor(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "p1", "Nome completamente outro", "", ("Avulsos",))
    conn.commit()
    e = _entrada("Adicionados/Zzz qqq/Cifra.pdf", "Zzz qqq", "", "Avulsos Diversos", "Cifra", "avulso:zzz-qqq")
    r = _cruza(conn, e)
    assert r.faixa == "sem_louvor" and r.praise_id is None and r.candidatos == []
    assert r.nota == "nenhum louvor candidato"


def test_hash_em_varios_louvores_sem_l_e_sem_louvor(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "p1", "Um", "", ("Avulsos",))
    _praise(conn, "p2", "Dois", "", ("Avulsos",))
    _material(conn, "m1", "p1", "Sheet Music")
    _material(conn, "m2", "p2", "Sheet Music")
    conn.commit()
    e = _entrada("Adicionados/Zzz qqq/Partitura.pdf", "Zzz qqq", "", "Avulsos Diversos",
                 "Partitura", "avulso:zzz-qqq")
    r = _cruza(conn, e, "sha-pag", {"sha-pag": {"m1", "m2"}})
    assert r.faixa == "sem_louvor" and r.nota == "hash bate em 2 louvores"
    assert {c["praise_id"] for c in r.candidatos} == {"p1", "p2"}


def test_candidatos_no_maximo_cinco_ordenados_por_score(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "p1", "Alto preço", "", ("Avulsos",))
    for i in range(7):
        _material(conn, f"m{i}", "p1", "Choir")
    conn.commit()
    e = _entrada("Adicionados/Alto preço/Partitura.pdf", "Alto preço", "", "Avulsos Diversos",
                 "Partitura", "avulso:alto-preco")
    r = _cruza(conn, e, "sha-3", {"sha-3": {"m3"}})
    assert r.faixa == "alta" and r.material_id == "m3"
    assert len(r.candidatos) == 5
    assert r.candidatos[0]["material_id"] == "m3"
    assert r.candidatos[0]["score"] > r.candidatos[1]["score"]
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd scripts/validate-acervo && python3 -m pytest tests/test_plpcg_crosswalk.py -v`
Expected: FAIL na importação, `ImportError: cannot import name 'cruzar'`.

- [ ] **Step 3: Implementar**

Em `detectors/plpcg_crosswalk.py`, trocar `from dataclasses import dataclass` por `from dataclasses import dataclass, field` e acrescentar no fim:

```python
# --- o cruzamento de uma entrada ---------------------------------------------

@dataclass
class Resultado:
    faixa: str
    evidencias: list[str]
    praise_id: str | None = None
    material_id: str | None = None
    kind_coldigom: str | None = None
    nota: str | None = None
    candidatos: list[dict] = field(default_factory=list)


def _testemunhas(m: str, H: set[str], Pth: set[str]) -> list[str]:
    return [e for e, s in (("hash", H), ("path", Pth)) if m in s]


def _candidatos(
    P: list[str], evid_l: list[str], H: set[str], Pth: set[str], acervo: Acervo, fam: set[str]
) -> list[dict]:
    """Até MAX_CANDIDATOS (praise, material?) com o porquê de cada um.

    É o que o site mostra ao lado do PDF do PLPCG. Entram os praises da
    Camada L e os que só o hash apontou; por praise, cada material pdf que
    trouxe testemunha própria (hash, path, kind da família), e o praise
    sozinho quando nenhum material trouxe.
    """
    so_hash = sorted({acervo.praise_do_material[m] for m in H if m in acervo.praise_do_material} - set(P))
    out: list[dict] = []
    for p in list(P) + so_hash:
        base = list(evid_l) if p in P else []
        algum = False
        for (m, k, t) in acervo.materiais.get(p, []):
            if t != "pdf":
                continue
            por_que = base + _testemunhas(m, H, Pth) + (["kind"] if k in fam else [])
            if len(por_que) > len(base):
                out.append({"praise_id": p, "material_id": m, "kind": k,
                            "score": len(por_que), "por_que": por_que})
                algum = True
        if not algum and base:
            out.append({"praise_id": p, "material_id": None, "kind": None,
                        "score": len(base), "por_que": base})
    out.sort(key=lambda c: (-c["score"], c["praise_id"], c["material_id"] or ""))
    return out[:MAX_CANDIDATOS]


def cruzar(entrada: dict, acervo: Acervo, sha: str | None, hc: dict[str, set[str]]) -> Resultado:
    """As camadas do spec §5 para uma entrada do PLPCG.

    L escolhe o(s) louvor(es); H e P só contam DENTRO deles (a página da
    coletânea com 31–34 é o mesmo arquivo em quatro louvores — hash sozinho
    não decide). Um único material corroborado escolhe louvor e material.
    """
    fam = FAMILIA[entrada["categoria"]]
    gnum = entrada["group_id"].split(":", 1)[0]
    n = int(gnum) if gnum.isdigit() else numero_int(entrada["numero"])

    P, evid, aproximado = candidatos_louvor(
        entrada["group_id"], entrada["classificacao"], entrada["numero"], acervo
    )
    H: set[str] = set(hc.get(sha, ())) if sha else set()
    Pth: set[str] = set()
    for k in chaves_plpcg(entrada["caminho"], n):
        Pth |= acervo.chave_csv.get(k, set())

    corro = sorted({
        m for p in P for (m, _k, t) in acervo.materiais.get(p, [])
        if t == "pdf" and (m in H or m in Pth)
    })

    if len(corro) == 1:
        m = corro[0]
        p = acervo.praise_do_material[m]
        k = next(k for (mm, k, _t) in acervo.materiais[p] if mm == m)
        r = Resultado("media" if aproximado else "alta", evid + _testemunhas(m, H, Pth), p, m, k)
        if k not in fam:
            # O hash prova que é o mesmo arquivo; o kind errado é assunto da
            # Fase 2 do validate-acervo, não deste cruzamento.
            r.nota = f"kind divergente: coldigom={k}"
    elif len(corro) > 1:
        pr = {acervo.praise_do_material[m] for m in corro}
        r = Resultado("ambiguo", evid, nota=f"{len(corro)} materiais corroborados em {len(pr)} louvor(es)")
        if len(pr) == 1:
            r.praise_id = next(iter(pr))
    elif len(P) == 1:
        p = P[0]
        do_kind = [(m, k) for (m, k, t) in acervo.materiais.get(p, []) if t == "pdf" and k in fam]
        if len(do_kind) == 1:
            r = Resultado("media", evid + ["kind-unico"], p, do_kind[0][0], do_kind[0][1])
        elif not do_kind:
            r = Resultado("media" if aproximado else "faltante", evid, p,
                          nota="louvor casado, sem material desse kind")
        else:
            r = Resultado("ambiguo", evid, p, nota=f"{len(do_kind)} materiais do kind, nenhum corroborado")
    elif len(P) > 1:
        r = Resultado("ambiguo", evid, nota=f"{len(P)} louvores candidatos")
    else:
        so_hash = {acervo.praise_do_material[m] for m in H if m in acervo.praise_do_material}
        if len(so_hash) == 1:
            p = next(iter(so_hash))
            dele = [m for (m, _k, _t) in acervo.materiais[p] if m in H]
            r = Resultado("media", evid + ["hash-so"], p,
                          dele[0] if len(dele) == 1 else None,
                          nota="só hash: mesmo arquivo em " + acervo.praises[p]["name"])
            if r.material_id:
                r.kind_coldigom = next(k for (m, k, _t) in acervo.materiais[p] if m == r.material_id)
        elif so_hash:
            r = Resultado("sem_louvor", evid, nota=f"hash bate em {len(so_hash)} louvores")
        else:
            r = Resultado("sem_louvor", evid, nota="nenhum louvor candidato")

    # aos candidatos vai só a evidência da Camada L; hash/path/kind cada
    # material traz a sua
    r.candidatos = _candidatos(P, [e for e in evid if e in EVIDENCIAS_L], H, Pth, acervo, fam)
    return r
```

E, junto das constantes do topo do arquivo:

```python
# As evidências que são do louvor (Camada L), não do material.
EVIDENCIAS_L = ("num", "nome", "nome~", "slug", "classe")
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd scripts/validate-acervo && python3 -m pytest tests/test_plpcg_crosswalk.py -v`
Expected: 24 passed.

Se `test_so_hash_num_louvor_unico_e_media_hash_so` falhar em `por_que == ["hash", "kind"]`: o praise veio por `so_hash` (não está em `P`), então `base` é `[]` e o material traz `hash` e `kind` — confira que `_candidatos` está sendo chamado com `P` vazio, não com `[r.praise_id]`.

- [ ] **Step 5: Commit**

```bash
git add scripts/validate-acervo/detectors/plpcg_crosswalk.py scripts/validate-acervo/tests/test_plpcg_crosswalk.py
git commit -m "feat(validate-acervo): plpcg_crosswalk — corroboração hash/caminho dentro do louvor, faixas e candidatos

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Detector — `detectar`, finding por entrada e por grupo, resumo, `main`, e a rodada 1

**Files:**
- Modify: `scripts/validate-acervo/detectors/plpcg_crosswalk.py`
- Test: `scripts/validate-acervo/tests/test_plpcg_crosswalk.py`
- Create: `scripts/validate-acervo/gabaritos/plpcg_crosswalk/rodada1/resumo.md`, `…/rodada1/findings.jsonl`

**Interfaces:**
- Consumes: `core.findings.Finding`, `Motivos`, `write_findings`; `core.plpcg.conectar`, `entradas`, `meta`, `abrir_hashes`, `hashes_de`, `hashes_coldigom`, `LADO_PLPCG`; `core.snapshot.conectar`; `core.paths.OUT`, `SNAPSHOT_DB`, `PLPCG_DB`, `HASHES_DB`, `ensure_out`.
- Produces: `detectar(snap, todas, checksum, hp, hc, run_id) -> (findings, motivos)`; `resumo(findings) -> str`; `main`. Finding da entrada: `target_type="plpcg"`, `target_id=pdf_id`, `field=None`, `praise_id`, `proposed=material_id`, `action`/`confidence` por `CONTRATO`, `evidence` com `faixa, evidencias, nome, numero, classificacao, categoria, group_id, short_id, path, sha256, kind_esperado, kind_coldigom, material_id, nota, candidatos, checksum`. Finding do grupo: `target_type="plpcg_grupo"`, `target_id=group_id`, `action="create_praise_plpcg"`, `confidence="alta"`, `proposed=nome`, `evidence` com `faixa="sem_louvor", nome, numero, classificacao, tags, entradas[{pdf_id, categoria, path, kind}], parecido{praise_id, nome, score} | None, checksum`.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar a `tests/test_plpcg_crosswalk.py` (import `detectar`, `resumo` junto dos outros):

```python
from detectors.plpcg_crosswalk import detectar, resumo


def test_detectar_emite_um_finding_por_entrada_com_o_contrato(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "p31", "Meu Deus, meu Pai", "031", ("Coletânea",))
    _material(conn, "m31", "p31", "Sheet Music")
    conn.commit()
    e = _entrada("ColAdultos/031.pdf", "Meu Deus, meu Pai", "031", "Coletânea Adultos",
                 "Partitura", "031:meu-deus-meu-pai", short_id="0457")
    findings, motivos = detectar(conn, [e], "chk-1", {e["caminho"]: "sha-31"}, {"sha-31": {"m31"}}, "r1")
    assert motivos.total() == 0
    assert len(findings) == 1
    f = findings[0]
    assert (f.detector, f.target_type, f.target_id) == ("plpcg_crosswalk", "plpcg", e["pdf_id"])
    assert (f.action, f.confidence) == ("link_plpcg", "alta")
    assert f.praise_id == "p31" and f.proposed == "m31" and f.field is None
    ev = f.evidence
    assert ev["faixa"] == "alta" and ev["evidencias"] == ["num", "hash"]
    assert ev["short_id"] == "0457" and ev["group_id"] == "031:meu-deus-meu-pai"
    assert ev["path"] == "ColAdultos/031.pdf" and ev["sha256"] == "sha-31"
    assert ev["kind_esperado"] == "Sheet Music" and ev["kind_coldigom"] == "Sheet Music"
    assert ev["checksum"] == "chk-1" and ev["candidatos"][0]["material_id"] == "m31"


def test_faixas_viram_confidence_e_acao_pelo_contrato(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "p31", "Meu Deus, meu Pai", "031", ("Coletânea",))
    _material(conn, "a31", "p31", "Audio", tipo="mp3")
    _praise(conn, "p1", "Alto preço", "", ("Avulsos",))
    _material(conn, "mA", "p1", "Choir")
    _material(conn, "mB", "p1", "Score")
    conn.commit()
    faltante = _entrada("ColAdultos/031.pdf", "Meu Deus, meu Pai", "031", "Coletânea Adultos",
                        "Partitura", "031:meu-deus-meu-pai")
    ambiguo = _entrada("Adicionados/Alto preço/Partitura.pdf", "Alto preço", "", "Avulsos Diversos",
                       "Partitura", "avulso:alto-preco")
    findings, _ = detectar(conn, [faltante, ambiguo], "chk", {}, {}, "r1")
    por_id = {f.target_id: f for f in findings}
    assert (por_id[faltante["pdf_id"]].action, por_id[faltante["pdf_id"]].confidence) == ("import_plpcg_material", "alta")
    assert (por_id[ambiguo["pdf_id"]].action, por_id[ambiguo["pdf_id"]].confidence) == ("link_plpcg", "baixa")
    assert por_id[ambiguo["pdf_id"]].proposed is None


def test_grupo_todo_sem_louvor_ganha_finding_de_criacao(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "p1", "Ainda há esperança", "", ("Avulsos",))
    conn.commit()
    cifra = _entrada("Adicionados/Ainda há tempo/Cifra.pdf", "Ainda há tempo", "", "Avulsos Diversos",
                     "Cifra", "avulso:ainda-ha-tempo")
    gestos = _entrada("Adicionados/Ainda há tempo/Gestos CIAs.pdf", "Ainda há tempo", "", "Avulsos Diversos",
                      "Gestos em Gravura", "avulso:ainda-ha-tempo")
    findings, _ = detectar(conn, [cifra, gestos], "chk", {}, {}, "r1")
    assert len(findings) == 3
    entradas_ = [f for f in findings if f.target_type == "plpcg"]
    assert all((f.action, f.confidence, f.praise_id) == ("import_plpcg_material", "media", None) for f in entradas_)
    assert all(f.evidence["faixa"] == "sem_louvor" for f in entradas_)

    g = next(f for f in findings if f.target_type == "plpcg_grupo")
    assert g.target_id == "avulso:ainda-ha-tempo"
    assert (g.action, g.confidence, g.proposed) == ("create_praise_plpcg", "alta", "Ainda há tempo")
    assert g.evidence["numero"] == "" and g.evidence["tags"] == ["Avulsos"]
    assert [x["pdf_id"] for x in g.evidence["entradas"]] == [cifra["pdf_id"], gestos["pdf_id"]]
    assert g.evidence["entradas"][1]["kind"] == "CIAs Gestures"
    assert g.evidence["parecido"]["praise_id"] == "p1" and 0 < g.evidence["parecido"]["score"] < 1


def test_grupo_numerado_da_coletanea_e_criado_com_numero_e_tags(tmp_path):
    conn = _mundo(tmp_path)
    conn.commit()
    e = _entrada("ColCIAs/999.pdf", "Novo hino", "999", "Coletânea CIAs", "Partitura", "999:novo-hino")
    findings, _ = detectar(conn, [e], "chk", {}, {}, "r1")
    g = next(f for f in findings if f.target_type == "plpcg_grupo")
    assert g.evidence["numero"] == "999" and g.evidence["tags"] == ["CIAs", "Coletânea"]
    assert g.evidence["parecido"] is None


def test_grupo_misto_nao_ganha_finding_de_criacao(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "p1", "Nome completamente outro", "", ("Avulsos",))
    _material(conn, "m1", "p1", "Chord Chart")
    conn.commit()
    com_hash = _entrada("Adicionados/Zzz qqq/Cifra.pdf", "Zzz qqq", "", "Avulsos Diversos", "Cifra", "avulso:zzz-qqq")
    sem_nada = _entrada("Adicionados/Zzz qqq/Gestos CIAs.pdf", "Zzz qqq", "", "Avulsos Diversos",
                        "Gestos em Gravura", "avulso:zzz-qqq")
    findings, _ = detectar(conn, [com_hash, sem_nada], "chk", {com_hash["caminho"]: "sha-1"}, {"sha-1": {"m1"}}, "r1")
    assert [f.target_type for f in findings] == ["plpcg", "plpcg"]
    assert findings[0].evidence["faixa"] == "media" and findings[1].evidence["faixa"] == "sem_louvor"


def test_categoria_fora_do_mapa_e_excluida_com_motivo(tmp_path):
    conn = _mundo(tmp_path)
    conn.commit()
    e = _entrada("Adicionados/X/Video.pdf", "X", "", "Avulsos Diversos", "Vídeo", "avulso:x")
    findings, motivos = detectar(conn, [e], "chk", {}, {}, "r1")
    assert findings == [] and motivos.total() == 1
    assert "categoria fora do mapa: Vídeo" in motivos.tabela()


def test_finding_id_nao_muda_entre_rodadas(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "p31", "Meu Deus, meu Pai", "031", ("Coletânea",))
    _material(conn, "m31", "p31", "Sheet Music")
    conn.commit()
    e = _entrada("ColAdultos/031.pdf", "Meu Deus, meu Pai", "031", "Coletânea Adultos",
                 "Partitura", "031:meu-deus-meu-pai")
    a, _ = detectar(conn, [e], "chk", {}, {}, "r1")
    b, _ = detectar(conn, [e], "chk", {}, {}, "r2")
    assert a[0].finding_id == b[0].finding_id and a[0].run_id != b[0].run_id


def test_resumo_reproduz_a_tabela_por_categoria_e_faixa(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "p31", "Meu Deus, meu Pai", "031", ("Coletânea",))
    _material(conn, "m31", "p31", "Sheet Music")
    conn.commit()
    alta = _entrada("ColAdultos/031.pdf", "Meu Deus, meu Pai", "031", "Coletânea Adultos",
                    "Partitura", "031:meu-deus-meu-pai")
    novo = _entrada("Adicionados/Zzz/Cifra.pdf", "Zzz", "", "Avulsos Diversos", "Cifra", "avulso:zzz")
    findings, _ = detectar(conn, [alta, novo], "chk", {alta["caminho"]: "s"}, {"s": {"m31"}}, "r1")
    texto = resumo(findings)
    assert "| Partitura | 1 | 0 | 0 | 0 | 0 | 1 |" in texto
    assert "| Cifra | 0 | 0 | 0 | 0 | 1 | 1 |" in texto
    assert "| **total** | 1 | 0 | 0 | 0 | 1 | 2 |" in texto
    assert "Louvores do PLPCG (grupos): 2" in texto
    assert "- todas alta: 1" in texto and "- ausente no coldigom: 1" in texto
    assert "- num+hash: 1" in texto
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd scripts/validate-acervo && python3 -m pytest tests/test_plpcg_crosswalk.py -v`
Expected: FAIL na importação, `ImportError: cannot import name 'detectar'`.

- [ ] **Step 3: Implementar**

Em `detectors/plpcg_crosswalk.py`, completar os imports do topo:

```python
import argparse
import difflib
import os
import re
import sqlite3
import sys
import time
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass, field

from core.findings import Finding, Motivos, write_findings
from core.paths import HASHES_DB, OUT, PLPCG_DB, SNAPSHOT_DB, ensure_out
from core.plpcg import (
    LADO_PLPCG,
    abrir_hashes,
    conectar as conectar_plpcg,
    entradas,
    hashes_coldigom,
    hashes_de,
    meta,
)
from core.snapshot import conectar
```

acrescentar junto das constantes:

```python
CATEGORIAS = ("Partitura", "Cifra nível I", "Cifra nível II", "Cifra", "Gestos em Gravura")
```

e no fim do arquivo:

```python
# --- findings -----------------------------------------------------------------

def _finding(run_id: str, e: dict, sha: str | None, r: Resultado, checksum: str) -> Finding:
    confidence, acao = CONTRATO[r.faixa]
    return Finding(
        run_id=run_id,
        detector=DETECTOR,
        target_type="plpcg",
        target_id=e["pdf_id"],
        praise_id=r.praise_id,
        action=acao,
        confidence=confidence,
        proposed=r.material_id,
        evidence={
            "faixa": r.faixa,
            "evidencias": r.evidencias,
            "nome": e["nome"],
            "numero": e["numero"],
            "classificacao": e["classificacao"],
            "categoria": e["categoria"],
            "group_id": e["group_id"],
            "short_id": e["short_id"],
            "path": e["caminho"],
            "sha256": sha,
            "kind_esperado": KIND_ESPERADO[e["categoria"]],
            "kind_coldigom": r.kind_coldigom,
            "material_id": r.material_id,
            "nota": r.nota,
            "candidatos": r.candidatos,
            "checksum": checksum,
        },
    )


def _mais_parecido(gslug: str, acervo: Acervo) -> dict | None:
    """O nome mais próximo no coldigom, como aviso: 'se isto já existe, é
    provavelmente este'. cutoff=0 devolve sempre o melhor, por pior que seja."""
    if not acervo.por_slug:
        return None
    perto = difflib.get_close_matches(gslug, list(acervo.por_slug), n=1, cutoff=0.0)
    if not perto:
        return None
    pid = acervo.por_slug[perto[0]][0]
    score = difflib.SequenceMatcher(None, gslug, perto[0]).ratio()
    return {"praise_id": pid, "nome": acervo.praises[pid]["name"], "score": round(score, 2)}


def _finding_grupo(run_id: str, gid: str, itens: list[tuple[dict, Resultado]],
                   acervo: Acervo, checksum: str) -> Finding:
    """Um louvor que só existe no PLPCG (D4): praise + tags + um import por entrada."""
    gnum, gslug = gid.split(":", 1)
    nome = Counter(e["nome"] for e, _ in itens).most_common(1)[0][0]
    classificacao = itens[0][0]["classificacao"]
    # number só quando o grupo é numerado E é coletânea: um avulso com
    # número no PLPCG é número de pasta, não da coletânea (spec §7).
    numero = gnum if gnum.isdigit() and classe_base(classificacao).startswith("Coletânea") else ""
    return Finding(
        run_id=run_id,
        detector=DETECTOR,
        target_type="plpcg_grupo",
        target_id=gid,
        praise_id=None,
        action="create_praise_plpcg",
        confidence="alta",
        proposed=nome,
        evidence={
            "faixa": "sem_louvor",
            "nome": nome,
            "numero": numero,
            "classificacao": classificacao,
            "tags": tags_propostas(classificacao),
            "entradas": [
                {"pdf_id": e["pdf_id"], "categoria": e["categoria"], "path": e["caminho"],
                 "kind": KIND_ESPERADO[e["categoria"]]}
                for e, _ in itens
            ],
            "parecido": _mais_parecido(gslug, acervo),
            "checksum": checksum,
        },
    )


def detectar(
    snap: sqlite3.Connection,
    todas: list[dict],
    checksum: str,
    hp: dict[str, str],
    hc: dict[str, set[str]],
    run_id: str,
) -> tuple[list[Finding], Motivos]:
    acervo = Acervo.carregar(snap)
    findings: list[Finding] = []
    motivos = Motivos()
    por_grupo: dict[str, list[tuple[dict, Resultado]]] = defaultdict(list)

    for e in todas:
        if e["categoria"] not in KIND_ESPERADO:
            motivos.excluir(f"categoria fora do mapa: {e['categoria']}")
            continue
        if ":" not in (e.get("group_id") or ""):
            motivos.excluir("sem group_id — o PLPCG não diz qual louvor é")
            continue
        r = cruzar(e, acervo, hp.get(e["caminho"]), hc)
        findings.append(_finding(run_id, e, hp.get(e["caminho"]), r, checksum))
        por_grupo[e["group_id"]].append((e, r))

    # Um grupo inteiro sem louvor é um louvor novo. Grupo misto (uma entrada
    # achou o louvor pelo hash, outra não) NÃO é: vai para o site.
    for gid, itens in sorted(por_grupo.items()):
        if all(r.faixa == "sem_louvor" for _, r in itens):
            findings.append(_finding_grupo(run_id, gid, itens, acervo, checksum))

    return findings, motivos


def resumo(findings: list[Finding]) -> str:
    """A tabela do spec §2.3 (categoria × faixa) e o resumo por louvor."""
    ents = [f for f in findings if f.target_type == "plpcg"]
    tab = Counter((f.evidence["categoria"], f.evidence["faixa"]) for f in ents)
    linhas = [
        "| categoria | " + " | ".join(FAIXAS_CROSSWALK) + " | total |",
        "|---|" + "---|" * (len(FAIXAS_CROSSWALK) + 1),
    ]
    for cat in CATEGORIAS:
        ns = [tab[(cat, fx)] for fx in FAIXAS_CROSSWALK]
        linhas.append(f"| {cat} | " + " | ".join(str(n) for n in ns) + f" | {sum(ns)} |")
    tot = [sum(tab[(c, fx)] for c in CATEGORIAS) for fx in FAIXAS_CROSSWALK]
    linhas.append("| **total** | " + " | ".join(str(n) for n in tot) + f" | {len(ents)} |")

    por_grupo: dict[str, list[str]] = defaultdict(list)
    for f in ents:
        por_grupo[f.evidence["group_id"]].append(f.evidence["faixa"])
    g: Counter = Counter()
    for fx in por_grupo.values():
        if all(x == "alta" for x in fx):
            g["todas alta"] += 1
        elif all(x == "sem_louvor" for x in fx):
            g["ausente no coldigom"] += 1
        elif "sem_louvor" in fx or "ambiguo" in fx:
            g["precisa de revisão"] += 1
        else:
            g["alta/média/faltante sem ambiguidade"] += 1
    linhas += ["", f"Louvores do PLPCG (grupos): {len(por_grupo)}"]
    for k in ("todas alta", "alta/média/faltante sem ambiguidade", "precisa de revisão", "ausente no coldigom"):
        linhas.append(f"- {k}: {g[k]}")

    ev = Counter("+".join(f.evidence["evidencias"]) for f in ents if f.evidence["faixa"] == "alta")
    linhas += ["", "Evidência na faixa alta:"]
    for k, n in ev.most_common():
        linhas.append(f"- {k}: {n}")
    return "\n".join(linhas)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=SNAPSHOT_DB, help="snapshot do coldigom")
    ap.add_argument("--plpcg", default=PLPCG_DB, help="exportação do PLPCG (python3 -m core.plpcg)")
    ap.add_argument("--hashes", default=HASHES_DB)
    ap.add_argument("--out", default=os.path.join(OUT, "plpcg_crosswalk"))
    args = ap.parse_args(argv)

    ensure_out()
    os.makedirs(args.out, exist_ok=True)
    run_id = time.strftime("%Y-%m-%dT%H%MZ-", time.gmtime()) + DETECTOR

    snap = conectar(args.db)
    plp = conectar_plpcg(args.plpcg)
    h = abrir_hashes(args.hashes)
    todas = entradas(plp)
    checksum = meta(plp).get("checksum", "")

    findings, motivos = detectar(snap, todas, checksum, hashes_de(h, LADO_PLPCG), hashes_coldigom(h), run_id)

    print(f"\n{DETECTOR} — {len(todas)} entradas do PLPCG (checksum {checksum[:12]})")
    print("exclusões:")
    print(motivos.tabela())
    texto = resumo(findings)
    print()
    print(texto)

    fj = os.path.join(args.out, "findings.jsonl")
    write_findings(findings, fj)
    with open(os.path.join(args.out, "resumo.md"), "w", encoding="utf-8") as f:
        f.write(f"# {DETECTOR} — {run_id}\n\nchecksum do catálogo PLPCG: `{checksum}`\n\n{texto}\n")
    print(f"\nfindings: {fj}")
    print(f"resumo:   {os.path.join(args.out, 'resumo.md')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Rodar a suíte inteira**

Run: `cd scripts/validate-acervo && python3 -m pytest tests/ -q`
Expected: 167 passed.

- [ ] **Step 5: A rodada 1, de verdade**

Pré-requisitos: Task 4 rodada (`out/plpcg/plpcg.sqlite` e `out/hashes.sqlite` existem) e o snapshot recente (`python3 -m core.snapshot` foi rodado em 15/09; se o dia for outro, rodar de novo — é o D1 de produção).

Run: `cd scripts/validate-acervo && python3 -m detectors.plpcg_crosswalk`
Expected: a tabela com a forma do spec §2.3 e números próximos (o spike deu, em 15/09: alta 3649 · média 276 · faltante 98 · ambíguo 263 · sem louvor 347 · total 4633; grupos 1897, ausentes 338). Divergência de algumas dezenas por faixa é esperada — a ordem continência → similaridade e o `hash-so` com material foram ajustados em relação ao spike. Divergência de centenas é bug: comparar com `evidence["faixa"]` por categoria antes de seguir.

Copiar a rodada para o git (regra da Fase 1: nada fica só em `out/`):

```bash
mkdir -p gabaritos/plpcg_crosswalk/rodada1
cp out/plpcg_crosswalk/resumo.md out/plpcg_crosswalk/findings.jsonl gabaritos/plpcg_crosswalk/rodada1/
ls -la gabaritos/plpcg_crosswalk/rodada1/
```

O `findings.jsonl` tem ~4.633 + ~338 linhas (alguns MB). Ele entra no git porque é o que o site da Fase B vai ler e o que as decisões do dono vão referenciar por `finding_id`.

- [ ] **Step 6: Commit**

```bash
git add scripts/validate-acervo/detectors/plpcg_crosswalk.py scripts/validate-acervo/tests/test_plpcg_crosswalk.py scripts/validate-acervo/gabaritos/plpcg_crosswalk/rodada1/
git commit -m "feat(validate-acervo): plpcg_crosswalk emite findings por entrada e por louvor novo — rodada 1

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

Na mensagem de conclusão desta task, colar a tabela impressa e os quatro números por grupo.

---

### Task 8: Migração 019, README

**Files:**
- Create: `api/migrations/019_plpcg_crosswalk.sql`
- Modify: `scripts/validate-acervo/README.md`

**Interfaces:**
- Produces: tabela `plpcg_crosswalk` no D1 `coldigom` (remoto), exatamente o §8.1 do spec.

- [ ] **Step 1: Escrever a migração**

Criar `api/migrations/019_plpcg_crosswalk.sql`:

```sql
-- Crosswalk PLPCG → coldigom (spec docs/superpowers/specs/2026-09-15-migracao-plpcg-design.md, §8.1).
--
-- Uma linha por pdf_id do catálogo do PLPCG, apontando o material do coldigom
-- que o substitui. É o que faz plpcg.com/?s=<short_id> e as listas salvas do
-- coldigui continuarem vivas depois que o PLPCG desligar (GET /api/plpcg/resolve
-- e /api/plpcg/manifest, Fase D).
--
-- Sem FK, como o resto da casa: a integridade é do scripts/validate-acervo/core/apply.py,
-- que é a única porta de escrita (link_plpcg / import_plpcg_material /
-- create_praise_plpcg, Fase C). Um material do coldigom pode ter várias pdf_id
-- (o PLPCG tem 56 duplicatas internas medidas).
--
-- Aplicar: cd api && wrangler d1 execute coldigom --remote --file=migrations/019_plpcg_crosswalk.sql

CREATE TABLE IF NOT EXISTS plpcg_crosswalk (
  pdf_id             TEXT PRIMARY KEY,                       -- base64 urlsafe do caminho do PDF no PLPCG
  short_id           TEXT NOT NULL,                          -- o ?s= dos links antigos
  group_id           TEXT NOT NULL,                          -- 'NNN:slug' | 'avulso:slug' — o louvor no PLPCG
  praise_id          TEXT NOT NULL,
  praise_material_id TEXT NOT NULL,
  evidencia          TEXT NOT NULL,                          -- 'num+slug+hash+path' | 'site:é este' …
  confianca          TEXT NOT NULL,                          -- alta | media | humano
  decidido_por       TEXT NOT NULL,                          -- detector | jairo
  run_id             TEXT NOT NULL,                          -- o run do apply que escreveu (undo)
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_plpcg_crosswalk_short ON plpcg_crosswalk(short_id);
CREATE INDEX IF NOT EXISTS idx_plpcg_crosswalk_praise ON plpcg_crosswalk(praise_id);
```

- [ ] **Step 2: Aplicar e verificar em produção**

Run:
```bash
cd api && wrangler d1 execute coldigom --remote --file=migrations/019_plpcg_crosswalk.sql
wrangler d1 execute coldigom --remote --json --command "SELECT name, type FROM sqlite_master WHERE name LIKE '%plpcg_crosswalk%' ORDER BY name"
wrangler d1 execute coldigom --remote --json --command "SELECT COUNT(*) AS n FROM plpcg_crosswalk"
```
Expected: três nomes (`idx_plpcg_crosswalk_praise` index, `idx_plpcg_crosswalk_short` index, `plpcg_crosswalk` table) e `n = 0`.

Rodar a migração uma segunda vez para provar a idempotência (`IF NOT EXISTS`): mesma saída, sem erro.

- [ ] **Step 3: README**

Em `scripts/validate-acervo/README.md`, acrescentar depois do bloco de comandos do "Rodar" (antes de "**A ordem dos três passos…**"):

````markdown
### Migração PLPCG (spec 2026-09-15-migracao-plpcg-design)

```bash
python3 -m core.plpcg                       # exporta o D1 plpcg-catalog, baixa o que falta, hasheia os dois lados
python3 -m core.snapshot                    # o acervo do coldigom, fresco
python3 -m detectors.plpcg_crosswalk        # Fase A — um finding por entrada do PLPCG + um por louvor só de lá
```

`core.plpcg` precisa do `wrangler` logado e do repo irmão `dev/plpcg-admin`
(cwd `worker/`, onde vive o binding do `plpcg-catalog`); os PDFs vêm de
`dev/plpcjf/assets` e, o que não está lá, de `plpcg.com`. Ambos sobrescrevíveis
por `PLPCG_ADMIN_WORKER` e `PLPCJF_ASSETS`. O hash é incremental em
`out/hashes.sqlite` — arquivo trocado no disco com o mesmo caminho não é
recalculado; apague a linha para forçar.

A **faixa do cruzamento** (§5.1 do spec) vive em `evidence["faixa"]`; o
`confidence` do finding é o contrato do arnês, pelo mapa:

| faixa | confidence | action | quem decide |
|---|---|---|---|
| alta | alta | `link_plpcg` | o apply (depois do gabarito cego, Fase B) |
| media | media | `link_plpcg` | o site local |
| faltante | alta | `import_plpcg_material` | o apply (D4) |
| ambiguo | baixa | `link_plpcg` | o site local |
| sem_louvor (entrada) | media | `import_plpcg_material` | o site, ou o grupo abaixo |
| sem_louvor (grupo inteiro, `target_type = plpcg_grupo`) | alta | `create_praise_plpcg` | o apply (D4), depois da pré-visualização no site |

Nenhuma dessas ações escreve ainda: o `apply` as recusa nominalmente
("chega com a Fase C da migração PLPCG"). A tabela `plpcg_crosswalk`
(migração 019) já existe no D1, vazia.
````

E na tabela "Arquivos", duas linhas:

```markdown
| `core/plpcg.py` | o PLPCG como fonte: exportação do D1 `plpcg-catalog`, `pdf_id` ↔ caminho, download, cache de sha256 dos dois lados |
| `detectors/plpcg_crosswalk.py` | Fase A da migração — louvor por número/slug/classe, hash e caminho só dentro do louvor, faixas e candidatos |
```

- [ ] **Step 4: Suíte e commit**

Run: `cd scripts/validate-acervo && python3 -m pytest tests/ -q`
Expected: 167 passed.

```bash
git add api/migrations/019_plpcg_crosswalk.sql scripts/validate-acervo/README.md
git commit -m "feat(api): migração 019 — tabela plpcg_crosswalk, aplicada vazia em produção; README da Fase A

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Portão da Fase A (spec §9)

A fase fecha quando:

1. `python3 -m pytest tests/ -q` verde (167).
2. `gabaritos/plpcg_crosswalk/rodada1/resumo.md` reproduz a tabela do §2.3 dentro de ± dezenas por faixa, total 4.633, e o número de grupos ausentes (~338) está na mesma ordem.
3. `plpcg_crosswalk` existe no D1 remoto com 0 linhas.
4. O dono viu o resumo e apontou a primeira leva de padrões (D7) — isso é o que abre a Fase B (site), que é outro plano.
