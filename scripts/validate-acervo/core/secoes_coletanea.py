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


# --- SQL -------------------------------------------------------------------------

def resolver_subtags(plano: Plano, tags: list[dict], novo_id=lambda: str(uuid.uuid4())) -> tuple[dict, list[dict]]:
    """(pai, nome) -> id de cada uma das 14 subtags, e as que faltam criar.

    `tags` é a tabela inteira: a do snapshot no ensaio, a de produção no
    --execute. Subtag de mesmo nome sob o mesmo pai é reaproveitada (§5.1.3)."""
    existentes = {(t["parent_id"], t["name"]): t["id"] for t in tags if t["parent_id"] is not None}
    ids: dict[tuple, str] = {}
    novas: list[dict] = []
    for pai, nome in mapa.SUBTAGS:
        pai_id = plano.raizes[pai]
        tid = existentes.get((pai_id, nome))
        if tid is None:
            tid = novo_id()
            novas.append({"id": tid, "name": nome, "parent_id": pai_id})
        ids[(pai, nome)] = tid
    return ids, novas


def _sql_criar_subtag(s: dict) -> str:
    return (f"INSERT INTO tags (id, name, parent_id) VALUES "
            f"({sql_str(s['id'])}, {sql_str(s['name'])}, {sql_str(s['parent_id'])});")


def _sql_ligar(lig: Ligacao, tag_id: str) -> str:
    """INSERT guardado: só liga se o praise ainda está como no snapshot.

    Categoria: a mesma do snapshot (`IS` compara NULL também). Manual: além
    disso, exatamente o mesmo conjunto de tags. SELECT ... WHERE em vez de
    VALUES também evita a FK: praise apagado depois do snapshot vira no-op em
    vez de derrubar o arquivo inteiro."""
    p = sql_str(lig.praise_id)
    cond = [f"EXISTS (SELECT 1 FROM praises WHERE id = {p} AND category IS {sql_str(lig.category)})"]
    if lig.origem == "manual":
        n = len(lig.tags_snapshot)
        lista = ", ".join(sql_str(t) for t in lig.tags_snapshot)
        cond.append(f"(SELECT COUNT(*) FROM praise_tags WHERE praise_id = {p}) = {n}")
        cond.append(f"(SELECT COUNT(*) FROM praise_tags WHERE praise_id = {p} AND tag_id IN ({lista})) = {n}")
    return (f"INSERT OR IGNORE INTO praise_tags (praise_id, tag_id) SELECT {p}, {sql_str(tag_id)} "
            f"WHERE {' AND '.join(cond)};")


def _sql_desligar_raiz(lig: Ligacao, raiz_id: str, tag_id: str) -> str:
    """DELETE da raiz Coletânea só quando a subtag já está ligada: se o INSERT
    foi barrado pela guarda, o praise não sai da Coletânea."""
    p = sql_str(lig.praise_id)
    return (f"DELETE FROM praise_tags WHERE praise_id = {p} AND tag_id = {sql_str(raiz_id)} "
            f"AND EXISTS (SELECT 1 FROM praise_tags WHERE praise_id = {p} AND tag_id = {sql_str(tag_id)});")


def sql_plano(plano: Plano, ids: dict, novas: list[dict]) -> list[str]:
    """Ordem fixa: cria subtags, liga, desliga a raiz. Um arquivo que falha
    no meio não deixa praise sem Coletânea: o DELETE exige a subtag ligada."""
    col = plano.raizes[mapa.RAIZ_COLETANEA]
    stmts = [_sql_criar_subtag(s) for s in novas]
    stmts += [_sql_ligar(lig, ids[(lig.pai, lig.subtag)]) for lig in plano.ligacoes if lig.inserir]
    stmts += [_sql_desligar_raiz(lig, col, ids[(lig.pai, lig.subtag)]) for lig in plano.ligacoes if lig.remover_raiz]
    return stmts


# --- relatório -------------------------------------------------------------------

def contagens(plano: Plano) -> dict[tuple, int]:
    """(pai, nome) -> praises ligados à subtag depois da migração."""
    depois = {chave: set(ps) for chave, ps in plano.ja_ligados.items()}
    for lig in plano.ligacoes:
        depois[(lig.pai, lig.subtag)].add(lig.praise_id)
    return {chave: len(ps) for chave, ps in depois.items()}


