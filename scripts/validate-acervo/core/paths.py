from __future__ import annotations

import os

# Derivado de __file__ e nunca hardcoded: o geom/ fixou o caminho absoluto e
# isso amarrou o pacote a uma máquina só.
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))

PKG = os.path.join(ROOT, "scripts", "validate-acervo")
OUT = os.path.join(PKG, "out")
API_DIR = os.path.join(ROOT, "api")

# A árvore de arquivos original que gerou a ingestão. Fora do repo, 26 GB.
ASSETS2 = os.environ.get("COLDIGOM_ASSETS2", "/Volumes/SSD 2TB SD/assets2")
CSV_MAP = os.path.join(ASSETS2, "files_classification.csv")

SNAPSHOT_DB = os.path.join(OUT, "snapshot.sqlite")


def resolve(p: str) -> str:
    """Aceita caminho absoluto, relativo ao cwd, ou relativo à raiz do repo."""
    if os.path.isabs(p):
        return p
    if os.path.exists(p):
        return os.path.abspath(p)
    return os.path.join(ROOT, p)


def ensure_out() -> str:
    os.makedirs(OUT, exist_ok=True)
    return OUT
