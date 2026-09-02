from __future__ import annotations

import argparse
import csv
import json
import os
import random
import sys

from core.findings import FAIXAS, Finding, read_findings
from core.paths import OUT, ensure_out

COLUNAS = ("target_id", "nome", "letra", "url", "veredito")

NENHUM = "NENHUM"


def sortear(findings: list[Finding], n: int, seed: int = 42) -> list[Finding]:
    """Amostra estratificada por faixa, reprodutível pela semente.

    Estratificar importa porque as faixas têm tamanhos muito diferentes: uma
    amostra uniforme de 50 sobre um lote onde a faixa alta tem 5 casos não
    mede a faixa alta.
    """
    por_faixa: dict[str, list[Finding]] = {f: [] for f in FAIXAS}
    for x in findings:
        por_faixa[x.confidence].append(x)
    presentes = [f for f in FAIXAS if por_faixa[f]]
    if not presentes:
        return []

    rnd = random.Random(seed)
    cota = max(1, n // len(presentes))
    out: list[Finding] = []
    for faixa in presentes:
        pool = sorted(por_faixa[faixa], key=lambda x: x.finding_id)
        rnd.shuffle(pool)
        out.extend(pool[:cota])
    return out


def escrever_formulario(alvos: list[dict], caminho: str) -> None:
    """TSV para o dono preencher.

    Contém o alvo e a evidência bruta, NUNCA a proposta do detector. Se a
    proposta aparecesse aqui, o que a medição capturaria seria concordância,
    não precisão — e concordar com uma resposta pronta é mais fácil que
    produzi-la.
    """
    os.makedirs(os.path.dirname(caminho) or ".", exist_ok=True)
    with open(caminho, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=COLUNAS, delimiter="\t",
                           extrasaction="ignore", lineterminator="\n")
        w.writeheader()
        for a in alvos:
            linha = {c: (a.get(c) or "") for c in COLUNAS}
            linha["letra"] = " ".join(str(linha["letra"]).split())[:200]
            linha["veredito"] = ""
            w.writerow(linha)


def ler_gabarito(caminho: str) -> dict[str, str]:
    """target_id → veredito. Linha sem veredito é 'ainda não decidida'."""
    out: dict[str, str] = {}
    with open(caminho, newline="", encoding="utf-8") as f:
        for linha in csv.DictReader(f, delimiter="\t"):
            tid = (linha.get("target_id") or "").strip()
            v = (linha.get("veredito") or "").strip()
            if tid and v:
                out[tid] = v
    return out


def medir(gabarito: dict[str, str], findings: list[Finding]) -> dict:
    """Precisão por faixa, contando o falso positivo separado.

    Falso positivo é propor uma ação onde o dono disse NENHUM — na Fase 1 é
    propor fundir dois louvores que não são o mesmo, que é o erro destrutivo
    que o portão existe para barrar.
    """
    r: dict[str, dict] = {
        faixa: {"total": 0, "acertos": 0, "erros": 0, "falso_positivo": 0, "precisao": 0.0}
        for faixa in FAIXAS
    }
    for f in findings:
        esperado = gabarito.get(f.target_id)
        if esperado is None:
            continue
        b = r[f.confidence]
        b["total"] += 1
        if esperado == NENHUM:
            b["falso_positivo"] += 1
            b["erros"] += 1
        elif esperado == f.proposed:
            b["acertos"] += 1
        else:
            b["erros"] += 1
    for b in r.values():
        b["precisao"] = round(100.0 * b["acertos"] / b["total"], 1) if b["total"] else 0.0
    return r


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="src", nargs="+", required=True)
    ap.add_argument("--gabarito", default="", help="TSV preenchido; sem ele, só mede o que houver")
    args = ap.parse_args(argv)

    ensure_out()
    findings: list[Finding] = []
    for c in args.src:
        findings.extend(read_findings(c))

    if not args.gabarito:
        print("nenhum gabarito informado — nada a medir")
        return 2

    gabarito = ler_gabarito(args.gabarito)
    r = medir(gabarito, findings)
    print(f"\ngabarito: {len(gabarito)} vereditos")
    print(f"{'faixa':12} {'total':>6} {'acertos':>8} {'erros':>6} {'falso+':>7} {'precisão':>9}")
    for faixa in FAIXAS:
        b = r[faixa]
        if not b["total"]:
            continue
        print(f"{faixa:12} {b['total']:6} {b['acertos']:8} {b['erros']:6} "
              f"{b['falso_positivo']:7} {b['precisao']:8.1f}%")

    caminho = os.path.join(OUT, "metrica.json")
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(r, f, ensure_ascii=False, indent=1)
    print(f"\nmétrica: {caminho}")

    # Portão da Fase 1 (desvio deliberado de D10, registrado no plano): a
    # faixa alta tem 5 casos, então o critério é zero erro, não >=98%.
    alta = r["alta"]
    return 0 if alta["erros"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