def divergencias(plano: Plano) -> list[str]:
    """O que não bate com os números da spec. Não aborta: o dono lê e decide."""
    n = contagens(plano)
    saida = []
    for nome, esperado in mapa.ESPERADO_DEPOIS.items():
        obtido = n[(mapa.RAIZ_COLETANEA, nome)]
        if obtido != esperado:
            saida.append(f"Coletânea · {nome}: {obtido} praises depois, a spec diz {esperado}")
    total = sum(v for (pai, _), v in n.items() if pai == mapa.RAIZ_COLETANEA)
    if total != mapa.ESPERADO_TOTAL:
        saida.append(f"total da Coletânea: {total}, a spec diz {mapa.ESPERADO_TOTAL}")
    gltm = n[(mapa.RAIZ_AVULSOS, "GLTM")]
    if gltm != mapa.ESPERADO_AVULSOS_GLTM:
        saida.append(f"Avulsos · GLTM: {gltm} praises depois, a spec diz {mapa.ESPERADO_AVULSOS_GLTM}")
    removidas = sum(1 for lig in plano.ligacoes if lig.remover_raiz)
    if removidas != mapa.ESPERADO_RAIZ_REMOVIDAS:
        saida.append(f"ligações diretas com Coletânea removidas: {removidas}, a spec diz {mapa.ESPERADO_RAIZ_REMOVIDAS}")
    # Nome de praise no D1 pode estar em NFD (medido no snapshot de 17/09);
    # a spec está em NFC. A comparação é só do relatório, não do mapeamento.
    entram = _nfc_pares((e["number"], e["name"]) for e in plano.entram_na_coletanea)
    esperado = _nfc_pares(mapa.ENTRAM_NA_COLETANEA)
    if entram != esperado:
        a_mais = [f"{n} {s}".strip() for n, s in entram if (n, s) not in esperado]
        faltam = [f"{n} {s}".strip() for n, s in esperado if (n, s) not in entram]
        saida.append(f"entram na Coletânea: {len(entram)} praises (spec: {len(esperado)}); "
                     f"a mais: {', '.join(a_mais) or '—'}; faltam: {', '.join(faltam) or '—'}")
    return saida


def _nfc_pares(pares) -> list[tuple[str, str]]:
    return sorted((n, unicodedata.normalize("NFC", s)) for n, s in pares)


def relatorio(plano: Plano, conn: sqlite3.Connection, run_id: str, novas: list[dict]) -> str:
    """O relatório do ensaio (§5.1.6), em markdown."""
    n = contagens(plano)
    rot = rotulos(conn)
    nome_da_raiz = {v: k for k, v in plano.raizes.items()}
    novas_chaves = {(nome_da_raiz[s["parent_id"]], s["name"]) for s in novas}
    por_id = {lig.praise_id: lig for lig in plano.ligacoes}
    div = divergencias(plano)

    linhas = [f"# Seções da Coletânea — {run_id}", "",
              "Relatório gerado a partir do snapshot. `category` não é alterada (§5.1.5).", "",
              "## Divergências da spec", ""]
    linhas += [f"- {d}" for d in div] or ["Nenhuma."]
    linhas += ["", "## Subtags (§2.1)", "",
               "| Subtag | Situação | Ligações novas | Praises depois | Spec |",
               "|---|---|---:|---:|---:|"]
    for pai, nome in mapa.SUBTAGS:
        chave = (pai, nome)
        novas_lig = sum(1 for lig in plano.ligacoes if (lig.pai, lig.subtag) == chave and lig.inserir)
        esperado = mapa.ESPERADO_DEPOIS[nome] if pai == mapa.RAIZ_COLETANEA else mapa.ESPERADO_AVULSOS_GLTM
        situacao = "nova" if chave in novas_chaves else "existente"
        linhas.append(f"| {pai}{mapa.SEP_ROTULO}{nome} | {situacao} | {novas_lig} | {n[chave]} | {esperado} |")
    total = sum(v for (pai, _), v in n.items() if pai == mapa.RAIZ_COLETANEA)
    linhas.append(f"| **Total Coletânea** | | | {total} | {mapa.ESPERADO_TOTAL} |")

    removidas = sum(1 for lig in plano.ligacoes if lig.remover_raiz)
    por_origem = {o: sum(1 for lig in plano.ligacoes if lig.origem == o and lig.inserir) for o in ("categoria", "manual")}
    linhas += ["", "## Ligações diretas com `Coletânea` removidas", "",
               f"{removidas} (spec: {mapa.ESPERADO_RAIZ_REMOVIDAS}).", "",
               f"Ligações novas: {por_origem['categoria']} pela categoria, {por_origem['manual']} manuais.", "",
               "## Casos manuais (§2.3)", "",
               "| id | shortId | Nº | Louvor | Tags no snapshot | Recebe | Ação |",
               "|---|---|---|---|---|---|---|"]
    for x in mapa.MANUAIS:
        lig = por_id.get(x["id"])
        tags = sorted(rot.get(r["tag_id"], r["tag_id"]) for r in conn.execute(
            "SELECT tag_id FROM praise_tags WHERE praise_id = ?", (x["id"],)))
        acao = ("liga" if lig.inserir else "já ligado") + ("; tira a raiz Coletânea" if lig.remover_raiz else "")
        linhas.append(f"| `{x['id']}` | {x['short_id']} | {x['numero'] or '—'} | {x['nome']} | "
                      f"{', '.join(tags)} | {x['pai']}{mapa.SEP_ROTULO}{x['subtag']} | {acao} |")

    linhas += ["", f"## Entram na Coletânea pela subtag ({len(plano.entram_na_coletanea)}; "
                   f"spec: {len(mapa.ENTRAM_NA_COLETANEA)})", "",
               "| id | Nº | Louvor | Seção |", "|---|---|---|---|"]
    for e in sorted(plano.entram_na_coletanea, key=lambda e: (e["number"], e["name"])):
        linhas.append(f"| `{e['id']}` | {e['number'] or '—'} | {e['name']} | {e['subtag']} |")
    return "\n".join(linhas) + "\n"


