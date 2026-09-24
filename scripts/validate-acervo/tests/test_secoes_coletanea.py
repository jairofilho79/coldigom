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


# --- SQL ---------------------------------------------------------------------------

def _ids_fixos():
    n = iter(range(1, 100))
    return lambda: f"novo-{next(n):02d}"


def _aplicar(conn, stmts):
    """Um batch atômico, como o wrangler executa cada arquivo."""
    try:
        conn.executescript("BEGIN;\n" + "\n".join(stmts) + "\nCOMMIT;")
    except sqlite3.Error:
        conn.rollback()
        raise


def _sql(mundo, tags_de=None):
    plano = sc.montar_plano(mundo["snap"])
    tags = [dict(r) for r in (tags_de or mundo["snap"]).execute("SELECT id, name, parent_id FROM tags")]
    ids, novas = sc.resolver_subtags(plano, tags, _ids_fixos())
    return plano, ids, novas, sc.sql_plano(plano, ids, novas)


def test_sql_cria_liga_e_depois_desliga(mundo):
    plano, ids, novas, stmts = _sql(mundo)
    assert len(novas) == 14 and ids[("Avulsos", "GLTM")] == "novo-14"
    tipos = [s.split(" (")[0].split(" SELECT")[0] for s in stmts]
    n_lig = sum(1 for lig in plano.ligacoes if lig.inserir)
    n_des = sum(1 for lig in plano.ligacoes if lig.remover_raiz)
    assert tipos == (["INSERT INTO tags"] * 14 + ["INSERT OR IGNORE INTO praise_tags"] * n_lig
                     + [s for s in tipos if s.startswith("DELETE")])
    assert sum(1 for s in stmts if s.startswith("DELETE FROM praise_tags")) == n_des
    assert stmts[0] == "INSERT INTO tags (id, name, parent_id) VALUES ('novo-01', 'Clamor', 't-col');"


def test_sql_em_producao_faz_a_migracao(mundo):
    prod = mundo["prod"]
    _, ids, _, stmts = _sql(mundo)
    _aplicar(prod, stmts)
    rot = sc.rotulos(prod)
    assert _rotulos_de(prod, "c1") == {"Coletânea · Clamor"}
    assert _rotulos_de(prod, "c3") == {"Coletânea · Morte Ressurreição e Salvação", "Avulsos"}
    assert _rotulos_de(prod, "e2") == {"Coletânea · Dedicação", "Avulsos"}
    assert _rotulos_de(prod, "a1") == {"Avulsos"} and _rotulos_de(prod, "v1") == set()
    assert _rotulos_de(prod, mapa.MANUAIS[-1]["id"]) == {"GLTM", "Avulsos · GLTM"}      # a raiz GLTM fica
    assert _rotulos_de(prod, mapa.MANUAIS[6]["id"]) == {
        "Avulsos", "Diversos · weider", "Coletânea · Volta de Jesus e Eternidade"}
    diretas = prod.execute("SELECT COUNT(*) FROM praise_tags WHERE tag_id = 't-col'").fetchone()[0]
    assert diretas == 0 and rot["t-col"] == "Coletânea"


def test_guarda_category_mudou_depois_do_snapshot(mundo):
    prod = mundo["prod"]
    prod.execute("UPDATE praises SET category = 'Louvor' WHERE id = 'c1'")
    prod.commit()
    _, _, _, stmts = _sql(mundo)
    _aplicar(prod, stmts)
    assert _rotulos_de(prod, "c1") == {"Coletânea"}      # não ligou E não saiu da Coletânea


def test_guarda_manual_com_tags_mudadas(mundo):
    prod = mundo["prod"]
    x = mapa.MANUAIS[0]
    prod.execute("INSERT INTO praise_tags VALUES (?, 't-pes')", (x["id"],))
    prod.commit()
    _, _, _, stmts = _sql(mundo)
    _aplicar(prod, stmts)
    assert _rotulos_de(prod, x["id"]) == {"Coletânea", "PES"}


def test_guarda_praise_apagado_nao_derruba_o_lote(mundo):
    prod = mundo["prod"]
    prod.execute("DELETE FROM praises WHERE id = 'c2'")
    prod.commit()
    _, _, _, stmts = _sql(mundo)
    _aplicar(prod, stmts)                                  # sem IntegrityError de FK
    assert _rotulos_de(prod, "c1") == {"Coletânea · Clamor"}


def test_delete_da_raiz_exige_a_subtag_ligada(mundo):
    prod = mundo["prod"]
    _, _, novas, stmts = _sql(mundo)
    so_tags_e_deletes = [s for s in stmts if not s.startswith("INSERT OR IGNORE")]
    _aplicar(prod, so_tags_e_deletes)
    assert prod.execute("SELECT COUNT(*) FROM praise_tags WHERE tag_id = 't-col'").fetchone()[0] == 11


