from __future__ import annotations

import json
import os

import pytest

from core.apply import _lit, aplicar, desfazer, estado_anterior, sql_para
from core.findings import Finding
from core.snapshot import conectar


ESQUEMA = """
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


def _povoar(conn, keepers=("keeper",)):
    """Uma fonte só-YouTube com letra, material e tag, mais os keepers vazios."""
    conn.executescript(ESQUEMA)
    # A FK real do D1 vem com ON DELETE CASCADE e o D1 roda com
    # PRAGMA foreign_keys = 1 — sem isto aqui, um teste que confia numa
    # cascata (ou que confia na AUSÊNCIA de uma) não reproduz produção.
    conn.execute("PRAGMA foreign_keys = ON")
    for k in keepers:
        conn.execute("INSERT INTO praises (id,name,lyrics) VALUES (?,'Medo tens',NULL)", (k,))
    conn.execute("INSERT INTO praises (id,name,lyrics) VALUES "
                 "('fonte','Medo tens','Medo tens que o tentador')")
    conn.execute("INSERT INTO praise_materials (id,praise_id,type,material_kind,url) "
                 "VALUES ('mat-yt','fonte','youtube','k-audio','https://youtu.be/x')")
    conn.execute("INSERT INTO tags VALUES ('t-av','Avulsos',NULL)")
    conn.execute("INSERT INTO praise_tags VALUES ('fonte','t-av')")
    conn.commit()
    return conn


def _mundo(tmp_path):
    return _povoar(conectar(str(tmp_path / "snap.sqlite")))


def _mundo_dois_bancos(tmp_path, keepers=("keeper",)):
    """Snapshot e produção em ARQUIVOS separados, como na vida real.

    Os testes antigos usam a MESMA conexão para os dois papéis, e isso cega a
    suíte para a classe inteira de "o estado envelheceu entre o snapshot e o
    --execute" — que é o eixo central do design. Com uma conexão só, o
    segundo finding de um lote já lê a fonte apagada e é recusado por
    "louvor ausente no snapshot", mascarando o estrago.
    """
    snap = _povoar(conectar(str(tmp_path / "snap.sqlite")), keepers)
    prod = _povoar(conectar(str(tmp_path / "prod.sqlite")), keepers)
    return snap, prod


def _merge() -> Finding:
    return Finding(
        run_id="r1", detector="youtube_merge", target_type="praise",
        target_id="fonte", praise_id="fonte", action="merge_praise",
        confidence="alta", proposed="keeper",
        evidence={"keeper": "keeper", "motivo": "letra e nome"},
    )


def _executar_no_conn(conn, chamadas=None):
    """run_sql_files falso: aplica os .sql gerados direto na mesma conexão.

    Usado nos testes que precisam do efeito real no banco (não dá pra
    verificar cascata de FK, nem pós-condição, olhando só o texto do SQL).
    Nunca toca o wrangler nem a rede. `chamadas`, se passado, recebe os
    caminhos dos arquivos .sql que teriam ido para o wrangler.
    """
    def _run(arquivos, remote=True):
        if chamadas is not None:
            chamadas.extend(arquivos)
        for caminho in arquivos:
            with open(caminho, encoding="utf-8") as f:
                conn.executescript(f.read())
        conn.commit()
    return _run


def _query_no_conn(conn):
    """core.d1.query falso: roda o SELECT direto na mesma conexão sqlite.

    aplicar(execute=True) sempre confirma a pós-condição contra "produção"
    depois de escrever (I5) — nos testes, "produção" é esta mesma conexão.
    Nunca toca o wrangler nem a rede.
    """
    def _run(sql, remote=True):
        cur = conn.execute(sql)
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]
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
    # I6: mapa coluna -> valor doado, não só a lista de nomes (fix round 3)
    assert antes["doadas"] == {"lyrics": "Medo tens que o tentador"}


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
    # A escrita precisa acontecer de verdade (não só registrar o nome do
    # arquivo): desde I5, aplicar() confirma a pós-condição contra
    # "produção" antes de gravar ok:true, e essa checagem só passa se a
    # fonte de fato sumiu.
    conn = _mundo(tmp_path)
    executados = []
    monkeypatch.setattr("core.apply.run_sql_files", _executar_no_conn(conn, executados))
    monkeypatch.setattr("core.apply.query", _query_no_conn(conn))
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
    assert "estado" not in final  # pós-condição cumprida: não é "guarda_barrou"
    assert final["run_id"] == "r1"
    assert final["antes"]["praise"]["id"] == "fonte"


def test_rodar_de_novo_pula_o_que_ja_foi_aplicado(tmp_path, monkeypatch):
    conn = _mundo(tmp_path)
    monkeypatch.setattr("core.apply.run_sql_files", _executar_no_conn(conn))
    monkeypatch.setattr("core.apply.query", _query_no_conn(conn))
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
    # A pré-condição da quebra 2 pergunta a produção se a fonte ainda
    # existe antes de escrever; sem este patch o teste sairia para o
    # wrangler de verdade.
    monkeypatch.setattr("core.apply.query", _query_no_conn(conn))
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
    monkeypatch.setattr("core.apply.query", _query_no_conn(conn))
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
    monkeypatch.setattr("core.apply.query", _query_no_conn(conn))
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
    monkeypatch.setattr("core.apply.query", _query_no_conn(conn))
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
    monkeypatch.setattr("core.apply.query", _query_no_conn(conn))
    log = str(tmp_path / "apply_log.jsonl")
    sql_dir = str(tmp_path / "sql")

    aplicar([_merge()], conn, execute=True, log_path=log, remote=False, sql_dir=sql_dir)

    with open(log, "a", encoding="utf-8") as fh:
        fh.write('{"finding_id": "x", "run_id": "r1", "ok": tr\n')

    r = desfazer("r1", log, execute=True, remote=False, sql_dir=sql_dir)
    assert r["entradas"] == 1
    assert conn.execute("SELECT id FROM praises WHERE id='fonte'").fetchone() is not None


def test_pos_condicao_barrada_grava_ok_false_e_guarda_barrou(tmp_path, monkeypatch):
    # I5: se a guarda otimista do C2(a) fizer o DELETE afetar 0 linhas (a
    # fonte ganhou material novo entre o snapshot e a escrita), o wrangler
    # sai com código 0 do mesmo jeito. Sem checar a pós-condição contra
    # produção, isso viraria ok:true e o finding nunca mais seria
    # retomado — a fusão ficaria pela metade (campos doados, tags e
    # materiais movidos, mas a fonte viva) registrada como sucesso.
    conn = _mundo(tmp_path)

    def _run_com_material_novo(arquivos, remote=True):
        # simula a corrida: o material novo chega em produção bem no
        # instante em que o "wrangler" roda os statements — a guarda do
        # DELETE vai no-opar quando chegar nele.
        conn.execute(
            "INSERT INTO praise_materials (id,praise_id,type,material_kind) "
            "VALUES ('mat-novo','fonte','pdf','partitura')"
        )
        for caminho in arquivos:
            with open(caminho, encoding="utf-8") as f:
                conn.executescript(f.read())
        conn.commit()

    monkeypatch.setattr("core.apply.run_sql_files", _run_com_material_novo)
    monkeypatch.setattr("core.apply.query", _query_no_conn(conn))

    log = str(tmp_path / "apply_log.jsonl")
    r = aplicar([_merge()], conn, execute=True, log_path=log, remote=False,
                sql_dir=str(tmp_path / "sql"))
    assert r["aplicado"] == 0
    assert r["falhou"] == 1

    linhas = [json.loads(l) for l in open(log, encoding="utf-8").read().strip().split("\n")]
    final = linhas[-1]
    assert final["ok"] is False
    assert final["estado"] == "guarda_barrou"
    assert "evidencia" in final

    # a fonte continua existindo — a guarda barrou de verdade, não é só o
    # log que diz isso
    assert conn.execute("SELECT id FROM praises WHERE id='fonte'").fetchone() is not None


def test_undo_do_keeper_toca_so_colunas_doadas_nesta_fusao(tmp_path, monkeypatch):
    # I6: o undo revertia a linha inteira do keeper com dado do snapshot —
    # inclusive colunas que a fusão nunca tocou. Uma edição feita pelo app
    # numa coluna não-doada, depois da fusão, tem que sobreviver ao --undo.
    conn = _mundo(tmp_path)
    monkeypatch.setattr("core.apply.run_sql_files", _executar_no_conn(conn))
    monkeypatch.setattr("core.apply.query", _query_no_conn(conn))
    log = str(tmp_path / "apply_log.jsonl")
    sql_dir = str(tmp_path / "sql")

    aplicar([_merge()], conn, execute=True, log_path=log, remote=False, sql_dir=sql_dir)

    # depois da fusão, alguém edita pelo app uma coluna do keeper que a
    # fusão NUNCA doa ('name' não está em DOAVEIS) — o undo não pode mexer
    # nela, mesmo divergindo do valor que o snapshot tinha.
    conn.execute(
        "UPDATE praises SET name = 'nome editado no app depois da fusao' WHERE id='keeper'"
    )
    conn.commit()

    desfazer("r1", log, execute=True, remote=False, sql_dir=sql_dir)

    keeper = conn.execute("SELECT * FROM praises WHERE id='keeper'").fetchone()
    assert keeper["name"] == "nome editado no app depois da fusao"  # intocado
    assert keeper["lyrics"] is None  # a coluna doada foi revertida normalmente


def _run_edita_keeper_antes_de_aplicar(conn):
    """run_sql_files falso que simula a corrida do C2(b) dentro do próprio
    'wrangler': alguém preenche keeper.lyrics pelo app bem entre o SQL ter
    sido gerado (assumindo keeper vazio) e ele rodar de verdade — a guarda
    otimista embutida no próprio statement gerado barra a doação.
    """
    def _run(arquivos, remote=True):
        conn.execute("UPDATE praises SET lyrics = 'letra editada no app' WHERE id='keeper'")
        for caminho in arquivos:
            with open(caminho, encoding="utf-8") as f:
                conn.executescript(f.read())
        conn.commit()
    return _run


def test_undo_do_keeper_nao_reverte_coluna_doada_editada_pelo_app_depois_da_fusao(tmp_path, monkeypatch):
    # Residual do I6 (fix round 3): antes["doadas"] guardava o que a fusão
    # PRETENDIA doar no snapshot, não o que a guarda do C2(b) de fato deixou
    # passar em produção. Auto-contradição: a guarda protege a edição
    # humana no caminho de ida (a doação vira no-op) e, sem guarda simétrica
    # no undo, o --undo destrói a mesma edição na volta, revertendo para o
    # vazio do snapshot mesmo assim.
    conn = _mundo(tmp_path)
    monkeypatch.setattr("core.apply.run_sql_files", _run_edita_keeper_antes_de_aplicar(conn))
    monkeypatch.setattr("core.apply.query", _query_no_conn(conn))
    log = str(tmp_path / "apply_log.jsonl")
    sql_dir = str(tmp_path / "sql")

    aplicar([_merge()], conn, execute=True, log_path=log, remote=False, sql_dir=sql_dir)

    # a guarda do C2(b), embutida no próprio statement gerado, barrou a
    # doação — confirma antes de desfazer.
    assert conn.execute(
        "SELECT lyrics FROM praises WHERE id='keeper'"
    ).fetchone()["lyrics"] == "letra editada no app"

    desfazer("r1", log, execute=True, remote=False, sql_dir=sql_dir)

    # o undo não pode ter tocado 'lyrics': produção já não tinha o valor
    # que a fusão doou (a doação nem aconteceu de verdade em produção).
    assert conn.execute(
        "SELECT lyrics FROM praises WHERE id='keeper'"
    ).fetchone()["lyrics"] == "letra editada no app"


def test_undo_do_keeper_reverte_coluna_doada_quando_producao_ainda_tem_o_valor_doado(tmp_path, monkeypatch):
    # Caminho normal (fix round 3): quando ninguém interferiu, a coluna
    # doada ainda tem exatamente o valor que a fusão escreveu — a guarda
    # simétrica do undo passa e a coluna é revertida ao vazio do snapshot,
    # como antes.
    conn = _mundo(tmp_path)
    monkeypatch.setattr("core.apply.run_sql_files", _executar_no_conn(conn))
    monkeypatch.setattr("core.apply.query", _query_no_conn(conn))
    log = str(tmp_path / "apply_log.jsonl")
    sql_dir = str(tmp_path / "sql")

    aplicar([_merge()], conn, execute=True, log_path=log, remote=False, sql_dir=sql_dir)
    assert conn.execute(
        "SELECT lyrics FROM praises WHERE id='keeper'"
    ).fetchone()["lyrics"] == "Medo tens que o tentador"

    desfazer("r1", log, execute=True, remote=False, sql_dir=sql_dir)

    assert conn.execute(
        "SELECT lyrics FROM praises WHERE id='keeper'"
    ).fetchone()["lyrics"] is None


def _merge_faixa(faixa: str, keeper: str) -> Finding:
    """Finding de fusão da mesma fonte para um keeper qualquer, numa faixa qualquer.

    O field entra no finding_id, então dois candidatos da mesma fonte não
    colidem — é assim que o detector emite a faixa média.
    """
    return Finding(
        run_id="r1", detector="youtube_merge", target_type="praise",
        target_id="fonte", praise_id="fonte", action="merge_praise",
        confidence=faixa, proposed=keeper, field=f"keeper:{keeper}",
        evidence={"keeper": keeper},
    )


def test_execute_recusa_faixa_media_e_nao_escreve_nada(tmp_path, monkeypatch):
    # C1: na faixa média o detector emite um finding por candidato da MESMA
    # fonte (7 candidatos numa das fontes reais). Cada finding lê o snapshot,
    # que não muda durante o lote: o primeiro funde de verdade e os outros
    # doam letra/autor e as tags da fonte para keepers que nunca foram
    # fundidos com nada — e a pós-condição devolve ok:true, porque ela só
    # pergunta se a fonte sumiu. D1 manda a faixa média para a fila de
    # revisão humana (o P2); até ela existir, --execute é recusado.
    snap, prod = _mundo_dois_bancos(tmp_path, keepers=("kA", "kB"))
    escreveu = []

    def _nao_devia_rodar(arquivos, remote=True):
        escreveu.extend(arquivos)

    monkeypatch.setattr("core.apply.run_sql_files", _nao_devia_rodar)
    monkeypatch.setattr("core.apply.query", _query_no_conn(prod))
    log = str(tmp_path / "apply_log.jsonl")

    with pytest.raises(ValueError, match="faixa"):
        aplicar([_merge_faixa("media", "kA"), _merge_faixa("media", "kB")],
                snap, execute=True, log_path=log, remote=False,
                sql_dir=str(tmp_path / "sql"))

    # A recusa é anterior a qualquer escrita: nem SQL, nem log, nem estrago
    # em produção. kB é o keeper que a faixa média contaminaria.
    assert escreveu == []
    assert not os.path.exists(log)
    for k in ("kA", "kB"):
        linha = prod.execute("SELECT lyrics FROM praises WHERE id=?", (k,)).fetchone()
        assert linha["lyrics"] is None
    assert prod.execute(
        "SELECT COUNT(*) n FROM praise_tags WHERE praise_id='kB'").fetchone()["n"] == 0
    assert prod.execute("SELECT id FROM praises WHERE id='fonte'").fetchone() is not None


def test_execute_recusa_lote_misto_inteiro(tmp_path):
    # A recusa é do lote, não do finding: um lote 'todas' com uma alta no
    # meio não escreve a alta e engole o resto em silêncio.
    snap, _prod = _mundo_dois_bancos(tmp_path, keepers=("kA", "kB"))
    log = str(tmp_path / "apply_log.jsonl")
    with pytest.raises(ValueError, match="media"):
        aplicar([_merge_faixa("alta", "kA"), _merge_faixa("media", "kB")],
                snap, execute=True, log_path=log, remote=False,
                sql_dir=str(tmp_path / "sql"))
    assert not os.path.exists(log)


def test_simulacao_da_faixa_media_continua_liberada(tmp_path):
    # A recusa é do --execute, não da simulação: inspecionar o payload de
    # qualquer faixa continua sendo a forma de olhar o que o detector propôs.
    snap, _prod = _mundo_dois_bancos(tmp_path, keepers=("kA", "kB"))
    r = aplicar([_merge_faixa("media", "kA"), _merge_faixa("media", "kB")],
                snap, execute=False, log_path=str(tmp_path / "apply_log.jsonl"),
                remote=False)
    assert r["simulado"] == 2
    assert r["aplicado"] == 0


def test_execute_recusa_alvo_repetido_no_lote(tmp_path, monkeypatch):
    # Conserto 2: o portão de faixa sozinho não basta. Dois findings de
    # faixa ALTA — a única que passa pelo portão de faixa — propondo
    # keepers diferentes para a MESMA fonte ('fonte', repetida via
    # _merge_faixa) é exatamente o cenário que D2 hoje impede por
    # construção (candidato único), mas que um detector futuro pode voltar
    # a emitir. Sem o portão de alvo repetido, o primeiro finding fundiria
    # a fonte de verdade e o segundo leria o mesmo snapshot (já obsoleto)
    # para doar letra/tags da fonte a um keeper que nunca foi fundido —
    # com ok:true nos dois, como o portão de faixa já documentava para a
    # média.
    snap, prod = _mundo_dois_bancos(tmp_path, keepers=("kA", "kB"))
    escreveu = []

    def _nao_devia_rodar(arquivos, remote=True):
        escreveu.extend(arquivos)

    monkeypatch.setattr("core.apply.run_sql_files", _nao_devia_rodar)
    monkeypatch.setattr("core.apply.query", _query_no_conn(prod))
    log = str(tmp_path / "apply_log.jsonl")

    with pytest.raises(ValueError, match="fonte"):
        aplicar([_merge_faixa("alta", "kA"), _merge_faixa("alta", "kB")],
                snap, execute=True, log_path=log, remote=False,
                sql_dir=str(tmp_path / "sql"))

    # A recusa é anterior a qualquer escrita: nem SQL, nem log, nem estrago
    # em produção — nos dois keepers e na fonte, que continua viva.
    assert escreveu == []
    assert not os.path.exists(log)
    for k in ("kA", "kB"):
        linha = prod.execute("SELECT lyrics FROM praises WHERE id=?", (k,)).fetchone()
        assert linha["lyrics"] is None
    assert prod.execute(
        "SELECT COUNT(*) n FROM praise_tags WHERE praise_id='kA'").fetchone()["n"] == 0
    assert prod.execute(
        "SELECT COUNT(*) n FROM praise_tags WHERE praise_id='kB'").fetchone()["n"] == 0
    assert prod.execute("SELECT id FROM praises WHERE id='fonte'").fetchone() is not None


def _run_com_material_novo_em_producao(prod):
    """run_sql_files falso que reproduz a corrida do C2(a) em produção.

    Alguém anexa um material novo à fonte pelo app bem no instante do
    --execute: o DELETE guardado vira no-op e a fusão fica pela metade.
    """
    def _run(arquivos, remote=True):
        prod.execute(
            "INSERT INTO praise_materials (id,praise_id,type,material_kind) "
            "VALUES ('mat-novo','fonte','pdf','partitura')"
        )
        for caminho in arquivos:
            with open(caminho, encoding="utf-8") as f:
                prod.executescript(f.read())
        prod.commit()
    return _run


def test_undo_desfaz_fusao_pela_metade_do_guarda_barrou(tmp_path, monkeypatch):
    # C2: quando a guarda otimista barra no meio do lote, o keeper já recebeu
    # os campos doados e as tags e o material já migrou, mas a fonte continua
    # viva. Antes, desfazer() só consumia entradas com ok truthy, então o
    # --undo reportava "0 escritas" na única situação em que havia o que
    # desfazer, e a retomada barrava de novo para sempre: travado.
    snap, prod = _mundo_dois_bancos(tmp_path)
    monkeypatch.setattr("core.apply.run_sql_files", _run_com_material_novo_em_producao(prod))
    monkeypatch.setattr("core.apply.query", _query_no_conn(prod))
    log = str(tmp_path / "apply_log.jsonl")
    sql_dir = str(tmp_path / "sql")

    r = aplicar([_merge()], snap, execute=True, log_path=log, remote=False, sql_dir=sql_dir)
    assert r["falhou"] == 1

    # o estrago pela metade, confirmado em produção antes de desfazer
    assert prod.execute("SELECT id FROM praises WHERE id='fonte'").fetchone() is not None
    assert prod.execute(
        "SELECT lyrics FROM praises WHERE id='keeper'"
    ).fetchone()["lyrics"] == "Medo tens que o tentador"
    assert prod.execute(
        "SELECT praise_id FROM praise_materials WHERE id='mat-yt'"
    ).fetchone()["praise_id"] == "keeper"

    monkeypatch.setattr("core.apply.run_sql_files", _executar_no_conn(prod))
    u = desfazer("r1", log, execute=True, remote=False, sql_dir=sql_dir)
    assert u["entradas"] == 1
    assert u["statements"] > 0

    # tudo de volta: material na fonte, keeper limpo, tag da união removida
    assert prod.execute(
        "SELECT praise_id FROM praise_materials WHERE id='mat-yt'"
    ).fetchone()["praise_id"] == "fonte"
    assert prod.execute(
        "SELECT lyrics FROM praises WHERE id='keeper'").fetchone()["lyrics"] is None
    assert prod.execute(
        "SELECT COUNT(*) n FROM praise_tags WHERE praise_id='keeper'").fetchone()["n"] == 0
    # e o material que chegou pelo app no meio do caminho continua na fonte
    assert prod.execute(
        "SELECT praise_id FROM praise_materials WHERE id='mat-novo'"
    ).fetchone()["praise_id"] == "fonte"


def test_undo_desfaz_escrita_interrompida_por_excecao(tmp_path, monkeypatch):
    # Mesma raiz do C2 pelo outro caminho: o wrangler cai depois de já ter
    # rodado parte dos statements. ok:false, mas o 'antes' está no log — e é
    # o 'antes' que torna a entrada reversível, não o sucesso.
    snap, prod = _mundo_dois_bancos(tmp_path)

    def _roda_e_explode(arquivos, remote=True):
        for caminho in arquivos:
            with open(caminho, encoding="utf-8") as f:
                prod.executescript(f.read())
        prod.commit()
        raise RuntimeError("wrangler caiu depois de escrever")

    monkeypatch.setattr("core.apply.run_sql_files", _roda_e_explode)
    monkeypatch.setattr("core.apply.query", _query_no_conn(prod))
    log = str(tmp_path / "apply_log.jsonl")
    sql_dir = str(tmp_path / "sql")

    r = aplicar([_merge()], snap, execute=True, log_path=log, remote=False, sql_dir=sql_dir)
    assert r["falhou"] == 1
    assert prod.execute("SELECT id FROM praises WHERE id='fonte'").fetchone() is None

    monkeypatch.setattr("core.apply.run_sql_files", _executar_no_conn(prod))
    u = desfazer("r1", log, execute=True, remote=False, sql_dir=sql_dir)
    assert u["entradas"] == 1
    assert prod.execute("SELECT id FROM praises WHERE id='fonte'").fetchone() is not None
    assert prod.execute(
        "SELECT praise_id FROM praise_materials WHERE id='mat-yt'"
    ).fetchone()["praise_id"] == "fonte"


def test_undo_continua_idempotente_com_entrada_sem_ok(tmp_path, monkeypatch):
    # Desfazer duas vezes tem que dar no mesmo: os statements do undo são
    # idempotentes e a guarda simétrica do keeper no-opa na segunda volta.
    snap, prod = _mundo_dois_bancos(tmp_path)
    monkeypatch.setattr("core.apply.run_sql_files", _run_com_material_novo_em_producao(prod))
    monkeypatch.setattr("core.apply.query", _query_no_conn(prod))
    log = str(tmp_path / "apply_log.jsonl")
    sql_dir = str(tmp_path / "sql")

    aplicar([_merge()], snap, execute=True, log_path=log, remote=False, sql_dir=sql_dir)
    monkeypatch.setattr("core.apply.run_sql_files", _executar_no_conn(prod))
    desfazer("r1", log, execute=True, remote=False, sql_dir=sql_dir)
    desfazer("r1", log, execute=True, remote=False, sql_dir=sql_dir)

    fonte = prod.execute("SELECT * FROM praises WHERE id='fonte'").fetchone()
    assert fonte["lyrics"] == "Medo tens que o tentador"
    assert prod.execute(
        "SELECT praise_id FROM praise_materials WHERE id='mat-yt'"
    ).fetchone()["praise_id"] == "fonte"
    assert prod.execute(
        "SELECT lyrics FROM praises WHERE id='keeper'").fetchone()["lyrics"] is None
    assert prod.execute(
        "SELECT COUNT(*) n FROM praise_tags WHERE praise_id='fonte'").fetchone()["n"] == 1


def test_undo_nao_reverte_coluna_doada_editada_depois_mesmo_em_entrada_falha(tmp_path, monkeypatch):
    # A guarda simétrica do undo continua valendo para as entradas que só
    # agora passaram a ser desfeitas: se produção já não tem o valor que esta
    # fusão doou, o undo não pisa na edição humana.
    snap, prod = _mundo_dois_bancos(tmp_path)
    monkeypatch.setattr("core.apply.run_sql_files", _run_com_material_novo_em_producao(prod))
    monkeypatch.setattr("core.apply.query", _query_no_conn(prod))
    log = str(tmp_path / "apply_log.jsonl")
    sql_dir = str(tmp_path / "sql")

    aplicar([_merge()], snap, execute=True, log_path=log, remote=False, sql_dir=sql_dir)

    # depois da fusão meio-feita, o dono corrige a letra do keeper pelo app
    prod.execute("UPDATE praises SET lyrics = 'letra revisada no app' WHERE id='keeper'")
    prod.commit()

    monkeypatch.setattr("core.apply.run_sql_files", _executar_no_conn(prod))
    desfazer("r1", log, execute=True, remote=False, sql_dir=sql_dir)

    assert prod.execute(
        "SELECT lyrics FROM praises WHERE id='keeper'"
    ).fetchone()["lyrics"] == "letra revisada no app"


def test_undo_se_registra_no_log_e_permite_reaplicar(tmp_path, monkeypatch):
    # I1: sem a entrada "desfeito" no log, _ja_aplicados continuava vendo o
    # ok:true da aplicação e pulava o finding em silêncio ('ja_aplicado: 1',
    # que lê como sucesso). O --undo virava porta de mão única.
    snap, prod = _mundo_dois_bancos(tmp_path)
    monkeypatch.setattr("core.apply.run_sql_files", _executar_no_conn(prod))
    monkeypatch.setattr("core.apply.query", _query_no_conn(prod))
    log = str(tmp_path / "apply_log.jsonl")
    sql_dir = str(tmp_path / "sql")

    r1 = aplicar([_merge()], snap, execute=True, log_path=log, remote=False, sql_dir=sql_dir)
    assert r1["aplicado"] == 1
    desfazer("r1", log, execute=True, remote=False, sql_dir=sql_dir)
    assert prod.execute("SELECT id FROM praises WHERE id='fonte'").fetchone() is not None

    linhas = [json.loads(l) for l in open(log, encoding="utf-8").read().strip().split("\n")]
    assert linhas[-1]["estado"] == "desfeito"
    assert linhas[-1]["finding_id"] == _merge().finding_id
    assert "antes" not in linhas[-1]  # um undo não se desfaz

    r2 = aplicar([_merge()], snap, execute=True, log_path=log, remote=False, sql_dir=sql_dir)
    assert r2["ja_aplicado"] == 0
    assert r2["aplicado"] == 1
    assert prod.execute("SELECT id FROM praises WHERE id='fonte'").fetchone() is None


def test_merge_recusa_tag_pai_que_so_a_fonte_tem(tmp_path):
    # I2: a API recusa com 400 associar tag-pai que vem só da fonte
    # (api/src/routes/praises.ts). A fusão por SQL contornava o invariante em
    # silêncio — mesma classe de vazamento que a recusa por r2_key previne.
    conn = _mundo(tmp_path)
    conn.execute("INSERT INTO tags VALUES ('t-filha','Sub de Avulsos','t-av')")
    conn.commit()
    with pytest.raises(ValueError, match="tag-pai"):
        sql_para(_merge(), conn)


def test_merge_aceita_tag_pai_que_o_keeper_ja_tem(tmp_path):
    # Mesmo raciocínio do endpoint: tag-pai que o keeper JÁ tem não é
    # associação nova, é dado preexistente — recusar mataria a fusão inteira
    # de um louvor por causa de uma subtag criada depois.
    conn = _mundo(tmp_path)
    conn.execute("INSERT INTO tags VALUES ('t-filha','Sub de Avulsos','t-av')")
    conn.execute("INSERT INTO praise_tags VALUES ('keeper','t-av')")
    conn.commit()
    junto = "\n".join(sql_para(_merge(), conn))
    assert "DELETE FROM praises WHERE id = 'fonte'" in junto


def test_undo_de_run_id_desconhecido_nao_cria_log_do_nada(tmp_path, monkeypatch):
    # Nada a desfazer é nada a registrar: um --undo com run_id errado não
    # pode inventar um apply_log.jsonl vazio onde não havia nenhum.
    monkeypatch.setattr("core.apply.run_sql_files", lambda arqs, remote=True: None)
    log = str(tmp_path / "nem-existe" / "apply_log.jsonl")
    r = desfazer("r-inexistente", log, execute=True, remote=False,
                 sql_dir=str(tmp_path / "sql"))
    assert r["entradas"] == 0
    assert not os.path.exists(log)


def test_undo_nao_desfaz_fusao_que_o_arnes_se_recusou_a_fazer(tmp_path, monkeypatch):
    # Quebra 1(a): a recusa do próprio sql_para (aqui a de r2_key) grava
    # "antes" e ok:false, mas run_sql_files NEM É CHAMADO — nada chegou a
    # produção. Consumir toda entrada com "antes" transformou o --undo em
    # causa de perda: ele passou a "desfazer" o que nunca aconteceu.
    snap, prod = _mundo_dois_bancos(tmp_path)
    # só o snapshot tem o r2_key — é ele que _sql_merge lê para recusar
    snap.execute("UPDATE praise_materials SET r2_key='assets/x.pdf', url=NULL "
                 "WHERE id='mat-yt'")
    snap.commit()

    tentou = []
    monkeypatch.setattr("core.apply.run_sql_files",
                        lambda arqs, remote=True: tentou.extend(arqs))
    monkeypatch.setattr("core.apply.query", _query_no_conn(prod))
    log = str(tmp_path / "apply_log.jsonl")
    sql_dir = str(tmp_path / "sql")

    r = aplicar([_merge()], snap, execute=True, log_path=log, remote=False,
                sql_dir=sql_dir)
    assert r["falhou"] == 1
    assert tentou == []  # a recusa é anterior a qualquer escrita

    final = [json.loads(l) for l in open(log, encoding="utf-8").read().strip().split("\n")][-1]
    assert final["ok"] is False
    assert final["escreveu"] is False  # é este campo que o --undo consulta
    assert final["antes"]["praise"]["id"] == "fonte"  # o "antes" está lá, e não basta

    monkeypatch.setattr("core.apply.run_sql_files", _executar_no_conn(prod))
    u = desfazer("r1", log, execute=True, remote=False, sql_dir=sql_dir)
    assert u["entradas"] == 0
    assert u["statements"] == 0


def test_undo_nao_reverte_louvor_de_entrada_que_nunca_escreveu(tmp_path, monkeypatch):
    # Quebra 1(a), com o estrago visível: num set_praise_field recusado
    # (campo fora da lista permitida) o undo reconstruía a linha INTEIRA do
    # louvor a partir do snapshot, com ON CONFLICT DO UPDATE. A guarda de
    # "a fonte sumiu" do conserto 1(b) só cobre merge_praise; aqui o que
    # protege é saber que a entrada nunca executou SQL.
    snap, prod = _mundo_dois_bancos(tmp_path)
    tentou = []
    monkeypatch.setattr("core.apply.run_sql_files",
                        lambda arqs, remote=True: tentou.extend(arqs))
    monkeypatch.setattr("core.apply.query", _query_no_conn(prod))
    log = str(tmp_path / "apply_log.jsonl")
    sql_dir = str(tmp_path / "sql")

    f = Finding(run_id="r1", detector="x", target_type="praise",
                target_id="fonte", action="set_praise_field", confidence="alta",
                field="r2_key", current=None, proposed="nao importa", evidence={})
    r = aplicar([f], snap, execute=True, log_path=log, remote=False, sql_dir=sql_dir)
    assert r["falhou"] == 1
    assert tentou == []

    # depois da corrida que não escreveu nada, o dono corrige a letra no app
    prod.execute("UPDATE praises SET lyrics='letra corrigida pelo dono' WHERE id='fonte'")
    prod.commit()

    monkeypatch.setattr("core.apply.run_sql_files", _executar_no_conn(prod))
    desfazer("r1", log, execute=True, remote=False, sql_dir=sql_dir)

    assert prod.execute(
        "SELECT lyrics FROM praises WHERE id='fonte'"
    ).fetchone()["lyrics"] == "letra corrigida pelo dono"


def test_undo_nao_reescreve_fonte_viva_nem_ressuscita_tag_que_o_app_apagou(tmp_path, monkeypatch):
    # Quebra 1(b): aqui a escrita ACONTECEU (guarda_barrou — o keeper
    # recebeu a doação e o material migrou), então 1(a) não protege. Mas a
    # fonte continua viva: o DELETE guardado no-opou, e por isso a fusão não
    # tocou nem na linha da fonte nem nas tags dela. Reverter a linha inteira
    # a partir do snapshot destruía a edição do dono, e o INSERT OR IGNORE
    # das tags ressuscitava tag que o app apagou. A fonte precisa da mesma
    # guarda simétrica que o keeper já tem: só desfaz o que ainda está como a
    # fusão deixou.
    snap, prod = _mundo_dois_bancos(tmp_path)
    monkeypatch.setattr("core.apply.run_sql_files", _run_com_material_novo_em_producao(prod))
    monkeypatch.setattr("core.apply.query", _query_no_conn(prod))
    log = str(tmp_path / "apply_log.jsonl")
    sql_dir = str(tmp_path / "sql")

    r = aplicar([_merge()], snap, execute=True, log_path=log, remote=False, sql_dir=sql_dir)
    assert r["falhou"] == 1
    assert prod.execute("SELECT id FROM praises WHERE id='fonte'").fetchone() is not None

    # o dono mexe na fonte pelo app: corrige a letra e apaga uma tag
    prod.execute("UPDATE praises SET lyrics='letra corrigida pelo dono' WHERE id='fonte'")
    prod.execute("DELETE FROM praise_tags WHERE praise_id='fonte' AND tag_id='t-av'")
    prod.commit()

    monkeypatch.setattr("core.apply.run_sql_files", _executar_no_conn(prod))
    desfazer("r1", log, execute=True, remote=False, sql_dir=sql_dir)

    assert prod.execute(
        "SELECT lyrics FROM praises WHERE id='fonte'"
    ).fetchone()["lyrics"] == "letra corrigida pelo dono"
    assert prod.execute(
        "SELECT COUNT(*) n FROM praise_tags WHERE praise_id='fonte'"
    ).fetchone()["n"] == 0
    # e o que a fusão de fato escreveu continua sendo desfeito
    assert prod.execute(
        "SELECT lyrics FROM praises WHERE id='keeper'").fetchone()["lyrics"] is None


def test_undo_nao_arranca_material_que_o_app_moveu_depois_da_fusao(tmp_path, monkeypatch):
    # Quebra 1(b), lado do material: a fusão pendurou mat-yt no keeper. Se o
    # dono moveu esse material para um terceiro louvor pelo app antes do
    # --undo, o de volta tem que no-opar — devolver à fonte arrancaria o
    # material de onde o dono o pôs.
    snap, prod = _mundo_dois_bancos(tmp_path)
    monkeypatch.setattr("core.apply.run_sql_files", _run_com_material_novo_em_producao(prod))
    monkeypatch.setattr("core.apply.query", _query_no_conn(prod))
    log = str(tmp_path / "apply_log.jsonl")
    sql_dir = str(tmp_path / "sql")

    aplicar([_merge()], snap, execute=True, log_path=log, remote=False, sql_dir=sql_dir)
    assert prod.execute(
        "SELECT praise_id FROM praise_materials WHERE id='mat-yt'"
    ).fetchone()["praise_id"] == "keeper"

    prod.execute("INSERT INTO praises (id,name) VALUES ('outro','Outro louvor')")
    prod.execute("UPDATE praise_materials SET praise_id='outro' WHERE id='mat-yt'")
    prod.commit()

    monkeypatch.setattr("core.apply.run_sql_files", _executar_no_conn(prod))
    desfazer("r1", log, execute=True, remote=False, sql_dir=sql_dir)

    assert prod.execute(
        "SELECT praise_id FROM praise_materials WHERE id='mat-yt'"
    ).fetchone()["praise_id"] == "outro"


def test_segundo_execute_contra_o_mesmo_snapshot_recusa_fonte_ja_fundida(tmp_path, monkeypatch):
    # Quebra 2: o mecanismo do C1 sobrevivia inteiro entre dois --execute
    # contra o MESMO snapshot — a sequência de quem mexe numa constante do
    # detector e re-roda (o snapshot é o default --db out/snapshot.sqlite).
    # O lote 1 funde fonte->kA de verdade. O lote 2 tem um finding só, então
    # o portão de alvo repetido (que é por lote) não dispara: _sql_merge lê a
    # fonte VIVA no snapshot velho e doa lyrics e as tags dela para kB, que
    # nunca foi fundido com nada. Os UPDATEs de material e o DELETE no-opam,
    # e _pos_condicao pergunta só "a fonte sumiu?" — sim, no lote ANTERIOR —
    # então gravava ok:true nos dois. A raiz não é o portão de lote; é
    # concluir sobre produção a partir do snapshot.
    snap, prod = _mundo_dois_bancos(tmp_path, keepers=("kA", "kB"))
    escritos = []
    monkeypatch.setattr("core.apply.run_sql_files", _executar_no_conn(prod, escritos))
    monkeypatch.setattr("core.apply.query", _query_no_conn(prod))
    log = str(tmp_path / "apply_log.jsonl")
    sql_dir = str(tmp_path / "sql")

    # lote 1: a fusão legítima
    r1 = aplicar([_merge_faixa("alta", "kA")], snap, execute=True, log_path=log,
                 remote=False, sql_dir=sql_dir)
    assert r1["aplicado"] == 1
    assert prod.execute("SELECT id FROM praises WHERE id='fonte'").fetchone() is None
    assert prod.execute(
        "SELECT lyrics FROM praises WHERE id='kA'"
    ).fetchone()["lyrics"] == "Medo tens que o tentador"
    escritos.clear()

    # lote 2: MESMO snapshot (não refeito), keeper diferente. finding_id
    # diferente, então _ja_aplicados não pega — é por isso que o replay pelo
    # log não cobre este caso.
    f2 = _merge_faixa("alta", "kB")
    assert f2.finding_id != _merge_faixa("alta", "kA").finding_id
    r2 = aplicar([f2], snap, execute=True, log_path=log, remote=False, sql_dir=sql_dir)

    assert r2["ja_aplicado"] == 0  # o log não salva este caso
    assert r2["aplicado"] == 0
    assert r2["falhou"] == 1
    assert escritos == []  # a recusa é anterior a qualquer escrita

    # kB continua sendo o louvor vazio que sempre foi
    kb = prod.execute("SELECT * FROM praises WHERE id='kB'").fetchone()
    assert kb["lyrics"] is None
    assert kb["author"] is None
    assert prod.execute(
        "SELECT COUNT(*) n FROM praise_tags WHERE praise_id='kB'").fetchone()["n"] == 0
    # e o material continua onde a fusão legítima o pôs
    assert prod.execute(
        "SELECT praise_id FROM praise_materials WHERE id='mat-yt'"
    ).fetchone()["praise_id"] == "kA"

    final = [json.loads(l) for l in open(log, encoding="utf-8").read().strip().split("\n")][-1]
    assert final["ok"] is False
    assert final["estado"] == "fonte_ausente"
    # e nada a desfazer: a recusa não escreveu, então o --undo não a toca
    assert final["escreveu"] is False


def test_fusao_com_a_fonte_viva_em_producao_continua_passando(tmp_path, monkeypatch):
    # A pré-condição da quebra 2 não pode virar um portão que recusa o
    # caminho feliz: com a fonte de pé em produção, a fusão escreve como
    # sempre escreveu.
    snap, prod = _mundo_dois_bancos(tmp_path)
    monkeypatch.setattr("core.apply.run_sql_files", _executar_no_conn(prod))
    monkeypatch.setattr("core.apply.query", _query_no_conn(prod))
    r = aplicar([_merge()], snap, execute=True,
                log_path=str(tmp_path / "apply_log.jsonl"), remote=False,
                sql_dir=str(tmp_path / "sql"))
    assert r["aplicado"] == 1
    assert prod.execute("SELECT id FROM praises WHERE id='fonte'").fetchone() is None


def test_pre_condicao_nao_recusa_fusao_com_a_fonte_apagada_so_no_snapshot(tmp_path, monkeypatch):
    # A pergunta é para PRODUÇÃO, não para o snapshot: uma fonte que o
    # snapshot não tem mais (porque o snapshot foi refeito) mas que produção
    # ainda tem não é o caso perigoso — e, do outro lado, um snapshot velho
    # cheio de fontes já fundidas não autoriza nada. Aqui a fonte só existe
    # em produção, e quem recusa é o próprio _sql_merge por não achá-la no
    # snapshot — não a pré-condição, que passa.
    snap, prod = _mundo_dois_bancos(tmp_path)
    snap.execute("DELETE FROM praise_materials WHERE praise_id='fonte'")
    snap.execute("DELETE FROM praises WHERE id='fonte'")
    snap.commit()
    escritos = []
    monkeypatch.setattr("core.apply.run_sql_files",
                        lambda arqs, remote=True: escritos.extend(arqs))
    monkeypatch.setattr("core.apply.query", _query_no_conn(prod))
    log = str(tmp_path / "apply_log.jsonl")

    r = aplicar([_merge()], snap, execute=True, log_path=log, remote=False,
                sql_dir=str(tmp_path / "sql"))
    assert r["falhou"] == 1
    assert escritos == []
    final = [json.loads(l) for l in open(log, encoding="utf-8").read().strip().split("\n")][-1]
    assert final.get("estado") != "fonte_ausente"
    assert "louvor ausente no snapshot" in final["erro"]


def test_retomada_apos_falha_ao_reportar_nao_apaga_o_undo_da_fusao(tmp_path, monkeypatch):
    # A dedup por finding_id guardava a ÚLTIMA entrada e só depois filtrava
    # por "escreveu" — o que pressupõe que a última entrada domina as
    # anteriores. Não domina: uma recusa que nunca escreveu não apaga uma
    # escrita que aconteceu.
    #
    # A cena real: o wrangler aplica o arquivo inteiro e morre ao reportar
    # (timeout de rede depois de o D1 ter aplicado). A fusão está COMPLETA em
    # produção e a entrada fica ok=False, escreveu=True. O operador faz o
    # gesto de retomada que o README documenta — roda o mesmo findings de
    # novo — e a pré-condição de fonte viva recusa, corretamente, gravando
    # estado=fonte_ausente com escreveu=False. Antes do conserto, essa recusa
    # sombreava a escrita e o --undo imprimia "0 escritas": a fonte não
    # voltava, num acervo sem lixeira.
    snap, prod = _mundo_dois_bancos(tmp_path)

    def _aplica_e_morre_ao_reportar(arquivos, remote=True):
        for caminho in arquivos:
            with open(caminho, encoding="utf-8") as f:
                prod.executescript(f.read())
        prod.commit()
        raise RuntimeError("timeout ao ler a resposta do wrangler")

    monkeypatch.setattr("core.apply.run_sql_files", _aplica_e_morre_ao_reportar)
    monkeypatch.setattr("core.apply.query", _query_no_conn(prod))
    log = str(tmp_path / "apply_log.jsonl")
    sql_dir = str(tmp_path / "sql")

    r1 = aplicar([_merge()], snap, execute=True, log_path=log, remote=False, sql_dir=sql_dir)
    assert r1["falhou"] == 1
    # a fusão aconteceu inteira, apesar do ok:false
    assert prod.execute("SELECT id FROM praises WHERE id='fonte'").fetchone() is None
    assert prod.execute(
        "SELECT lyrics FROM praises WHERE id='keeper'"
    ).fetchone()["lyrics"] == "Medo tens que o tentador"

    # a retomada honesta: mesmo findings, mesmo snapshot. _ja_aplicados não
    # pula (a entrada é ok:false de propósito) e a pré-condição recusa.
    monkeypatch.setattr("core.apply.run_sql_files", _executar_no_conn(prod))
    r2 = aplicar([_merge()], snap, execute=True, log_path=log, remote=False, sql_dir=sql_dir)
    assert r2["falhou"] == 1
    ultima = [json.loads(l) for l in open(log, encoding="utf-8").read().strip().split("\n")][-1]
    assert ultima["estado"] == "fonte_ausente"
    assert ultima["escreveu"] is False

    u = desfazer("r1", log, execute=True, remote=False, sql_dir=sql_dir)

    # o que manda é a entrada que escreveu, não a recusa que veio depois
    assert u["entradas"] == 1
    assert u["statements"] > 0
    assert prod.execute("SELECT id FROM praises WHERE id='fonte'").fetchone() is not None
    assert prod.execute(
        "SELECT praise_id FROM praise_materials WHERE id='mat-yt'"
    ).fetchone()["praise_id"] == "fonte"
    assert prod.execute(
        "SELECT lyrics FROM praises WHERE id='keeper'").fetchone()["lyrics"] is None
    assert prod.execute(
        "SELECT COUNT(*) n FROM praise_tags WHERE praise_id='fonte'").fetchone()["n"] == 1


def test_recusa_posterior_nao_ressuscita_entrada_anterior_que_nao_escreveu(tmp_path, monkeypatch):
    # O contrapeso do teste acima: guardar "a última que escreveu" não pode
    # virar "guardar qualquer entrada anterior". Se NENHUMA entrada do
    # finding escreveu — recusa do próprio sql_para (r2_key) seguida da
    # recusa da pré-condição —, o finding continua fora do undo.
    snap, prod = _mundo_dois_bancos(tmp_path)
    for c in (snap, prod):
        c.execute("UPDATE praise_materials SET r2_key='pdf/x.pdf' WHERE id='mat-yt'")
        c.commit()
    escritos = []
    monkeypatch.setattr("core.apply.run_sql_files", _executar_no_conn(prod, escritos))
    monkeypatch.setattr("core.apply.query", _query_no_conn(prod))
    log = str(tmp_path / "apply_log.jsonl")
    sql_dir = str(tmp_path / "sql")

    aplicar([_merge()], snap, execute=True, log_path=log, remote=False, sql_dir=sql_dir)
    aplicar([_merge()], snap, execute=True, log_path=log, remote=False, sql_dir=sql_dir)
    assert escritos == []  # a recusa por r2_key é anterior a qualquer escrita

    # o dono edita a fonte pelo app depois da recusa
    prod.execute("UPDATE praises SET lyrics='EDICAO DO DONO' WHERE id='fonte'")
    prod.commit()

    u = desfazer("r1", log, execute=True, remote=False, sql_dir=sql_dir)
    assert u["entradas"] == 0
    assert u["statements"] == 0
    assert prod.execute(
        "SELECT lyrics FROM praises WHERE id='fonte'"
    ).fetchone()["lyrics"] == "EDICAO DO DONO"