def _escrever_relatorio(pasta: str, texto: str) -> str:
    os.makedirs(pasta, exist_ok=True)
    caminho = os.path.join(pasta, "relatorio.md")
    with open(caminho, "w", encoding="utf-8") as f:
        f.write(texto)
    return caminho


# --- execução --------------------------------------------------------------------

def conferir_raizes(plano: Plano, tags: list[dict]) -> None:
    """As raízes de produção são as do snapshot? Todo o SQL usa esses ids."""
    problemas = []
    for nome, tid in plano.raizes.items():
        prod = [t["id"] for t in tags if t["name"] == nome and t["parent_id"] is None]
        if prod != [tid]:
            problemas.append(f"a raiz {nome!r} em produção ({prod}) não é a do snapshot ({tid})")
    if problemas:
        raise Trava(problemas)


def _ligacoes_producao(tag_ids: list[str], remote: bool) -> set:
    lista = ", ".join(sql_str(t) for t in tag_ids)
    return {(r["praise_id"], r["tag_id"]) for r in query(
        f"SELECT praise_id, tag_id FROM praise_tags WHERE tag_id IN ({lista})", remote=remote)}


def executar(plano: Plano, conn: sqlite3.Connection, execute: bool, run_id: str,
             log_path: str = LOG_PADRAO, out_dir: str | None = None, execucao_dir: str | None = None,
             remote: bool = True, novo_id=lambda: str(uuid.uuid4())) -> dict:
    pasta = os.path.join(out_dir or OUT_PADRAO, run_id)
    col = plano.raizes[mapa.RAIZ_COLETANEA]
    resumo = {"run_id": run_id, "executado": execute, "pasta": pasta,
              "ligar": sum(1 for lig in plano.ligacoes if lig.inserir),
              "desligar_raiz": sum(1 for lig in plano.ligacoes if lig.remover_raiz),
              "subtags_novas": 0, "statements": 0, "divergencias": len(divergencias(plano)),
              "criadas": 0, "removidas": 0, "atrasadas": {"ligar": [], "desligar_raiz": []}, "falhou": False}

    if not execute:
        # Portão do ensaio: sem rede, sem credencial. As subtags vêm do snapshot.
        tags = [dict(r) for r in conn.execute("SELECT id, name, parent_id FROM tags")]
        ids, novas = resolver_subtags(plano, tags, novo_id)
        stmts = sql_plano(plano, ids, novas)
        write_sql_chunks(stmts, os.path.join(pasta, "sql"), prefix="ensaio", per_file=LOTE_SQL)
        resumo["relatorio"] = _escrever_relatorio(pasta, relatorio(plano, conn, run_id, novas))
        resumo.update(subtags_novas=len(novas), statements=len(stmts))
        return resumo

    # Produção manda sobre o snapshot no que o SQL referencia por id: as raízes
    # e as subtags (uma subtag criada pelo admin depois do snapshot é reaproveitada).
    tags_prod = query("SELECT id, name, parent_id FROM tags", remote=remote)
    conferir_raizes(plano, tags_prod)
    ids, novas = resolver_subtags(plano, tags_prod, novo_id)
    stmts = sql_plano(plano, ids, novas)
    alvo = sorted({col, *ids.values()})
    antes = _ligacoes_producao(alvo, remote)
    ligar = sorted({(lig.praise_id, ids[(lig.pai, lig.subtag)]) for lig in plano.ligacoes if lig.inserir})
    desligar = sorted({(lig.praise_id, col) for lig in plano.ligacoes if lig.remover_raiz})
    # O que o undo pode tocar: só ligações que não existiam antes (para apagar)
    # e só ligações com a raiz que existiam antes (para repor).
    base = {"run_id": run_id, "raiz_coletanea": col, "subtags_novas": novas,
            "ligar": [list(x) for x in ligar if x not in antes],
            "desligar_raiz": [list(x) for x in desligar if x in antes]}
    resumo.update(subtags_novas=len(novas), statements=len(stmts))
    resumo["relatorio"] = _escrever_relatorio(pasta, relatorio(plano, conn, run_id, novas))

    os.makedirs(os.path.dirname(log_path) or ".", exist_ok=True)
    log = open(log_path, "a", encoding="utf-8")

    def gravar(linha: dict) -> None:
        log.write(json.dumps(dict(linha, ts=time.time()), ensure_ascii=False) + "\n")
        log.flush()

    try:
        gravar(dict(base, estado="pendente", escreveu=False))
        arquivos = write_sql_chunks(stmts, os.path.join(pasta, "sql"), prefix="lote", per_file=LOTE_SQL)
        # A partir daqui SQL pode chegar a produção: a linha vai para o disco
        # ANTES do wrangler, para um processo morto no meio ser desfazível.
        gravar(dict(base, estado="escrevendo", escreveu=True))
        try:
            run_sql_files(arquivos, remote=remote)
        except Exception as erro:
            texto = _erro_texto(erro)
            # Melhor esforço: mesmo com o wrangler tendo caído, tenta saber o
            # que já chegou a produção (pode ter sido um lote parcial). Se a
            # releitura também falhar, o erro original do wrangler é o que
            # importa — não deixa a segunda falha escondê-lo.
            try:
                depois_parcial = _ligacoes_producao(alvo, remote)
                resumo["criadas"] = sum(1 for x in base["ligar"] if tuple(x) in depois_parcial)
                resumo["removidas"] = sum(1 for x in base["desligar_raiz"] if tuple(x) not in depois_parcial)
            except Exception:
                pass
            gravar(dict(base, estado="falhou", escreveu=True, ok=False, erro=texto))
            resumo["falhou"] = True
            resumo["erro"] = texto
            return resumo

        # §7: o wrangler sai 0 mesmo quando a guarda barra — quem diz o que
        # pegou é a releitura de produção. Try separado do run_sql_files: se o
        # SQL chegou (wrangler não levantou) e só a releitura falhar, é um
        # problema diferente — o run pode ter migrado tudo, só não dá para
        # confirmar agora.
        try:
            depois = _ligacoes_producao(alvo, remote)
        except Exception as erro:
            texto = _erro_texto(erro)
            gravar(dict(base, estado="releitura_falhou", escreveu=True, ok=False, erro=texto))
            resumo["falhou"] = True
            resumo["erro"] = texto
            return resumo

        atras_ligar = sorted(p for p, t in ligar if (p, t) not in depois)
        atras_desligar = sorted(p for p, t in desligar if (p, t) in depois)
        ok = not atras_ligar and not atras_desligar
        resumo["criadas"] = sum(1 for x in base["ligar"] if tuple(x) in depois)
        resumo["removidas"] = sum(1 for x in base["desligar_raiz"] if tuple(x) not in depois)
        resumo["atrasadas"] = {"ligar": atras_ligar, "desligar_raiz": atras_desligar}
        resumo["falhou"] = not ok
        # A lista do log fica só com o que de fato pegou (spec §5.2): o undo
        # de um run mais velho não pode apagar ligação que um run mais novo
        # criou depois, nem repor a raiz de quem a guarda já tirou daqui.
        gravar(dict(base, estado="ok" if ok else "guarda_barrou", escreveu=True, ok=ok,
                    ligar=[x for x in base["ligar"] if tuple(x) in depois],
                    desligar_raiz=[x for x in base["desligar_raiz"] if tuple(x) not in depois],
                    criadas=resumo["criadas"], removidas=resumo["removidas"], atrasadas=resumo["atrasadas"]))
        return resumo
    finally:
        log.close()
        copiar_execucao(run_id, log_path, execucao_dir or EXECUCAO_PADRAO)


