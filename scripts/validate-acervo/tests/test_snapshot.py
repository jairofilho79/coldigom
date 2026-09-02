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
