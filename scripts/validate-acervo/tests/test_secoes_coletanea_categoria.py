# tests/test_secoes_coletanea_categoria.py
from __future__ import annotations

import json
import sqlite3

import pytest

from core import secoes_coletanea_categoria as cc
from core.snapshot import conectar

ESQUEMA = """
    CREATE TABLE praises (id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT,
        updated_at TEXT DEFAULT '2026-01-01');
"""
LINHAS = [("p1", "A", "Clamor"), ("p2", "B", "Avulsos"), ("p3", "C", ""),
          ("p4", "D", None), ("p5", "E", "Morte, Ressurreição e Salvação"), ("p6", "F", "D'Ávila")]


def _povoar(caminho):
    conn = conectar(caminho)
    conn.executescript(ESQUEMA)
    conn.executemany("INSERT INTO praises (id, name, category) VALUES (?, ?, ?)", LINHAS)
    conn.commit()
    return conn


@pytest.fixture
def mundo(tmp_path, monkeypatch):
    snap = _povoar(str(tmp_path / "snap.sqlite"))
    prod = _povoar(str(tmp_path / "prod.sqlite"))
    falhar = {"no_arquivo": None}

    def query(sql, remote=True):
        cur = prod.execute(sql)
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, r)) for r in cur.fetchall()]

    def run_sql_files(arquivos, remote=True):
        for i, caminho in enumerate(arquivos):
            if falhar["no_arquivo"] == i:
                raise RuntimeError("wrangler caiu")
            with open(caminho, encoding="utf-8") as f:
                prod.executescript("BEGIN;" + f.read() + "COMMIT;")

    monkeypatch.setattr(cc, "query", query)
    monkeypatch.setattr(cc, "run_sql_files", run_sql_files)
    monkeypatch.setattr(cc.sc, "run_sql_files", run_sql_files)
    kw = dict(log_path=str(tmp_path / "log.jsonl"), out_dir=str(tmp_path / "out"),
              execucao_dir=str(tmp_path / "exec"))
    return {"snap": snap, "prod": prod, "falhar": falhar, "kw": kw, "tmp": tmp_path}


def _cats(conn):
    return {r["id"]: r["category"] for r in conn.execute("SELECT id, category FROM praises")}


def _log(m):
    return [json.loads(x) for x in open(m["kw"]["log_path"], encoding="utf-8") if x.strip()]


def test_alvos_sao_todos_os_nao_nulos_inclusive_vazio(mundo):
    assert cc.alvos_snapshot(mundo["snap"]) == [
        ("p1", "Clamor"), ("p2", "Avulsos"), ("p3", ""),
        ("p5", "Morte, Ressurreição e Salvação"), ("p6", "D'Ávila")]


def test_sql_guarda_pelo_valor_e_escapa_aspas():
    assert cc.sql_zerar([("p6", "D'Ávila")]) == [
        "UPDATE praises SET category = NULL WHERE id = 'p6' AND category = 'D''Ávila';"]
    assert cc.sql_undo({"zerados": [["p6", "D'Ávila"]]}) == [
        "UPDATE praises SET category = 'D''Ávila' WHERE id = 'p6' AND category IS NULL;"]


def test_ensaio_nao_toca_producao_e_escreve_relatorio(mundo):
    r = cc.executar(mundo["snap"], False, "r-ensaio", **mundo["kw"])
    assert r["alvos"] == 5 and r["statements"] == 5 and not r["executado"]
    assert _cats(mundo["prod"])["p1"] == "Clamor"
    texto = open(r["relatorio"], encoding="utf-8").read()
    assert "| Clamor | 1 |" in texto and "| (vazio) | 1 |" in texto


def test_execute_zera_e_loga_so_o_que_pegou(mundo):
    r = cc.executar(mundo["snap"], True, "r1", **mundo["kw"])
    assert r["zerados"] == 5 and r["atrasados"] == [] and not r["falhou"]
    assert set(_cats(mundo["prod"]).values()) == {None}
    final = _log(mundo)[-1]
    assert final["estado"] == "ok" and len(final["zerados"]) == 5
    assert [x["estado"] for x in _log(mundo)] == ["pendente", "escrevendo", "ok"]


def test_execute_le_producao_e_guarda_barra_valor_editado(mundo, monkeypatch):
    real = cc.query
    def query_e_edita(sql, remote=True):
        linhas = real(sql, remote)
        if "IS NOT NULL" in sql and not mundo.get("editou"):
            mundo["editou"] = True       # edição entre a leitura e a escrita
            mundo["prod"].execute("UPDATE praises SET category = 'Louvor' WHERE id = 'p1'")
            mundo["prod"].commit()
        return linhas
    monkeypatch.setattr(cc, "query", query_e_edita)
    r = cc.executar(mundo["snap"], True, "r1", **mundo["kw"])
    assert r["atrasados"] == ["p1"] and r["falhou"]
    assert _cats(mundo["prod"])["p1"] == "Louvor"
    final = _log(mundo)[-1]
    assert final["estado"] == "guarda_barrou" and ["p1", "Clamor"] not in final["zerados"]


def test_falha_do_wrangler_loga_releitura_parcial_e_undo_repoe_so_isso(mundo, monkeypatch):
    monkeypatch.setattr(cc, "LOTE_SQL", 2)                  # 5 statements, 3 arquivos
    mundo["falhar"]["no_arquivo"] = 1
    r = cc.executar(mundo["snap"], True, "r1", **mundo["kw"])
    assert r["falhou"] and r["zerados"] == 2
    final = _log(mundo)[-1]
    assert final["estado"] == "falhou" and len(final["zerados"]) == 2
    mundo["falhar"]["no_arquivo"] = None
    u = cc.sc.desfazer("r1", mundo["kw"]["log_path"], True, out_dir=mundo["kw"]["out_dir"],
                       execucao_dir=mundo["kw"]["execucao_dir"], sql_undo_fn=cc.sql_undo)
    assert u["statements"] == 2 and not u["falhou"]
    assert _cats(mundo["prod"]) == {pid: cat for pid, _, cat in LINHAS}


def test_undo_nao_sobrescreve_valor_novo(mundo):
    cc.executar(mundo["snap"], True, "r1", **mundo["kw"])
    mundo["prod"].execute("UPDATE praises SET category = 'Nova' WHERE id = 'p2'")
    mundo["prod"].commit()
    assert cc.main(["--undo", "r1", "--execute", "--log", mundo["kw"]["log_path"],
                    "--out-dir", mundo["kw"]["out_dir"], "--execucao-dir", mundo["kw"]["execucao_dir"]]) == 0
    cats = _cats(mundo["prod"])
    assert cats["p2"] == "Nova" and cats["p1"] == "Clamor" and cats["p6"] == "D'Ávila" and cats["p3"] == ""


def test_updated_at_nao_muda(mundo):
    cc.executar(mundo["snap"], True, "r1", **mundo["kw"])
    assert {r[0] for r in mundo["prod"].execute("SELECT updated_at FROM praises")} == {"2026-01-01"}


def test_main_ensaio_sem_snapshot_falha(tmp_path, capsys):
    assert cc.main(["--snapshot", str(tmp_path / "nao.sqlite")]) == 1
    assert "sem snapshot" in capsys.readouterr().err
