from __future__ import annotations

import json
import os
import subprocess

from core.paths import API_DIR

DB_NAME = "coldigom"


def sql_str(s: str | None) -> str:
    """Literal SQL. None vira NULL; string vazia continua string vazia.

    A distinção importa: 484 louvores têm number = '' e isso não é o mesmo
    que number IS NULL — a Fase 4 decide entre preencher e não tocar com base
    nisso.
    """
    if s is None:
        return "NULL"
    return "'" + s.replace("'", "''") + "'"


def write_sql_chunks(
    statements: list[str],
    out_dir: str,
    prefix: str,
    per_file: int = 300,
) -> list[str]:
    """Quebra os statements em arquivos .sql numerados.

    O wrangler engasga com arquivo muito grande, e arquivo menor também torna
    a retomada mais barata: um chunk que falhou é rodado de novo sozinho.
    """
    if not statements:
        return []
    os.makedirs(out_dir, exist_ok=True)
    arquivos: list[str] = []
    for i in range(0, len(statements), per_file):
        caminho = os.path.join(out_dir, f"{prefix}_{len(arquivos):03d}.sql")
        with open(caminho, "w", encoding="utf-8") as f:
            f.write("\n".join(statements[i:i + per_file]) + "\n")
        arquivos.append(caminho)
    return arquivos


def _wrangler(args: list[str]) -> subprocess.CompletedProcess:
    # cwd em api/ porque é lá que está o wrangler.toml, que é gitignored.
    return subprocess.run(
        ["wrangler", "d1", *args],
        cwd=API_DIR,
        capture_output=True,
        text=True,
        check=True,
    )


def export_table(tabela: str, destino: str, remote: bool = True) -> None:
    """Baixa uma tabela do D1 como .sql de INSERTs."""
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    args = ["export", DB_NAME, "--table", tabela, "--output", destino]
    if remote:
        args.append("--remote")
    _wrangler(args)


def run_sql_files(arquivos: list[str], remote: bool = True) -> None:
    """Executa arquivos .sql no D1, em ordem."""
    for caminho in arquivos:
        args = ["execute", DB_NAME, f"--file={caminho}"]
        if remote:
            args.append("--remote")
        print("wrangler:", os.path.basename(caminho))
        _wrangler(args)


def query(sql: str, remote: bool = True) -> list[dict]:
    """Leitura pontual. Para leitura em volume use o snapshot local."""
    args = ["execute", DB_NAME, "--json", "--command", sql]
    if remote:
        args.append("--remote")
    saida = _wrangler(args).stdout
    return json.loads(saida)[0].get("results", [])
