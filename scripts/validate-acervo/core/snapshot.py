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
