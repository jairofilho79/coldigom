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
