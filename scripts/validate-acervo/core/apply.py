from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
import time

from core.d1 import query, run_sql_files, sql_str, write_sql_chunks
from core.findings import Finding, read_findings
from core.paths import OUT, SNAPSHOT_DB, ensure_out
from core.snapshot import conectar

LOG_PADRAO = os.path.join(OUT, "apply_log.jsonl")

# Campos que a fonte pode doar ao keeper numa fusão. 'name' fica de fora: o
# nome do keeper é o nome que o acervo já usa.
DOAVEIS = ("number", "author", "rhythm", "tonality", "category", "lyrics")

FASE_DA_ACAO = {
    "delete_material": "Fase 3",
    "set_material_kind": "Fase 2",
    "move_material": "Fase 3B",
    "set_group_id": "Fase 7",
}


def _vazio(v) -> bool:
    return v is None or str(v).strip() == ""


def _lit(v) -> str:
    """Literal SQL para um valor python já tipado (vindo do log ou de uma linha).

    bool é subclasse de int em Python — isinstance(True, int) é True — então
    checar bool primeiro evita que um True vire a string 'True' (SQL
    inválido). SQLite não tem tipo boolean nativo: grava 1/0, que é o que uma
    coluna INTEGER como is_reviewed já espera.
    """
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, int):
        return str(v)
    return sql_str(v)


def _sql_merge(f: Finding, conn: sqlite3.Connection) -> list[str]:
    """Funde a fonte no keeper, em SQL.

    Por que SQL e não o endpoint POST /api/praises/:id/merge: aquele endpoint
    exige JWT de sessão (api/src/middleware.ts:88), e o único token que um
    script tem é o COLDIGOM_UPLOAD_TOKEN, aceito só em PUT .../content.

    O endpoint também apaga objetos órfãos do R2, coisa que SQL não faz. Por
    isso a fusão é recusada se algum material da fonte tiver r2_key: na Fase 1
    nenhum tem (os 25 são links de YouTube), e deixar isso implícito seria um
    vazamento silencioso quando outra fase reusar esta função.
    """
    fonte = f.target_id
    keeper = f.proposed
    if not keeper:
        raise ValueError("merge_praise sem keeper em 'proposed'")

    materiais = conn.execute(
        "SELECT id, r2_key FROM praise_materials WHERE praise_id = ?", (fonte,)
    ).fetchall()
    com_r2 = [m["id"] for m in materiais if not _vazio(m["r2_key"])]
    if com_r2:
        raise ValueError(
            f"fusão recusada: {len(com_r2)} material(is) da fonte têm r2_key "
            f"({com_r2[0]}...). SQL não limpa o R2 — use o endpoint com JWT."
        )

    k = conn.execute("SELECT * FROM praises WHERE id = ?", (keeper,)).fetchone()
    s = conn.execute("SELECT * FROM praises WHERE id = ?", (fonte,)).fetchone()
    if k is None or s is None:
        raise ValueError(f"louvor ausente no snapshot: keeper={keeper} fonte={fonte}")

    stmts: list[str] = []

    # D3 — o keeper manda; a fonte só preenche campo vazio. Um UPDATE por
    # campo doado, cada um com a própria guarda otimista no WHERE: o
    # _vazio(k[c]) acima só valida contra o snapshot, que pode ter horas ou
    # dias de idade. Sem reafirmar "continua vazio" no WHERE, alguém que
    # preencheu o campo pelo app entre o snapshot e o --execute teria a
    # edição sobrescrita pela fusão.
    for c in DOAVEIS:
        if _vazio(k[c]) and not _vazio(s[c]):
            stmts.append(
                f"UPDATE praises SET {c} = {sql_str(s[c])}, updated_at = datetime('now') "
                f"WHERE id = {sql_str(keeper)} AND ({c} IS NULL OR trim({c}) = '');"
            )

    # Tags em união: o keeper mantém as dele e recebe as da fonte.
    for t in conn.execute("SELECT tag_id FROM praise_tags WHERE praise_id = ?", (fonte,)):
        stmts.append(
            "INSERT OR IGNORE INTO praise_tags (praise_id, tag_id) VALUES "
            f"({sql_str(keeper)}, {sql_str(t['tag_id'])});"
        )

    for m in materiais:
        stmts.append(
            f"UPDATE praise_materials SET praise_id = {sql_str(keeper)}, "
            f"merged_from_praise_id = {sql_str(fonte)} "
            f"WHERE id = {sql_str(m['id'])} AND praise_id = {sql_str(fonte)};"
        )

    # Guarda contra material criado na fonte depois do snapshot: se sobrou
    # algum praise_materials com praise_id = fonte que a lista acima não
    # conhecia (e por isso não moveu nem checou r2_key), o DELETE vira no-op
    # em vez de apagar o louvor e cascatear a perda silenciosa desse
    # material — e do objeto no R2, que a checagem de r2_key acima existe
    # para proteger.
    stmts.append(
        f"DELETE FROM praises WHERE id = {sql_str(fonte)} "
        f"AND NOT EXISTS (SELECT 1 FROM praise_materials WHERE praise_id = {sql_str(fonte)});"
    )
    return stmts


