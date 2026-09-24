# tests/test_secoes_coletanea.py
from __future__ import annotations

import json
import os
import sqlite3
import subprocess
import unicodedata

import pytest

from core import secoes_coletanea as sc
from core import secoes_coletanea_mapa as mapa
from core.snapshot import conectar

ESQUEMA = """
    CREATE TABLE praises (id TEXT PRIMARY KEY, name TEXT NOT NULL, number TEXT, author TEXT,
        rhythm TEXT, tonality TEXT, category TEXT, lyrics TEXT, group_id TEXT, short_id TEXT,
        created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE tags (id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_id TEXT,
        FOREIGN KEY (parent_id) REFERENCES tags(id) ON DELETE RESTRICT);
    CREATE UNIQUE INDEX idx_tags_root_name ON tags(name) WHERE parent_id IS NULL;
    CREATE UNIQUE INDEX idx_tags_child_name ON tags(parent_id, name) WHERE parent_id IS NOT NULL;
    CREATE TABLE praise_tags (praise_id TEXT NOT NULL, tag_id TEXT NOT NULL,
        PRIMARY KEY (praise_id, tag_id),
        FOREIGN KEY (praise_id) REFERENCES praises(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE);
"""

TAG_ID = {"Coletânea": "t-col", "Avulsos": "t-avu", "GLTM": "t-gltm", "PES": "t-pes",
          "CIAs": "t-cias", "Diversos": "t-div", "Diversos · weider": "t-weider"}

# (id, número, nome, category, rótulos das tags)
LOUVORES = [
    ("c1", "001", "Clamor A", "Clamor", ["Coletânea"]),
    ("c2", "002", "Morte grafia errada", "Morte, Ressureição e Salvação", ["Coletânea"]),
    ("c3", "003", "Morte grafia certa", "Morte, Ressurreição e Salvação", ["Coletânea", "Avulsos"]),
    ("c4", "004", "Santificação curta", "Santificação e Derramamento", ["Coletânea", "PES"]),
    ("e1", "060", "Tudo está pronto", "Louvor", []),
    ("e2", "", "Alvo Mais Que a Neve", "Dedicação", ["Avulsos"]),
    ("a1", "", "Avulso qualquer", "Avulsos", ["Avulsos"]),
    ("v1", "", "Sem categoria", "", []),
    ("n1", "", "Categoria nula", None, ["PES"]),
]


def _povoar(caminho: str) -> sqlite3.Connection:
    conn = conectar(caminho)
    conn.executescript(ESQUEMA)
    conn.execute("PRAGMA foreign_keys = ON")   # o D1 roda com FK ligada
    for nome, tid in TAG_ID.items():
        if " · " in nome:
            continue
        conn.execute("INSERT INTO tags VALUES (?, ?, NULL)", (tid, nome))
    conn.execute("INSERT INTO tags VALUES ('t-weider', 'weider', 't-div')")
    for pid, numero, nome, cat, tags in LOUVORES:
        conn.execute("INSERT INTO praises (id, number, name, category) VALUES (?, ?, ?, ?)", (pid, numero, nome, cat))
        for t in tags:
            conn.execute("INSERT INTO praise_tags VALUES (?, ?)", (pid, TAG_ID[t]))
    for x in mapa.MANUAIS:
        cat = "Avulsos das Senhoras" if x["short_id"] == "11e" else ""
        conn.execute("INSERT INTO praises (id, number, name, category, short_id) VALUES (?, ?, ?, ?, ?)",
                     (x["id"], x["numero"], x["nome"], cat, x["short_id"]))
        for t in x["tags_hoje"]:
            conn.execute("INSERT INTO praise_tags VALUES (?, ?)", (x["id"], TAG_ID[t]))
    conn.commit()
    return conn


@pytest.fixture
def mundo(tmp_path):
    """Snapshot e produção em arquivos separados: é o intervalo entre os dois
    que as guardas protegem (ver _mundo_dois_bancos em test_apply.py)."""
    return {"snap": _povoar(str(tmp_path / "snap.sqlite")),
            "prod": _povoar(str(tmp_path / "prod.sqlite")),
            "tmp": tmp_path}


