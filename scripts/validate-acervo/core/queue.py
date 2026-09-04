from __future__ import annotations

import argparse
import json
import os
import sys
import time

from core.d1 import query, run_sql_files, sql_str, write_sql_chunks
from core.findings import Finding, promovido, read_findings, write_findings
from core.gold import NENHUM, ler_gabarito
from core.paths import OUT, ensure_out

FAIXA_QUE_NAO_ENTRA = "alta"   # a alta passa pelo portão (gold) e pelo apply, não pela fila

COLUNAS = ("id", "run_id", "detector", "target_type", "target_id", "praise_id", "action",
           "field", "current_value", "proposed_value", "confidence", "evidence", "status",
           "decided_at", "decided_by", "decision_note")


def linha_de(f: Finding, decisao: tuple[str, str, str] | None) -> dict:
    """A linha de validation_findings para um finding. decisao = (status, nota, quem)."""
    status, nota, quem = decisao or ("pendente", None, None)
    return {
        "id": f.finding_id, "run_id": f.run_id, "detector": f.detector,
        "target_type": f.target_type, "target_id": f.target_id, "praise_id": f.praise_id,
        "action": f.action, "field": f.field,
        "current_value": f.current, "proposed_value": f.proposed,
        "confidence": f.confidence,
        "evidence": json.dumps(f.evidence, ensure_ascii=False),
        "status": status,
        "decided_at": time.strftime("%Y-%m-%d %H:%M:%S") if decisao else None,
        "decided_by": quem, "decision_note": nota,
    }


def decisoes_do_gabarito(findings: list[Finding], gabarito: dict[str, str], origem: str) -> dict[str, tuple[str, str, str]]:
    """O veredito do dono, traduzido em decisão por finding. Sem veredito, sem decisão."""
    out: dict[str, tuple[str, str, str]] = {}
    for f in findings:
        v = gabarito.get(f.target_id)
        if v is None:
            continue
        if v == f.proposed:
            out[f.finding_id] = ("aprovado", f"gabarito {origem}: dono confirmou", "gabarito")
        elif v == NENHUM:
            out[f.finding_id] = ("rejeitado", f"gabarito {origem}: dono respondeu NENHUM", "gabarito")
        else:
            out[f.finding_id] = ("rejeitado", f"gabarito {origem}: dono apontou {v}", "gabarito")
    return out


def aplicados_do_log(log_path: str) -> set[str]:
    """finding_id das entradas que escreveram de verdade (ok e escreveu), a regra do --undo."""
    ids: set[str] = set()
    if not os.path.exists(log_path):
        return ids
    with open(log_path, encoding="utf-8") as fh:
        for linha in fh:
            linha = linha.strip()
            if not linha:
                continue
            e = json.loads(linha)
            if e.get("ok") and e.get("escreveu"):
                ids.add(e["finding_id"])
    return ids


def sql_insert(linhas: list[dict]) -> list[str]:
    cols = ", ".join(COLUNAS)
    return [
        f"INSERT OR IGNORE INTO validation_findings ({cols}) VALUES ("
        + ", ".join(sql_str(l[c]) for c in COLUNAS) + ");"
        for l in linhas
    ]


def empurrar(findings: list[Finding], decisoes: dict[str, tuple[str, str, str]], aplicados: set[str],
             run=run_sql_files, out_dir: str | None = None, remote: bool = True) -> dict:
    """Leva para o D1 tudo que não é faixa alta. INSERT OR IGNORE: decisão já tomada fica."""
    out_dir = out_dir or os.path.join(OUT, "sql", "fila")
    linhas: list[dict] = []
    por_status: dict[str, int] = {}
    for f in findings:
        if f.confidence == FAIXA_QUE_NAO_ENTRA:
            continue
        if f.finding_id in aplicados:
            decisao: tuple[str, str, str] | None = ("aplicado", "aplicado pelo apply", "apply")
        else:
            decisao = decisoes.get(f.finding_id)
        l = linha_de(f, decisao)
        por_status[l["status"]] = por_status.get(l["status"], 0) + 1
        linhas.append(l)
    arquivos = write_sql_chunks(sql_insert(linhas), out_dir, time.strftime("%Y-%m-%dT%H%MZ-fila"))
    if arquivos:
        run(arquivos, remote=remote)
    return {"empurrados": len(linhas), "por_status": dict(sorted(por_status.items()))}


