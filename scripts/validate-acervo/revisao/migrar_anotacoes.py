"""Migra as anotações da rodada 1 (localStorage do site, marca + texto livre)
para `decisoes.jsonl`. Roda uma vez; recusa sobrescrever.

    python3 -m revisao.migrar_anotacoes

Onde o texto não decide sozinho, grava `tipo: null` + `duvida` — o filtro
"Revisão 2" do site lista esses para o dono fechar.
"""
from __future__ import annotations

import argparse
import collections
import json
import os
import sqlite3
import sys

from core.paths import PKG, SNAPSHOT_DB
from revisao.decisoes import gravar, migrar
from revisao.serve import DECISOES_PADRAO, FINDINGS_PADRAO, GABARITO_RODADA1

ANOTACOES_PADRAO = os.path.join(PKG, "gabaritos", "plpcg_crosswalk", "rodada1", "anotacoes.json")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--anotacoes", default=ANOTACOES_PADRAO)
    ap.add_argument("--findings", default=None)
    ap.add_argument("--snapshot", default=SNAPSHOT_DB)
    ap.add_argument("--saida", default=DECISOES_PADRAO)
    a = ap.parse_args(argv)

    findings = a.findings or (FINDINGS_PADRAO if os.path.exists(FINDINGS_PADRAO) else GABARITO_RODADA1)
    if os.path.exists(a.saida) and os.path.getsize(a.saida):
        print(f"{a.saida} já existe — a migração roda uma vez; apague antes se quiser refazer", file=sys.stderr)
        return 1
    with open(a.anotacoes, encoding="utf-8") as f:
        anotacoes = json.load(f)
    with open(findings, encoding="utf-8") as f:
        linhas = [json.loads(l) for l in f if l.strip()]
    praises = dict(sqlite3.connect(a.snapshot).execute("SELECT id, name FROM praises"))

    decisoes = migrar(anotacoes, linhas, praises)
    for d in decisoes:
        gravar(a.saida, d)
    tipos = collections.Counter(d["tipo"] or "duvida" for d in decisoes)
    print(f"{len(decisoes)} anotações → {a.saida}\n" + " · ".join(f"{k} {v}" for k, v in tipos.most_common()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
