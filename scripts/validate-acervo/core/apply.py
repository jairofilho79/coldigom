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

# A única faixa que o apply pode escrever. D1 do spec manda média e baixa
# para uma fila de revisão humana (o P2), que ainda não existe — e o detector
# emite um finding por candidato na faixa média, então um lote de média
# escreveria os metadados e as tags da mesma fonte em vários keepers.
FAIXA_QUE_ESCREVE = "alta"

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

    # Mesma recusa da r2_key, pelo mesmo motivo, aplicada às tags: o endpoint
    # de merge do app (api/src/routes/praises.ts) devolve 400 quando uma tag
    # que vem SÓ da fonte é tag-pai ("Cannot attach a parent tag; use a
    # subtag"). Tag que o keeper já tem não conta — é dado preexistente, e é
    # assim que o endpoint também raciocina. A fusão por SQL não passa por
    # esse invariante, então precisa reafirmá-lo aqui: hoje não há tag-pai no
    # acervo, mas o app deixa criar subtag a qualquer momento e a primeira
    # fase que reusar esta função herdaria o vazamento silencioso.
    tags_da_fonte = [
        t["tag_id"] for t in
        conn.execute("SELECT tag_id FROM praise_tags WHERE praise_id = ?", (fonte,))
    ]
    tags_do_keeper = {
        t["tag_id"] for t in
        conn.execute("SELECT tag_id FROM praise_tags WHERE praise_id = ?", (keeper,))
    }
    pais = [
        t for t in tags_da_fonte
        if t not in tags_do_keeper
        and conn.execute(
            "SELECT 1 FROM tags WHERE parent_id = ? LIMIT 1", (t,)).fetchone()
    ]
    if pais:
        raise ValueError(
            f"fusão recusada: {len(pais)} tag(s) da fonte são tag-pai "
            f"({pais[0]}...). A API recusa associar tag-pai com 400 — "
            f"use uma subtag."
        )

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
    for t in tags_da_fonte:
        stmts.append(
            "INSERT OR IGNORE INTO praise_tags (praise_id, tag_id) VALUES "
            f"({sql_str(keeper)}, {sql_str(t)});"
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


def _pre_condicao(f: Finding, remote: bool) -> tuple[bool, dict]:
    """Confirma em PRODUÇÃO que a fusão ainda tem o que fundir.

    _pos_condicao aceita "a fonte sumiu" como prova de que esta fusão
    aconteceu. Não é: ela pode ter sumido numa fusão anterior. Dois
    --execute contra o MESMO snapshot — a sequência de quem mexe numa
    constante do detector e re-roda, e o snapshot é o default `--db
    out/snapshot.sqlite` — bastam para o estrago do C1 atravessar lotes:
    o lote 1 funde fonte->kA de verdade; o lote 2, com um finding só (o
    portão de alvo repetido é por lote e não dispara), lê a fonte VIVA no
    snapshot velho e doa author/lyrics e as tags dela para kB, que nunca
    foi fundido com nada. Os UPDATEs de material e o DELETE no-opam, a
    pós-condição pergunta "a fonte sumiu?", a resposta é sim — por causa do
    lote 1 — e a entrada fica ok:true.

    A raiz é ler o estado no snapshot e concluir sobre produção. Então a
    pergunta vai para produção, antes de escrever: a fonte ainda existe? Se
    não existe, esta fusão já foi feita (por este arnês ou pelo app) e o
    que sobrou dela é só a metade que ainda casa por acidente — recusar é a
    falha segura. Recusar um replay legítimo não custa nada: o replay
    honesto pelo log já é filtrado antes, por _ja_aplicados.

    Diferente dos portões de lote de aplicar(), esta checagem é por finding
    e vale ENTRE lotes, que é justamente onde o portão de lote não alcança.
    """
    if f.action != "merge_praise":
        return True, {}
    if not _fonte_existe(f.target_id, remote=remote):
        return False, {
            "motivo": "a fonte já não existe em produção — esta fusão já foi "
                      "feita, ou foi feita por outro caminho",
            "fonte": f.target_id,
        }
    return True, {}


def _fonte_existe(praise_id: str, remote: bool) -> bool:
    """A fonte ainda está em produção? Leitura pontual, nunca no snapshot.

    O snapshot é a foto do acervo no momento em que `core.snapshot` rodou;
    tudo que aconteceu depois — inclusive um `--execute` anterior contra o
    mesmo snapshot — é invisível para ele. Quem responde "isto ainda existe"
    é produção.
    """
    r = query(
        f"SELECT COUNT(*) AS n FROM praises WHERE id = {sql_str(praise_id)}",
        remote=remote,
    )
    return bool(r and r[0].get("n"))


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
        # Mapa coluna -> valor doado (o valor da fonte), não só a lista de
        # nomes: o valor doado é o que o undo precisa para reafirmar, coluna
        # a coluna, que produção ainda contém o que esta fusão escreveu ali
        # antes de reverter — ver o guard em desfazer().
        if antes["keeper"] and antes["praise"]:
            antes["doadas"] = {
                c: antes["praise"][c] for c in DOAVEIS
                if _vazio(antes["keeper"][c]) and not _vazio(antes["praise"][c])
            }
    return antes


def _ja_aplicados(log_path: str) -> set[str]:
    """Só finding_id com ok:true conta como aplicado — e um undo o desconta.

    Falha é reenviada de propósito: a retomada tem que consertar o que quebrou,
    não pular por cima dele.

    O log é cronológico, então basta varrer na ordem: ok:true marca o finding
    como feito, e a entrada "desfeito" que o --undo grava depois o desmarca.
    Sem isso, desfazer viraria porta de mão única — o finding continuaria
    "aplicado" para sempre e só editar o .jsonl na mão permitiria reaplicar.
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
            fid = r.get("finding_id")
            if not fid:
                continue
            if r.get("estado") == "desfeito":
                feitos.discard(fid)
            elif r.get("ok"):
                feitos.add(fid)
    return feitos


def _reversivel(r: dict) -> bool:
    """A entrada chegou a mandar SQL para produção?

    Só o que executou SQL é desfazível. Uma entrada com "antes" mas sem
    escrita — processo morto na linha pendente, recusa do próprio sql_para,
    finding intocado de um lote que falhou antes dele — não tem nada em
    produção para reverter; "desfazê-la" seria escrever o snapshot por cima
    de estado vivo.

    Log gravado por uma versão anterior não traz o campo. Aí a única coisa
    que se sabe com certeza é que ok:true implica escrita — que é
    exatamente o critério antigo, e é o conservador: na dúvida, não tocar em
    produção.
    """
    if "escreveu" in r:
        return bool(r["escreveu"])
    return bool(r.get("ok"))


def aplicar(
    findings: list[Finding],
    conn: sqlite3.Connection,
    execute: bool,
    log_path: str = LOG_PADRAO,
    remote: bool = True,
    sql_dir: str | None = None,
) -> dict:
    # Portão de faixa: só a alta escreve, e a recusa é do mesmo tipo da
    # recusa por r2_key — erro, não aviso. Na faixa média o detector emite um
    # finding por candidato da MESMA fonte (7 candidatos numa delas hoje), e
    # cada finding lê o snapshot, que não muda durante o lote: o primeiro
    # funde de verdade e os outros doam author/lyrics e as tags da fonte para
    # keepers que nunca foram fundidos com nada — com ok:true, porque a
    # pós-condição só pergunta se a fonte sumiu. A simulação continua livre
    # (o early-return dela vem depois, e é o que permite inspecionar o
    # payload de qualquer faixa).
    if execute:
        fora = sorted({f.confidence for f in findings if f.confidence != FAIXA_QUE_ESCREVE})
        if fora:
            n = sum(1 for f in findings if f.confidence != FAIXA_QUE_ESCREVE)
            raise ValueError(
                f"--execute recusado: {n} finding(s) fora da faixa "
                f"'{FAIXA_QUE_ESCREVE}' (faixas no lote: {', '.join(fora)}). "
                f"D1 manda a faixa média para a fila de revisão humana, que é "
                f"o P2 e ainda não existe. Simule à vontade (sem --execute); "
                f"para escrever, rode com --faixa {FAIXA_QUE_ESCREVE}."
            )

        # Portão de alvo repetido: mesma recusa, mesmo motivo do portão de
        # faixa acima. O perigo real não é a faixa em si — é dois findings
        # escrevendo sobre a MESMA fonte (target_id) no mesmo lote. Hoje a
        # Fase 1 só está a salvo por acidente: D2 exige candidato único, então
        # a faixa alta tem no máximo um finding por fonte por construção. Um
        # detector futuro que emita duas propostas de faixa alta para a
        # mesma fonte reabre o problema inteiro — cada finding lê o
        # snapshot, que não muda durante o lote, então o segundo escreveria
        # em cima de um estado que o primeiro já apagou (a fonte já sumiu,
        # ou o keeper já recebeu doação e tags), com ok:true nos dois.
        contagem: dict[str, int] = {}
        for f in findings:
            contagem[f.target_id] = contagem.get(f.target_id, 0) + 1
        repetidos = sorted(tid for tid, n in contagem.items() if n > 1)
        if repetidos:
            raise ValueError(
                f"--execute recusado: alvo(s) repetido(s) no lote "
                f"({', '.join(repetidos)}). Dois findings escrevendo sobre a "
                f"mesma fonte no mesmo lote: cada um lê o snapshot, que não "
                f"muda durante o lote, então o segundo escreveria em cima de "
                f"um estado que a primeira escrita já tornou obsoleto."
            )

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

            # Pré-condição contra produção, antes de gerar SQL, antes da
            # linha "pendente" e antes de qualquer escrita: uma fusão cuja
            # fonte já não existe recusa, em vez de "ter sucesso" doando os
            # metadados dela para um keeper que nunca foi fundido. Fecha a
            # raiz que o portão de alvo repetido só fecha dentro de um lote.
            ok_pre, evidencia = _pre_condicao(f, remote=remote)
            if not ok_pre:
                entrada = dict(base, ts=time.time(), ok=False, escreveu=False,
                               estado="fonte_ausente", evidencia=evidencia,
                               antes=antes)
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
            #
            # "escreveu" separa "falhou pela metade" de "falhou antes de
            # começar" — é essa distinção que decide o que o --undo pode
            # tocar. Na linha pendente é sempre False: nenhum SQL saiu ainda.
            # Um processo morto aqui deixa esta linha como a última do
            # finding, e desfazer() a pula — não há escrita a reverter, só
            # estado de produção a preservar.
            pendente = dict(base, ts=time.time(), estado="pendente",
                            escreveu=False, antes=antes)
            log.write(json.dumps(pendente, ensure_ascii=False) + "\n")
            log.flush()

            entrada = dict(base, ts=time.time(), escreveu=False, antes=antes)
            try:
                stmts = sql_para(f, conn)
                arquivos = write_sql_chunks(
                    stmts, os.path.join(base_sql, f.run_id),
                    prefix=f.finding_id, per_file=300,
                )
                # A partir daqui SQL pode ter chegado a produção — inclusive
                # se run_sql_files levantar no meio da lista de arquivos.
                # Marcado ANTES da chamada de propósito: o que torna uma
                # entrada reversível é ter tentado escrever, não ter
                # conseguido. Uma recusa do próprio sql_para (r2_key,
                # tag-pai) nunca chega aqui — e por isso segue com
                # escreveu=False, que é a verdade: não há nada a desfazer
                # numa fusão que o arnês se recusou a fazer.
                entrada["escreveu"] = bool(arquivos)
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
    # É o "antes" MAIS o "escreveu" que tornam uma entrada reversível — não o
    # ok, e não o "antes" sozinho. Consumir só ok:true deixava sem saída os
    # caminhos em que a escrita aconteceu pela metade: o guarda_barrou (keeper
    # já recebeu campos doados e tags, material já migrou, fonte ainda viva —
    # e a retomada barra de novo para sempre) e o except Exception (wrangler
    # caiu no arquivo 2 de 3). Mas consumir todo "antes" foi longe demais: um
    # processo morto antes de qualquer SQL, uma recusa do próprio sql_para
    # (r2_key, tag-pai — run_sql_files nem é chamado) e o finding intocado de
    # um lote que falhou no anterior também gravam "antes", e neles NADA
    # aconteceu em produção. "Desfazer" o que nunca foi feito é escrever dado
    # velho por cima de estado vivo. Só é reversível o que chegou a executar
    # SQL, e é isso que "escreveu" registra.
    #
    # Uma entrada por finding_id — a última QUE ESCREVEU, que é a que
    # descreve o que existe em produção para desfazer. Consumir "pendente" e
    # final juntos duplicaria cada statement; como todos são idempotentes
    # isso não corromperia nada, mas dobraria o SQL enviado sem ganho nenhum.
    por_finding: dict[str, dict] = {}
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
                if r.get("run_id") != run_id or not r.get("antes"):
                    continue
                # A entrada que o próprio --undo grava não tem "antes", então
                # nunca entra aqui: desfazer um undo seria reaplicar a fusão.
                chave = r.get("finding_id") or f"__sem_id__{len(por_finding)}"
                anterior = por_finding.get(chave)
                # ARMADILHA QUE JÁ MORDEU: "a última entrada do finding domina
                # as anteriores" é falso. Uma recusa que NUNCA ESCREVEU não
                # domina uma escrita que ACONTECEU. O caso real: o wrangler
                # aplica o arquivo inteiro e morre ao reportar (entrada
                # ok:false, escreveu:true, fusão completa em produção); o
                # operador faz o gesto de retomada que o README documenta e
                # roda o findings de novo; a pré-condição de fonte viva
                # recusa — corretamente — e grava uma entrada
                # estado=fonte_ausente com "antes" e escreveu:false. Se essa
                # recusa sombreasse a escrita anterior, o --undo imprimiria
                # "0 escritas" — a mesma frase que o README ensina a ler como
                # "nada aconteceu em produção" — para uma fusão que apagou o
                # louvor-fonte num acervo sem lixeira. Ou seja: retomar
                # destruiria a reversibilidade.
                #
                # Então a dedup guarda a última entrada que escreveu, e só
                # cai para a última entrada quando nenhuma escreveu (aí o
                # filtro abaixo descarta o finding inteiro, que é o certo).
                if anterior is not None and _reversivel(anterior) and not _reversivel(r):
                    continue
                por_finding[chave] = r
    # O filtro por "escreveu" ainda vem DEPOIS da dedup: uma linha pendente
    # (escreveu=False) seguida da final (escreveu=True) é uma escrita que
    # rodou — a dedup acima já fica com a final; pendente sozinha é um
    # processo morto antes de escrever, e cai aqui.
    entradas = [r for r in por_finding.values() if _reversivel(r)]

    stmts: list[str] = []
    for r in reversed(entradas):
        antes = r.get("antes") or {}
        eh_merge = r.get("action") == "merge_praise"
        keeper = antes.get("keeper")
        p = antes.get("praise")
        # A fonte ainda está em produção? É o que decide o que desta entrada
        # é reversível: a fusão só apaga a fonte pelo DELETE guardado do fim
        # do _sql_merge, então uma fonte viva quer dizer que esse DELETE não
        # pegou (guarda_barrou, ou o wrangler caiu antes dele) — e nada que
        # dependa dele foi desfeito para se refazer aqui.
        fonte_sumiu = True
        if eh_merge and p:
            fonte_sumiu = not _fonte_existe(p["id"], remote)
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
            if eh_merge:
                # Guarda simétrica da FONTE, o par da que o keeper já tem: a
                # fusão nunca faz UPDATE na linha da fonte — ela só some pelo
                # DELETE guardado do fim do _sql_merge. Então só há linha a
                # reconstituir quando a linha não está lá. DO NOTHING diz
                # exatamente isso em SQL: se a fonte ainda existe (o DELETE
                # no-opou, ou o wrangler caiu antes dele), a linha viva é a
                # boa — inclusive a edição que o dono fez nela depois do
                # snapshot — e reescrevê-la com o snapshot seria destruí-la.
                stmts.append(
                    f"INSERT INTO praises ({colnames}) VALUES ({valores}) "
                    f"ON CONFLICT(id) DO NOTHING;"
                )
            else:
                stmts.append(
                    f"INSERT INTO praises ({colnames}) VALUES ({valores}) "
                    f"ON CONFLICT(id) DO UPDATE SET {sets};"
                )
        for m in antes.get("materiais", []):
            # O merged_from_praise_id de antes pode já não ser NULL (uma
            # fusão anterior à que está sendo desfeita). Zerar sempre
            # destruiria essa proveniência — devolve exatamente o valor que
            # estava lá antes desta escrita, não NULL fixo.
            #
            # E a mesma guarda simétrica do keeper, aplicada ao material: a
            # fusão o deixou pendurado no keeper com merged_from apontando
            # para a fonte. Só volta o que ainda está exatamente assim — se o
            # app moveu esse material para um terceiro louvor depois, ou se o
            # UPDATE da ida no-opou, o de volta tem que no-opar também, em
            # vez de arrancar o material de onde o dono o pôs.
            if eh_merge and keeper:
                onde = (f"praise_id = {sql_str(keeper['id'])} AND "
                        f"merged_from_praise_id = {sql_str(m['praise_id'])}")
            else:
                # Fora da fusão nenhuma ação do P1 move material: a guarda é
                # "continua onde estava", o que faz o statement ser um no-op
                # estrito quando o app mexeu no material nesse meio-tempo.
                onde = ("praise_id IS NULL" if m["praise_id"] is None
                        else f"praise_id = {sql_str(m['praise_id'])}")
            stmts.append(
                f"UPDATE praise_materials SET praise_id = {sql_str(m['praise_id'])}, "
                f"merged_from_praise_id = {sql_str(m.get('merged_from_praise_id'))} "
                f"WHERE id = {sql_str(m['id'])} AND {onde};"
            )
        # As tags da fonte só desaparecem pela cascata do DELETE do louvor —
        # a fusão não apaga praise_tags da fonte por conta própria. Logo, com
        # a fonte ainda em produção, a cascata não rodou e não há tag a
        # repor: qualquer tag ausente é o app que a apagou, e um
        # INSERT OR IGNORE aqui a ressuscitaria. Isto não dá para dizer em
        # SQL como o DO NOTHING acima diz para a linha do louvor (a tag entra
        # numa tabela em que não há conflito de id a explorar), então a
        # condição vem de uma leitura pontual em produção — a mesma que
        # _pos_condicao já usa.
        if p and fonte_sumiu:
            for t in antes.get("tags", []):
                stmts.append(
                    "INSERT OR IGNORE INTO praise_tags (praise_id, tag_id) VALUES "
                    f"({sql_str(p['id'])}, {sql_str(t)});"
                )

        # Uma fusão também mexe no keeper (doa campo, une tag) — desfazer
        # tem que reverter isso também, não só reconstituir a fonte. Os dois
        # dados já vêm de estado_anterior (antes["keeper"] e
        # antes["keeper_tags"]); só faltava usá-los.
        if keeper:
            # Só as colunas efetivamente doadas nesta fusão — gravadas em
            # antes["doadas"] no momento de aplicar. Reverter a linha
            # inteira do keeper tocaria colunas que a fusão nunca mexeu
            # (name, group_id, created_at, ...). A fonte, ao contrário, é
            # reinserida inteira a partir do snapshot — o que só é aceitável
            # porque agora isso acontece exclusivamente quando produção
            # confirmou que ela sumiu (ver a guarda de fonte_sumiu acima):
            # não há linha viva para preservar, e a única perda possível é
            # uma edição feita na fonte entre o snapshot e o --execute que a
            # própria fusão já tinha apagado com o DELETE.
            #
            # Mas "doada no snapshot" não é "doada de fato em produção": a
            # guarda otimista do C2(b) pode ter feito a doação virar no-op
            # (alguém preencheu a coluna do keeper pelo app entre o
            # snapshot e o --execute). Sem guarda simétrica aqui, o undo
            # reverteria a coluna para o vazio do snapshot mesmo assim,
            # destruindo a mesma edição que o C2(b) acabou de proteger no
            # caminho de ida — o mesmo tipo de auto-contradição do C1/I6.
            # Por isso cada coluna doada leva o próprio UPDATE, guardado
            # contra o valor que a fonte doou (gravado junto de "doadas"):
            # só reverte se produção ainda tiver exatamente o que esta
            # fusão escreveu ali. <valor do snapshot do keeper>, do lado do
            # SET, é por definição vazio/NULL — é o que fez a coluna entrar
            # em "doadas".
            doadas = antes.get("doadas") or {}
            for c, valor_doado in doadas.items():
                guarda = "IS NULL" if valor_doado is None else f"= {sql_str(valor_doado)}"
                stmts.append(
                    f"UPDATE praises SET {c} = {_lit(keeper[c])} "
                    f"WHERE id = {sql_str(keeper['id'])} AND {c} {guarda};"
                )

            tags_antes_do_keeper = set(antes.get("keeper_tags", []))
            tags_que_vieram_da_fonte = set(antes.get("tags", []))
            for t in tags_que_vieram_da_fonte - tags_antes_do_keeper:
                stmts.append(
                    f"DELETE FROM praise_tags WHERE praise_id = {sql_str(keeper['id'])} "
                    f"AND tag_id = {sql_str(t)};"
                )

    # "escritas" aqui são as entradas que de fato mandaram SQL para produção
    # (as outras já foram filtradas): a linha que o operador lê para decidir
    # se algo aconteceu não pode contar entrada de log que nunca escreveu.
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

    # O undo tem que se registrar. Sem esta entrada, _ja_aplicados continua
    # vendo o ok:true da aplicação e pula o finding em silêncio na próxima
    # rodada ("ja_aplicado: 1", que lê como sucesso): o --undo viraria porta
    # de mão única, com saída só editando o .jsonl na mão. A entrada não
    # carrega "antes", então um --undo seguinte não a consome (desfazer um
    # undo seria reaplicar a fusão).
    if not entradas:
        return {"entradas": 0, "statements": len(stmts), "executado": True}
    with open(log_path, "a", encoding="utf-8") as log:
        for r in entradas:
            log.write(json.dumps({
                "finding_id": r.get("finding_id"),
                "run_id": run_id,
                "detector": r.get("detector"),
                "action": r.get("action"),
                "target_id": r.get("target_id"),
                "ts": time.time(),
                "estado": "desfeito",
            }, ensure_ascii=False) + "\n")
        log.flush()
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
    try:
        resumo = aplicar(findings, conn, args.execute, args.log, remote=remote)
    except ValueError as e:
        # Recusa de portão (faixa fora da alta): erro alto e nada escrito.
        print(f"\nRECUSADO: {e}", file=sys.stderr)
        return 2
    print(f"\n{resumo}")
    return 1 if resumo["falhou"] else 0


if __name__ == "__main__":
    sys.exit(main())
