from __future__ import annotations

import json
import os

import pytest

from core.apply import _lit, aplicar, desfazer, estado_anterior, sql_para
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
                              reviewed_by TEXT,
                              FOREIGN KEY (praise_id) REFERENCES praises(id) ON DELETE CASCADE);
        CREATE TABLE tags (id TEXT PRIMARY KEY, name TEXT, parent_id TEXT);
        CREATE TABLE praise_tags (praise_id TEXT, tag_id TEXT, PRIMARY KEY (praise_id, tag_id),
                              FOREIGN KEY (praise_id) REFERENCES praises(id) ON DELETE CASCADE);
        """
    )
    # A FK real do D1 vem com ON DELETE CASCADE e o D1 roda com
    # PRAGMA foreign_keys = 1 — sem isto aqui, um teste que confia numa
    # cascata (ou que confia na AUSÊNCIA de uma) não reproduz produção.
    conn.execute("PRAGMA foreign_keys = ON")
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


def _executar_no_conn(conn):
    """run_sql_files falso: aplica os .sql gerados direto na mesma conexão.

    Usado só nos testes de undo que precisam do efeito real no banco (não
    dá pra verificar cascata de FK olhando só o texto do SQL). Nunca toca o
    wrangler nem a rede.
    """
    def _run(arquivos, remote=True):
        for caminho in arquivos:
            with open(caminho, encoding="utf-8") as f:
                conn.executescript(f.read())
        conn.commit()
    return _run


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


def test_execute_escreve_pendente_e_ok_por_finding(tmp_path, monkeypatch):
    # Uma linha "pendente" (com o antes) antes de tentar escrever, e uma
    # linha "ok" depois — não mais uma linha só (ver I1 no fix round 1).
    conn = _mundo(tmp_path)
    executados = []
    monkeypatch.setattr("core.apply.run_sql_files", lambda arqs, remote=True: executados.extend(arqs))
    log = str(tmp_path / "apply_log.jsonl")
    r = aplicar([_merge()], conn, execute=True, log_path=log, remote=False,
                sql_dir=str(tmp_path / "sql"))
    assert r["aplicado"] == 1
    assert len(executados) == 1
    linhas = [json.loads(l) for l in open(log, encoding="utf-8").read().strip().split("\n")]
    assert len(linhas) == 2
    pendente, final = linhas
    assert pendente["estado"] == "pendente"
    assert pendente["antes"]["praise"]["id"] == "fonte"
    assert final["ok"] is True
    assert final["run_id"] == "r1"
    assert final["antes"]["praise"]["id"] == "fonte"


def test_rodar_de_novo_pula_o_que_ja_foi_aplicado(tmp_path, monkeypatch):
    conn = _mundo(tmp_path)
    monkeypatch.setattr("core.apply.run_sql_files", lambda arqs, remote=True: None)
    log = str(tmp_path / "apply_log.jsonl")
    sql_dir = str(tmp_path / "sql")
    aplicar([_merge()], conn, execute=True, log_path=log, remote=False, sql_dir=sql_dir)
    r = aplicar([_merge()], conn, execute=True, log_path=log, remote=False, sql_dir=sql_dir)
    assert r["aplicado"] == 0
    assert r["ja_aplicado"] == 1


def test_falha_na_escrita_grava_pendente_com_antes_antes_de_tentar(tmp_path, monkeypatch):
    # I1: mesmo quando a escrita falha (ex.: o wrangler caiu no meio do
    # lote), o "antes" já está no disco — gravado na linha pendente antes de
    # qualquer tentativa de escrever, não só quando a escrita dá certo.
    conn = _mundo(tmp_path)

    def _explode(arqs, remote=True):
        raise RuntimeError("wrangler caiu no meio do lote")

    monkeypatch.setattr("core.apply.run_sql_files", _explode)
    log = str(tmp_path / "apply_log.jsonl")
    r = aplicar([_merge()], conn, execute=True, log_path=log, remote=False,
                sql_dir=str(tmp_path / "sql"))
    assert r["falhou"] == 1
    linhas = [json.loads(l) for l in open(log, encoding="utf-8").read().strip().split("\n")]
    assert len(linhas) == 2
    pendente, final = linhas
    assert pendente["estado"] == "pendente"
    assert pendente["antes"]["praise"]["id"] == "fonte"
    assert final["ok"] is False
    assert final["antes"]["praise"]["id"] == "fonte"


def test_merge_guarda_recusa_apagar_fonte_com_material_novo_em_producao(tmp_path):
    # C2(a): entre o snapshot e o --execute alguém anexou um material novo à
    # fonte. O DELETE FROM praises tem que virar no-op, não apagar o louvor
    # e cascatear a perda silenciosa desse material.
    conn = _mundo(tmp_path)
    stmts = sql_para(_merge(), conn)
    conn.execute(
        "INSERT INTO praise_materials (id,praise_id,type,material_kind) "
        "VALUES ('mat-novo','fonte','pdf','partitura')"
    )
    conn.commit()
    for s in stmts:
        conn.execute(s)
    conn.commit()

    assert conn.execute("SELECT id FROM praises WHERE id='fonte'").fetchone() is not None
    assert conn.execute(
        "SELECT praise_id FROM praise_materials WHERE id='mat-yt'"
    ).fetchone()["praise_id"] == "keeper"
    assert conn.execute(
        "SELECT praise_id FROM praise_materials WHERE id='mat-novo'"
    ).fetchone()["praise_id"] == "fonte"


def test_merge_guarda_recusa_sobrescrever_keeper_preenchido_em_producao(tmp_path):
    # C2(b): a checagem "keeper vazio" só vale no instante do snapshot. Se
    # alguém preencheu a letra do keeper pelo app antes do --execute rodar,
    # o UPDATE tem que se recusar a sobrescrever essa edição.
    conn = _mundo(tmp_path)
    stmts = sql_para(_merge(), conn)
    assert "lyrics = 'Medo tens que o tentador'" in "\n".join(stmts)

    conn.execute("UPDATE praises SET lyrics = 'letra editada no app' WHERE id='keeper'")
    conn.commit()

    for s in stmts:
        conn.execute(s)
    conn.commit()

    assert conn.execute(
        "SELECT lyrics FROM praises WHERE id='keeper'"
    ).fetchone()["lyrics"] == "letra editada no app"


def test_set_praise_field_tem_guarda_otimista_contra_valor_mudado(tmp_path):
    # C2(c): mesma ideia para set_praise_field, usando o 'current' que o
    # Finding carrega — o valor que o detector viu no snapshot.
    conn = _mundo(tmp_path)
    f = Finding(run_id="r1", detector="letra_dup", target_type="praise",
                target_id="fonte", action="set_praise_field", confidence="alta",
                field="lyrics", current="Medo tens que o tentador",
                proposed="letra nova", evidence={})
    stmts = sql_para(f, conn)
    junto = "\n".join(stmts)
    assert "lyrics = 'letra nova'" in junto
    assert "AND lyrics = 'Medo tens que o tentador'" in junto

    conn.execute("UPDATE praises SET lyrics = 'outra coisa, editada pelo app' WHERE id='fonte'")
    conn.commit()
    for s in stmts:
        conn.execute(s)
    conn.commit()

    assert conn.execute(
        "SELECT lyrics FROM praises WHERE id='fonte'"
    ).fetchone()["lyrics"] == "outra coisa, editada pelo app"


def test_lit_bool_vira_literal_sql_valido_nao_a_palavra_true():
    # isinstance(True, int) é True em Python — checar bool primeiro evita
    # que _lit(True) vire a string 'True' (SQL inválido).
    assert _lit(True) == "1"
    assert _lit(False) == "0"
    assert _lit(None) == "NULL"
    assert _lit(5) == "5"
    assert _lit("ok") == "'ok'"


def test_undo_de_set_praise_field_nao_apaga_materiais_nem_tags(tmp_path, monkeypatch):
    # C1, de regressão: 'INSERT OR REPLACE' é DELETE+INSERT no SQLite, e com
    # a FK real (ON DELETE CASCADE) isso apaga materiais e tags de uma linha
    # que nem foi apagada — o caso de set_praise_field, que nunca apaga o
    # louvor.
    conn = _mundo(tmp_path)
    monkeypatch.setattr("core.apply.run_sql_files", _executar_no_conn(conn))
    log = str(tmp_path / "apply_log.jsonl")
    sql_dir = str(tmp_path / "sql")

    f = Finding(run_id="r1", detector="letra_dup", target_type="praise",
                target_id="fonte", action="set_praise_field", confidence="alta",
                field="lyrics", current="Medo tens que o tentador",
                proposed="letra nova", evidence={})
    aplicar([f], conn, execute=True, log_path=log, remote=False, sql_dir=sql_dir)
    assert conn.execute(
        "SELECT lyrics FROM praises WHERE id='fonte'"
    ).fetchone()["lyrics"] == "letra nova"

    desfazer("r1", log, execute=True, remote=False, sql_dir=sql_dir)

    assert conn.execute(
        "SELECT lyrics FROM praises WHERE id='fonte'"
    ).fetchone()["lyrics"] == "Medo tens que o tentador"
    assert conn.execute(
        "SELECT COUNT(*) n FROM praise_materials WHERE praise_id='fonte'"
    ).fetchone()["n"] == 1
    assert conn.execute(
        "SELECT COUNT(*) n FROM praise_tags WHERE praise_id='fonte'"
    ).fetchone()["n"] == 1


def test_undo_de_merge_restaura_fonte_materiais_e_campos_e_tags_do_keeper(tmp_path, monkeypatch):
    # I3: o undo de uma fusão tem que desfazer o que ela fez no keeper
    # também — não só reconstituir a fonte.
    conn = _mundo(tmp_path)
    monkeypatch.setattr("core.apply.run_sql_files", _executar_no_conn(conn))
    log = str(tmp_path / "apply_log.jsonl")
    sql_dir = str(tmp_path / "sql")

    aplicar([_merge()], conn, execute=True, log_path=log, remote=False, sql_dir=sql_dir)

    # confirma que a fusão de fato aconteceu antes de desfazer
    assert conn.execute("SELECT * FROM praises WHERE id='fonte'").fetchone() is None
    assert conn.execute(
        "SELECT lyrics FROM praises WHERE id='keeper'"
    ).fetchone()["lyrics"] == "Medo tens que o tentador"
    assert conn.execute(
        "SELECT praise_id FROM praise_materials WHERE id='mat-yt'"
    ).fetchone()["praise_id"] == "keeper"

    desfazer("r1", log, execute=True, remote=False, sql_dir=sql_dir)

    fonte = conn.execute("SELECT * FROM praises WHERE id='fonte'").fetchone()
    assert fonte is not None
    assert fonte["lyrics"] == "Medo tens que o tentador"

    keeper = conn.execute("SELECT * FROM praises WHERE id='keeper'").fetchone()
    assert keeper["lyrics"] is None  # campo doado voltou ao vazio original

    mat = conn.execute("SELECT praise_id FROM praise_materials WHERE id='mat-yt'").fetchone()
    assert mat["praise_id"] == "fonte"

    tags_keeper = {r["tag_id"] for r in conn.execute(
        "SELECT tag_id FROM praise_tags WHERE praise_id='keeper'")}
    assert "t-av" not in tags_keeper  # tag que só chegou pela união saiu

    tags_fonte = {r["tag_id"] for r in conn.execute(
        "SELECT tag_id FROM praise_tags WHERE praise_id='fonte'")}
    assert tags_fonte == {"t-av"}


def test_undo_preserva_merged_from_praise_id_anterior(tmp_path, monkeypatch):
    # I4: se o material já vinha de uma fusão anterior, o undo não pode
    # zerar essa proveniência — tem que devolver o valor de antes desta
    # fusão, não NULL fixo.
    conn = _mundo(tmp_path)
    conn.execute("UPDATE praise_materials SET merged_from_praise_id='fusao-anterior' WHERE id='mat-yt'")
    conn.commit()
    monkeypatch.setattr("core.apply.run_sql_files", _executar_no_conn(conn))
    log = str(tmp_path / "apply_log.jsonl")
    sql_dir = str(tmp_path / "sql")

    aplicar([_merge()], conn, execute=True, log_path=log, remote=False, sql_dir=sql_dir)
    assert conn.execute(
        "SELECT merged_from_praise_id FROM praise_materials WHERE id='mat-yt'"
    ).fetchone()["merged_from_praise_id"] == "fonte"

    desfazer("r1", log, execute=True, remote=False, sql_dir=sql_dir)

    assert conn.execute(
        "SELECT merged_from_praise_id FROM praise_materials WHERE id='mat-yt'"
    ).fetchone()["merged_from_praise_id"] == "fusao-anterior"


def test_undo_ignora_linha_corrompida_no_meio_do_log(tmp_path, monkeypatch):
    # I2: linha truncada é o sintoma de um processo morto no meio do
    # log.write — e é depois desse crash que alguém roda --undo. A
    # ferramenta de emergência não pode quebrar bem na situação em que é
    # necessária.
    conn = _mundo(tmp_path)
    monkeypatch.setattr("core.apply.run_sql_files", _executar_no_conn(conn))
    log = str(tmp_path / "apply_log.jsonl")
    sql_dir = str(tmp_path / "sql")

    aplicar([_merge()], conn, execute=True, log_path=log, remote=False, sql_dir=sql_dir)

    with open(log, "a", encoding="utf-8") as fh:
        fh.write('{"finding_id": "x", "run_id": "r1", "ok": tr\n')

    r = desfazer("r1", log, execute=True, remote=False, sql_dir=sql_dir)
    assert r["entradas"] == 1
    assert conn.execute("SELECT id FROM praises WHERE id='fonte'").fetchone() is not None
