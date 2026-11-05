from __future__ import annotations

import json
import os
import sqlite3

import pytest

from revisao.serve import Dados, caminho_pdf_coldigom, caminho_pdf_plpcg, carregar, indice_storage


def _finding(short_id, faixa, group_id, nome, numero="", candidatos=(), praise_id=None):
    return {
        "run_id": "r1", "detector": "plpcg_crosswalk", "target_type": "plpcg",
        "target_id": "id-" + short_id, "action": "link_plpcg", "confidence": "alta",
        "evidence": {
            "faixa": faixa, "evidencias": ["num", "hash"], "nome": nome, "numero": numero,
            "classificacao": "Coletânea", "categoria": "Cifra nível I", "group_id": group_id,
            "short_id": short_id, "path": f"ColAdultos/{short_id}.pdf", "sha256": "x",
            "kind_esperado": "Chord Chart I", "kind_coldigom": None, "material_id": None,
            "nota": "", "candidatos": list(candidatos), "checksum": "c1",
        },
        "praise_id": praise_id, "field": None, "current": None, "proposed": None,
        "finding_id": "f" + short_id,
    }


def _grupo(group_id, nome, parecido=None):
    return {
        "run_id": "r1", "detector": "plpcg_crosswalk", "target_type": "plpcg_grupo",
        "target_id": group_id, "action": "create_praise_plpcg", "confidence": "alta",
        "evidence": {
            "faixa": "sem_louvor", "nome": nome, "numero": "", "classificacao": "Avulsos Diversos",
            "tags": ["Avulsos"], "entradas": [{"pdf_id": "p", "short_id": "0ff0", "categoria": "Cifra",
                                                "path": "Adicionados/x.pdf", "sha256": "y", "kind": "Chord Chart"}],
            "parecido": parecido, "checksum": "c1",
        },
        "praise_id": None, "field": None, "current": None, "proposed": nome, "finding_id": "g1",
    }


@pytest.fixture
def mundo(tmp_path):
    db = tmp_path / "snapshot.sqlite"
    conn = sqlite3.connect(db)
    conn.executescript("""
        CREATE TABLE praises (id TEXT PRIMARY KEY, name TEXT, number TEXT);
        CREATE TABLE praise_materials (id TEXT PRIMARY KEY, praise_id TEXT, material_kind TEXT,
                                       type TEXT, r2_key TEXT, is_reviewed INTEGER DEFAULT 0);
        CREATE TABLE material_kinds (id TEXT PRIMARY KEY, name TEXT);
        CREATE TABLE tags (id TEXT PRIMARY KEY, name TEXT, parent_id TEXT);
        CREATE TABLE praise_tags (praise_id TEXT, tag_id TEXT);
        INSERT INTO material_kinds VALUES ('k1', 'Chord Chart I'), ('k2', 'Sheet Music');
        INSERT INTO praises VALUES ('p1', 'Aleluia', '001'), ('p2', 'Outro', '');
        INSERT INTO praise_materials VALUES ('m1', 'p1', 'k1', 'pdf', 'assets/praises/p1/m1.pdf', 1),
                                            ('m2', 'p1', 'k2', 'pdf', 'assets/praises/p1/m2.pdf', 0),
                                            ('m3', 'p2', 'k1', 'pdf', 'assets/praises/p2/m3.pdf', 0);
        INSERT INTO tags VALUES ('t1', 'Coletânea', NULL);
        INSERT INTO praise_tags VALUES ('p1', 't1');
    """)
    conn.commit(); conn.close()

    findings = tmp_path / "findings.jsonl"
    linhas = [
        _finding("0002", "media", "001:aleluia", "Aleluia", "001",
                 candidatos=[{"praise_id": "p1", "material_id": "m1", "kind": "Chord Chart I",
                              "score": 3, "por_que": ["num", "hash"]}], praise_id="p1"),
        _finding("0001", "alta", "001:aleluia", "Aleluia", "001",
                 candidatos=[{"praise_id": "p1", "material_id": "m2", "kind": "Sheet Music",
                              "score": 3, "por_que": ["num", "path"]}], praise_id="p1"),
        _finding("0003", "faltante", "avulso:zzz", "Zzz"),
        _grupo("avulso:novo", "Novo louvor", parecido={"praise_id": "p2", "nome": "Outro", "score": 0.5}),
    ]
    findings.write_text("\n".join(json.dumps(l) for l in linhas) + "\n")

    storage = tmp_path / "storage"
    (storage / "p1").mkdir(parents=True)
    (storage / "p1" / "m1.pdf").write_bytes(b"%PDF-1.4 fake")
    plpcjf = tmp_path / "plpcjf"
    (plpcjf / "ColAdultos").mkdir(parents=True)
    (plpcjf / "ColAdultos" / "0001.pdf").write_bytes(b"%PDF-1.4 fake")
    baixados = tmp_path / "baixados"
    (baixados / "PES").mkdir(parents=True)
    (baixados / "PES" / "b.pdf").write_bytes(b"%PDF-1.4 fake")
    return dict(findings=str(findings), snapshot=str(db), storage=str(storage),
                plpcjf=str(plpcjf), baixados=str(baixados))


