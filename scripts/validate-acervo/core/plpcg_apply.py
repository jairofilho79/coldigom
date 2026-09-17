# core/plpcg_apply.py
"""Fase C da migração PLPCG (spec §7): escreve no coldigom o que o dono
decidiu no site (`gabaritos/plpcg_crosswalk/decisoes.jsonl`).

    python3 -m core.plpcg_apply                      # simula tudo: plano, recusas, exemplos de SQL
    python3 -m core.plpcg_apply --tipo link --execute
    python3 -m core.plpcg_apply --undo <run_id>

Separado do core.apply da Fase 1 de propósito: lá a entrada é finding e a
escrita é só SQL; aqui a entrada é decisão humana por pdf_id e a escrita tem
um lado no R2 que precisa entrar no log e no undo. As três camadas — plano,
SQL, execução — são puras até a última, que só fala com o mundo por
query/run_sql_files/r2_put/r2_delete (core.d1), todas via wrangler.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sqlite3
import sys
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone

from core.d1 import query, r2_delete, r2_put, run_sql_files, sql_str, write_sql_chunks
from core.normalize import norm_nome
from core.paths import OUT, PKG, PLPCG_BAIXADOS, PLPCJF_ASSETS, SNAPSHOT_DB
from core.plpcg import arquivo_local, sha256_arquivo
from core.snapshot import conectar
from detectors.plpcg_crosswalk import tags_propostas
from revisao import decisoes as dec

LOG_PADRAO = os.path.join(OUT, "plpcg_apply_log.jsonl")
EXECUCAO_PADRAO = os.path.join(PKG, "gabaritos", "plpcg_crosswalk", "execucao")
DECISOES_PADRAO = os.path.join(PKG, "gabaritos", "plpcg_crosswalk", "decisoes.jsonl")
FINDINGS_PADRAO = os.path.join(PKG, "gabaritos", "plpcg_crosswalk", "rodada1", "findings.jsonl")

TIPOS = ("link", "importar", "substituir", "criar")   # os que escrevem, na ordem do spec §9
ORDEM = {"link": 0, "importar": 1, "substituir": 2, "criar": 3, "nada": 4}
MAX_SALTOS = 20


@dataclass
class Entrada:
    pdf_id: str
    short_id: str
    group_id: str
    path: str
    sha256: str
    kind: str | None
    arquivo: str | None
    evidencia: str


@dataclass
class Op:
    op_id: str
    tipo: str
    entradas: list[Entrada]
    praise_id: str | None = None
    material_id: str | None = None
    nome: str | None = None
    numero: str | None = None
    tags: list[str] = field(default_factory=list)
    confianca: str = "humano"
    decidido_por: str = "jairo"
    motivo: str | None = None

    @property
    def pdf_ids(self) -> list[str]:
        return [e.pdf_id for e in self.entradas]


@dataclass
class Plano:
    ops: list[Op]
    recusas: list[dict]

    def por_tipo(self, tipo: str) -> list[Op]:
        return [o for o in self.ops if o.tipo == tipo]


def op_id(tipo: str, pdf_ids: list[str]) -> str:
    return hashlib.sha256((tipo + "|" + "|".join(sorted(pdf_ids))).encode("utf-8")).hexdigest()[:16]


def _acervo(conn: sqlite3.Connection) -> dict:
    kinds = {r[1]: r[0] for r in conn.execute("SELECT id, name FROM material_kinds")}
    praises = {r[0] for r in conn.execute("SELECT id FROM praises")}
    materiais = {r[0]: r[1] for r in conn.execute("SELECT id, praise_id FROM praise_materials")}
    return {"kinds": kinds, "praises": praises, "materiais": materiais}


def _resolver_junto(pdf_id: str, decisoes: dict[str, dict]) -> tuple[str, str] | tuple[None, str]:
    """Segue junto_com até uma decisão que cria ('criar', pdf_id de quem cria)
    ou que tem praise ('praise', praise_id). Ciclo/ponta solta → (None, motivo).
    Só é chamada quando a decisão de `pdf_id` tem junto_com."""
    vistos = [pdf_id]
    atual = decisoes.get(pdf_id, {})
    while atual.get("junto_com"):
        alvo = atual["junto_com"]
        if alvo in vistos:
            return None, f"junto_com em ciclo ({' → '.join(v[:12] for v in vistos + [alvo])})"
        if len(vistos) > MAX_SALTOS:
            return None, f"junto_com com mais de {MAX_SALTOS} saltos"
        vistos.append(alvo)
        atual = decisoes.get(alvo, {})
        if atual.get("tipo") == "criar":
            return "criar", alvo
        if atual.get("tipo") in ("adicionar", "substituir", "link") and atual.get("praise_id") and not atual.get("junto_com"):
            return "praise", atual["praise_id"]
    return None, "junto_com sem destino (a entrada apontada não tem praise nem cria)"


def montar_plano(decisoes: dict[str, dict], findings: list[dict], conn: sqlite3.Connection,
                 plpcjf: str = PLPCJF_ASSETS, baixados: str = PLPCG_BAIXADOS) -> Plano:
    acervo = _acervo(conn)
    ops: list[Op] = []
    recusas: list[dict] = []
    criar_por_nome: dict[str, Op] = {}
    criar_por_pdf: dict[str, str] = {}   # pdf_id que cria → nome normalizado

    def recusar(e: dict, motivo: str) -> None:
        recusas.append({"pdf_id": e["target_id"], "short_id": e["evidence"]["short_id"], "motivo": motivo})

    def entrada(f: dict, d: dict | None, evidencia: str) -> Entrada:
        e = f["evidence"]
        kind = (d or {}).get("kind") or dec.KIND_PADRAO.get(e["categoria"])
        return Entrada(pdf_id=f["target_id"], short_id=e["short_id"], group_id=e["group_id"], path=e["path"],
                       sha256=e["sha256"], kind=kind, arquivo=arquivo_local(e["path"], plpcjf, baixados),
                       evidencia=evidencia)

    plpcg = sorted((f for f in findings if f["target_type"] == "plpcg"), key=lambda f: f["evidence"]["short_id"])
    # 1ª passada: quem cria o quê (para o junto_com achar o grupo certo)
    for f in plpcg:
        d = decisoes.get(f["target_id"])
        if d and d.get("tipo") == "criar":
            criar_por_pdf[f["target_id"]] = norm_nome(d.get("nome") or f["evidence"]["nome"])

    for f in plpcg:
        e = f["evidence"]
        d = decisoes.get(f["target_id"])
        tipo = (d or {}).get("tipo")

        if not tipo:
            if e["faixa"] == "alta" and e.get("material_id") and f.get("praise_id"):
                ent = entrada(f, None, "+".join(e["evidencias"]))
                ops.append(Op(op_id("link", [ent.pdf_id]), "link", [ent], praise_id=f["praise_id"],
                              material_id=e["material_id"], confianca="alta", decidido_por="detector"))
            else:
                recusar(f, "sem decisão")
            continue

        if tipo in ("nao_levar", "descartar"):
            ent = entrada(f, d, f"site:{tipo}")
            ops.append(Op(op_id("nada", [ent.pdf_id]), "nada", [ent], motivo=tipo))
            continue

        ent = entrada(f, d, f"site:{tipo}")
        if tipo != "link" and ent.kind not in acervo["kinds"]:
            recusar(f, f"kind não existe no coldigom: {ent.kind!r}")
            continue
        if tipo != "link" and ent.arquivo is None:
            recusar(f, f"PDF não está no disco: {e['path']}")
            continue

        if tipo == "link":
            if acervo["materiais"].get(d["material_id"]) != d["praise_id"]:
                recusar(f, f"material {d['material_id']} não é do praise {d['praise_id']} no snapshot")
                continue
            ops.append(Op(op_id("link", [ent.pdf_id]), "link", [ent], praise_id=d["praise_id"],
                          material_id=d["material_id"]))
            continue

        if tipo == "substituir":
            if acervo["materiais"].get(d["material_id"]) != d["praise_id"]:
                recusar(f, f"material {d['material_id']} não é do praise {d['praise_id']} no snapshot")
                continue
            ops.append(Op(op_id("substituir", [ent.pdf_id]), "substituir", [ent], praise_id=d["praise_id"],
                          material_id=d["material_id"]))
            continue

        if tipo == "adicionar":
            praise = d.get("praise_id")
            if d.get("junto_com"):
                onde, alvo = _resolver_junto(f["target_id"], decisoes)
                if onde is None:
                    recusar(f, alvo)
                    continue
                if onde == "criar":
                    if alvo not in criar_por_pdf:
                        recusar(f, "junto_com aponta para uma entrada sem finding nesta rodada")
                        continue
                    nome_n = criar_por_pdf[alvo]
                    grupo = criar_por_nome.get(nome_n)
                    if grupo is None:
                        # o criador ainda não passou (short_id maior): cria o grupo já, ele preenche depois
                        grupo = criar_por_nome[nome_n] = Op("", "criar", [])
                    grupo.entradas.append(ent)
                    continue
                praise = alvo
            if not praise or praise not in acervo["praises"]:
                recusar(f, f"praise {praise!r} não existe no snapshot")
                continue
            ops.append(Op(op_id("importar", [ent.pdf_id]), "importar", [ent], praise_id=praise))
            continue

        if tipo == "criar":
            nome_n = criar_por_pdf[f["target_id"]]
            grupo = criar_por_nome.get(nome_n)
            if grupo is None:
                grupo = criar_por_nome[nome_n] = Op("", "criar", [])
            if grupo.nome is None:
                grupo.nome = d.get("nome") or e["nome"]
                grupo.numero = e["numero"] if e["classificacao"].startswith("Coletânea") and str(e["numero"]).isdigit() else ""
                grupo.tags = tags_propostas(e["classificacao"])
            grupo.entradas.append(ent)
            continue

        recusar(f, f"tipo desconhecido: {tipo!r}")

    for grupo in criar_por_nome.values():
        if grupo.nome is None:
            for ent in grupo.entradas:
                recusas.append({"pdf_id": ent.pdf_id, "short_id": ent.short_id,
                                "motivo": "junto_com aponta para um 'criar' que foi recusado"})
            continue
        grupo.entradas.sort(key=lambda x: x.short_id)
        grupo.op_id = op_id("criar", grupo.pdf_ids)
        ops.append(grupo)

    ops.sort(key=lambda o: (ORDEM[o.tipo], o.entradas[0].short_id))
    recusas.sort(key=lambda r: r["short_id"])
    return Plano(ops, recusas)
