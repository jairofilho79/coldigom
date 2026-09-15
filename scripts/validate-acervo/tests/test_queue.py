from __future__ import annotations

import json

from core.findings import Finding, write_findings
from core.queue import (aplicados_do_log, decisoes_do_gabarito, empurrar, linha_de,
                        marcar_aplicados, puxar_aprovados, sql_insert)


def _f(tid, faixa, proposto, detector="youtube_merge"):
    return Finding(run_id="r1", detector=detector, target_type="praise", target_id=tid,
                   praise_id=tid, action="merge_praise", confidence=faixa, proposed=proposto,
                   field=f"keeper:{proposto}", evidence={"letra": True, "nome_fonte": "Medo tens"})


def test_linha_de_traduz_o_finding_para_as_colunas_da_tabela():
    l = linha_de(_f("t1", "media", "k1"), None)
    assert l["id"] == _f("t1", "media", "k1").finding_id
    assert l["proposed_value"] == "k1" and l["current_value"] is None
    assert json.loads(l["evidence"]) == {"letra": True, "nome_fonte": "Medo tens"}
    assert (l["status"], l["decision_note"], l["decided_by"]) == ("pendente", None, None)
    d = linha_de(_f("t1", "media", "k1"), ("rejeitado", "nao e o mesmo", "gabarito"))
    assert (d["status"], d["decision_note"], d["decided_by"]) == ("rejeitado", "nao e o mesmo", "gabarito")


def test_decisoes_do_gabarito_confirmado_nenhum_outro_e_sem_veredito():
    fs = [_f("t1", "media", "k1"), _f("t2", "media", "k2"), _f("t3", "media", "k3"), _f("t4", "media", "k4")]
    gab = {"t1": "k1", "t2": "NENHUM", "t3": "k9"}
    d = decisoes_do_gabarito(fs, gab, origem="g.tsv")
    assert d[fs[0].finding_id] == ("aprovado", "gabarito g.tsv: dono confirmou", "gabarito")
    assert d[fs[1].finding_id] == ("rejeitado", "gabarito g.tsv: dono respondeu NENHUM", "gabarito")
    assert d[fs[2].finding_id] == ("rejeitado", "gabarito g.tsv: dono apontou k9", "gabarito")
    assert fs[3].finding_id not in d


def test_aplicados_do_log_segue_a_regra_do_undo(tmp_path):
    log = tmp_path / "apply_log.jsonl"
    log.write_text("\n".join(json.dumps(e) for e in [
        {"finding_id": "a", "ok": None, "escreveu": False},
        {"finding_id": "a", "ok": True, "escreveu": True},
        {"finding_id": "b", "ok": False, "escreveu": True},
        {"finding_id": "c", "ok": True, "escreveu": False},
    ]) + "\n", encoding="utf-8")
    assert aplicados_do_log(str(log)) == {"a"}


def test_sql_insert_e_insert_or_ignore_com_null_de_verdade():
    sql = sql_insert([linha_de(_f("t1", "media", "k1"), None)])
    assert len(sql) == 1
    assert sql[0].startswith("INSERT OR IGNORE INTO validation_findings (")
    assert "NULL" in sql[0]              # current_value
    assert "'pendente'" in sql[0]
    assert "\"letra\": true" in sql[0] or '"letra":true' in sql[0]


def test_empurrar_pula_a_alta_e_aplicado_vence_o_gabarito(tmp_path):
    fs = [_f("t0", "alta", "k0"), _f("t1", "media", "k1"), _f("t2", "media", "k2")]
    decisoes = {fs[1].finding_id: ("aprovado", "gabarito g: dono confirmou", "gabarito")}
    rodados = []
    r = empurrar(fs, decisoes, aplicados={fs[1].finding_id},
                 run=lambda arquivos, remote=True: rodados.extend(arquivos),
                 out_dir=str(tmp_path / "sql"), remote=False)
    assert r == {"empurrados": 2, "por_status": {"aplicado": 1, "pendente": 1}}
    texto = "\n".join(open(a, encoding="utf-8").read() for a in rodados)
    assert "'aplicado'" in texto and "'pendente'" in texto
    assert fs[0].finding_id not in texto


def test_puxar_aprovados_promove_e_pula_o_conflito(capsys):
    linhas = [
        {"id": "x1", "run_id": "r1", "detector": "youtube_merge", "target_type": "praise", "target_id": "t1",
         "praise_id": "t1", "action": "merge_praise", "field": "keeper:k1", "current_value": None,
         "proposed_value": "k1", "confidence": "media", "evidence": '{"letra": true}', "status": "aprovado",
         "decided_at": "2026-09-04 10:00:00", "decided_by": "jairo@x", "decision_note": None, "created_at": "..."},
        # conflito: duas aprovacoes para a mesma fonte, keepers diferentes
        {"id": "x2", "run_id": "r1", "detector": "youtube_merge", "target_type": "praise", "target_id": "t2",
         "praise_id": "t2", "action": "merge_praise", "field": "keeper:k2", "current_value": None,
         "proposed_value": "k2", "confidence": "media", "evidence": "{}", "status": "aprovado",
         "decided_at": "d", "decided_by": "u", "decision_note": None, "created_at": "..."},
        {"id": "x3", "run_id": "r1", "detector": "youtube_merge", "target_type": "praise", "target_id": "t2",
         "praise_id": "t2", "action": "merge_praise", "field": "keeper:k3", "current_value": None,
         "proposed_value": "k3", "confidence": "media", "evidence": "{}", "status": "aprovado",
         "decided_at": "d", "decided_by": "u", "decision_note": None, "created_at": "..."},
    ]
    out = puxar_aprovados(q=lambda sql, remote=True: linhas, remote=False)
    assert [f.finding_id for f in out] == ["x1"]
    assert out[0].confidence == "alta" and out[0].proposed == "k1"
    assert out[0].evidence == {"letra": True, "promocao": {
        "por": "fila", "decided_by": "jairo@x", "decided_at": "2026-09-04 10:00:00", "decision_note": None}}
    assert "conflito" in capsys.readouterr().err


def test_marcar_aplicados_so_quem_estava_aprovado(tmp_path):
    log = tmp_path / "apply_log.jsonl"
    log.write_text(json.dumps({"finding_id": "x1", "ok": True, "escreveu": True}) + "\n", encoding="utf-8")
    rodados = []
    n = marcar_aplicados(str(log), run=lambda arquivos, remote=True: rodados.extend(arquivos),
                         out_dir=str(tmp_path / "sql"), remote=False)
    assert n == 1
    texto = open(rodados[0], encoding="utf-8").read()
    assert "SET status = 'aplicado'" in texto
    assert "WHERE id = 'x1' AND status = 'aprovado'" in texto
