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


# --- SQL ---------------------------------------------------------------------

def r2_key(praise_id: str, material_id: str) -> str:
    """Valor da coluna praise_materials.r2_key (api/src/driveImport.ts:104)."""
    return f"assets/praises/{praise_id}/{material_id}.pdf"


def chave_bucket(r2_key_: str) -> str:
    """A chave do objeto no bucket: o app prefixa 'storage/' (driveImport.ts:105)."""
    return f"storage/{r2_key_}"


def _sql_crosswalk(e: Entrada, praise_id: str, material_id: str, op: Op, run_id: str) -> str:
    return ("INSERT INTO plpcg_crosswalk (pdf_id, short_id, group_id, praise_id, praise_material_id, "
            "evidencia, confianca, decidido_por, run_id) VALUES ("
            + ", ".join(sql_str(v) for v in (e.pdf_id, e.short_id, e.group_id, praise_id, material_id,
                                             e.evidencia, op.confianca, op.decidido_por, run_id)) + ");")


def _sql_material(e: Entrada, praise_id: str, material_id: str, kinds: dict[str, str]) -> str:
    return ("INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key, file_path_legacy, "
            "source_material_id, merged_from_praise_id, url, is_reviewed) VALUES ("
            f"{sql_str(material_id)}, {sql_str(praise_id)}, {sql_str(kinds[e.kind])}, 'pdf', "
            f"{sql_str(r2_key(praise_id, material_id))}, {sql_str('plpcg:' + e.path)}, NULL, NULL, NULL, 0);")


def sql_op(op: Op, ids: dict, kinds: dict[str, str], tags: dict[str, str], run_id: str) -> list[str]:
    if op.tipo == "nada":
        return []
    if op.tipo == "link":
        e = op.entradas[0]
        return [_sql_crosswalk(e, op.praise_id, op.material_id, op, run_id)]
    if op.tipo in ("importar", "substituir"):
        e = op.entradas[0]
        mid = ids["material_ids"][e.pdf_id]
        stmts = [_sql_material(e, op.praise_id, mid, kinds), _sql_crosswalk(e, op.praise_id, mid, op, run_id)]
        if op.tipo == "substituir":
            stmts.append(f"DELETE FROM praise_materials WHERE id = {sql_str(op.material_id)} "
                         f"AND praise_id = {sql_str(op.praise_id)};")
        return stmts
    if op.tipo == "criar":
        pid = ids["praise_id"]
        faltam = [t for t in op.tags if t not in tags]
        if faltam:
            raise ValueError(f"tag não existe no coldigom: {', '.join(faltam)}")
        stmts = [f"INSERT INTO praises (id, name, number) VALUES ({sql_str(pid)}, {sql_str(op.nome)}, {sql_str(op.numero or '')});"]
        stmts += [f"INSERT INTO praise_tags (praise_id, tag_id) VALUES ({sql_str(pid)}, {sql_str(tags[t])});" for t in op.tags]
        for e in op.entradas:
            mid = ids["material_ids"][e.pdf_id]
            stmts += [_sql_material(e, pid, mid, kinds), _sql_crosswalk(e, pid, mid, op, run_id)]
        return stmts
    raise ValueError(f"tipo desconhecido: {op.tipo}")


# --- execução ------------------------------------------------------------------

LOTE_SQL = 300  # statements por chunk (o wrangler engasga com arquivo grande)


def ja_aplicadas(log_path: str) -> set[str]:
    """op_id com ok:true, descontando as desfeitas depois — mesma regra do core.apply."""
    feitas: set[str] = set()
    if not os.path.exists(log_path):
        return feitas
    with open(log_path, encoding="utf-8") as f:
        for linha in f:
            if not linha.strip():
                continue
            r = json.loads(linha)
            if r.get("estado") == "desfeito":
                if r.get("ok"):          # undo que falhou no SQL deixa a escrita em produção
                    feitas.discard(r["op_id"])
            elif r.get("ok"):
                feitas.add(r["op_id"])
    return feitas


