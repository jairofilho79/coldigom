# tests/test_plpcg_apply.py
from __future__ import annotations

import json
import sqlite3

import pytest

from core import plpcg_apply as pa
from revisao import decisoes as dec


def _finding(short, faixa, nome, path, categoria="Cifra", numero="", classificacao="Avulsos Diversos",
             praise_id=None, material_id=None, evid=("nome",), sha="s"):
    return {
        "run_id": "r1", "detector": "plpcg_crosswalk", "target_type": "plpcg", "target_id": "pdf-" + short,
        "action": "link_plpcg", "confidence": faixa, "praise_id": praise_id,
        "evidence": {"faixa": faixa, "evidencias": list(evid), "nome": nome, "numero": numero,
                     "classificacao": classificacao, "categoria": categoria, "group_id": "avulso:" + short,
                     "short_id": short, "path": path, "sha256": sha, "kind_esperado": "Chord Chart",
                     "kind_coldigom": None, "material_id": material_id, "nota": "", "candidatos": [], "checksum": "c"},
        "field": None, "current": None, "proposed": None, "finding_id": "f" + short,
    }


@pytest.fixture
def mundo(tmp_path):
    db = tmp_path / "snapshot.sqlite"
    conn = sqlite3.connect(db)
    conn.row_factory = sqlite3.Row
    conn.executescript("""
        CREATE TABLE praises (id TEXT PRIMARY KEY, name TEXT, number TEXT);
        CREATE TABLE praise_materials (id TEXT PRIMARY KEY, praise_id TEXT, material_kind TEXT, type TEXT,
            r2_key TEXT, file_path_legacy TEXT, source_material_id TEXT, merged_from_praise_id TEXT, url TEXT,
            is_reviewed INTEGER DEFAULT 0);
        CREATE TABLE material_kinds (id TEXT PRIMARY KEY, name TEXT);
        CREATE TABLE tags (id TEXT PRIMARY KEY, name TEXT, parent_id TEXT);
        CREATE TABLE praise_tags (praise_id TEXT, tag_id TEXT);
        INSERT INTO material_kinds VALUES ('k-choir', 'Choir'), ('k-cc', 'Chord Chart'), ('k-cc1', 'Chord Chart I');
        INSERT INTO praises VALUES ('p1', 'Aleluia', '001'), ('p2', 'Gadareno', '');
        INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES
            ('m1', 'p1', 'k-cc1', 'pdf', 'assets/praises/p1/m1.pdf'),
            ('m2', 'p1', 'k-choir', 'pdf', 'assets/praises/p1/m2.pdf');
        INSERT INTO tags VALUES ('t-col', 'Coletânea', NULL), ('t-avu', 'Avulsos', NULL), ('t-pes', 'PES', NULL);
        INSERT INTO praise_tags VALUES ('p1', 't-col');
    """)
    conn.commit()
    plpcjf = tmp_path / "plpcjf"
    for p in ("ColAdultos/001/Cifra I.pdf", "Avulsos/a.pdf", "Avulsos/b.pdf", "Avulsos/c.pdf", "Avulsos/d.pdf"):
        (plpcjf / p).parent.mkdir(parents=True, exist_ok=True)
        (plpcjf / p).write_bytes(b"%PDF " + p.encode())
    findings = [
        _finding("0001", "alta", "Aleluia", "ColAdultos/001/Cifra I.pdf", "Cifra nível I", "001", "Coletânea Adultos",
                 praise_id="p1", material_id="m1", evid=("num", "slug", "hash")),
        _finding("0002", "media", "Aleluia", "Avulsos/a.pdf", "Partitura", praise_id="p1", evid=("nome",)),
        _finding("0003", "sem_louvor", "A palavra de poder", "Avulsos/b.pdf", "Cifra"),
        _finding("0004", "sem_louvor", "A Palavra de Poder", "Avulsos/c.pdf", "Partitura"),
        _finding("0005", "sem_louvor", "Lixo", "Avulsos/d.pdf", "Cifra"),
        _finding("0006", "sem_louvor", "Sem arquivo", "Avulsos/nao-existe.pdf", "Cifra"),
        _finding("0007", "alta", "Aleluia II", "Avulsos/zz.pdf", "Cifra", praise_id="p1", material_id="m1", evid=("hash",)),
    ]
    decisoes = {
        "pdf-0002": {"pdf_id": "pdf-0002", "tipo": "substituir", "praise_id": "p1", "material_id": "m2", "kind": "Choir"},
        "pdf-0003": {"pdf_id": "pdf-0003", "tipo": "criar", "nome": "A palavra de poder", "kind": "Chord Chart"},
        "pdf-0004": {"pdf_id": "pdf-0004", "tipo": "adicionar", "kind": "Choir", "junto_com": "pdf-0003"},
        "pdf-0005": {"pdf_id": "pdf-0005", "tipo": "descartar"},
        "pdf-0006": {"pdf_id": "pdf-0006", "tipo": "criar", "nome": "Sem arquivo", "kind": "Chord Chart"},
    }
    return {"conn": conn, "findings": findings, "decisoes": decisoes, "plpcjf": str(plpcjf),
            "baixados": str(tmp_path / "baixados"), "tmp": tmp_path}


