#!/usr/bin/env python3
"""
scripts/ajustar_sintaxe_cifras.py

Corrige anomalias sintáticas nos arquivos .chord onde marcadores de seção
([Coro], [Final], [Instrumentos], [Intro]) foram inseridos dentro de colchetes de acordes.
Substitui por diretivas canônicas {comment: ...}.

Aplica:
1. No espelho local: storage/assets/praises/{praise_id}/{chord_material_id}.chord
2. No diretório de extrações: storage/cifras_avulsos_extraidas/{lote}/{praise_id}.chord
3. Sincroniza em produção no Cloudflare R2 (coldigom-assets)
"""

from __future__ import annotations

import glob
import json
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS_DIR = ROOT / "storage" / "assets" / "praises"
EXTRAIDAS_DIR = ROOT / "storage" / "cifras_avulsos_extraidas"
FILA_PATH = ROOT / "data" / "fila_cifras_avulsos.json"
R2_BUCKET = "coldigom-assets"
MAX_WORKERS = 8


def clean_syntax(text: str) -> tuple[str, list[str]]:
    changes = []
    lines = text.splitlines()
    new_lines = []
    for line in lines:
        s = line.strip()
        if s.lower() in {"[coro]", "[refrão]"}:
            new_lines.append("{comment: Coro}")
            changes.append(f"{s} -> {{comment: Coro}}")
        elif s.lower() == "[final]":
            new_lines.append("{comment: Final}")
            changes.append(f"{s} -> {{comment: Final}}")
        elif s.lower() == "[instrumentos]":
            new_lines.append("{comment: Instrumentos}")
            changes.append(f"{s} -> {{comment: Instrumentos}}")
        elif s.lower() in {"[intro]", "[introdução]"}:
            new_lines.append("{comment: Introdução}")
            changes.append(f"{s} -> {{comment: Introdução}}")
        elif re.match(r"^\s*\[intro\]\s*(.*)$", line, re.I):
            rest = re.match(r"^\s*\[intro\]\s*(.*)$", line, re.I).group(1)
            new_lines.append("{comment: Introdução}")
            new_lines.append(rest)
            changes.append("[Intro] ... -> {comment: Introdução} + acordes")
        elif re.match(r"^\s*\[instrumentos\]\s*(.*)$", line, re.I):
            rest = re.match(r"^\s*\[instrumentos\]\s*(.*)$", line, re.I).group(1)
            new_lines.append("{comment: Instrumentos}")
            new_lines.append(rest)
            changes.append("[Instrumentos] ... -> {comment: Instrumentos} + acordes")
        elif re.match(r"^\s*\[final\]\s*(.*)$", line, re.I):
            rest = re.match(r"^\s*\[final\]\s*(.*)$", line, re.I).group(1)
            new_lines.append("{comment: Final}")
            new_lines.append(rest)
            changes.append("[Final] ... -> {comment: Final} + acordes")
        else:
            new_lines.append(line)
    return "\n".join(new_lines) + "\n", changes


def upload_r2(praise_id: str, chord_material_id: str, local_path: Path) -> tuple[bool, str]:
    r2_obj = f"{R2_BUCKET}/storage/assets/praises/{praise_id}/{chord_material_id}.chord"
    cmd = [
        "wrangler", "r2", "object", "put", r2_obj,
        f"--file={str(local_path)}", "--remote"
    ]
    res = subprocess.run(cmd, cwd=str(ROOT / "api"), capture_output=True, text=True)
    if res.returncode == 0:
        return True, r2_obj
    return False, res.stderr or res.stdout


def main():
    print("🔍 [1/3] Identificando arquivos com marcadores em colchetes...")
    with open(FILA_PATH, "r", encoding="utf-8") as f:
        fila = json.load(f)

    # Mapear pid -> (batch_id, chord_material_id, praise_name)
    item_map = {}
    for b in fila.get("batches", []):
        bid = b["batch_id"]
        for it in b.get("items", []):
            pid = it["praise_id"]
            cid = it.get("chord_material_id")
            name = it.get("praise_name", "")
            item_map[pid] = (bid, cid, name)

    assets_files = list(ASSETS_DIR.glob("*/*.chord"))
    to_update = []

    for fpath in assets_files:
        pid = fpath.parent.name
        cid = fpath.stem
        content = fpath.read_text(encoding="utf-8")
        new_content, changes = clean_syntax(content)
        if changes:
            to_update.append({
                "praise_id": pid,
                "chord_material_id": cid,
                "asset_path": fpath,
                "new_content": new_content,
                "changes": changes,
            })

    print(f"📋 Encontrados {len(to_update)} arquivos com desvios sintáticos.")

    print("\n✍️ [2/3] Atualizando arquivos locais...")
    for item in to_update:
        # Salva no espelho de assets
        item["asset_path"].write_text(item["new_content"], encoding="utf-8")
        # Se for avulso, salva também na pasta de extrações
        pid = item["praise_id"]
        if pid in item_map:
            bid, _, _ = item_map[pid]
            ext_file = EXTRAIDAS_DIR / bid / f"{pid}.chord"
            if ext_file.exists():
                ext_file.write_text(item["new_content"], encoding="utf-8")

    print(f"✅ {len(to_update)} arquivos locais atualizados com sucesso.")

    print("\n☁️ [3/3] Sincronizando com Cloudflare R2 em produção...")
    sucessos = 0
    falhas = 0
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {
            executor.submit(upload_r2, item["praise_id"], item["chord_material_id"], item["asset_path"]): item
            for item in to_update
        }
        for fut in as_completed(futures):
            item = futures[fut]
            ok, msg = fut.result()
            if ok:
                sucessos += 1
                print(f"  ✓ [{sucessos}/{len(to_update)}] R2 atualizado: {item['praise_id'][:8]}/{item['chord_material_id'][:8]}.chord")
            else:
                falhas += 1
                print(f"  ✗ Erro R2 em {item['praise_id']}: {msg}")

    print(f"\n🎉 Ajuste sintático concluído! Sucessos: {sucessos}, Falhas: {falhas}")
    if falhas > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