def _ligacoes(conn) -> set:
    return {(r["praise_id"], r["tag_id"]) for r in conn.execute("SELECT praise_id, tag_id FROM praise_tags")}


def _tags(conn) -> set:
    return {(r["id"], r["name"], r["parent_id"]) for r in conn.execute("SELECT id, name, parent_id FROM tags")}


def _rotulos_de(conn, pid) -> set:
    rot = sc.rotulos(conn)
    return {rot[r["tag_id"]] for r in conn.execute("SELECT tag_id FROM praise_tags WHERE praise_id = ?", (pid,))}


# --- plano e travas -----------------------------------------------------------------

def test_plano_mapeia_as_grafias_e_liga_qualquer_tag(mundo):
    plano = sc.montar_plano(mundo["snap"])
    por_id = {lig.praise_id: lig for lig in plano.ligacoes}
    assert (por_id["c1"].subtag, por_id["c1"].category, por_id["c1"].remover_raiz) == ("Clamor", "Clamor", True)
    assert por_id["c2"].subtag == por_id["c3"].subtag == "Morte Ressurreição e Salvação"
    assert por_id["c4"].subtag == "Santificação e Derramamento do Espírito Santo"
    assert all(por_id[p].pai == "Coletânea" and por_id[p].origem == "categoria" for p in ("c1", "c2", "c3", "c4"))
    assert not {"a1", "v1", "n1"} & set(por_id)          # coleção e vazio não geram ligação


def test_plano_lista_quem_entra_na_coletanea_pela_subtag(mundo):
    plano = sc.montar_plano(mundo["snap"])
    assert sorted((e["number"], e["name"], e["subtag"]) for e in plano.entram_na_coletanea) == [
        ("", "Alvo Mais Que a Neve", "Dedicação"), ("060", "Tudo está pronto", "Louvor")]
    por_id = {lig.praise_id: lig for lig in plano.ligacoes}
    assert por_id["e1"].remover_raiz is False and por_id["e1"].inserir is True


def test_plano_manuais_e_gltm_sob_avulsos(mundo):
    plano = sc.montar_plano(mundo["snap"])
    manuais = [lig for lig in plano.ligacoes if lig.origem == "manual"]
    assert [lig.praise_id for lig in manuais] == [x["id"] for x in mapa.MANUAIS]
    gltm = manuais[-1]
    assert (gltm.pai, gltm.subtag, gltm.remover_raiz, gltm.tags_snapshot) == ("Avulsos", "GLTM", False, ("t-gltm",))
    assert gltm.category == "Avulsos das Senhoras"
    weider = manuais[6]
    assert (weider.subtag, weider.remover_raiz, weider.tags_snapshot) == (
        "Volta de Jesus e Eternidade", True, ("t-avu", "t-col", "t-weider"))


def test_plano_marca_subtag_existente_e_ligacao_que_ja_existe(mundo):
    snap = mundo["snap"]
    snap.execute("INSERT INTO tags VALUES ('t-clamor', 'Clamor', 't-col')")
    snap.execute("INSERT INTO praise_tags VALUES ('c1', 't-clamor')")
    snap.commit()
    plano = sc.montar_plano(snap)
    assert plano.subtags[("Coletânea", "Clamor")] == "t-clamor"
    assert plano.subtags[("Coletânea", "Louvor")] is None
    assert plano.ja_ligados[("Coletânea", "Clamor")] == {"c1"}
    c1 = next(lig for lig in plano.ligacoes if lig.praise_id == "c1")
    assert c1.inserir is False and c1.remover_raiz is True


def test_quem_ja_esta_numa_subtag_da_coletanea_nao_entra_de_novo(mundo):
    snap = mundo["snap"]
    snap.execute("INSERT INTO tags VALUES ('t-louvor', 'Louvor', 't-col')")
    snap.execute("INSERT INTO praise_tags VALUES ('e1', 't-louvor')")
    snap.commit()
    plano = sc.montar_plano(snap)
    assert [e["id"] for e in plano.entram_na_coletanea] == ["e2"]