# --- undo ------------------------------------------------------------------------

def _ler_log(log_path: str) -> list[dict]:
    """Linha truncada (processo morto no meio do write) é pulada: o --undo é a
    ferramenta de emergência e não pode morrer justo depois de um crash."""
    if not os.path.exists(log_path):
        return []
    linhas = []
    with open(log_path, encoding="utf-8") as f:
        for linha in f:
            linha = linha.strip()
            if not linha:
                continue
            try:
                linhas.append(json.loads(linha))
            except json.JSONDecodeError:
                continue
    return linhas


def sql_undo(linha: dict) -> list[str]:
    """Repõe a raiz, tira as ligações criadas, apaga as subtags criadas que
    ficaram sem ligação (§5.2). Nessa ordem: um arquivo que falha no meio
    deixa o praise com a raiz E a subtag, nunca sem nenhuma das duas."""
    stmts = []
    for p, t in linha["desligar_raiz"]:
        stmts.append(f"INSERT OR IGNORE INTO praise_tags (praise_id, tag_id) SELECT {sql_str(p)}, {sql_str(t)} "
                     f"WHERE EXISTS (SELECT 1 FROM praises WHERE id = {sql_str(p)}) "
                     f"AND EXISTS (SELECT 1 FROM tags WHERE id = {sql_str(t)});")
    for p, t in linha["ligar"]:
        stmts.append(f"DELETE FROM praise_tags WHERE praise_id = {sql_str(p)} AND tag_id = {sql_str(t)};")
    for s in linha["subtags_novas"]:
        i = sql_str(s["id"])
        stmts.append(f"DELETE FROM tags WHERE id = {i} "
                     f"AND NOT EXISTS (SELECT 1 FROM praise_tags WHERE tag_id = {i}) "
                     f"AND NOT EXISTS (SELECT 1 FROM tags WHERE parent_id = {i});")
    return stmts


