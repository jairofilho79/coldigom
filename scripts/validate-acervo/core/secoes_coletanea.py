# core/secoes_coletanea.py
"""Seções da Coletânea viram subtags (spec 2026-09-24-secoes-coletanea-subtags-design §5).

    python3 -m core.secoes_coletanea                          # ensaio: travas, relatório, SQL — nada é escrito
    python3 -m core.secoes_coletanea --execute                # grava em produção
    python3 -m core.secoes_coletanea --undo <run_id>          # simula o undo
    python3 -m core.secoes_coletanea --undo <run_id> --execute

Comando próprio, e não detector + core.apply, pelo mesmo motivo do
core.plpcg_apply: o core.apply só conhece merge_praise e set_praise_field,
lê um finding por alvo e confere a pós-condição com uma consulta por finding
(seriam ~2240), e não sabe criar tag. Daqui só se reusa o que é do core:
snapshot (core.snapshot.conectar), SQL em lotes (core.d1.write_sql_chunks +
run_sql_files), leitura pontual (core.d1.query), o log .jsonl com a cópia em
gabaritos/ (core.plpcg_apply.copiar_execucao) e o texto de erro do wrangler.

As camadas são puras até a execução: montar_plano lê só o snapshot;
sql_plano só formata; executar e desfazer são os únicos que falam com o D1.
"""
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
import time
import unicodedata
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from core import secoes_coletanea_mapa as mapa
from core.d1 import query, run_sql_files, sql_str, write_sql_chunks
from core.paths import OUT, PKG, SNAPSHOT_DB
from core.plpcg_apply import _erro_texto, copiar_execucao
from core.snapshot import conectar

LOG_PADRAO = os.path.join(OUT, "secoes_coletanea_log.jsonl")
OUT_PADRAO = os.path.join(OUT, "secoes_coletanea")
EXECUCAO_PADRAO = os.path.join(PKG, "gabaritos", "secoes_coletanea", "execucao")
LOTE_SQL = 300  # statements por arquivo .sql — cada arquivo é um batch atômico do D1


class Trava(Exception):
    """§5.1.2: aborta antes de qualquer escrita. Carrega TODOS os problemas,
    para o dono corrigir de uma vez em vez de descobrir um por rodada."""

    def __init__(self, problemas: list[str]):
        super().__init__(f"{len(problemas)} problema(s): " + "; ".join(problemas[:3]))
        self.problemas = problemas


@dataclass(frozen=True)
class Ligacao:
    praise_id: str
    pai: str                     # nome da raiz: "Coletânea" ou "Avulsos"
    subtag: str                  # nome da subtag
    origem: str                  # "categoria" | "manual"
    category: str | None         # valor lido no snapshot: a guarda do INSERT
    tags_snapshot: tuple = ()    # ids das tags do praise no snapshot, ordenados (guarda dos manuais)
    inserir: bool = True         # False: o snapshot já tem a ligação com a subtag
    remover_raiz: bool = False   # True: o snapshot tem a ligação direta com Coletânea


@dataclass
class Plano:
    raizes: dict                 # nome da raiz -> id
    subtags: dict                # (pai, nome) -> id no snapshot, ou None (a criar)
    ligacoes: list               # [Ligacao]
    ja_ligados: dict             # (pai, nome) -> set de praise_id já ligados no snapshot
    entram_na_coletanea: list    # [{id, number, name, subtag}]


def rotulos(conn: sqlite3.Connection) -> dict[str, str]:
    """tag id -> rótulo como a API mostra: `nome` na raiz, `pai · nome` na subtag."""
    tags = {r["id"]: (r["name"], r["parent_id"]) for r in conn.execute("SELECT id, name, parent_id FROM tags")}
    saida = {}
    for tid, (nome, pai) in tags.items():
        saida[tid] = nome if pai is None or pai not in tags else f"{tags[pai][0]}{mapa.SEP_ROTULO}{nome}"
    return saida


def _descricao(p: dict) -> str:
    numero = (p.get("number") or "").strip()
    return f"{p['id']} {numero + ' ' if numero else ''}«{p['name']}»"