def estado_producao(remote: bool = True, praises_snapshot: set[str] = frozenset()) -> dict:
    """Quatro leituras, uma vez por run — nunca uma por op (3588 links).
    `nomes` só tem os praises que não estavam no snapshot: os outros o dono
    já viu na Revisão 3 quando confirmou 'criar'."""
    nomes: dict[str, set[str]] = {}
    for r in query("SELECT p.id AS id, p.name AS name, t.name AS tag FROM praises p "
                   "LEFT JOIN praise_tags pt ON pt.praise_id = p.id LEFT JOIN tags t ON t.id = pt.tag_id", remote=remote):
        if r["id"] not in praises_snapshot:
            nomes.setdefault(norm_nome(r["name"]), set()).add(r["tag"] or "")
    return {
        "crosswalk": {r["pdf_id"] for r in query("SELECT pdf_id FROM plpcg_crosswalk", remote=remote)},
        "praises": {r["id"] for r in query("SELECT id FROM praises", remote=remote)},
        "materiais": {r["id"]: r["praise_id"] for r in query("SELECT id, praise_id FROM praise_materials", remote=remote)},
        "nomes": nomes,
    }


def _tag_base(tags: set[str]) -> str:
    return "Coletânea" if "Coletânea" in tags else "Avulsos"


def _pre_condicao(op: Op, estado: dict) -> str | None:
    """Motivo da recusa, ou None. Lê o estado de PRODUÇÃO, não o snapshot."""
    ja = [e.pdf_id for e in op.entradas if e.pdf_id in estado["crosswalk"]]
    if ja:
        return f"pdf_id já está em plpcg_crosswalk: {', '.join(p[:16] for p in ja)}"
    if op.tipo in ("link", "importar", "substituir") and op.praise_id not in estado["praises"]:
        return f"praise {op.praise_id} não existe mais em produção"
    if op.tipo in ("link", "substituir") and estado["materiais"].get(op.material_id) != op.praise_id:
        return f"material {op.material_id} não existe em produção ou não é do praise {op.praise_id}"
    if op.tipo == "criar":
        bases = estado["nomes"].get(norm_nome(op.nome), set())
        if bases and _tag_base(set(op.tags)) in {_tag_base({b}) for b in bases}:
            return f"apareceu em produção, depois do snapshot, um praise com o mesmo nome e tag-base: {op.nome!r}"
    for e in op.entradas:
        if op.tipo != "link" and e.arquivo and sha256_arquivo(e.arquivo) != e.sha256:
            return f"sha256 do PDF local difere do finding: {e.short_id} {e.path}"
    return None


def _antes(op: Op, conn: sqlite3.Connection) -> dict:
    if op.tipo != "substituir":
        return {}
    r = conn.execute("SELECT * FROM praise_materials WHERE id = ?", (op.material_id,)).fetchone()
    return dict(r) if r else {}


def copiar_execucao(run_id: str, log_path: str, execucao_dir: str) -> str:
    os.makedirs(execucao_dir, exist_ok=True)
    destino = os.path.join(execucao_dir, f"{run_id}.jsonl")
    with open(log_path, encoding="utf-8") as origem, open(destino, "w", encoding="utf-8") as saida:
        for linha in origem:
            if linha.strip() and json.loads(linha).get("run_id") == run_id:
                saida.write(linha)
    return destino


def _catalogos(conn: sqlite3.Connection) -> tuple[dict[str, str], dict[str, str], set[str]]:
    kinds = {r[1]: r[0] for r in conn.execute("SELECT id, name FROM material_kinds")}
    tags = {r[1]: r[0] for r in conn.execute("SELECT id, name FROM tags")}
    praises = {r[0] for r in conn.execute("SELECT id FROM praises")}
    return kinds, tags, praises