def _finding_de(l: dict) -> Finding:
    ev = l.get("evidence")
    if isinstance(ev, str):
        try:
            ev = json.loads(ev)
        except ValueError:
            ev = {"bruto": ev}
    return Finding(
        run_id=l["run_id"], detector=l["detector"], target_type=l["target_type"],
        target_id=l["target_id"], praise_id=l.get("praise_id"), action=l["action"],
        field=l.get("field"), current=l.get("current_value"), proposed=l.get("proposed_value"),
        confidence=l["confidence"], evidence=ev or {}, finding_id=l["id"],
    )


def puxar_aprovados(q=query, remote: bool = True) -> list[Finding]:
    """Os 'aprovado' da fila, promovidos à faixa alta. Conflito (dois keepers para a
    mesma fonte) é pulado inteiro — o apply não pode escolher pelo dono."""
    linhas = q("SELECT * FROM validation_findings WHERE status = 'aprovado' ORDER BY praise_id, id", remote=remote)
    por_alvo: dict[tuple[str, str], set[str]] = {}
    for l in linhas:
        por_alvo.setdefault((l["target_id"], l["action"]), set()).add(l.get("proposed_value") or "")
    out: list[Finding] = []
    for l in linhas:
        if len(por_alvo[(l["target_id"], l["action"])]) > 1:
            print(f"conflito: {l['target_id']} ({l['action']}) tem mais de um aprovado — pulando {l['id']}",
                  file=sys.stderr)
            continue
        out.append(promovido(_finding_de(l), {
            "por": "fila", "decided_by": l.get("decided_by"), "decided_at": l.get("decided_at"),
            "decision_note": l.get("decision_note"),
        }))
    return out


def marcar_aplicados(log_path: str, run=run_sql_files, out_dir: str | None = None, remote: bool = True) -> int:
    out_dir = out_dir or os.path.join(OUT, "sql", "fila")
    stmts = [
        f"UPDATE validation_findings SET status = 'aplicado', decided_at = datetime('now') "
        f"WHERE id = {sql_str(i)} AND status = 'aprovado';"
        for i in sorted(aplicados_do_log(log_path))
    ]
    arquivos = write_sql_chunks(stmts, out_dir, time.strftime("%Y-%m-%dT%H%MZ-aplicados"))
    if arquivos:
        run(arquivos, remote=remote)
    return len(stmts)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="a fila de revisão: empurra findings, puxa aprovados, marca aplicados")
    ap.add_argument("--empurrar", nargs="+", help="findings.jsonl a levar para o D1 (a faixa alta fica de fora)")
    ap.add_argument("--gabarito", default="", help="TSV preenchido: veredito vira decisão na fila")
    ap.add_argument("--apply-log", default="", help="apply_log.jsonl: quem já escreveu entra como 'aplicado'")
    ap.add_argument("--puxar-aprovados", default="", help="grava aqui os 'aprovado', como findings de faixa alta")
    ap.add_argument("--marcar-aplicados", default="", help="apply_log.jsonl: marca na fila o que escreveu")
    ap.add_argument("--local", action="store_true", help="D1 local em vez do remoto")
    args = ap.parse_args(argv)
    ensure_out()
    remote = not args.local

    if args.empurrar:
        findings: list[Finding] = []
        for c in args.empurrar:
            findings.extend(read_findings(c))
        decisoes = (decisoes_do_gabarito(findings, ler_gabarito(args.gabarito), os.path.basename(args.gabarito))
                    if args.gabarito else {})
        aplicados = aplicados_do_log(args.apply_log) if args.apply_log else set()
        r = empurrar(findings, decisoes, aplicados, remote=remote)
        print(f"empurrados: {r['empurrados']}  por status: {r['por_status']}")
    if args.puxar_aprovados:
        fs = puxar_aprovados(remote=remote)
        write_findings(fs, args.puxar_aprovados)
        print(f"aprovados puxados: {len(fs)} -> {args.puxar_aprovados}")
    if args.marcar_aplicados:
        n = marcar_aplicados(args.marcar_aplicados, remote=remote)
        print(f"marcados como aplicados: {n}")
    if not (args.empurrar or args.puxar_aprovados or args.marcar_aplicados):
        ap.print_help()
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