def test_trava_a_category_desconhecida(mundo):
    mundo["snap"].execute("UPDATE praises SET category = 'Dm' WHERE id = 'v1'")
    with pytest.raises(sc.Trava) as e:
        sc.montar_plano(mundo["snap"])
    assert len(e.value.problemas) == 1
    assert e.value.problemas[0].startswith("(a)") and "'Dm'" in e.value.problemas[0] and "v1" in e.value.problemas[0]


def test_trava_b_raiz_coletanea_sem_secao(mundo):
    mundo["snap"].execute("INSERT INTO praise_tags VALUES ('a1', 't-col')")   # category 'Avulsos' não dá seção
    with pytest.raises(sc.Trava) as e:
        sc.montar_plano(mundo["snap"])
    assert [p[:3] for p in e.value.problemas] == ["(b)"] and "a1" in e.value.problemas[0]


def test_trava_c_manual_ausente_ou_com_tags_diferentes(mundo):
    snap = mundo["snap"]
    snap.execute("DELETE FROM praises WHERE id = ?", (mapa.MANUAIS[0]["id"],))
    snap.execute("INSERT INTO praise_tags VALUES (?, 't-pes')", (mapa.MANUAIS[4]["id"],))
    with pytest.raises(sc.Trava) as e:
        sc.montar_plano(snap)
    assert len(e.value.problemas) == 2
    assert mapa.MANUAIS[0]["id"] in e.value.problemas[0] and "não existe" in e.value.problemas[0]
    assert mapa.MANUAIS[4]["id"] in e.value.problemas[1] and "PES" in e.value.problemas[1]


def test_trava_c_manual_com_secao_mapeada(mundo):
    mundo["snap"].execute("UPDATE praises SET category = 'Clamor' WHERE id = ?", (mapa.MANUAIS[1]["id"],))
    with pytest.raises(sc.Trava) as e:
        sc.montar_plano(mundo["snap"])
    assert e.value.problemas[0].startswith("(c)") and "seção mapeada" in e.value.problemas[0]


def test_trava_c_aceita_manual_ja_migrado(mundo):
    # A retomada (spec §7) roda o script de novo sobre um acervo parcialmente migrado.
    snap = mundo["snap"]
    x = mapa.MANUAIS[0]
    snap.execute("INSERT INTO tags VALUES ('t-clamor', 'Clamor', 't-col')")
    snap.execute("DELETE FROM praise_tags WHERE praise_id = ? AND tag_id = 't-col'", (x["id"],))
    snap.execute("INSERT INTO praise_tags VALUES (?, 't-clamor')", (x["id"],))
    snap.commit()
    lig = next(lig for lig in sc.montar_plano(snap).ligacoes if lig.praise_id == x["id"])
    assert (lig.inserir, lig.remover_raiz) == (False, False)
    # meio caminho: subtag ligada e a raiz ainda lá (o DELETE caiu num arquivo posterior)
    y = mapa.MANUAIS[1]
    snap.execute("INSERT INTO praise_tags VALUES (?, 't-clamor')", (y["id"],))
    snap.commit()
    lig = next(lig for lig in sc.montar_plano(snap).ligacoes if lig.praise_id == y["id"])
    assert (lig.inserir, lig.remover_raiz) == (False, True)


def test_travas_juntas_e_nenhuma_escrita(mundo):
    snap = mundo["snap"]
    snap.execute("UPDATE praises SET category = 'Dm' WHERE id = 'v1'")
    snap.execute("INSERT INTO praise_tags VALUES ('a1', 't-col')")
    snap.execute("DELETE FROM praises WHERE id = ?", (mapa.MANUAIS[3]["id"],))
    with pytest.raises(sc.Trava) as e:
        sc.montar_plano(snap)
    assert sorted(p[:3] for p in e.value.problemas) == ["(a)", "(b)", "(c)"]


def test_raiz_ausente_trava(mundo):
    mundo["snap"].execute("UPDATE tags SET name = 'Coletanea' WHERE id = 't-col'")
    with pytest.raises(sc.Trava, match="Coletânea"):
        sc.montar_plano(mundo["snap"])
