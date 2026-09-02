from __future__ import annotations

import json
import os

from core.findings import (
    FAIXAS,
    Finding,
    Motivos,
    finding_id,
    read_findings,
    write_findings,
)


def _finding(**kw) -> Finding:
    base = dict(
        run_id="2026-09-02T00:00Z-teste",
        detector="youtube_merge",
        target_type="praise",
        target_id="p1",
        praise_id="p1",
        action="merge_praise",
        field=None,
        current=None,
        proposed="p2",
        confidence="alta",
        evidence={"motivo": "letra e nome"},
    )
    base.update(kw)
    return Finding(**base)


def test_finding_id_e_deterministico():
    a = finding_id("youtube_merge", "p1", None)
    b = finding_id("youtube_merge", "p1", None)
    assert a == b
    assert len(a) == 16


def test_finding_id_muda_com_qualquer_componente():
    base = finding_id("youtube_merge", "p1", None)
    assert finding_id("praise_dup", "p1", None) != base
    assert finding_id("youtube_merge", "p2", None) != base
    assert finding_id("youtube_merge", "p1", "lyrics") != base


def test_finding_preenche_o_id_sozinho():
    f = _finding()
    assert f.finding_id == finding_id("youtube_merge", "p1", None)


def test_roundtrip_preserva_tudo(tmp_path):
    caminho = str(tmp_path / "findings.jsonl")
    originais = [_finding(target_id="p1"), _finding(target_id="p2", confidence="media")]
    write_findings(originais, caminho)
    lidos = read_findings(caminho)
    assert [f.target_id for f in lidos] == ["p1", "p2"]
    assert [f.confidence for f in lidos] == ["alta", "media"]
    assert lidos[0].evidence == {"motivo": "letra e nome"}


def test_arquivo_escrito_e_uma_linha_por_finding_com_acento_intacto(tmp_path):
    caminho = str(tmp_path / "findings.jsonl")
    write_findings([_finding(evidence={"nota": "Regozijai-vos é o mesmo"})], caminho)
    linhas = open(caminho, encoding="utf-8").read().strip().split("\n")
    assert len(linhas) == 1
    # ensure_ascii=False: acento tem que sobreviver no arquivo, para o arquivo
    # ser legível por humano sem ferramenta.
    assert "é o mesmo" in linhas[0]
    assert json.loads(linhas[0])["detector"] == "youtube_merge"


def test_faixa_invalida_e_recusada():
    try:
        _finding(confidence="talvez")
    except ValueError as e:
        assert "talvez" in str(e)
    else:
        raise AssertionError("faixa inválida deveria ter sido recusada")


def test_faixas_conhecidas():
    assert FAIXAS == ("alta", "media", "baixa", "discussao")


def test_motivos_conta_e_tabela_mostra_o_porque():
    m = Motivos()
    m.excluir("já revisado por humano")
    m.excluir("já revisado por humano")
    m.excluir("sem arquivo local")
    tabela = m.tabela()
    assert "já revisado por humano" in tabela
    assert "2" in tabela
    assert m.total() == 3
