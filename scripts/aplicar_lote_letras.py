#!/usr/bin/env python3
"""
scripts/aplicar_lote_letras.py

Aplica um lote de letras aprovadas:
1. Executa UPDATE no Cloudflare D1 em produção (--remote) via wrangler.
2. Atualiza storage/assets/praises/{id}/metadata.yml.
3. Atualiza os bancos locais (snapshot.sqlite e acervo_embeddings.sqlite).
4. Registra histórico em data/letras_apply_log.jsonl.
"""

from __future__ import annotations

import json
import os
import re
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API_DIR = ROOT / "api"
SNAPSHOT_DB = ROOT / "scripts" / "validate-acervo" / "out" / "snapshot.sqlite"
EMBEDDINGS_DB = ROOT / "data" / "embeddings" / "acervo_embeddings.sqlite"
ASSETS_DIR = ROOT / "storage" / "assets" / "praises"
APPLY_LOG = ROOT / "data" / "letras_apply_log.jsonl"
TMP_SQL_DIR = Path("/tmp/coldigom_letras_sql")


def escape_sql(val: str) -> str:
    return "'" + val.replace("'", "''") + "'"


def update_metadata_yml(praise_id: str, lyrics: str) -> bool:
    yml_path = ASSETS_DIR / praise_id / "metadata.yml"
    if not yml_path.exists():
        return False
    content = yml_path.read_text(encoding="utf-8", errors="replace")

    # Formata como YAML literal block
    indented_lyrics = "\n".join("    " + line for line in lyrics.splitlines())
    replacement = f"praise_lyrics: |\n{indented_lyrics}"

    # Substitui praise_lyrics: ...
    pattern = r"praise_lyrics:\s*(\'\'|\"\"|\|.*?(?=\n\w|\Z)|.*?(?=\n\w|\Z))"
    new_content, count = re.subn(pattern, replacement, content, count=1, flags=re.DOTALL)
    if count == 0:
        # Se não achou com o padrão, adiciona ou substitui na linha
        new_content = re.sub(r"praise_lyrics:.*", replacement, content)

    yml_path.write_text(new_content, encoding="utf-8")
    return True


def apply_batch(items: list[dict], batch_name: str = "lote") -> bool:
    """
    items: list of dicts with:
      - praise_id (str)
      - praise_name (str)
      - lyrics (str)
    """
    print(f"\n🚀 Aplicando {batch_name} ({len(items)} louvores) no Coldigom...")
    if isinstance(items, dict):
        items = [items]

    TMP_SQL_DIR.mkdir(parents=True, exist_ok=True)
    sql_file = TMP_SQL_DIR / f"{batch_name}_{int(time.time())}.sql"

    sql_lines = []
    for it in items:
        pid = it.get("praise_id") or it.get("id")
        lyrics = (it.get("lyrics") or it.get("extracted_lyrics", "")).strip()
        sql_lines.append(
            f"UPDATE praises SET lyrics = {escape_sql(lyrics)}, updated_at = datetime('now') WHERE id = '{pid}';"
        )
    sql_content = "\n".join(sql_lines) + "\n"
    sql_file.write_text(sql_content, encoding="utf-8")

    # 1. Executa no Cloudflare D1 em produção via --command
    print(f"📡 [1/4] Executando UPDATE no Cloudflare D1 (produção)...")
    env_vars = os.environ.copy()
    env_vars["CLOUDFLARE_ACCOUNT_ID"] = "246ee6c20c011ae98a226d48a7a38902"

    for idx, it in enumerate(items, 1):
        pid = it.get("praise_id") or it.get("id")
        lyrics = (it.get("lyrics") or it.get("extracted_lyrics", "")).strip()
        auth = (it.get("author") or it.get("praise_author", "")).strip()
        if auth:
            sql_stmt = f"UPDATE praises SET lyrics = {escape_sql(lyrics)}, author = {escape_sql(auth)}, updated_at = datetime('now') WHERE id = '{pid}';"
        else:
            sql_stmt = f"UPDATE praises SET lyrics = {escape_sql(lyrics)}, updated_at = datetime('now') WHERE id = '{pid}';"
        cmd = [
            "npx", "wrangler", "d1", "execute", "coldigom", "--remote",
            f"--command={sql_stmt}"
        ]
        res = subprocess.run(cmd, cwd=str(API_DIR), capture_output=True, text=True, env=env_vars)
        if res.returncode != 0:
            print(f"❌ Erro ao executar no D1 remoto para {pid}:\n{res.stderr or res.stdout}", file=sys.stderr)
            return False
    print("   ✅ D1 remoto atualizado com sucesso!")

    # 2. Atualiza snapshot.sqlite local
    print("🗄️  [2/4] Atualizando banco snapshot.sqlite local...")
    if SNAPSHOT_DB.exists():
        with sqlite3.connect(SNAPSHOT_DB) as conn:
            for it in items:
                pid = it.get("praise_id") or it.get("id")
                lyr = (it.get("lyrics") or it.get("extracted_lyrics", "")).strip()
                auth = (it.get("author") or it.get("praise_author", "")).strip()
                if auth:
                    conn.execute(
                        "UPDATE praises SET lyrics = ?, author = ?, updated_at = datetime('now') WHERE id = ?",
                        (lyr, auth, pid),
                    )
                else:
                    conn.execute(
                        "UPDATE praises SET lyrics = ?, updated_at = datetime('now') WHERE id = ?",
                        (lyr, pid),
                    )
        print("   ✅ snapshot.sqlite sincronizado!")

    # 3. Atualiza acervo_embeddings.sqlite local (praises_semantic)
    print("🧠 [3/4] Atualizando acervo_embeddings.sqlite...")
    if EMBEDDINGS_DB.exists():
        with sqlite3.connect(EMBEDDINGS_DB) as conn:
            for it in items:
                pid = it.get("praise_id") or it.get("id")
                conn.execute(
                    "UPDATE praises_semantic SET has_lyrics = 1 WHERE id = ?",
                    (pid,),
                )
        print("   ✅ praises_semantic atualizado!")

    # 4. Atualiza metadata.yml e log
    print("📝 [4/4] Atualizando metadata.yml e gravando log de auditoria...")
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    log_entries = []
    for it in items:
        pid = it.get("praise_id") or it.get("id")
        lyrics = (it.get("lyrics") or it.get("extracted_lyrics", "")).strip()
        update_metadata_yml(pid, lyrics)
        log_entries.append(json.dumps({
            "timestamp": now_iso,
            "batch": batch_name,
            "praise_id": pid,
            "praise_name": it.get("praise_name") or it.get("name", ""),
            "lyrics_len": len(lyrics),
        }, ensure_ascii=False))

    APPLY_LOG.parent.mkdir(parents=True, exist_ok=True)
    with open(APPLY_LOG, "a", encoding="utf-8") as f:
        for entry in log_entries:
            f.write(entry + "\n")

    print(f"🎉 {len(items)} louvores do {batch_name} foram aplicados em produção com sucesso!")
    return True


if __name__ == "__main__":
    if len(sys.argv) > 1:
        # Pode receber um JSON com os itens via argumento ou arquivo
        json_path = Path(sys.argv[1])
        if json_path.exists():
            data = json.loads(json_path.read_text(encoding="utf-8"))
            apply_batch(data, batch_name=json_path.stem)
        else:
            print(f"Arquivo {json_path} não encontrado.")
    else:
        print("Uso: python3 scripts/aplicar_lote_letras.py <caminho_para_json>")