def test_plano_alta_sem_decisao_vira_link_do_detector(mundo):
    plano = pa.montar_plano(mundo["decisoes"], mundo["findings"], mundo["conn"], mundo["plpcjf"], mundo["baixados"])
    links = plano.por_tipo("link")
    assert [(o.entradas[0].short_id, o.praise_id, o.material_id, o.confianca, o.decidido_por) for o in links] == [
        ("0001", "p1", "m1", "alta", "detector"), ("0007", "p1", "m1", "alta", "detector")]
    assert links[0].entradas[0].evidencia == "num+slug+hash"
    assert links[1].entradas[0].arquivo is None  # link não precisa do PDF no disco


def test_plano_substituir_e_nada(mundo):
    plano = pa.montar_plano(mundo["decisoes"], mundo["findings"], mundo["conn"], mundo["plpcjf"], mundo["baixados"])
    (s,) = plano.por_tipo("substituir")
    assert (s.praise_id, s.material_id, s.entradas[0].kind, s.entradas[0].evidencia) == ("p1", "m2", "Choir", "site:substituir")
    assert s.entradas[0].arquivo.endswith("Avulsos/a.pdf")
    (n,) = plano.por_tipo("nada")
    assert (n.entradas[0].short_id, n.motivo) == ("0005", "descartar")


def test_plano_criar_agrupa_por_nome_e_resolve_junto_com(mundo):
    plano = pa.montar_plano(mundo["decisoes"], mundo["findings"], mundo["conn"], mundo["plpcjf"], mundo["baixados"])
    (c,) = plano.por_tipo("criar")
    assert c.nome == "A palavra de poder" and c.numero == "" and c.tags == ["Avulsos"]
    assert [(e.short_id, e.kind) for e in c.entradas] == [("0003", "Chord Chart"), ("0004", "Choir")]
    assert c.op_id == pa.op_id("criar", ["pdf-0003", "pdf-0004"])


def test_plano_recusa_pdf_ausente_e_junto_com_solto(mundo):
    d = dict(mundo["decisoes"])
    d["pdf-0004"] = {"pdf_id": "pdf-0004", "tipo": "adicionar", "kind": "Choir", "junto_com": "pdf-0005"}
    d["pdf-0005"] = {"pdf_id": "pdf-0005", "tipo": "adicionar", "kind": "Chord Chart", "junto_com": "pdf-0004"}
    plano = pa.montar_plano(d, mundo["findings"], mundo["conn"], mundo["plpcjf"], mundo["baixados"])
    motivos = {r["short_id"]: r["motivo"] for r in plano.recusas}
    assert "ciclo" in motivos["0004"] and "ciclo" in motivos["0005"]
    assert motivos["0006"].startswith("PDF não está no disco")          # criar sem o PDF
    assert [e.short_id for e in plano.por_tipo("criar")[0].entradas] == ["0003"]
    d["pdf-0005"] = {"pdf_id": "pdf-0005", "tipo": "adicionar", "kind": "Chord Chart", "junto_com": "pdf-0006"}
    d["pdf-0004"] = {"pdf_id": "pdf-0004", "tipo": "adicionar", "kind": "Choir", "junto_com": "pdf-0003"}
    plano = pa.montar_plano(d, mundo["findings"], mundo["conn"], mundo["plpcjf"], mundo["baixados"])
    assert {r["short_id"]: r["motivo"] for r in plano.recusas}["0005"] == "junto_com aponta para um 'criar' que foi recusado"


def test_plano_recusa_kind_desconhecido_e_material_de_outro_praise(mundo):
    d = dict(mundo["decisoes"])
    d["pdf-0002"] = {"pdf_id": "pdf-0002", "tipo": "adicionar", "praise_id": "p1", "kind": "Banjo"}
    d["pdf-0001"] = {"pdf_id": "pdf-0001", "tipo": "link", "praise_id": "p2", "material_id": "m1"}
    plano = pa.montar_plano(d, mundo["findings"], mundo["conn"], mundo["plpcjf"], mundo["baixados"])
    motivos = {r["short_id"]: r["motivo"] for r in plano.recusas}
    assert "Banjo" in motivos["0002"] and "m1" in motivos["0001"]


