from __future__ import annotations

import json
import threading
import urllib.request
from http.server import HTTPServer

import pytest

from revisao import decisoes as dec
from revisao.serve import Dados, fazer_handler
from tests.test_revisao import _finding


def _f(short, faixa, nome, praise_id=None, material_id=None, categoria="Cifra", candidatos=(), evid=("nome",)):
    f = _finding(short, faixa, "g-" + short, nome, candidatos=candidatos, praise_id=praise_id)
    f["evidence"].update(categoria=categoria, material_id=material_id, evidencias=list(evid))
    return f


PRAISES = {"p1": "Aleluia", "p2": "Outro"}


def _migrar(texto, marca="", **kw):
    f = _f("0001", kw.pop("faixa", "media"), kw.pop("nome", "Aleluia"), **kw)
    return dec.migrar({f["target_id"]: {"marca": marca, "texto": texto}}, [f], PRAISES)[0]


def test_classe_texto_segue_o_vocabulario_do_dono():
    assert dec.classe_texto("Não precisa levar") == "nao_levar"
    assert dec.classe_texto("Manter versão do Coldigom") == "nao_levar"
    assert dec.classe_texto("Subtitua por esse Choir") == "substituir"
    assert dec.classe_texto("Criar praise e adicionar como Cifra") == "criar"
    assert dec.classe_texto("Outro louvor, crie um praise só pra ele") == "criar_outro"
    assert dec.classe_texto("adicionar como Cifra junto com 0330") == "junto"
    assert dec.classe_texto("adicionar como Cifra no 0127") == "junto"
    assert dec.classe_texto("Adicione como Choir") == "adicionar"
    assert dec.classe_texto("excluir esse material, pois está em branco") == "descartar"
    assert dec.classe_texto("") == "sem_texto"


def test_kind_do_texto_respeita_nivel_da_cifra():
    assert dec.kind_do_texto("Adicionar como Music Sheet", "Partitura") == "Sheet Music"
    assert dec.kind_do_texto("adicionar como Cifra", "Cifra nível II") == "Chord Chart II"
    assert dec.kind_do_texto("Coro e piano", "Partitura") == "Choir and Piano"
    assert dec.kind_do_texto("", "Partitura") is None


def test_migrar_sem_texto_alta_vira_link_e_media_vira_adicionar():
    d = _migrar("", faixa="alta", praise_id="p1", material_id="m1")
    assert (d["tipo"], d["material_id"]) == ("link", "m1")
    d = _migrar("", marca="ok", faixa="media", praise_id="p1", categoria="Partitura")
    assert (d["tipo"], d["praise_id"], d["kind"]) == ("adicionar", "p1", "Choir")


def test_migrar_texto_manda_mais_que_a_marca():
    d = _migrar("Não precisa levar", marca="ok", praise_id="p1")
    assert d["tipo"] == "nao_levar" and d["marca_rodada1"] == "ok"
    d = _migrar("Criar praise e adicionar como Cifra", marca="erro", faixa="sem_louvor", nome="Novo")
    assert (d["tipo"], d["nome"], d["kind"]) == ("criar", "Novo", "Chord Chart")


def test_migrar_duvidas():
    assert "✗ sem texto" in _migrar("", marca="erro")["duvida"]
    d = _migrar("Criar praise e adicionar como Cifra", marca="ok", faixa="faltante", praise_id="p1")
    assert d["tipo"] is None and "casou com o praise 'Aleluia'" in d["duvida"] and d["proposta"] == "criar"
    d = _migrar("Criar praise e adicionar como Cifra", faixa="sem_louvor", nome="Outro")
    assert "já existe praise com esse nome" in d["duvida"]
    d = _migrar("Criar praise e adicionar como Cifra", faixa="sem_louvor", nome="X", categoria="Partitura")
    assert "Choir ou Chord Chart" in d["duvida"]
    d = _migrar("Substituir pelo do PLPCG", praise_id="p1")
    assert d["tipo"] is None and "substituir" in d["duvida"]


def test_migrar_junto_com_resolve_short_id_e_criar_repetido_agrupa():
    a = _f("0001", "sem_louvor", "A palavra de poder", categoria="Cifra")
    b = _f("0002", "sem_louvor", "A Palavra de Poder", categoria="Partitura")
    c = _f("0003", "faltante", "Mil glórias", praise_id="p1")
    an = {a["target_id"]: {"texto": "Criar praise e adicionar como Cifra"},
          b["target_id"]: {"texto": "Criar praise e adicionar como Choir"},
          c["target_id"]: {"texto": "adicionar como Cifra junto com 0002"}}
    da, db, dc = dec.migrar(an, [a, b, c], PRAISES)
    assert da["tipo"] == "criar"
    assert (db["tipo"], db["junto_com"], db["kind"]) == ("adicionar", a["target_id"], "Choir")
    assert (dc["tipo"], dc["praise_id"], dc["junto_com"]) == ("adicionar", "p1", b["target_id"])