def executar(plano: Plano, tipo: str, execute: bool, run_id: str, log_path: str,
             conn: sqlite3.Connection, remote: bool = True, sql_dir: str | None = None,
             execucao_dir: str | None = None, novo_id=lambda: str(uuid.uuid4())) -> dict:
    if execute and tipo not in TIPOS:
        raise ValueError(f"--execute exige --tipo explícito ({' | '.join(TIPOS)}); a ordem do spec §9 é link → "
                         "importar/substituir → criar, com core.snapshot entre eles")
    kinds, tags, praises_snapshot = _catalogos(conn)
    feitas = ja_aplicadas(log_path)
    fila = [o for o in plano.ops if (tipo == "todos" or o.tipo in (tipo, "nada")) and o.op_id not in feitas]
    resumo = {"ops": len(plano.ops), "recusadas_no_plano": len(plano.recusas),
              "ja_aplicadas": len(plano.ops) - len(fila) if tipo == "todos"
              else sum(1 for o in plano.ops if o.tipo in (tipo, "nada")) - len(fila),
              "simuladas": 0, "aplicadas": 0, "falharam": 0, "sem_escrita": 0}

    if not execute:
        # Portão da simulação: sem rede, sem credencial. O sha é disco.
        mostrados = 0
        for op in fila:
            if op.tipo == "nada":
                resumo["sem_escrita"] += 1
                continue
            ids = {"praise_id": novo_id() if op.tipo == "criar" else op.praise_id,
                   "material_ids": {} if op.tipo == "link" else {e.pdf_id: novo_id() for e in op.entradas}}
            ruim = next((f"sha256 difere: {e.short_id}" for e in op.entradas
                         if op.tipo != "link" and e.arquivo and sha256_arquivo(e.arquivo) != e.sha256), None)
            try:
                stmts = sql_op(op, ids, kinds, tags, run_id)
            except ValueError as erro:
                ruim = str(erro)
            if ruim:
                print(f"  RECUSADO {op.tipo} {','.join(e.short_id for e in op.entradas)}: {ruim}")
                resumo["falharam"] += 1
                continue
            resumo["simuladas"] += 1
            if mostrados < 3:
                mostrados += 1
                print(f"\n--- exemplo: {op.tipo} {','.join(e.short_id for e in op.entradas)} ---")
                for e in op.entradas:
                    if op.tipo != "link":
                        print(f"    R2 put {chave_bucket(r2_key(ids['praise_id'], ids['material_ids'][e.pdf_id]))} ← {e.arquivo}")
                for s in stmts:
                    print("   ", s)
        return resumo

    estado = estado_producao(remote, praises_snapshot)
    base_sql = os.path.join(sql_dir or os.path.join(OUT, "sql"), run_id)
    os.makedirs(os.path.dirname(log_path) or ".", exist_ok=True)
    log = open(log_path, "a", encoding="utf-8")

    def gravar(linha: dict) -> None:
        log.write(json.dumps(linha, ensure_ascii=False) + "\n")
        log.flush()

    abertas: list[tuple[Op, dict]] = []   # ops de link acumuladas no chunk corrente
    pendencias: list[tuple[Op, dict]] = []  # tudo que escreveu e espera a pós-condição
    removidos: list[str] = []
    chunk: list[str] = []
    n_chunk = 0

    def fechar_chunk() -> None:
        nonlocal chunk, abertas, n_chunk
        if not chunk:
            return
        try:
            arquivos = write_sql_chunks(chunk, base_sql, prefix=f"lote_{n_chunk:03d}", per_file=LOTE_SQL)
            n_chunk += 1
            # A escrita local terminou: cada op do lote é reversível a partir de agora,
            # e isso vai para o disco ANTES do wrangler — quem morre no meio do
            # run_sql_files não deixa a produção escrita com o log dizendo "pendente".
            for _, linha in abertas:
                linha["escreveu"] = True
                gravar(dict(linha, ts=time.time(), estado="escrevendo"))
            run_sql_files(arquivos, remote=remote)
            pendencias.extend(abertas)
        except Exception as erro:  # write_sql_chunks ou o wrangler levantaram: todo o lote falha
            for op, linha in abertas:
                gravar(dict(linha, ts=time.time(), ok=False, estado="falhou", erro=f"{type(erro).__name__}: {erro}"))
                resumo["falharam"] += 1
        chunk, abertas = [], []

    try:
        for op in fila:
            base = {"op_id": op.op_id, "run_id": run_id, "tipo": op.tipo, "pdf_ids": op.pdf_ids}
            if op.tipo == "nada":
                gravar(dict(base, ts=time.time(), ok=True, escreveu=False, estado="sem_escrita", motivo=op.motivo))
                resumo["sem_escrita"] += 1
                continue
            motivo = _pre_condicao(op, estado)
            if motivo:
                gravar(dict(base, ts=time.time(), ok=False, escreveu=False, estado="pre_condicao", motivo=motivo))
                resumo["falharam"] += 1
                continue
            ids = {"praise_id": novo_id() if op.tipo == "criar" else op.praise_id,
                   "material_ids": {} if op.tipo == "link" else {e.pdf_id: novo_id() for e in op.entradas}}
            linha = dict(base, ts=time.time(), estado="pendente", escreveu=False, ids=ids, r2=[], antes=_antes(op, conn))
            gravar(linha)
            try:
                stmts = sql_op(op, ids, kinds, tags, run_id)
            except ValueError as erro:
                gravar(dict(linha, ts=time.time(), ok=False, estado="pre_condicao", motivo=str(erro)))
                resumo["falharam"] += 1
                continue
            if op.tipo == "link":
                chunk.extend(stmts)
                abertas.append((op, linha))
                if len(chunk) >= LOTE_SQL:
                    fechar_chunk()
                continue
            fechar_chunk()
            # A partir daqui o R2 pode ter objeto novo: cada chave sobe e vai para o disco
            # antes da próxima chamada — um objeto no bucket já é escrita que precisa ser
            # reversível, mesmo que o processo morra antes do SQL.
            try:
                for e in op.entradas:
                    chave = chave_bucket(r2_key(ids["praise_id"], ids["material_ids"][e.pdf_id]))
                    r2_put(chave, e.arquivo)
                    linha["r2"].append(chave)
                    linha["escreveu"] = True
                    gravar(dict(linha, ts=time.time(), estado="subindo_r2"))
                arquivos = write_sql_chunks(stmts, base_sql, prefix=op.op_id, per_file=LOTE_SQL)
                linha["escreveu"] = True
                gravar(dict(linha, ts=time.time(), estado="escrevendo"))
                run_sql_files(arquivos, remote=remote)
                if op.tipo == "substituir":
                    removidos.append(op.material_id)
                pendencias.append((op, linha))
            except Exception as erro:
                gravar(dict(linha, ts=time.time(), ok=False, estado="falhou", erro=f"{type(erro).__name__}: {erro}"))
                resumo["falharam"] += 1
        fechar_chunk()

        # Pós-condição, uma vez: o que entrou no crosswalk neste run e o que devia ter saído.
        if pendencias:
            no_crosswalk = {r["pdf_id"] for r in query(
                f"SELECT pdf_id FROM plpcg_crosswalk WHERE run_id = {sql_str(run_id)}", remote=remote)}
            ainda = set()
            if removidos:
                lista = ", ".join(sql_str(m) for m in removidos)
                ainda = {r["id"] for r in query(f"SELECT id FROM praise_materials WHERE id IN ({lista})", remote=remote)}
            for op, linha in pendencias:
                ok = all(p in no_crosswalk for p in op.pdf_ids) and (op.tipo != "substituir" or op.material_id not in ainda)
                if ok:
                    gravar(dict(linha, ts=time.time(), ok=True, estado="ok"))
                    resumo["aplicadas"] += 1
                else:
                    gravar(dict(linha, ts=time.time(), ok=False, estado="guarda_barrou"))
                    resumo["falharam"] += 1
    finally:
        log.close()
    copiar_execucao(run_id, log_path, execucao_dir or EXECUCAO_PADRAO)
    return resumo