def test_plano_recusa_junto_com_para_entrada_sem_finding(mundo):
    # pdf-0004 (adicionar, junto_com pdf-0003) aponta para uma decisão "criar"
    # (pdf-0003) que não tem finding nesta rodada de findings.jsonl.
    findings = [f for f in mundo["findings"] if f["target_id"] != "pdf-0003"]
    plano = pa.montar_plano(mundo["decisoes"], findings, mundo["conn"], mundo["plpcjf"], mundo["baixados"])
    motivos = {r["short_id"]: r["motivo"] for r in plano.recusas}
    assert "sem finding" in motivos["0004"]


def test_sql_link_e_importar(mundo):
    plano = pa.montar_plano(mundo["decisoes"], mundo["findings"], mundo["conn"], mundo["plpcjf"], mundo["baixados"])
    kinds = {"Choir": "k-choir", "Chord Chart": "k-cc", "Chord Chart I": "k-cc1"}
    tags = {"Avulsos": "t-avu", "Coletânea": "t-col"}
    link = plano.por_tipo("link")[0]
    (s,) = pa.sql_op(link, {"praise_id": None, "material_ids": {}}, kinds, tags, "run-x")
    assert s.startswith("INSERT INTO plpcg_crosswalk (pdf_id, short_id, group_id, praise_id, praise_material_id, evidencia, confianca, decidido_por, run_id) VALUES ('pdf-0001', '0001', 'avulso:0001', 'p1', 'm1', 'num+slug+hash', 'alta', 'detector', 'run-x')")
    sub = plano.por_tipo("substituir")[0]
    stmts = pa.sql_op(sub, {"praise_id": None, "material_ids": {"pdf-0002": "m-novo"}}, kinds, tags, "run-x")
    assert stmts[0] == ("INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key, file_path_legacy, "
                        "source_material_id, merged_from_praise_id, url, is_reviewed) VALUES ('m-novo', 'p1', 'k-choir', 'pdf', "
                        "'assets/praises/p1/m-novo.pdf', 'plpcg:Avulsos/a.pdf', NULL, NULL, NULL, 0);")
    assert "'pdf-0002', '0002', 'avulso:0002', 'p1', 'm-novo', 'site:substituir', 'humano', 'jairo', 'run-x'" in stmts[1]
    assert stmts[2] == "DELETE FROM praise_materials WHERE id = 'm2' AND praise_id = 'p1';"


def test_sql_criar_praise_tags_e_materiais(mundo):
    plano = pa.montar_plano(mundo["decisoes"], mundo["findings"], mundo["conn"], mundo["plpcjf"], mundo["baixados"])
    kinds = {"Choir": "k-choir", "Chord Chart": "k-cc"}
    (c,) = plano.por_tipo("criar")
    ids = {"praise_id": "p-novo", "material_ids": {"pdf-0003": "m3", "pdf-0004": "m4"}}
    stmts = pa.sql_op(c, ids, kinds, {"Avulsos": "t-avu"}, "run-x")
    assert stmts[0] == "INSERT INTO praises (id, name, number) VALUES ('p-novo', 'A palavra de poder', '');"
    assert stmts[1] == "INSERT INTO praise_tags (praise_id, tag_id) VALUES ('p-novo', 't-avu');"
    assert "('m3', 'p-novo', 'k-cc', 'pdf', 'assets/praises/p-novo/m3.pdf'" in stmts[2]
    assert "'pdf-0003', '0003'" in stmts[3] and "('m4', 'p-novo', 'k-choir'" in stmts[4] and "'pdf-0004'" in stmts[5]
    assert len(stmts) == 6
    with pytest.raises(ValueError, match="tag"):
        pa.sql_op(c, ids, kinds, {}, "run-x")
    assert pa.sql_op(plano.por_tipo("nada")[0], ids, kinds, {}, "run-x") == []


# --- execução ------------------------------------------------------------------

