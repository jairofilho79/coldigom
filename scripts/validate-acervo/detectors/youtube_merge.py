from __future__ import annotations

import argparse
import os
import sqlite3
import sys
import time

from core.findings import Finding, Motivos, write_findings
from core.gold import escrever_formulario
from core.normalize import norm_letra, norm_nome, shingles
from core.paths import OUT, SNAPSHOT_DB, ensure_out
from core.snapshot import conectar

DETECTOR = "youtube_merge"

# Janela do shingle. 8 palavras é longo o bastante para um trecho de letra ser
# específico de um louvor, e curto o bastante para sobreviver a diferença de
# pontuação e de quebra de verso entre duas transcrições da mesma letra.
SHINGLE = 8

# Nome curto casa por acidente. 'Fé' está dentro de dezenas de títulos.
# A guarda vale para os DOIS lados do casamento por substring — ou seja, para
# o menor dos dois nomes. Exigi-la só do candidato deixava passar exatamente
# o caso que este comentário descreve: fonte 'Fé' dentro de candidato 'Fé do
# coração' (13 >= 8) casava. Nome idêntico não passa por aqui: casa sempre.
NOME_MINIMO = 8


def so_youtube(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    """Louvores que têm material e cujo único type é youtube."""
    return conn.execute(
        """SELECT p.id, p.name, p.lyrics,
                  (SELECT m.url FROM praise_materials m
                    WHERE m.praise_id = p.id
                    ORDER BY m.id LIMIT 1) AS url
             FROM praises p
            WHERE EXISTS (SELECT 1 FROM praise_materials m WHERE m.praise_id = p.id)
              AND NOT EXISTS (SELECT 1 FROM praise_materials m
                               WHERE m.praise_id = p.id AND m.type <> 'youtube')
            ORDER BY p.name"""
    ).fetchall()  # ORDER BY m.id na subconsulta garante determinismo da evidência


def candidatos(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    """Todo louvor que NÃO é só-YouTube é candidato a keeper."""
    return conn.execute(
        """SELECT p.id, p.name, p.lyrics FROM praises p
            WHERE EXISTS (SELECT 1 FROM praise_materials m
                           WHERE m.praise_id = p.id AND m.type <> 'youtube')"""
    ).fetchall()


def detectar(conn: sqlite3.Connection, run_id: str):
    fontes = so_youtube(conn)
    alvos_possiveis = candidatos(conn)

    nome_de = {c["id"]: norm_nome(c["name"]) for c in alvos_possiveis}
    sh_de = {}
    for c in alvos_possiveis:
        s = shingles(norm_letra(c["lyrics"]), SHINGLE)
        if s:
            sh_de[c["id"]] = s

    findings: list[Finding] = []
    motivos = Motivos()
    formulario: list[dict] = []

    for fonte in fontes:
        formulario.append({
            "target_id": fonte["id"],
            "nome": fonte["name"],
            "letra": fonte["lyrics"] or "",
            "url": fonte["url"] or "",
        })

        n = norm_nome(fonte["name"])
        s = shingles(norm_letra(fonte["lyrics"]), SHINGLE)

        por_letra = {cid for cid, sh in sh_de.items() if s and (s & sh)}
        por_nome = {
            cid for cid, cn in nome_de.items()
            if cn and (cn == n or (min(len(cn), len(n)) >= NOME_MINIMO
                                   and (cn in n or n in cn)))
        }

        ambos = por_letra & por_nome
        if len(ambos) == 1:
            # D2: letra manda, nome confirma. Um alvo só, as duas testemunhas
            # de acordo — é a única configuração que funde sozinha.
            alvo = next(iter(ambos))
            findings.append(_finding(run_id, fonte, alvo, "alta",
                                     {"letra": True, "nome": True}))
            continue

        uniao = por_letra | por_nome
        if not uniao:
            # Sem candidato NÃO quer dizer louvor novo. 'Qual suspira a corça
            # inquieta' é hino clássico e pode estar no acervo com outro
            # título. Reportar e parar aqui é a resposta certa.
            motivos.excluir("sem candidato — precisa de olho humano")
            continue

        for alvo in sorted(uniao):
            findings.append(_finding(run_id, fonte, alvo, "media", {
                "letra": alvo in por_letra,
                "nome": alvo in por_nome,
                "candidatos": len(uniao),
            }))

    return findings, motivos, formulario


def _finding(run_id: str, fonte: sqlite3.Row, alvo: str, faixa: str, ev: dict) -> Finding:
    return Finding(
        run_id=run_id,
        detector=DETECTOR,
        target_type="praise",
        target_id=fonte["id"],
        praise_id=fonte["id"],
        action="merge_praise",
        confidence=faixa,
        proposed=alvo,
        # O 'field' entra no finding_id: sem ele, dois candidatos do mesmo
        # louvor colidiriam no mesmo id e um sumiria.
        field=f"keeper:{alvo}",
        evidence={**ev, "nome_fonte": fonte["name"], "url": fonte["url"]},
    )


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=SNAPSHOT_DB)
    ap.add_argument("--out", default=os.path.join(OUT, "youtube_merge"))
    args = ap.parse_args(argv)

    ensure_out()
    os.makedirs(args.out, exist_ok=True)
    run_id = time.strftime("%Y-%m-%dT%H%MZ-") + DETECTOR

    conn = conectar(args.db)
    findings, motivos, formulario = detectar(conn, run_id)

    print(f"\n{DETECTOR} — {len(formulario)} louvores só-YouTube")
    print("exclusões:")
    print(motivos.tabela())

    por_faixa: dict[str, int] = {}
    for f in findings:
        por_faixa[f.confidence] = por_faixa.get(f.confidence, 0) + 1
    print("\nfindings por faixa:")
    for faixa, n in sorted(por_faixa.items()):
        print(f"  {faixa:12} {n}")

    fj = os.path.join(args.out, "findings.jsonl")
    write_findings(findings, fj)
    print(f"\nfindings: {fj}")

    form = os.path.join(args.out, "gabarito.tsv")
    escrever_formulario(formulario, form)
    print(f"formulário de gabarito (preencher a coluna 'veredito'): {form}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