def _sql_set_praise_field(f: Finding, conn: sqlite3.Connection) -> list[str]:
    if not f.field:
        raise ValueError("set_praise_field sem 'field'")
    if f.field not in DOAVEIS + ("name", "group_id"):
        raise ValueError(f"campo não permitido: {f.field}")
    # Escrita otimista: o Finding carrega o valor que o detector viu
    # (current). Só escreve se o campo em produção ainda for esse valor no
    # momento do --execute, que pode vir horas ou dias depois do snapshot —
    # senão a escrita pisaria numa edição feita pelo app nesse intervalo.
    guarda = "IS NULL" if f.current is None else f"= {sql_str(f.current)}"
    return [
        f"UPDATE praises SET {f.field} = {sql_str(f.proposed)}, "
        f"updated_at = datetime('now') WHERE id = {sql_str(f.target_id)} "
        f"AND {f.field} {guarda};"
    ]


def _pos_condicao(f: Finding, remote: bool) -> tuple[bool, dict]:
    """Confirma contra produção que a escrita realmente aconteceu.

    O wrangler sai com código 0 mesmo quando um UPDATE/DELETE afeta 0 linhas
    — é exatamente o que as guardas otimistas do C2 fazem quando o estado em
    produção já mudou desde o snapshot. `wrangler d1 execute --file` nem
    devolve linhas afetadas por statement (a saída mistura texto de
    progresso com o JSON), então contar isso no arquivo não dá; em vez
    disso, uma consulta pontual (a mesma `core.d1.query` já usa
    `--command --json`, que devolve `meta.changes` de forma confiável)
    confirma o resultado direto na fonte da verdade. Sem isto, um finding
    cuja guarda barrou seria gravado como ok:true e _ja_aplicados nunca mais
    o retomaria — a escrita passaria a falhar em silêncio.

    Uma consulta por finding: para merge_praise as duas checagens (fonte
    sumiu, nenhum material preso nela) vêm combinadas num único SELECT.
    """
    if f.action == "merge_praise":
        fonte = f.target_id
        r = query(
            "SELECT "
            f"(SELECT COUNT(*) FROM praises WHERE id = {sql_str(fonte)}) AS fonte_existe, "
            f"(SELECT COUNT(*) FROM praise_materials WHERE praise_id = {sql_str(fonte)}) "
            "AS materiais_presos",
            remote=remote,
        )
        linha = r[0] if r else {"fonte_existe": 1, "materiais_presos": 0}
        if linha.get("fonte_existe") or linha.get("materiais_presos"):
            return False, {"motivo": "fonte ou material ainda presos em produção", "encontrado": linha}
        return True, {}

    if f.action == "set_praise_field":
        r = query(
            f"SELECT {f.field} AS valor FROM praises WHERE id = {sql_str(f.target_id)}",
            remote=remote,
        )
        if not r:
            return False, {"motivo": "louvor não encontrado em produção"}
        encontrado = r[0].get("valor")
        if encontrado != f.proposed:
            return False, {"motivo": "campo não bate com o proposto", "encontrado": encontrado}
        return True, {}

    # Ações de fase futura nunca chegam aqui: sql_para já teria levantado
    # NotImplementedError antes de qualquer tentativa de escrita.
    return True, {}


def sql_para(f: Finding, conn: sqlite3.Connection) -> list[str]:
    if f.action == "merge_praise":
        return _sql_merge(f, conn)
    if f.action == "set_praise_field":
        return _sql_set_praise_field(f, conn)
    fase = FASE_DA_ACAO.get(f.action, "uma fase futura")
    raise NotImplementedError(
        f"ação '{f.action}' chega com a {fase}; o P1 implementa só "
        f"merge_praise e set_praise_field"
    )


