from __future__ import annotations

import json
import os

import pytest

from core.apply import aplicar, estado_anterior, sql_para
from core.findings import Finding
from core.snapshot import conectar


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
        CREATE TABLE tags (id TEXT PRIMARY KEY, name TEXT, parent_id TEXT);
        CREATE TABLE praise_tags (praise_id TEXT, tag_id TEXT, PRIMARY KEY (praise_id, tag_id));
        """
    )
    conn.execute("INSERT INTO praises (id,name,lyrics) VALUES ('keeper','Medo tens',NULL)")
    conn.execute("INSERT INTO praises (id,name,lyrics) VALUES ('fonte','Medo tens','Medo tens que o tentador')")
    conn.execute("INSERT INTO praise_materials (id,praise_id,type,material_kind,url) "
                 "VALUES ('mat-yt','fonte','youtube','k-audio','https://youtu.be/x')")
    conn.execute("INSERT INTO tags VALUES ('t-av','Avulsos',NULL)")
    conn.execute("INSERT INTO praise_tags VALUES ('fonte','t-av')")
    conn.commit()
    return conn


def _merge() -> Finding:
    return Finding(
        run_id="r1", detector="youtube_merge", target_type="praise",
        target_id="fonte", praise_id="fonte", action="merge_praise",
        confidence="alta", proposed="keeper",
        evidence={"keeper": "keeper", "motivo": "letra e nome"},
    )


def test_sql_de_merge_move_material_apaga_fonte_e_marca_a_origem(tmp_path):
    conn = _mundo(tmp_path)
    stmts = sql_para(_merge(), conn)
    junto = "\n".join(stmts)
    assert "UPDATE praise_materials" in junto
    assert "merged_from_praise_id = 'fonte'" in junto
    assert "praise_id = 'keeper'" in junto
    assert "DELETE FROM praises WHERE id = 'fonte'" in junto


def test_merge_doa_letra_quando_o_keeper_esta_vazio(tmp_path):
    # D3: o keeper manda, a fonte so preenche campo vazio.
    conn = _mundo(tmp_path)
    junto = "\n".join(sql_para(_merge(), conn))
    assert "lyrics = 'Medo tens que o tentador'" in junto


def test_merge_nao_sobrescreve_campo_preenchido_do_keeper(tmp_path):
    conn = _mundo(tmp_path)
    conn.execute("UPDATE praises SET lyrics = 'letra do keeper' WHERE id='keeper'")
    conn.commit()
    junto = "\n".join(sql_para(_merge(), conn))
    assert "letra do keeper" not in junto
    assert "Medo tens que o tentador" not in junto


def test_merge_leva_as_tags_da_fonte_em_uniao(tmp_path):
    conn = _mundo(tmp_path)
    junto = "\n".join(sql_para(_merge(), conn))
    assert "INSERT OR IGNORE INTO praise_tags" in junto
    assert "'keeper', 't-av'" in junto


def test_merge_recusa_fonte_com_material_em_r2(tmp_path):
    # O SQL nao limpa o R2. Fundir algo com r2_key deixaria objeto orfao no
    # bucket, e por isso e recusado aqui em vez de silenciosamente vazar.
    conn = _mundo(tmp_path)
    conn.execute("UPDATE praise_materials SET r2_key='assets/x.pdf', url=NULL WHERE id='mat-yt'")
    conn.commit()
    with pytest.raises(ValueError, match="r2_key"):
        sql_para(_merge(), conn)


def test_acao_de_fase_futura_diz_qual_fase(tmp_path):
    conn = _mundo(tmp_path)
    f = Finding(run_id="r1", detector="material_dup", target_type="material",
                target_id="mat-yt", action="delete_material", confidence="alta",
                evidence={})
    with pytest.raises(NotImplementedError, match="Fase 3"):
        sql_para(f, conn)


def test_estado_anterior_guarda_o_suficiente_para_desfazer(tmp_path):
    conn = _mundo(tmp_path)
    antes = estado_anterior(_merge(), conn)
    assert antes["praise"]["id"] == "fonte"
    assert antes["praise"]["lyrics"] == "Medo tens que o tentador"
    assert antes["materiais"][0]["id"] == "mat-yt"
    assert antes["tags"] == ["t-av"]
    assert antes["keeper"]["id"] == "keeper"


def test_dry_run_nao_escreve_arquivo_sql_nem_log(tmp_path):
    conn = _mundo(tmp_path)
    log = str(tmp_path / "apply_log.jsonl")
    r = aplicar([_merge()], conn, execute=False, log_path=log, remote=False)
    assert r["simulado"] == 1
    assert r["aplicado"] == 0
    assert not os.path.exists(log)


def test_execute_escreve_uma_linha_de_log_por_finding(tmp_path, monkeypatch):
    conn = _mundo(tmp_path)
    executados = []
    monkeypatch.setattr("core.apply.run_sql_files", lambda arqs, remote=True: executados.extend(arqs))
    log = str(tmp_path / "apply_log.jsonl")
    r = aplicar([_merge()], conn, execute=True, log_path=log, remote=False,
                sql_dir=str(tmp_path / "sql"))
    assert r["aplicado"] == 1
    assert len(executados) == 1
    linhas = open(log, encoding="utf-8").read().strip().split("\n")
    assert len(linhas) == 1
    entrada = json.loads(linhas[0])
    assert entrada["ok"] is True
    assert entrada["run_id"] == "r1"
    assert entrada["antes"]["praise"]["id"] == "fonte"


def test_rodar_de_novo_pula_o_que_ja_foi_aplicado(tmp_path, monkeypatch):
    conn = _mundo(tmp_path)
    monkeypatch.setattr("core.apply.run_sql_files", lambda arqs, remote=True: None)
    log = str(tmp_path / "apply_log.jsonl")
    sql_dir = str(tmp_path / "sql")
    aplicar([_merge()], conn, execute=True, log_path=log, remote=False, sql_dir=sql_dir)
    r = aplicar([_merge()], conn, execute=True, log_path=log, remote=False, sql_dir=sql_dir)
    assert r["aplicado"] == 0
    assert r["ja_aplicado"] == 1