def test_reaproveita_subtag_existente(mundo):
    for conn in (mundo["snap"], mundo["prod"]):
        conn.execute("INSERT INTO tags VALUES ('t-clamor', 'Clamor', 't-col')")
        conn.commit()
    _, ids, novas, stmts = _sql(mundo)
    assert ids[("Coletânea", "Clamor")] == "t-clamor" and len(novas) == 13
    assert not any("'Clamor'" in s for s in stmts if s.startswith("INSERT INTO tags"))
    _aplicar(mundo["prod"], stmts)
    assert ("c1", "t-clamor") in _ligacoes(mundo["prod"])
    assert mundo["prod"].execute("SELECT COUNT(*) FROM tags WHERE name = 'Clamor'").fetchone()[0] == 1


# --- relatório ---------------------------------------------------------------------

def _esperado_da_fixture(monkeypatch):
    depois = {nome: 0 for nome in mapa.ESPERADO_DEPOIS}
    depois.update({"Clamor": 3, "Morte Ressurreição e Salvação": 2, "Santificação e Derramamento do Espírito Santo": 1,
                   "Louvor": 1, "Dedicação": 2, "Crianças e Adolescentes": 1, "Volta de Jesus e Eternidade": 3})
    monkeypatch.setattr(mapa, "ESPERADO_DEPOIS", depois)
    monkeypatch.setattr(mapa, "ESPERADO_TOTAL", 13)
    monkeypatch.setattr(mapa, "ESPERADO_RAIZ_REMOVIDAS", 11)
    monkeypatch.setattr(mapa, "ENTRAM_NA_COLETANEA", (("", "Alvo Mais Que a Neve"), ("060", "Tudo está pronto")))


def test_contagens_e_divergencias(mundo, monkeypatch):
    _esperado_da_fixture(monkeypatch)
    plano = sc.montar_plano(mundo["snap"])
    n = sc.contagens(plano)
    assert n[("Coletânea", "Clamor")] == 3 and n[("Avulsos", "GLTM")] == 1
    assert sc.divergencias(plano) == []
    monkeypatch.setattr(mapa, "ESPERADO_DEPOIS", dict(mapa.ESPERADO_DEPOIS, Clamor=4))
    monkeypatch.setattr(mapa, "ESPERADO_RAIZ_REMOVIDAS", 1119)
    assert sc.divergencias(plano) == [
        "Coletânea · Clamor: 3 praises depois, a spec diz 4",
        "ligações diretas com Coletânea removidas: 11, a spec diz 1119",
    ]


def test_divergencia_de_quem_entra_ignora_nfd_e_nomeia_a_diferenca(mundo, monkeypatch):
    _esperado_da_fixture(monkeypatch)
    snap = mundo["snap"]
    snap.execute("UPDATE praises SET name = ? WHERE id = 'e1'", (unicodedata.normalize("NFD", "Tudo está pronto"),))
    plano = sc.montar_plano(snap)
    assert sc.divergencias(plano) == []
    monkeypatch.setattr(mapa, "ENTRAM_NA_COLETANEA", (("", "Alvo Mais Que a Neve"), ("609", "Senhor")))
    assert sc.divergencias(plano) == [
        "entram na Coletânea: 2 praises (spec: 2); a mais: 060 Tudo está pronto; faltam: 609 Senhor"]


def test_contagem_inclui_quem_ja_estava_na_subtag(mundo):
    snap = mundo["snap"]
    snap.execute("INSERT INTO tags VALUES ('t-clamor', 'Clamor', 't-col')")
    snap.execute("INSERT INTO praise_tags VALUES ('v1', 't-clamor')")   # ligado à mão, sem categoria
    snap.commit()
    assert sc.contagens(sc.montar_plano(snap))[("Coletânea", "Clamor")] == 4