def test_carregar_agrupa_por_louvor_do_plpcg_e_ordena(mundo):
    d = carregar(mundo["findings"], mundo["snapshot"], mundo["storage"], mundo["plpcjf"], mundo["baixados"])
    assert isinstance(d, Dados)
    assert [g["group_id"] for g in d.grupos] == ["001:aleluia", "avulso:zzz"]
    aleluia = d.grupos[0]
    assert [e["short_id"] for e in aleluia["entradas"]] == ["0001", "0002"]
    assert aleluia["pior"] == "media"
    assert d.grupos[1]["pior"] == "faltante"
    assert d.resumo == {"alta": 1, "media": 1, "faltante": 1, "ambiguo": 0, "sem_louvor": 0}
    assert d.run_id == "r1" and d.checksum == "c1"


def test_carregar_marca_se_o_pdf_do_plpcg_existe_no_disco(mundo):
    d = carregar(mundo["findings"], mundo["snapshot"], mundo["storage"], mundo["plpcjf"], mundo["baixados"])
    por_id = {e["short_id"]: e for g in d.grupos for e in g["entradas"]}
    assert por_id["0001"]["local"] is True
    assert por_id["0002"]["local"] is False
    assert por_id["0001"]["url"] == "https://plpcg.com/assets/ColAdultos/0001.pdf"


def test_carregar_traz_os_louvores_referenciados_com_materiais_e_tags(mundo):
    d = carregar(mundo["findings"], mundo["snapshot"], mundo["storage"], mundo["plpcjf"], mundo["baixados"])
    assert set(d.praises) == {"p1", "p2"}
    p1 = d.praises["p1"]
    assert p1["name"] == "Aleluia" and p1["number"] == "001" and p1["tags"] == ["Coletânea"]
    assert [(m["id"], m["kind"], m["is_reviewed"], m["local"]) for m in p1["materiais"]] == [
        ("m1", "Chord Chart I", 1, True), ("m2", "Sheet Music", 0, False)]
    assert d.criar[0]["nome"] == "Novo louvor" and d.criar[0]["parecido"]["nome"] == "Outro"


def test_caminho_pdf_plpcg_recusa_sair_das_raizes(mundo):
    assert caminho_pdf_plpcg("ColAdultos/0001.pdf", mundo["plpcjf"], mundo["baixados"]).endswith("ColAdultos/0001.pdf")
    assert caminho_pdf_plpcg("assets/PES/b.pdf", mundo["plpcjf"], mundo["baixados"]).endswith("PES/b.pdf")
    assert caminho_pdf_plpcg("../snapshot.sqlite", mundo["plpcjf"], mundo["baixados"]) is None
    assert caminho_pdf_plpcg("ColAdultos/../../findings.jsonl", mundo["plpcjf"], mundo["baixados"]) is None
    assert caminho_pdf_plpcg("nao/existe.pdf", mundo["plpcjf"], mundo["baixados"]) is None


def test_caminho_pdf_coldigom_acha_pelo_material_id_mesmo_apos_merge(mundo):
    # o espelho tem o material na pasta do praise antigo; o id do material vale
    pasta_antiga = os.path.join(mundo["storage"], "2b598c35-1265-451c-86df-5ce9fb1cbd54")
    os.makedirs(pasta_antiga)
    alvo = os.path.join(pasta_antiga, "afa932f0-57aa-404f-8593-e63c8280368a.pdf")
    open(alvo, "wb").write(b"%PDF")
    indice = indice_storage(mundo["storage"])
    assert indice["m1"].endswith("p1/m1.pdf")
    assert caminho_pdf_coldigom("afa932f0-57aa-404f-8593-e63c8280368a", indice) == alvo
    assert caminho_pdf_coldigom("m1", indice) is None            # não é uuid
    assert caminho_pdf_coldigom("../x", indice) is None
    assert indice_storage(os.path.join(mundo["storage"], "nao-existe")) == {}
