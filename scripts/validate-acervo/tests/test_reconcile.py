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