@pytest.fixture
def stubs(monkeypatch):
    """Substitui as quatro portas para o mundo. `prod` é o estado que `query` responde."""
    prod = {"praises": {"p1", "p2"}, "materiais": {"m1": "p1", "m2": "p1"}, "crosswalk": set(),
            "nomes": [("p1", "Aleluia", "Coletânea"), ("p2", "Gadareno", None)]}
    chamadas = {"query": [], "sql": [], "put": [], "delete": []}
    falhar = {"sql": False, "silencioso": False}

    def query(sql, remote=True):
        chamadas["query"].append(sql)
        if "FROM plpcg_crosswalk WHERE run_id" in sql:
            return [{"pdf_id": p} for p in sorted(prod["crosswalk"])]
        if sql.startswith("SELECT pdf_id FROM plpcg_crosswalk"):
            return [{"pdf_id": p} for p in sorted(prod["crosswalk"])]
        if sql.startswith("SELECT id FROM praises"):
            return [{"id": p} for p in sorted(prod["praises"])]
        if sql.startswith("SELECT id, praise_id FROM praise_materials"):
            return [{"id": m, "praise_id": p} for m, p in sorted(prod["materiais"].items())]
        if sql.startswith("SELECT id FROM praise_materials WHERE id IN"):
            return [{"id": m} for m in sorted(prod["materiais"]) if m in sql]
        if "AS tag FROM praises" in sql:
            return [{"id": i, "name": n, "tag": t} for i, n, t in prod["nomes"]]
        raise AssertionError("query inesperada: " + sql)

    def run_sql_files(arquivos, remote=True):
        chamadas["sql"].extend(arquivos)
        if falhar["sql"]:
            raise RuntimeError("wrangler caiu")
        if falhar["silencioso"]:
            return  # o wrangler "roda" mas nada pega em produção (guarda_barrou na pós-condição)
        for a in arquivos:
            for linha in open(a, encoding="utf-8"):
                if linha.startswith("INSERT INTO plpcg_crosswalk"):
                    prod["crosswalk"].add(linha.split("VALUES ('")[1].split("'")[0])
                if linha.startswith("DELETE FROM praise_materials WHERE id = '"):
                    prod["materiais"].pop(linha.split("'")[1], None)
                if linha.startswith("INSERT INTO praise_materials"):
                    mid, pid = linha.split("VALUES ('")[1].split("'")[0], linha.split("', '")[1]
                    prod["materiais"][mid] = pid
                if linha.startswith("INSERT INTO praises "):
                    prod["praises"].add(linha.split("VALUES ('")[1].split("'")[0])

    monkeypatch.setattr(pa, "query", query)
    monkeypatch.setattr(pa, "run_sql_files", run_sql_files)
    monkeypatch.setattr(pa, "r2_put", lambda key, arquivo, content_type="application/pdf": chamadas["put"].append(key))
    monkeypatch.setattr(pa, "r2_delete", lambda key: chamadas["delete"].append(key))
    return {"prod": prod, "chamadas": chamadas, "falhar": falhar}


def _ids():
    n = iter(range(1, 100))
    return lambda: f"id-{next(n):02d}"


def _log(path):
    return [json.loads(l) for l in open(path, encoding="utf-8") if l.strip()]


def test_simulacao_nao_toca_rede_e_confere_sha(mundo, stubs, capsys):
    plano = pa.montar_plano(mundo["decisoes"], mundo["findings"], mundo["conn"], mundo["plpcjf"], mundo["baixados"])
    r = pa.executar(plano, "todos", execute=False, run_id="run-s", log_path=str(mundo["tmp"] / "log.jsonl"),
                    conn=mundo["conn"], sql_dir=str(mundo["tmp"] / "sql"), execucao_dir=str(mundo["tmp"] / "exec"))
    assert stubs["chamadas"] == {"query": [], "sql": [], "put": [], "delete": []}
    assert r["simuladas"] == 2 and r["falharam"] == 2 and r["sem_escrita"] == 1  # 0002/0004+0003 têm sha 's' ≠ real
    assert not (mundo["tmp"] / "log.jsonl").exists()
    assert "INSERT INTO plpcg_crosswalk" in capsys.readouterr().out


def test_execute_exige_tipo(mundo, stubs):
    plano = pa.montar_plano(mundo["decisoes"], mundo["findings"], mundo["conn"], mundo["plpcjf"], mundo["baixados"])
    with pytest.raises(ValueError, match="--tipo"):
        pa.executar(plano, "todos", execute=True, run_id="r", log_path=str(mundo["tmp"] / "l"), conn=mundo["conn"])


def _com_sha_real(mundo):
    """Os findings da fixture têm sha 's'; aqui os alinhamos com o disco para a execução passar."""
    from core.plpcg import arquivo_local, sha256_arquivo
    for f in mundo["findings"]:
        p = arquivo_local(f["evidence"]["path"], mundo["plpcjf"], mundo["baixados"])
        if p:
            f["evidence"]["sha256"] = sha256_arquivo(p)


def test_execute_link_em_lote_e_pos_condicao(mundo, stubs):
    _com_sha_real(mundo)
    plano = pa.montar_plano(mundo["decisoes"], mundo["findings"], mundo["conn"], mundo["plpcjf"], mundo["baixados"])
    log = str(mundo["tmp"] / "log.jsonl")
    r = pa.executar(plano, "link", execute=True, run_id="run-l", log_path=log, conn=mundo["conn"],
                    sql_dir=str(mundo["tmp"] / "sql"), execucao_dir=str(mundo["tmp"] / "exec"), novo_id=_ids())
    assert (r["aplicadas"], r["falharam"], r["sem_escrita"]) == (2, 0, 1)
    assert len(stubs["chamadas"]["sql"]) == 1 and stubs["chamadas"]["put"] == []   # 2 links num chunk só
    assert stubs["prod"]["crosswalk"] == {"pdf-0001", "pdf-0007"}
    finais = {l["op_id"]: l for l in _log(log)}
    assert all(l["ok"] for l in finais.values()) and finais[plano.por_tipo("nada")[0].op_id]["estado"] == "sem_escrita"
    assert (mundo["tmp"] / "exec" / "run-l.jsonl").read_text().count("\n") == len(_log(log))
    # retomada: nada a fazer
    r2 = pa.executar(plano, "link", execute=True, run_id="run-l2", log_path=log, conn=mundo["conn"],
                     sql_dir=str(mundo["tmp"] / "sql"), execucao_dir=str(mundo["tmp"] / "exec"), novo_id=_ids())
    assert r2["ja_aplicadas"] == 3 and r2["aplicadas"] == 0