def test_validar_exige_os_campos_de_cada_tipo():
    ok = dec.validar({"pdf_id": "x", "tipo": "adicionar", "praise_id": "p1", "kind": "Choir"}, {"Choir"})
    assert ok["origem"] == "site" and ok["quando"].endswith("Z") and ok["motivo"] is None
    for ruim in [{"tipo": "adicionar"}, {"pdf_id": "x", "group_id": "g", "tipo": "nao_levar"},
                 {"pdf_id": "x", "tipo": "voar"}, {"pdf_id": "x", "tipo": "adicionar", "kind": "Choir"},
                 {"pdf_id": "x", "tipo": "adicionar", "praise_id": "p", "kind": "Banjo"},
                 {"pdf_id": "x", "tipo": "substituir", "praise_id": "p", "kind": "Choir"},
                 {"pdf_id": "x", "tipo": "criar", "kind": "Choir"}, {"pdf_id": "x", "tipo": None},
                 {"pdf_id": "x", "tipo": "adicionar", "junto_com": "x", "kind": "Choir"},
                 # A3: link/substituir têm alvo fixo — junto_com não substitui praise_id para eles.
                 {"pdf_id": "x", "tipo": "link", "material_id": "m"},
                 {"pdf_id": "x", "tipo": "substituir", "material_id": "m", "junto_com": "y", "kind": "Choir"}]:
        with pytest.raises(ValueError):
            dec.validar(ruim, {"Choir"})
    assert dec.validar({"group_id": "g", "tipo": "criar", "nome": "N", "kind": "Choir", "tags": ["", "Avulsos"]},
                       {"Choir"})["tags"] == ["Avulsos"]


def test_validar_limpa_alvo_quando_nada_sobe():
    d = dec.validar({"pdf_id": "x", "tipo": "descartar", "praise_id": "p", "material_id": "m", "kind": "Choir"}, {"Choir"})
    assert (d["praise_id"], d["material_id"], d["kind"]) == (None, None, None)
    d = dec.validar({"pdf_id": "x", "tipo": "criar", "nome": "N", "praise_id": "p", "kind": "Choir"}, {"Choir"})
    assert d["praise_id"] is None and d["kind"] == "Choir"


def test_ler_ultima_linha_vence(tmp_path):
    p = tmp_path / "d.jsonl"
    dec.gravar(str(p), {"pdf_id": "x", "tipo": "nao_levar"})
    dec.gravar(str(p), {"pdf_id": "y", "tipo": "descartar"})
    dec.gravar(str(p), {"pdf_id": "x", "tipo": "adicionar"})
    assert {k: v["tipo"] for k, v in dec.ler(str(p)).items()} == {"x": "adicionar", "y": "descartar"}
    assert dec.ler(str(tmp_path / "nao-existe")) == {}


@pytest.fixture
def servidor(tmp_path):
    dados = Dados(run_id="r", checksum="c", resumo={}, grupos=[], criar=[], praises={}, kinds=["Choir"])
    arq = tmp_path / "decisoes.jsonl"
    srv = HTTPServer(("127.0.0.1", 0), fazer_handler(dados, str(tmp_path), str(tmp_path), str(tmp_path), str(arq)))
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    yield f"http://127.0.0.1:{srv.server_port}", arq, dados
    srv.shutdown()


def _post(url, corpo):
    req = urllib.request.Request(url + "/decide", data=json.dumps(corpo).encode(), method="POST",
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def test_post_decide_grava_e_reflete_no_api_dados(servidor):
    url, arq, dados = servidor
    status, d = _post(url, {"pdf_id": "x", "tipo": "adicionar", "praise_id": "p1", "kind": "Choir", "motivo": " ok "})
    assert status == 200 and d["motivo"] == "ok" and d["quando"]
    assert dec.ler(str(arq))["x"]["tipo"] == "adicionar"
    with urllib.request.urlopen(url + "/api/dados") as r:
        assert json.loads(r.read())["decisoes"]["x"]["tipo"] == "adicionar"
    status, msg = _post(url, {"pdf_id": "x", "tipo": "adicionar", "praise_id": "p1", "kind": "Banjo"})
    assert status == 400 and "Banjo" in msg
    assert dados.decisoes["x"]["kind"] == "Choir"


def test_homonimos_igual_e_parecido():
    idx = dec.indice_nomes({"p1": ("Ó grande Deus", "583"), "p2": ("Grande Deus, único Deus", "81"),
                            "p3": ("A melhor coisa", ""), "p4": ("Outro", "")})
    hs = dec.homonimos("O Grande Deus", idx)
    assert [(x["praise_id"], x["score"]) for x in hs] == [("p1", 1.0), ("p2", 0.5)] or hs[0]["praise_id"] == "p1"
    assert hs[0]["score"] == 1.0 and all(x["praise_id"] != "p4" for x in hs)
    assert dec.homonimos("Nada a ver", idx) == []


def test_validar_desfazer_volta_para_sem_decisao():
    d = dec.validar({"pdf_id": "x", "tipo": None, "desfazer": True}, {"Choir"})
    assert d["tipo"] is None and d["duvida"] is None
    d = dec.validar({"pdf_id": "x", "tipo": "criar", "nome": "N", "kind": "Choir", "confirma": "homonimo"}, {"Choir"})
    assert d["confirma"] == "homonimo"
