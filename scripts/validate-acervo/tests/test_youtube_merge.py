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