def test_execute_criar_e_substituir_sobem_r2_antes_do_sql(mundo, stubs):
    _com_sha_real(mundo)
    plano = pa.montar_plano(mundo["decisoes"], mundo["findings"], mundo["conn"], mundo["plpcjf"], mundo["baixados"])
    log = str(mundo["tmp"] / "log.jsonl")
    r = pa.executar(plano, "criar", execute=True, run_id="run-c", log_path=log, conn=mundo["conn"],
                    sql_dir=str(mundo["tmp"] / "sql"), execucao_dir=str(mundo["tmp"] / "exec"), novo_id=_ids())
    assert r["aplicadas"] == 1
    assert stubs["chamadas"]["put"] == ["storage/assets/praises/id-01/id-02.pdf", "storage/assets/praises/id-01/id-03.pdf"]
    (c,) = plano.por_tipo("criar")
    fim = [l for l in _log(log) if l["op_id"] == c.op_id][-1]
    assert fim["ids"] == {"praise_id": "id-01", "material_ids": {"pdf-0003": "id-02", "pdf-0004": "id-03"}}
    assert fim["r2"] == stubs["chamadas"]["put"] and fim["escreveu"] and fim["ok"]
    r = pa.executar(plano, "substituir", execute=True, run_id="run-r", log_path=log, conn=mundo["conn"],
                    sql_dir=str(mundo["tmp"] / "sql"), execucao_dir=str(mundo["tmp"] / "exec"), novo_id=_ids())
    assert r["aplicadas"] == 1 and "m2" not in stubs["prod"]["materiais"]
    fim = [l for l in _log(log) if l["run_id"] == "run-r" and l["tipo"] == "substituir"][-1]
    assert fim["antes"]["id"] == "m2" and fim["antes"]["r2_key"] == "assets/praises/p1/m2.pdf"


def test_execute_pre_condicao_e_falha_do_wrangler(mundo, stubs):
    _com_sha_real(mundo)
    stubs["prod"]["crosswalk"].add("pdf-0001")            # já vinculado em produção
    stubs["prod"]["nomes"].append(("p-alheio", "A palavra de poder", None))  # homônimo Avulsos criado DEPOIS do snapshot
    plano = pa.montar_plano(mundo["decisoes"], mundo["findings"], mundo["conn"], mundo["plpcjf"], mundo["baixados"])
    log = str(mundo["tmp"] / "log.jsonl")
    r = pa.executar(plano, "link", execute=True, run_id="run-1", log_path=log, conn=mundo["conn"],
                    sql_dir=str(mundo["tmp"] / "sql"), execucao_dir=str(mundo["tmp"] / "exec"), novo_id=_ids())
    assert (r["aplicadas"], r["falharam"]) == (1, 1)
    ruim = [l for l in _log(log) if l["pdf_ids"] == ["pdf-0001"]][-1]
    assert ruim["estado"] == "pre_condicao" and "plpcg_crosswalk" in ruim["motivo"] and not ruim["escreveu"]
    r = pa.executar(plano, "criar", execute=True, run_id="run-2", log_path=log, conn=mundo["conn"],
                    sql_dir=str(mundo["tmp"] / "sql"), execucao_dir=str(mundo["tmp"] / "exec"), novo_id=_ids())
    assert r["falharam"] == 1 and "mesmo nome" in _log(log)[-1]["motivo"] and stubs["chamadas"]["put"] == []
    # Gadareno já estava no snapshot: um 'criar' homônimo dele NÃO é recusado (Revisão 3 já cobriu)
    assert "gadareno" not in pa.estado_producao(praises_snapshot={"p1", "p2"})["nomes"]
    stubs["falhar"]["sql"] = True
    r = pa.executar(plano, "substituir", execute=True, run_id="run-3", log_path=log, conn=mundo["conn"],
                    sql_dir=str(mundo["tmp"] / "sql"), execucao_dir=str(mundo["tmp"] / "exec"), novo_id=_ids())
    fim = _log(log)[-1]
    assert r["falharam"] == 1 and fim["escreveu"] and not fim["ok"] and "wrangler caiu" in fim["erro"] and len(fim["r2"]) == 1