def test_relatorio_tem_as_secoes_do_ensaio(mundo, monkeypatch):
    _esperado_da_fixture(monkeypatch)
    plano = sc.montar_plano(mundo["snap"])
    _, novas = sc.resolver_subtags(plano, [dict(r) for r in mundo["snap"].execute("SELECT * FROM tags")], _ids_fixos())
    texto = sc.relatorio(plano, mundo["snap"], "run-x", novas)
    assert texto.startswith("# Seções da Coletânea — run-x")
    assert "## Divergências da spec\n\nNenhuma." in texto
    assert "| Coletânea · Clamor | nova | 3 | 3 | 3 |" in texto
    assert "| Avulsos · GLTM | nova | 1 | 1 | 1 |" in texto
    assert "| **Total Coletânea** | | | 13 | 13 |" in texto
    assert "11 (spec: 11)." in texto
    assert "Ligações novas: 6 pela categoria, 8 manuais." in texto
    assert ("| `bbd5f528-1622-4346-a3d7-898223f7292b` | 68b | 566 | O Senhor é meu Pastor (Maranata, Jesus vem) | "
            "Avulsos, Coletânea, Diversos · weider | Coletânea · Volta de Jesus e Eternidade | "
            "liga; tira a raiz Coletânea |") in texto
    assert "| `2b309bf1-50a0-48fc-8607-8ccce0031500` | 11e | — | Tu és Maravilhoso | GLTM | Avulsos · GLTM | liga |" in texto
    assert "## Entram na Coletânea pela subtag (2; spec: 2)" in texto
    assert "| `e1` | 060 | Tudo está pronto | Louvor |" in texto


# --- execução -----------------------------------------------------------------------

@pytest.fixture
def d1(mundo, monkeypatch):
    """query e run_sql_files contra o sqlite de "produção". Cada arquivo é um
    batch atômico, como no wrangler. Nada toca rede nem credencial."""
    prod = mundo["prod"]
    chamadas = {"query": [], "sql": []}
    falhar = {"sql_no_arquivo": None, "erro": None}

    def query(sql, remote=True):
        chamadas["query"].append(sql)
        cur = prod.execute(sql)
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, r)) for r in cur.fetchall()]

    def run_sql_files(arquivos, remote=True):
        for i, caminho in enumerate(arquivos):
            if falhar["sql_no_arquivo"] == i:
                raise falhar["erro"] or RuntimeError("wrangler caiu")
            chamadas["sql"].append(caminho)
            with open(caminho, encoding="utf-8") as f:
                _aplicar(prod, f.read().splitlines())

    monkeypatch.setattr(sc, "query", query)
    monkeypatch.setattr(sc, "run_sql_files", run_sql_files)
    return {"chamadas": chamadas, "falhar": falhar}


def _kw(mundo):
    t = mundo["tmp"]
    return dict(log_path=str(t / "log.jsonl"), out_dir=str(t / "out"), execucao_dir=str(t / "exec"))


def _log(mundo):
    return [json.loads(x) for x in open(mundo["tmp"] / "log.jsonl", encoding="utf-8") if x.strip()]


def test_ensaio_nao_toca_producao_e_grava_sql_e_relatorio(mundo, d1):
    plano = sc.montar_plano(mundo["snap"])
    r = sc.executar(plano, mundo["snap"], False, "run-e", novo_id=_ids_fixos(), **_kw(mundo))
    assert d1["chamadas"] == {"query": [], "sql": []}
    assert not (mundo["tmp"] / "log.jsonl").exists()
    assert os.path.exists(r["relatorio"]) and r["relatorio"].endswith("run-e/relatorio.md")
    assert (r["ligar"], r["desligar_raiz"], r["subtags_novas"]) == (14, 11, 14)
    assert r["statements"] == 14 + 14 + 11
    assert os.listdir(mundo["tmp"] / "out" / "run-e" / "sql") == ["ensaio_000.sql"]


def test_execute_migra_loga_e_copia_para_gabaritos(mundo, d1):
    plano = sc.montar_plano(mundo["snap"])
    r = sc.executar(plano, mundo["snap"], True, "run-1", novo_id=_ids_fixos(), **_kw(mundo))
    assert r["falhou"] is False and (r["criadas"], r["removidas"]) == (14, 11)
    assert r["atrasadas"] == {"ligar": [], "desligar_raiz": []}
    assert mundo["prod"].execute("SELECT COUNT(*) FROM praise_tags WHERE tag_id = 't-col'").fetchone()[0] == 0
    linhas = _log(mundo)
    assert [x["estado"] for x in linhas] == ["pendente", "escrevendo", "ok"]
    assert [x["escreveu"] for x in linhas] == [False, True, True]
    assert len(linhas[-1]["ligar"]) == 14 and len(linhas[-1]["desligar_raiz"]) == 11
    assert len(linhas[-1]["subtags_novas"]) == 14
    assert (mundo["tmp"] / "exec" / "run-1.jsonl").read_text(encoding="utf-8").count("\n") == 3


