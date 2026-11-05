# tests/test_secoes_coletanea_mapa.py
from __future__ import annotations

import pytest

from core import secoes_coletanea_mapa as m


@pytest.mark.parametrize("valor, subtag", [
    ("Clamor", "Clamor"),
    ("Crianças e Adolescentes", "Crianças e Adolescentes"),
    ("Contra-Capa", "Contra-Capa"),
    ("Morte, Ressureição e Salvação", "Morte Ressurreição e Salvação"),    # a grafia errada do D1
    ("Morte, Ressurreição e Salvação", "Morte Ressurreição e Salvação"),
    ("Santificação e Derramamento", "Santificação e Derramamento do Espírito Santo"),
    ("Santificação e Derramamento do Espírito Santo", "Santificação e Derramamento do Espírito Santo"),
])
def test_secao_mapeia_para_subtag(valor, subtag):
    assert m.classificar(valor) == ("secao", subtag)


@pytest.mark.parametrize("valor", ["Avulso", "Avulsos", "Avulso Cias", "Avulsos das Senhoras"])
def test_colecao_nao_gera_tag(valor):
    assert m.classificar(valor) == ("colecao", None)


@pytest.mark.parametrize("valor", [None, "", "   "])
def test_vazio(valor):
    assert m.classificar(valor) == ("vazio", None)


@pytest.mark.parametrize("valor", ["Dm", "clamor", "Clamor ", "Morte Ressurreição e Salvação", "Avulsos GLTM"])
def test_qualquer_outra_grafia_e_desconhecida(valor):
    # Sem strip, sem casefold: quem decide um valor novo é o dono, não o script.
    assert m.classificar(valor) == ("desconhecido", None)


def test_treze_secoes_e_totais_da_spec():
    assert len(set(m.SECAO_POR_CATEGORIA.values())) == 13
    assert set(m.SECAO_POR_CATEGORIA.values()) == set(m.ESPERADO_DEPOIS)
    assert sum(m.ESPERADO_DEPOIS.values()) == m.ESPERADO_TOTAL == 1123
    assert m.ESPERADO_RAIZ_REMOVIDAS == 1119
    assert m.ESPERADO_AVULSOS_GLTM == 1


def test_nome_de_subtag_sem_virgula():
    # routes/tags.ts recusa vírgula: o GROUP_CONCAT das tags é separado por vírgula.
    assert all("," not in nome for _, nome in m.SUBTAGS)


def test_subtags_sao_as_13_de_coletanea_mais_gltm_de_avulsos():
    assert len(m.SUBTAGS) == 14
    assert m.SUBTAGS[-1] == ("Avulsos", "GLTM")
    assert all(pai == "Coletânea" for pai, _ in m.SUBTAGS[:-1])


def test_manuais_sao_os_8_ids_da_spec():
    assert [x["id"] for x in m.MANUAIS] == [
        "90ad7fd8-46d5-4121-a071-96b4fee42196",
        "b43a21e7-3c12-4a96-b298-e2bd908db2d9",
        "3c366df7-52c9-4d64-9ffb-03e6d4699e3e",
        "ffcb930d-b34d-4236-a389-3c7b0e198567",
        "1f468959-3e72-4000-bd54-1b9c682882db",
        "70845455-7bb1-455a-990b-c6082b75261f",
        "bbd5f528-1622-4346-a3d7-898223f7292b",
        "2b309bf1-50a0-48fc-8607-8ccce0031500",
    ]
    alvo = {(x["pai"], x["subtag"]) for x in m.MANUAIS}
    assert alvo <= set(m.SUBTAGS)
    gltm = m.MANUAIS[-1]
    assert (gltm["short_id"], gltm["tags_hoje"], gltm["pai"], gltm["subtag"]) == ("11e", frozenset({"GLTM"}), "Avulsos", "GLTM")


def test_rotulos_usam_o_ponto_medio_da_api():
    assert m.SEP_ROTULO == " · "
    assert "Diversos · weider" in m.MANUAIS[6]["tags_hoje"]