def test_execute_link_em_lotes_falha_do_wrangler_marca_todas(mundo, stubs, monkeypatch):
    # LOTE_SQL=1: cada link fecha o próprio lote (2 links, 2 chamadas a run_sql_files).
    # É exatamente o caminho que roda 3588x em produção — precisa de cobertura própria
    # do fracasso e do limite de lote, não só do caminho feliz.
    monkeypatch.setattr(pa, "LOTE_SQL", 1)
    stubs["falhar"]["sql"] = True
    _com_sha_real(mundo)
    plano = pa.montar_plano(mundo["decisoes"], mundo["findings"], mundo["conn"], mundo["plpcjf"], mundo["baixados"])
    log = str(mundo["tmp"] / "log.jsonl")
    r = pa.executar(plano, "link", execute=True, run_id="run-f", log_path=log, conn=mundo["conn"],
                    sql_dir=str(mundo["tmp"] / "sql"), execucao_dir=str(mundo["tmp"] / "exec"), novo_id=_ids())
    assert len(stubs["chamadas"]["sql"]) == 2   # um fechamento de lote por link, cada um seu próprio run_sql_files
    assert r["falharam"] == 2 and r["sem_escrita"] == 1
    linhas = _log(log)
    links = [l for l in linhas if l["tipo"] == "link"]
    finais = {l["op_id"]: l for l in links}
    assert len(finais) == 2
    assert all(l["escreveu"] and not l["ok"] and "wrangler caiu" in l["erro"] for l in finais.values())
    assert all(l["estado"] != "pendente" for l in finais.values())   # nunca fica preso em "pendente"
    for op_id in finais:
        de_um_op = [l for l in links if l["op_id"] == op_id]
        assert any(l["estado"] == "escrevendo" for l in de_um_op[:-1])   # a linha intermediária chegou ao disco
    assert len(stubs["chamadas"]["query"]) == 4   # só o estado_producao inicial; sem pós-condição (nada pendente)


def test_execute_guarda_barrou(mundo, stubs):
    _com_sha_real(mundo)
    stubs["falhar"]["silencioso"] = True   # o wrangler "roda" mas o INSERT não pega em produção
    plano = pa.montar_plano(mundo["decisoes"], mundo["findings"], mundo["conn"], mundo["plpcjf"], mundo["baixados"])
    log = str(mundo["tmp"] / "log.jsonl")
    r = pa.executar(plano, "link", execute=True, run_id="run-g", log_path=log, conn=mundo["conn"],
                    sql_dir=str(mundo["tmp"] / "sql"), execucao_dir=str(mundo["tmp"] / "exec"), novo_id=_ids())
    assert (r["aplicadas"], r["falharam"], r["sem_escrita"]) == (0, 2, 1)
    links = [l for l in _log(log) if l["tipo"] == "link"]
    finais = {l["op_id"]: l for l in links}
    assert all(l["ok"] is False and l["estado"] == "guarda_barrou" for l in finais.values())


def test_execute_sql_op_value_error_depois_do_pendente(mundo, stubs):
    _com_sha_real(mundo)
    plano = pa.montar_plano(mundo["decisoes"], mundo["findings"], mundo["conn"], mundo["plpcjf"], mundo["baixados"])
    mundo["conn"].execute("DELETE FROM tags WHERE name = 'Avulsos'")
    mundo["conn"].commit()
    log = str(mundo["tmp"] / "log.jsonl")
    r = pa.executar(plano, "criar", execute=True, run_id="run-t", log_path=log, conn=mundo["conn"],
                    sql_dir=str(mundo["tmp"] / "sql"), execucao_dir=str(mundo["tmp"] / "exec"), novo_id=_ids())
    (c,) = plano.por_tipo("criar")
    fim = [l for l in _log(log) if l["op_id"] == c.op_id][-1]
    assert fim["ok"] is False and fim["estado"] == "pre_condicao" and "tag" in fim["motivo"]
    assert stubs["chamadas"]["put"] == []
    assert r["falharam"] == 1


# --- undo ----------------------------------------------------------------------

