from __future__ import annotations

import hashlib
import io
import os

from core.plpcg import (
    LADO_COLDIGOM,
    LADO_PLPCG,
    abrir_hashes,
    arquivo_local,
    baixar,
    caminho_relativo,
    codificar,
    decodificar,
    hashear,
    hashes_coldigom,
    hashes_de,
    pdfs_em,
    sha256_arquivo,
    url_publica,
    USER_AGENT,
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
    reqs = []

    def abrir(req):
        urls.append(req.full_url)
        reqs.append(req)
        return _Resp(b"%PDF-fake")

    destino = baixar("assets/PES/Alto preço - CIFRA.pdf", cache=str(tmp_path), abrir=abrir)
    assert destino == str(tmp_path / "PES" / "Alto preço - CIFRA.pdf")
    with open(destino, "rb") as f:
        assert f.read() == b"%PDF-fake"
    assert urls == ["https://plpcg.com/assets/PES/Alto%20pre%C3%A7o%20-%20CIFRA.pdf"]
    assert reqs[0].get_header("User-agent") == USER_AGENT
    assert not os.path.exists(destino + ".part")


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
