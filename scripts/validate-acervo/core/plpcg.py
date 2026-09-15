from __future__ import annotations

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