def test_undo_reverte_criar_e_substituir_e_apaga_so_o_r2_do_run(mundo, stubs):
    _com_sha_real(mundo)
    plano = pa.montar_plano(mundo["decisoes"], mundo["findings"], mundo["conn"], mundo["plpcjf"], mundo["baixados"])
    log = str(mundo["tmp"] / "log.jsonl")
    kw = dict(log_path=log, conn=mundo["conn"], sql_dir=str(mundo["tmp"] / "sql"), execucao_dir=str(mundo["tmp"] / "exec"))
    pa.executar(plano, "link", execute=True, run_id="run-1", novo_id=_ids(), **kw)
    pa.executar(plano, "substituir", execute=True, run_id="run-2", novo_id=_ids(), **kw)
    pa.executar(plano, "criar", execute=True, run_id="run-3", novo_id=_ids(), **kw)
    stubs["chamadas"]["sql"].clear()
    r = pa.desfazer("run-3", log, sql_dir=str(mundo["tmp"] / "sql"), execucao_dir=str(mundo["tmp"] / "exec"))
    assert r == {"desfeitas": 1, "puladas": 0, "falharam": 0}   # a op 'nada' já tinha sido registrada no run-1, não está no run-3
    sql = "".join(open(a).read() for a in stubs["chamadas"]["sql"])
    assert "DELETE FROM plpcg_crosswalk WHERE pdf_id = 'pdf-0003' AND run_id = 'run-3';" in sql
    assert "DELETE FROM praise_materials WHERE praise_id = 'id-01';" in sql
    assert "DELETE FROM praise_tags WHERE praise_id = 'id-01';" in sql and "DELETE FROM praises WHERE id = 'id-01';" in sql
    assert stubs["chamadas"]["delete"] == ["storage/assets/praises/id-01/id-02.pdf", "storage/assets/praises/id-01/id-03.pdf"]
    ultima = _log(log)[-1]
    assert ultima["estado"] == "desfeito" and ultima["ok"] and ultima["run_id"] == "run-3"
    assert pa.ja_aplicadas(log) == {o.op_id for o in plano.por_tipo("link")} | {plano.por_tipo("substituir")[0].op_id} | {plano.por_tipo("nada")[0].op_id}
    # undo do substituir devolve a linha antiga do material e apaga só o objeto novo
    stubs["chamadas"]["sql"].clear(); stubs["chamadas"]["delete"].clear()
    r = pa.desfazer("run-2", log, sql_dir=str(mundo["tmp"] / "sql"), execucao_dir=str(mundo["tmp"] / "exec"))
    sql = "".join(open(a).read() for a in stubs["chamadas"]["sql"])
    assert r["desfeitas"] == 1
    assert "INSERT OR IGNORE INTO praise_materials (id, praise_id, material_kind, type, r2_key" in sql and "'m2', 'p1', 'k-choir', 'pdf', 'assets/praises/p1/m2.pdf'" in sql
    assert stubs["chamadas"]["delete"] == ["storage/assets/praises/p1/id-01.pdf"]
    # segundo undo do mesmo run: nada a fazer
    assert pa.desfazer("run-2", log, sql_dir=str(mundo["tmp"] / "sql"), execucao_dir=str(mundo["tmp"] / "exec"))["desfeitas"] == 0


def test_undo_substituir_que_morreu_antes_do_sql_nao_colide(mundo, stubs):
    """Uma linha 'subindo_r2'/'escrevendo'/'falhou'/'guarda_barrou' de substituir
    deixa a linha antiga (m2) viva. O re-INSERT do undo precisa de OR IGNORE:
    sem ele, colide em UNIQUE(id), run_sql_files levanta ANTES do laço de
    r2_delete, e o objeto novo do R2 fica órfão."""
    _com_sha_real(mundo)
    plano = pa.montar_plano(mundo["decisoes"], mundo["findings"], mundo["conn"], mundo["plpcjf"], mundo["baixados"])
    log = str(mundo["tmp"] / "log.jsonl")
    kw = dict(log_path=log, conn=mundo["conn"], sql_dir=str(mundo["tmp"] / "sql"), execucao_dir=str(mundo["tmp"] / "exec"))
    pa.executar(plano, "substituir", execute=True, run_id="run-real", novo_id=_ids(), **kw)
    real = [l for l in _log(log) if l["tipo"] == "substituir"][-1]
    linha_morta = dict(real, run_id="run-x", estado="subindo_r2", escreveu=True,
                       ids={"praise_id": real["ids"]["praise_id"], "material_ids": {"pdf-0002": "id-99"}},
                       r2=["storage/assets/praises/p1/id-99.pdf"], antes=real["antes"])
    with open(log, "a", encoding="utf-8") as f:
        f.write(json.dumps(linha_morta, ensure_ascii=False) + "\n")
    stubs["chamadas"]["sql"].clear(); stubs["chamadas"]["delete"].clear()
    r = pa.desfazer("run-x", log, sql_dir=str(mundo["tmp"] / "sql"), execucao_dir=str(mundo["tmp"] / "exec"))
    assert r["desfeitas"] == 1
    # mundo["conn"] (o snapshot local) não tem plpcg_crosswalk — só a tabela
    # que este teste quer provar: sem OR IGNORE, a linha abaixo levantaria
    # IntegrityError (UNIQUE(id)) porque m2 nunca foi apagada.
    for arquivo in stubs["chamadas"]["sql"]:
        for linha_sql in open(arquivo, encoding="utf-8"):
            if "praise_materials" in linha_sql:
                mundo["conn"].executescript(linha_sql)
    linhas = mundo["conn"].execute("SELECT id FROM praise_materials WHERE id = 'm2'").fetchall()
    assert len(linhas) == 1
    assert stubs["chamadas"]["delete"] == ["storage/assets/praises/p1/id-99.pdf"]