def estado_anterior(f: Finding, conn: sqlite3.Connection) -> dict:
    """Tudo que é preciso para reconstituir o que a escrita desfez."""
    def linha(r) -> dict | None:
        return dict(r) if r is not None else None

    antes: dict = {
        "praise": linha(conn.execute(
            "SELECT * FROM praises WHERE id = ?", (f.target_id,)).fetchone()),
        "materiais": [dict(r) for r in conn.execute(
            "SELECT * FROM praise_materials WHERE praise_id = ?", (f.target_id,))],
        "tags": [r["tag_id"] for r in conn.execute(
            "SELECT tag_id FROM praise_tags WHERE praise_id = ?", (f.target_id,))],
    }
    if f.action == "merge_praise" and f.proposed:
        antes["keeper"] = linha(conn.execute(
            "SELECT * FROM praises WHERE id = ?", (f.proposed,)).fetchone())
        antes["keeper_tags"] = [r["tag_id"] for r in conn.execute(
            "SELECT tag_id FROM praise_tags WHERE praise_id = ?", (f.proposed,))]
        # O undo do keeper só pode tocar as colunas que esta fusão de fato
        # doou — calculado aqui, no momento de aplicar, contra o mesmo
        # snapshot que _sql_merge vai usar para decidir a doação (mesma
        # conexão, sem escrita entre uma leitura e a outra). Gravar isso no
        # log em vez de re-derivar na hora do desfazer evita reverter
        # colunas que a fusão nunca tocou (name, group_id, created_at, ...).
        if antes["keeper"] and antes["praise"]:
            antes["doadas"] = [
                c for c in DOAVEIS
                if _vazio(antes["keeper"][c]) and not _vazio(antes["praise"][c])
            ]
    return antes


def _ja_aplicados(log_path: str) -> set[str]:
    """Só finding_id com ok:true conta como aplicado.

    Falha é reenviada de propósito: a retomada tem que consertar o que quebrou,
    não pular por cima dele.
    """
    feitos: set[str] = set()
    if not os.path.exists(log_path):
        return feitos
    with open(log_path, encoding="utf-8") as f:
        for linha in f:
            linha = linha.strip()
            if not linha:
                continue
            try:
                r = json.loads(linha)
            except json.JSONDecodeError:
                continue
            if r.get("ok") and r.get("finding_id"):
                feitos.add(r["finding_id"])
    return feitos


def aplicar(
    findings: list[Finding],
    conn: sqlite3.Connection,
    execute: bool,
    log_path: str = LOG_PADRAO,
    remote: bool = True,
    sql_dir: str | None = None,
) -> dict:
    # sql_dir existe para o teste não escrever no out/ de produção: os testes
    # que rodam com execute=True apontam para tmp_path. Em produção
    # (sql_dir=None) o comportamento não muda — os .sql vão para OUT/sql.
    feitos = _ja_aplicados(log_path)
    fila = [f for f in findings if f.finding_id not in feitos]
    resumo = {
        "recebidos": len(findings),
        "ja_aplicado": len(findings) - len(fila),
        "simulado": 0,
        "aplicado": 0,
        "falhou": 0,
    }

    if not execute:
        # Portão da simulação: nada é escrito, e nenhuma credencial é lida.
        # O SQL é gerado assim mesmo, para o dry-run mostrar o payload real.
        for f in fila:
            try:
                stmts = sql_para(f, conn)
            except (ValueError, NotImplementedError) as e:
                print(f"  RECUSADO {f.finding_id} ({f.action}): {e}")
                resumo["falhou"] += 1
                continue
            resumo["simulado"] += 1
            if resumo["simulado"] <= 3:
                print(f"\n--- exemplo: {f.detector} / {f.target_id} ({f.confidence}) ---")
                for s in stmts:
                    print("   ", s)
        return resumo

    base_sql = sql_dir or os.path.join(OUT, "sql")
    os.makedirs(os.path.dirname(log_path) or ".", exist_ok=True)
    with open(log_path, "a", encoding="utf-8") as log:
        for f in fila:
            base = {
                "finding_id": f.finding_id, "run_id": f.run_id,
                "detector": f.detector, "action": f.action,
                "target_id": f.target_id,
            }
            try:
                antes = estado_anterior(f, conn)
            except Exception as e:
                entrada = dict(base, ts=time.time(), ok=False,
                                erro=f"{type(e).__name__}: {e}")
                log.write(json.dumps(entrada, ensure_ascii=False) + "\n")
                log.flush()
                resumo["falhou"] += 1
                continue

            # Grava o "antes" ANTES de tentar escrever no D1. Um finding
            # grande vira vários arquivos .sql (per_file=300) e várias
            # invocações do wrangler em sequência: se a segunda falhar depois
            # da primeira ter entrado, a escrita fica pela metade. Sem isto,
            # o "antes" só chegaria ao disco se a escrita inteira desse
            # certo — e não haveria com o quê recuperar manualmente esse
            # meio-caminho. _ja_aplicados só conta ok:true, então esta linha
            # "pendente" é ignorada na retomada.
            pendente = dict(base, ts=time.time(), estado="pendente", antes=antes)
            log.write(json.dumps(pendente, ensure_ascii=False) + "\n")
            log.flush()

            entrada = dict(base, ts=time.time(), antes=antes)
            try:
                stmts = sql_para(f, conn)
                arquivos = write_sql_chunks(
                    stmts, os.path.join(base_sql, f.run_id),
                    prefix=f.finding_id, per_file=300,
                )
                run_sql_files(arquivos, remote=remote)

                # As guardas otimistas do C2 fazem o statement afetar 0
                # linhas quando o estado em produção já não bate mais com o
                # snapshot — e o wrangler sai com código 0 nesse caso do
                # mesmo jeito. Sem confirmar a pós-condição contra produção,
                # isso viraria ok:true e o finding nunca mais seria
                # retomado: a escrita passaria a falhar em silêncio em vez
                # de falhar alto.
                ok_pos, evidencia = _pos_condicao(f, remote=remote)
                if not ok_pos:
                    entrada["ok"] = False
                    entrada["estado"] = "guarda_barrou"
                    entrada["evidencia"] = evidencia
                    resumo["falhou"] += 1
                else:
                    entrada["statements"] = len(stmts)
                    entrada["ok"] = True
                    resumo["aplicado"] += 1
            except Exception as e:
                entrada["ok"] = False
                entrada["erro"] = f"{type(e).__name__}: {e}"
                resumo["falhou"] += 1
            log.write(json.dumps(entrada, ensure_ascii=False) + "\n")
            log.flush()
    return resumo


