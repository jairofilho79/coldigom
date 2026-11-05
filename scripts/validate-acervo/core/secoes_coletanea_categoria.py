# core/secoes_coletanea_categoria.py
"""Fase 3 das seções da Coletânea: praises.category vira NULL (spec
2026-09-24-secoes-coletanea-subtags-design §6, item 5).

    python3 -m core.secoes_coletanea_categoria                          # ensaio: relatório e SQL do snapshot
    python3 -m core.secoes_coletanea_categoria --execute                # grava em produção
    python3 -m core.secoes_coletanea_categoria --undo <run_id>          # simula o undo
    python3 -m core.secoes_coletanea_categoria --undo <run_id> --execute

As seções já são subtags de Coletânea; o valor antigo só fica no log, para o
undo. A coluna continua no schema (o DROP COLUMN é outra entrega). O ensaio
lê só o snapshot; o --execute lê a produção na hora (é ela que manda) e
guarda cada UPDATE pelo valor lido, então uma edição feita no meio não é
apagada — vira «atrasado». O undo é o do core.secoes_coletanea, com o SQL
daqui, e só repõe onde a categoria ainda está NULL.
"""
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
import time
from collections import Counter
from datetime import datetime, timezone

from core import secoes_coletanea as sc
from core.d1 import query, run_sql_files, sql_str, write_sql_chunks
from core.paths import OUT, PKG, SNAPSHOT_DB
from core.plpcg_apply import _erro_texto
from core.snapshot import conectar

LOG_PADRAO = os.path.join(OUT, "secoes_coletanea_categoria_log.jsonl")
OUT_PADRAO = os.path.join(OUT, "secoes_coletanea_categoria")
EXECUCAO_PADRAO = os.path.join(PKG, "gabaritos", "secoes_coletanea", "execucao")
LOTE_SQL = 300
_SQL_ALVOS = "SELECT id, category FROM praises WHERE category IS NOT NULL ORDER BY id"


def alvos_snapshot(conn: sqlite3.Connection) -> list[tuple[str, str]]:
    return [(r[0], r[1]) for r in conn.execute(_SQL_ALVOS)]


def _alvos_producao(remote: bool) -> list[tuple[str, str]]:
    return [(r["id"], r["category"]) for r in query(_SQL_ALVOS, remote=remote)]


def sql_zerar(alvos: list[tuple[str, str]]) -> list[str]:
    return [f"UPDATE praises SET category = NULL WHERE id = {sql_str(p)} AND category = {sql_str(c)};"
            for p, c in alvos]


def sql_undo(linha: dict) -> list[str]:
    return [f"UPDATE praises SET category = {sql_str(c)} WHERE id = {sql_str(p)} AND category IS NULL;"
            for p, c in linha["zerados"]]


def relatorio(alvos: list[tuple[str, str]], run_id: str, executado: bool) -> str:
    linhas = [f"# Fase 3 — category vira NULL ({run_id})", "",
              f"- modo: {'EXECUTADO' if executado else 'ensaio (nada foi escrito)'}",
              f"- praises com category não nula: {len(alvos)}", "",
              "| Valor | Praises |", "|---|---:|"]
    for valor, n in sorted(Counter(c for _, c in alvos).items(), key=lambda kv: (-kv[1], kv[0])):
        linhas.append(f"| {valor if valor else '(vazio)'} | {n} |")
    return "\n".join(linhas) + "\n"


def _escrever(pasta: str, texto: str) -> str:
    os.makedirs(pasta, exist_ok=True)
    caminho = os.path.join(pasta, "relatorio.md")
    with open(caminho, "w", encoding="utf-8") as f:
        f.write(texto)
    return caminho


def _restantes(ids: set[str], remote: bool) -> set[str]:
    return {r["id"] for r in query("SELECT id FROM praises WHERE category IS NOT NULL", remote=remote)} & ids