def test_undo_que_falhou_pode_ser_repetido(mundo, stubs):
    _com_sha_real(mundo)
    plano = pa.montar_plano(mundo["decisoes"], mundo["findings"], mundo["conn"], mundo["plpcjf"], mundo["baixados"])
    log = str(mundo["tmp"] / "log.jsonl")
    kw = dict(log_path=log, conn=mundo["conn"], sql_dir=str(mundo["tmp"] / "sql"), execucao_dir=str(mundo["tmp"] / "exec"))
    pa.executar(plano, "substituir", execute=True, run_id="run-1", novo_id=_ids(), **kw)
    op_id = plano.por_tipo("substituir")[0].op_id
    stubs["falhar"]["sql"] = True
    r = pa.desfazer("run-1", log, sql_dir=str(mundo["tmp"] / "sql"), execucao_dir=str(mundo["tmp"] / "exec"))
    assert r["falharam"] == 1
    ultima = [l for l in _log(log) if l["op_id"] == op_id][-1]
    assert ultima["estado"] == "desfeito" and ultima["ok"] is False
    assert op_id in pa.ja_aplicadas(log)
    stubs["falhar"]["sql"] = False
    r2 = pa.desfazer("run-1", log, sql_dir=str(mundo["tmp"] / "sql"), execucao_dir=str(mundo["tmp"] / "exec"))
    assert r2["desfeitas"] == 1


def test_undo_erro_no_r2_delete_nao_invalida_o_sql(mundo, stubs, monkeypatch):
    _com_sha_real(mundo)
    plano = pa.montar_plano(mundo["decisoes"], mundo["findings"], mundo["conn"], mundo["plpcjf"], mundo["baixados"])
    log = str(mundo["tmp"] / "log.jsonl")
    kw = dict(log_path=log, conn=mundo["conn"], sql_dir=str(mundo["tmp"] / "sql"), execucao_dir=str(mundo["tmp"] / "exec"))
    pa.executar(plano, "criar", execute=True, run_id="run-1", novo_id=_ids(), **kw)
    (c,) = plano.por_tipo("criar")
    fim = [l for l in _log(log) if l["op_id"] == c.op_id][-1]
    primeira, segunda = fim["r2"]

    def r2_delete_falha_na_primeira(chave):
        if chave == primeira:
            raise RuntimeError("r2 caiu")
        stubs["chamadas"]["delete"].append(chave)

    monkeypatch.setattr(pa, "r2_delete", r2_delete_falha_na_primeira)
    r = pa.desfazer("run-1", log, sql_dir=str(mundo["tmp"] / "sql"), execucao_dir=str(mundo["tmp"] / "exec"))
    assert r["desfeitas"] == 1
    ultima = [l for l in _log(log) if l["op_id"] == c.op_id][-1]
    assert ultima["estado"] == "desfeito" and ultima["ok"] is True
    assert len(ultima["erros_r2"]) == 1 and primeira in ultima["erros_r2"][0]
    assert ultima["r2_apagados"] == [segunda]
    assert stubs["chamadas"]["delete"] == [segunda]


def test_main_simula_e_imprime_plano(mundo, stubs, capsys, monkeypatch):
    import json as _json
    _com_sha_real(mundo)
    dpath = mundo["tmp"] / "decisoes.jsonl"
    with open(dpath, "w", encoding="utf-8") as f:
        for d in mundo["decisoes"].values():
            f.write(_json.dumps(d) + "\n")
    fpath = mundo["tmp"] / "findings.jsonl"
    with open(fpath, "w", encoding="utf-8") as f:
        for x in mundo["findings"]:
            f.write(_json.dumps(x) + "\n")
    rc = pa.main(["--decisoes", str(dpath), "--findings", str(fpath), "--snapshot", str(mundo["tmp"] / "snapshot.sqlite"),
                  "--plpcjf", mundo["plpcjf"], "--baixados", mundo["baixados"], "--log", str(mundo["tmp"] / "log.jsonl"),
                  "--sql-dir", str(mundo["tmp"] / "sql")])
    out = capsys.readouterr().out
    assert rc == 0 and "link 2" in out and "criar 1" in out and "recusas: 1" in out and "0006" in out
    assert stubs["chamadas"]["sql"] == []
    with pytest.raises(SystemExit):
        pa.main(["--execute", "--decisoes", str(dpath), "--findings", str(fpath), "--snapshot", str(mundo["tmp"] / "snapshot.sqlite")])