def desfazer(
    run_id: str,
    log_path: str,
    execute: bool,
    remote: bool = True,
    sql_dir: str | None = None,
) -> dict:
    """Reconstitui o estado anterior das escritas de um run_id.

    Reinsere o louvor apagado, devolve os materiais e repõe as tags — e, numa
    fusão, também desfaz o que ela fez no keeper: os campos doados voltam ao
    valor de antes e as tags que só chegaram pela união saem. Não restaura
    arquivo do R2 — nenhuma ação do P1 toca no R2, por construção.
    """
    entradas = []
    if os.path.exists(log_path):
        with open(log_path, encoding="utf-8") as f:
            for linha in f:
                linha = linha.strip()
                if not linha:
                    continue
                try:
                    r = json.loads(linha)
                except json.JSONDecodeError:
                    # Linha truncada é o sintoma de um processo morto no meio
                    # do log.write — e é exatamente depois desse tipo de
                    # crash que alguém roda --undo. A ferramenta de
                    # emergência não pode falhar na única situação em que é
                    # necessária.
                    continue
                if r.get("ok") and r.get("run_id") == run_id:
                    entradas.append(r)

    stmts: list[str] = []
    for r in reversed(entradas):
        antes = r.get("antes") or {}
        p = antes.get("praise")
        if p:
            # 'INSERT OR REPLACE' é DELETE+INSERT no SQLite. Numa linha que
            # ainda existe — o caso do undo de set_praise_field, que nunca
            # apaga o louvor — isso dispara o ON DELETE CASCADE de verdade
            # (a FK real do D1 é praise_materials.praise_id/praise_tags.praise_id
            # -> praises(id) ON DELETE CASCADE) e some com materiais e tags
            # do próprio louvor que só devia levar um campo de volta. Upsert
            # atualiza a linha no lugar, sem apagar nada.
            cols = list(p.keys())
            outros = [c for c in cols if c != "id"]
            colnames = ", ".join(cols)
            valores = ", ".join(_lit(p[c]) for c in cols)
            sets = ", ".join(f"{c} = excluded.{c}" for c in outros)
            stmts.append(
                f"INSERT INTO praises ({colnames}) VALUES ({valores}) "
                f"ON CONFLICT(id) DO UPDATE SET {sets};"
            )
        for m in antes.get("materiais", []):
            # O merged_from_praise_id de antes pode já não ser NULL (uma
            # fusão anterior à que está sendo desfeita). Zerar sempre
            # destruiria essa proveniência — devolve exatamente o valor que
            # estava lá antes desta escrita, não NULL fixo.
            stmts.append(
                f"UPDATE praise_materials SET praise_id = {sql_str(m['praise_id'])}, "
                f"merged_from_praise_id = {sql_str(m.get('merged_from_praise_id'))} "
                f"WHERE id = {sql_str(m['id'])};"
            )
        if p:
            for t in antes.get("tags", []):
                stmts.append(
                    "INSERT OR IGNORE INTO praise_tags (praise_id, tag_id) VALUES "
                    f"({sql_str(p['id'])}, {sql_str(t)});"
                )

        # Uma fusão também mexe no keeper (doa campo, une tag) — desfazer
        # tem que reverter isso também, não só reconstituir a fonte. Os dois
        # dados já vêm de estado_anterior (antes["keeper"] e
        # antes["keeper_tags"]); só faltava usá-los.
        keeper = antes.get("keeper")
        if keeper:
            # Só as colunas efetivamente doadas nesta fusão — gravadas em
            # antes["doadas"] no momento de aplicar. Reverter a linha
            # inteira do keeper tocaria colunas que a fusão nunca mexeu
            # (name, group_id, created_at, ...); e usar o valor do
            # snapshot para elas destruiria qualquer edição feita pelo app
            # depois do snapshot, inclusive numa coluna doada que a guarda
            # otimista do C2(b) tinha acabado de proteger durante o
            # --execute. A fonte, ao contrário, foi apagada — não há
            # estado de produção a preservar ali, então reverter a linha
            # toda continua certo.
            doadas = antes.get("doadas") or []
            if doadas:
                ksets = ", ".join(f"{c} = {_lit(keeper[c])}" for c in doadas)
                stmts.append(f"UPDATE praises SET {ksets} WHERE id = {sql_str(keeper['id'])};")

            tags_antes_do_keeper = set(antes.get("keeper_tags", []))
            tags_que_vieram_da_fonte = set(antes.get("tags", []))
            for t in tags_que_vieram_da_fonte - tags_antes_do_keeper:
                stmts.append(
                    f"DELETE FROM praise_tags WHERE praise_id = {sql_str(keeper['id'])} "
                    f"AND tag_id = {sql_str(t)};"
                )

    print(f"desfazer {run_id}: {len(entradas)} escritas, {len(stmts)} statements")
    if not execute:
        for s in stmts[:10]:
            print("   ", s)
        return {"entradas": len(entradas), "statements": len(stmts), "executado": False}

    # sql_dir existe pelo mesmo motivo que em aplicar(): o teste não pode
    # escrever .sql de verdade no out/ de produção. Default (None) preserva
    # o comportamento em produção — os .sql vão para OUT/sql/undo-<run_id>.
    base_sql = sql_dir or os.path.join(OUT, "sql")
    arquivos = write_sql_chunks(stmts, os.path.join(base_sql, f"undo-{run_id}"),
                               prefix="undo", per_file=300)
    run_sql_files(arquivos, remote=remote)
    return {"entradas": len(entradas), "statements": len(stmts), "executado": True}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="src", nargs="+", help="arquivos findings.jsonl")
    ap.add_argument("--execute", action="store_true")
    ap.add_argument("--undo", dest="undo", default="", help="run_id a desfazer")
    ap.add_argument("--faixa", default="alta",
                    help="só aplica esta faixa; 'todas' ignora o filtro")
    ap.add_argument("--log", default=LOG_PADRAO)
    ap.add_argument("--db", default=SNAPSHOT_DB)
    ap.add_argument("--local", action="store_true")
    args = ap.parse_args(argv)

    ensure_out()
    remote = not args.local

    if args.undo:
        desfazer(args.undo, args.log, args.execute, remote=remote)
        return 0

    if not args.src:
        print("faltou --from <findings.jsonl>", file=sys.stderr)
        return 2

    findings: list[Finding] = []
    for caminho in args.src:
        findings.extend(read_findings(caminho))
    if args.faixa != "todas":
        findings = [f for f in findings if f.confidence == args.faixa]

    conn = conectar(args.db)
    modo = "APLICANDO" if args.execute else "SIMULAÇÃO — nada será escrito"
    print(f"{modo}: {len(findings)} findings na faixa '{args.faixa}'")
    resumo = aplicar(findings, conn, args.execute, args.log, remote=remote)
    print(f"\n{resumo}")
    return 1 if resumo["falhou"] else 0


if __name__ == "__main__":
    sys.exit(main())