def executar(conn: sqlite3.Connection, execute: bool, run_id: str, log_path: str = LOG_PADRAO,
             out_dir: str | None = None, execucao_dir: str | None = None, remote: bool = True) -> dict:
    pasta = os.path.join(out_dir or OUT_PADRAO, run_id)
    alvos = _alvos_producao(remote) if execute else alvos_snapshot(conn)
    stmts = sql_zerar(alvos)
    resumo = {"run_id": run_id, "executado": execute, "pasta": pasta, "alvos": len(alvos),
              "statements": len(stmts), "zerados": 0, "atrasados": [], "falhou": False,
              "relatorio": _escrever(pasta, relatorio(alvos, run_id, execute))}
    if not execute:
        write_sql_chunks(stmts, os.path.join(pasta, "sql"), prefix="ensaio", per_file=LOTE_SQL)
        return resumo

    ids = {p for p, _ in alvos}
    base = {"run_id": run_id, "alvos": len(alvos)}
    os.makedirs(os.path.dirname(log_path) or ".", exist_ok=True)
    log = open(log_path, "a", encoding="utf-8")

    def gravar(linha: dict) -> None:
        log.write(json.dumps(dict(linha, ts=time.time()), ensure_ascii=False) + "\n")
        log.flush()

    def pegou(restantes: set[str]) -> list[list[str]]:
        return [[p, c] for p, c in alvos if p not in restantes]

    try:
        gravar(dict(base, estado="pendente", escreveu=False, zerados=[]))
        arquivos = write_sql_chunks(stmts, os.path.join(pasta, "sql"), prefix="lote", per_file=LOTE_SQL)
        # Antes do wrangler, com a lista inteira: um processo morto no meio
        # ainda é desfazível (o undo só repõe onde está NULL).
        gravar(dict(base, estado="escrevendo", escreveu=True, zerados=[[p, c] for p, c in alvos]))
        try:
            run_sql_files(arquivos, remote=remote)
        except Exception as erro:
            texto = _erro_texto(erro)
            zerados = [[p, c] for p, c in alvos]
            try:
                zerados = pegou(_restantes(ids, remote))
            except Exception:
                pass
            gravar(dict(base, estado="falhou", escreveu=True, ok=False, erro=texto, zerados=zerados))
            resumo.update(falhou=True, erro=texto, zerados=len(zerados))
            return resumo
        try:
            restantes = _restantes(ids, remote)
        except Exception as erro:
            texto = _erro_texto(erro)
            gravar(dict(base, estado="releitura_falhou", escreveu=True, ok=False, erro=texto,
                        zerados=[[p, c] for p, c in alvos]))
            resumo.update(falhou=True, erro=texto)
            return resumo
        zerados = pegou(restantes)
        ok = not restantes
        gravar(dict(base, estado="ok" if ok else "guarda_barrou", escreveu=True, ok=ok,
                    zerados=zerados, atrasados=sorted(restantes)))
        resumo.update(zerados=len(zerados), atrasados=sorted(restantes), falhou=not ok)
        return resumo
    finally:
        log.close()
        sc._copiar_execucao_segura(run_id, log_path, execucao_dir or EXECUCAO_PADRAO)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--snapshot", default=SNAPSHOT_DB)
    ap.add_argument("--execute", action="store_true", help="grava em produção (o padrão é o ensaio)")
    ap.add_argument("--undo", metavar="RUN_ID")
    ap.add_argument("--log", default=LOG_PADRAO)
    ap.add_argument("--out-dir", default=OUT_PADRAO)
    ap.add_argument("--execucao-dir", default=EXECUCAO_PADRAO)
    ap.add_argument("--local", action="store_true", help="wrangler --local (D1 local)")
    a = ap.parse_args(argv)
    remote = not a.local

    if a.undo:
        r = sc.desfazer(a.undo, a.log, a.execute, remote=remote, out_dir=a.out_dir,
                        execucao_dir=a.execucao_dir, sql_undo_fn=sql_undo)
        modo = "EXECUTADO" if a.execute else "simulado"
        print(f"undo {a.undo} ({modo}): {r['statements']} statements"
              + (f" — {r['motivo']}" if r["motivo"] else ""))
        return 1 if r["falhou"] else 0

    conn = None
    if not a.execute:
        if not os.path.exists(a.snapshot):
            print(f"sem snapshot: {a.snapshot} (rode python3 -m core.snapshot)", file=sys.stderr)
            return 1
        conn = conectar(a.snapshot)
    sufixo = "secoes_coletanea_categoria" if a.execute else "secoes_coletanea_categoria-ensaio"
    run_id = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ") + f"-{sufixo}"
    r = executar(conn, a.execute, run_id, a.log, a.out_dir, a.execucao_dir, remote=remote)

    modo = "EXECUTADO" if a.execute else "ensaio (nada foi escrito)"
    print(f"{modo} {run_id}: praises com category {r['alvos']} · statements {r['statements']}")
    print(f"relatório: {r['relatorio']}")
    if a.execute:
        print(f"zerados {r['zerados']} · atrasados {len(r['atrasados'])}")
        for pid in r["atrasados"][:30]:
            print(f"  ficou para trás: {pid}")
        if r.get("erro"):
            print(f"erro: {r['erro']}", file=sys.stderr)
        print(f"log: {a.log}\nundo: python3 -m core.secoes_coletanea_categoria --undo {run_id} --execute")
    return 1 if r["falhou"] else 0


if __name__ == "__main__":
    sys.exit(main())