def test_execute_guarda_barrou_lista_quem_ficou_para_tras(mundo, d1):
    mundo["prod"].execute("UPDATE praises SET category = 'Louvor' WHERE id = 'c1'")
    mundo["prod"].commit()
    plano = sc.montar_plano(mundo["snap"])
    r = sc.executar(plano, mundo["snap"], True, "run-g", novo_id=_ids_fixos(), **_kw(mundo))
    assert r["falhou"] is True
    assert r["atrasadas"] == {"ligar": ["c1"], "desligar_raiz": ["c1"]}
    fim = _log(mundo)[-1]
    assert (fim["estado"], fim["ok"]) == ("guarda_barrou", False)
    # A ligação que a guarda barrou não pode ficar na lista do log: um --undo
    # rodado sobre esse run não pode apagar uma ligação que um run mais novo
    # crie depois (spec §5.2 — o undo só apaga o que ESTE run criou).
    assert ["c1", "novo-01"] not in fim["ligar"]


def test_execute_usa_subtag_criada_em_producao_depois_do_snapshot(mundo, d1):
    mundo["prod"].execute("INSERT INTO tags VALUES ('t-clamor-admin', 'Clamor', 't-col')")
    mundo["prod"].commit()
    plano = sc.montar_plano(mundo["snap"])
    r = sc.executar(plano, mundo["snap"], True, "run-p", novo_id=_ids_fixos(), **_kw(mundo))
    assert r["falhou"] is False and r["subtags_novas"] == 13
    assert ("c1", "t-clamor-admin") in _ligacoes(mundo["prod"])
    assert "Clamor" not in {s["name"] for s in _log(mundo)[-1]["subtags_novas"]}


def test_execute_nao_reclama_ligacao_que_ja_existia_em_producao(mundo, d1):
    mundo["prod"].execute("INSERT INTO tags VALUES ('t-clamor', 'Clamor', 't-col')")
    mundo["prod"].execute("INSERT INTO praise_tags VALUES ('c1', 't-clamor')")
    mundo["prod"].commit()
    plano = sc.montar_plano(mundo["snap"])
    sc.executar(plano, mundo["snap"], True, "run-j", novo_id=_ids_fixos(), **_kw(mundo))
    assert ["c1", "t-clamor"] not in _log(mundo)[-1]["ligar"]     # o undo não vai apagá-la


def test_execute_falha_do_wrangler_fica_desfazivel(mundo, d1):
    d1["falhar"]["sql_no_arquivo"] = 0
    d1["falhar"]["erro"] = subprocess.CalledProcessError(1, ["wrangler"], stderr="D1_ERROR: boom")
    plano = sc.montar_plano(mundo["snap"])
    r = sc.executar(plano, mundo["snap"], True, "run-f", novo_id=_ids_fixos(), **_kw(mundo))
    assert r["falhou"] is True
    fim = _log(mundo)[-1]
    assert (fim["estado"], fim["escreveu"], fim["ok"]) == ("falhou", True, False)
    assert "D1_ERROR: boom" in fim["erro"]


def test_execute_raiz_trocada_em_producao_trava_sem_log(mundo, d1):
    prod = mundo["prod"]
    prod.execute("UPDATE tags SET name = 'Coletânea antiga' WHERE id = 't-col'")
    prod.execute("INSERT INTO tags VALUES ('t-col-2', 'Coletânea', NULL)")
    prod.commit()
    plano = sc.montar_plano(mundo["snap"])
    with pytest.raises(sc.Trava, match="Coletânea"):
        sc.executar(plano, mundo["snap"], True, "run-r", novo_id=_ids_fixos(), **_kw(mundo))
    assert d1["chamadas"]["sql"] == [] and not (mundo["tmp"] / "log.jsonl").exists()


def test_execute_grava_escrevendo_no_log_antes_do_wrangler(mundo, monkeypatch):
    """A linha "escrevendo" (escreveu=True) tem que estar no disco ANTES do
    wrangler rodar: um processo morto no meio do run_sql_files precisa achar
    essa linha para o undo saber que a escrita pode ter chegado."""
    prod = mundo["prod"]
    viu = {"escrevendo_no_disco": False}

    def query(sql, remote=True):
        cur = prod.execute(sql)
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, r)) for r in cur.fetchall()]

    def run_sql_files(arquivos, remote=True):
        linhas = _log(mundo)
        viu["escrevendo_no_disco"] = bool(linhas) and (linhas[-1]["estado"], linhas[-1]["escreveu"]) == ("escrevendo", True)
        for caminho in arquivos:
            with open(caminho, encoding="utf-8") as f:
                _aplicar(prod, f.read().splitlines())

    monkeypatch.setattr(sc, "query", query)
    monkeypatch.setattr(sc, "run_sql_files", run_sql_files)
    plano = sc.montar_plano(mundo["snap"])
    sc.executar(plano, mundo["snap"], True, "run-ordem", novo_id=_ids_fixos(), **_kw(mundo))
    assert viu["escrevendo_no_disco"] is True
