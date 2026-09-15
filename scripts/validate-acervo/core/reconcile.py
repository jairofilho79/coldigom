from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys

from core.paths import OUT, SNAPSHOT_DB, ensure_out
from core.snapshot import conectar

RECON_SCHEMA = """
DROP TABLE IF EXISTS reconciliacao;
CREATE TABLE reconciliacao (
  material_id  TEXT PRIMARY KEY,
  praise_id    TEXT,
  type         TEXT,
  kind_id      TEXT,
  caminho      TEXT,
  nome_arquivo TEXT,
  pasta        TEXT,
  tamanho      INTEGER,
  kind_csv     TEXT,
  praise_csv   TEXT,
  passe        TEXT
);
CREATE INDEX ix_recon_praise ON reconciliacao(praise_id);
CREATE INDEX ix_recon_passe ON reconciliacao(passe);
CREATE INDEX ix_recon_tam ON reconciliacao(tamanho);
"""


def reconciliar(conn: sqlite3.Connection) -> dict:
    """Liga cada material do banco ao arquivo original, em dois passes.

    Passe 1 — praise_material_id do CSV. É o mais forte: é o mesmo UUID.
    Passe 2 — file_path_legacy, quando o CSV não cobre.

    Um caminho que não existe na árvore NÃO casa: casar com arquivo ausente é
    pior que não casar, porque a falha apareceria longe daqui, dentro de outra
    fase, já fora do contexto.

    O praise_id gravado é sempre o do BANCO. O do CSV vai em praise_csv, e a
    divergência entre os dois é o que permite achar material no louvor errado.
    """
    conn.executescript(RECON_SCHEMA)

    existe = {r["caminho"] for r in conn.execute("SELECT caminho FROM arquivos")}
    tamanho = {r["caminho"]: r["tamanho"] for r in conn.execute("SELECT caminho, tamanho FROM arquivos")}

    csv_por_mid = {}
    for r in conn.execute("SELECT praise_material_id, file_path, material_kind_csv, praise_id FROM csvmap"):
        if r["praise_material_id"]:
            csv_por_mid[r["praise_material_id"]] = r

    linhas = []
    resumo = {"csv": 0, "legacy": 0, "sem_origem": 0}

    for m in conn.execute(
        "SELECT id, praise_id, type, material_kind, file_path_legacy FROM praise_materials"
    ):
        c = csv_por_mid.get(m["id"])
        caminho = None
        passe = "sem_origem"
        kind_csv = c["material_kind_csv"] if c else None
        praise_csv = c["praise_id"] if c else None

        if c and c["file_path"] in existe:
            caminho, passe = c["file_path"], "csv"
        elif m["file_path_legacy"] and m["file_path_legacy"] in existe:
            caminho, passe = m["file_path_legacy"], "legacy"

        resumo[passe] += 1
        linhas.append((
            m["id"], m["praise_id"], m["type"], m["material_kind"],
            caminho,
            os.path.splitext(os.path.basename(caminho))[0] if caminho else None,
            os.path.dirname(caminho) if caminho else None,
            tamanho.get(caminho) if caminho else None,
            kind_csv, praise_csv, passe,
        ))

    conn.executemany(
        "INSERT INTO reconciliacao VALUES (?,?,?,?,?,?,?,?,?,?,?)", linhas
    )
    conn.commit()
    resumo["total"] = len(linhas)
    return resumo


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=SNAPSHOT_DB)
    args = ap.parse_args(argv)

    ensure_out()
    conn = conectar(args.db)
    resumo = reconciliar(conn)

    # Materiais que nunca tiveram arquivo na árvore não são falha de
    # reconciliação: nasceram depois dela.
    sem_arquivo_por_natureza = conn.execute(
        "SELECT COUNT(*) n FROM praise_materials WHERE type IN ('chord','youtube','gestures')"
    ).fetchone()["n"]
    orfaos = resumo["sem_origem"] - sem_arquivo_por_natureza

    print("\nreconciliação:")
    print(f"  total de materiais           {resumo['total']}")
    print(f"  casados pelo CSV             {resumo['csv']}")
    print(f"  casados pelo legacy          {resumo['legacy']}")
    print(f"  sem origem                   {resumo['sem_origem']}")
    print(f"    dos quais chord/youtube/gestures (esperado)  {sem_arquivo_por_natureza}")
    print(f"    órfãos de verdade                            {orfaos}")

    com_arquivo = resumo["csv"] + resumo["legacy"]
    elegiveis = resumo["total"] - sem_arquivo_por_natureza
    cobertura = 100.0 * com_arquivo / elegiveis if elegiveis else 0.0
    print(f"\n  cobertura sobre os elegíveis: {cobertura:.1f}%")

    caminho = os.path.join(OUT, "reconciliacao.json")
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump({**resumo, "orfaos": orfaos, "cobertura": round(cobertura, 2)},
                  f, ensure_ascii=False, indent=1)
    print(f"  relatório: {caminho}")

    # 99% é o critério de pronto da Fase 0, fixado no spec §7.1.
    return 0 if cobertura >= 99.0 else 1


if __name__ == "__main__":
    sys.exit(main())