def montar_plano(conn: sqlite3.Connection) -> Plano:
    """Lê o snapshot e decide cada ligação. Levanta Trava com as três travas
    de §5.1.2 — nada de SQL é gerado antes disso."""
    raizes: dict[str, str] = {}
    for nome in (mapa.RAIZ_COLETANEA, mapa.RAIZ_AVULSOS):
        r = conn.execute("SELECT id FROM tags WHERE name = ? AND parent_id IS NULL", (nome,)).fetchone()
        if r is None:
            raise Trava([f"a tag raiz {nome!r} não existe no snapshot"])
        raizes[nome] = r["id"]
    col = raizes[mapa.RAIZ_COLETANEA]

    subtags: dict[tuple, str | None] = {}
    for pai, nome in mapa.SUBTAGS:
        r = conn.execute("SELECT id FROM tags WHERE parent_id = ? AND name = ?", (raizes[pai], nome)).fetchone()
        subtags[(pai, nome)] = r["id"] if r else None
    filhos_col = {r["id"] for r in conn.execute("SELECT id FROM tags WHERE parent_id = ?", (col,))}

    tags_de: dict[str, set] = {}
    for r in conn.execute("SELECT praise_id, tag_id FROM praise_tags"):
        tags_de.setdefault(r["praise_id"], set()).add(r["tag_id"])
    ja_ligados = {
        chave: {pid for pid, ts in tags_de.items() if tid in ts} if tid else set()
        for chave, tid in subtags.items()
    }
    rot = rotulos(conn)
    praises = {r["id"]: dict(r) for r in conn.execute("SELECT * FROM praises")}
    manuais = {x["id"]: x for x in mapa.MANUAIS}

    problemas: list[str] = []
    ligacoes: list[Ligacao] = []
    entram: list[dict] = []

    for pid in sorted(praises):
        p = praises[pid]
        tipo, subtag = mapa.classificar(p["category"])
        tags = tags_de.get(pid, set())
        if tipo == "desconhecido":
            problemas.append(f"(a) category fora de §2.1/§2.2 {p['category']!r}: {_descricao(p)}")
            continue
        if pid in manuais:
            if tipo == "secao":
                problemas.append(f"(c) caso manual com seção mapeada {p['category']!r}: {_descricao(p)}")
            continue
        if tipo == "secao":
            chave = (mapa.RAIZ_COLETANEA, subtag)
            ligacoes.append(Ligacao(
                praise_id=pid, pai=chave[0], subtag=chave[1], origem="categoria",
                category=p["category"], inserir=pid not in ja_ligados[chave], remover_raiz=col in tags,
            ))
            if col not in tags and not (tags & filhos_col):
                entram.append({"id": pid, "number": (p.get("number") or "").strip(),
                               "name": p["name"], "subtag": subtag})
        elif col in tags:
            problemas.append(f"(b) tem a raiz Coletânea e a category {p['category']!r} não dá seção: {_descricao(p)}")

    for x in mapa.MANUAIS:
        pid = x["id"]
        p = praises.get(pid)
        if p is None:
            problemas.append(f"(c) caso manual {pid} ({x['short_id']} «{x['nome']}») não existe no snapshot")
            continue
        chave = (x["pai"], x["subtag"])
        tags = tags_de.get(pid, set())
        hoje = frozenset(rot.get(t, t) for t in tags)
        alvo = f"{x['pai']}{mapa.SEP_ROTULO}{x['subtag']}"
        # Aceita a tabela da spec e os dois estados de uma retomada: subtag já
        # ligada com e sem a raiz Coletânea. Sem isso, rodar de novo depois de
        # um --execute parcial (spec §7) abortaria na trava (c).
        aceitos = (x["tags_hoje"], x["tags_hoje"] | {alvo},
                   (x["tags_hoje"] - {mapa.RAIZ_COLETANEA}) | {alvo})
        if hoje not in aceitos:
            problemas.append(f"(c) caso manual {_descricao(p)}: tags {sorted(hoje)} ≠ {sorted(x['tags_hoje'])} da spec")
            continue
        ligacoes.append(Ligacao(
            praise_id=pid, pai=chave[0], subtag=chave[1], origem="manual", category=p["category"],
            tags_snapshot=tuple(sorted(tags)), inserir=pid not in ja_ligados[chave], remover_raiz=col in tags,
        ))

    if problemas:
        raise Trava(problemas)
    return Plano(raizes=raizes, subtags=subtags, ligacoes=ligacoes,
                 ja_ligados=ja_ligados, entram_na_coletanea=entram)
