from __future__ import annotations

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
from datetime import datetime, timezone

from core.paths import (
    HASHES_DB,
    PKG,
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
EXPORTACAO_FINAL = os.path.join(PKG, "gabaritos", "plpcg_crosswalk", "plpcg_catalog_final.sql")

LADO_PLPCG = "plpcg"
LADO_COLDIGOM = "coldigom"

USER_AGENT = "coldigom-validate-acervo/1.0 (+https://github.com/jairofilho79/coldigom)"


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
    # o Cloudflare do plpcg.com devolve 403 ao User-Agent padrão do urllib.
    req = urllib.request.Request(url_publica(caminho), headers={"User-Agent": USER_AGENT})
    with abrir(req) as resp, open(destino + ".part", "wb") as f:
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


# --- o D1 do PLPCG -----------------------------------------------------------

def _wrangler(args: list[str], cwd: str) -> subprocess.CompletedProcess:
    # cwd no worker do plpcg-admin: é lá que está o wrangler.jsonc com o
    # binding do D1 plpcg-catalog. O wrangler do api/ não conhece esse banco.
    try:
        return subprocess.run(
            ["wrangler", "d1", *args], cwd=cwd, capture_output=True, text=True, check=True
        )
    except subprocess.CalledProcessError as e:
        # capture_output esconde o stderr do wrangler no traceback padrão —
        # sem isto, um erro de auth/binding vira só "exit status 1".
        print(e.stderr, file=sys.stderr)
        raise


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


def guardar_exportacao_final(dumps_dir: str, destino: str, quando: str | None = None) -> dict[str, str]:
    """Junta os dumps (louvores + catalog_meta) num único .sql — a exportação
    final do D1 plpcg-catalog que o spec §8.3 manda guardar em gabaritos/
    quando o catálogo congela. O cabeçalho diz de quando é e contra qual
    checksum. Devolve o catalog_meta lido do dump, mais 'louvores' = contagem."""
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    partes_sql: list[str] = []
    for t in TABELAS:
        with open(os.path.join(dumps_dir, f"{t}.sql"), encoding="utf-8") as f:
            sql = f.read()
        conn.executescript(sql)
        partes_sql.append(f"-- {t}.sql\n{sql.rstrip()}\n")
    m = meta(conn)
    n = conn.execute("SELECT COUNT(*) FROM louvores").fetchone()[0]
    conn.close()

    quando = quando or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    cabecalho = (
        f"-- exportação final do D1 plpcg-catalog em {quando}: {n} louvores, "
        f"checksum {m.get('checksum', '?')}, short_id_next {m.get('short_id_next', '?')}\n"
    )
    os.makedirs(os.path.dirname(destino) or ".", exist_ok=True)
    with open(destino, "w", encoding="utf-8") as f:
        f.write(cabecalho + "\n" + "\n".join(partes_sql))
    return {"louvores": str(n), **m}


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
    ap.add_argument("--guardar-final", nargs="?", const=EXPORTACAO_FINAL, metavar="DESTINO",
                    help="grava a exportação final do catálogo (louvores + catalog_meta) num .sql "
                         f"único e para; padrão {EXPORTACAO_FINAL}")
    args = ap.parse_args(argv)

    ensure_out()
    dumps = os.path.join(PLPCG_OUT, "dumps")
    if not args.pular_download:
        print("baixando o D1 plpcg-catalog:")
        exportar_d1(dumps, remote=not args.local)

    if args.guardar_final:
        info = guardar_exportacao_final(dumps, args.guardar_final)
        print(f"exportação final: {args.guardar_final}\n  {info['louvores']} louvores, "
              f"checksum {info.get('checksum', '?')}, short_id_next {info.get('short_id_next', '?')}")
        return 0

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