def desfazer(run_id: str, log_path: str, execute: bool, remote: bool = True,
             out_dir: str | None = None, execucao_dir: str | None = None) -> dict:
    """Simula por padrão, como o core.apply. A última linha do run que
    escreveu é a que vale; um undo com ok:true fecha o run."""
    alvo = None
    desfeito = False
    for r in _ler_log(log_path):
        if r.get("run_id") != run_id:
            continue
        if r.get("estado") == "desfeito":
            desfeito = desfeito or bool(r.get("ok"))
            continue
        if r.get("escreveu"):
            alvo = r
    resumo = {"run_id": run_id, "executado": execute, "statements": 0, "falhou": False, "motivo": ""}
    if alvo is None:
        resumo["motivo"] = "nada a desfazer: o run não chegou a escrever"
        return resumo
    if desfeito:
        resumo["motivo"] = "já desfeito"
        return resumo
    stmts = sql_undo(alvo)
    resumo["statements"] = len(stmts)
    if not execute:
        for s in stmts[:10]:
            print("   ", s)
        return resumo

    carimbo = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    arquivos = write_sql_chunks(stmts, os.path.join(out_dir or OUT_PADRAO, run_id, f"undo-{carimbo}"),
                                prefix="undo", per_file=LOTE_SQL)
    saida = {"run_id": run_id, "estado": "desfeito", "statements": len(stmts)}
    try:
        run_sql_files(arquivos, remote=remote)
        saida["ok"] = True
    except Exception as erro:
        saida["ok"] = False
        saida["erro"] = _erro_texto(erro)
        resumo["falhou"] = True
    os.makedirs(os.path.dirname(log_path) or ".", exist_ok=True)
    with open(log_path, "a", encoding="utf-8") as log:
        log.write(json.dumps(dict(saida, ts=time.time()), ensure_ascii=False) + "\n")
    copiar_execucao(run_id, log_path, execucao_dir or EXECUCAO_PADRAO)
    return resumo
