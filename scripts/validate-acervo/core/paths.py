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

# O PLPCG, o app que vai ser desligado (spec 2026-09-15-migracao-plpcg). São
# repos irmãos deste: o admin tem o wrangler do D1 plpcg-catalog, a PWA tem
# os PDFs em assets/. Env para quem tiver os repos em outro lugar.
PLPCG_ADMIN_WORKER = os.environ.get(
    "PLPCG_ADMIN_WORKER",
    os.path.join(os.path.dirname(ROOT), "plpcg-admin", "worker"),
)
PLPCJF_ASSETS = os.environ.get(
    "PLPCJF_ASSETS",
    os.path.join(os.path.dirname(ROOT), "plpcjf", "assets"),
)
PLPCG_URL = "https://plpcg.com/"

# Espelho local pré-R2 dos PDFs do coldigom: <praise_id>/<material_id>.pdf.
# Serve para hash barato; a verdade continua sendo o R2.
STORAGE_PRAISES = os.path.join(ROOT, "storage", "assets", "praises")

PLPCG_OUT = os.path.join(OUT, "plpcg")
PLPCG_DB = os.path.join(PLPCG_OUT, "plpcg.sqlite")
PLPCG_BAIXADOS = os.path.join(PLPCG_OUT, "baixados")
HASHES_DB = os.path.join(OUT, "hashes.sqlite")


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
