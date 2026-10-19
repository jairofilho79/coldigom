#!/usr/bin/env python3
"""
Publicação em Produção das Cifras dos 517 Louvores Avulsos.

Etapas:
1. Copia os 517 arquivos .chord para storage/assets/praises/{praise_id}/{chord_material_id}.chord
2. Upload concorrente para Cloudflare R2 (coldigom-assets/storage/assets/praises/...)
3. Ingestão no Cloudflare D1 (praise_materials + atualização de tom em praises)
4. Atualização do estado em data/fila_cifras_avulsos.json
5. Verificação de integridade ponta a ponta (API, D1 e R2)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILA_PATH = ROOT / "data" / "fila_cifras_avulsos.json"
EXTRAIDAS_DIR = ROOT / "storage" / "cifras_avulsos_extraidas"
ASSETS_PRAISES_DIR = ROOT / "storage" / "assets" / "praises"
TMP_SQL_DIR = Path("/tmp/coldigom_cifras_prod_sql")

CHORD_KIND_ID = "e2274af6-a19f-4186-93cd-e3810ce75e2c"  # Chord Chart
R2_BUCKET = "coldigom-assets"
MAX_WORKERS = 8
MAX_RETRIES = 3


def stable_chord_id(pdf_material_id: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"coldigom/chord/{pdf_material_id}"))


def escape_sql(val: str | None) -> str:
    if val is None:
        return "NULL"
    return "'" + str(val).replace("'", "''") + "'"


def load_manifest() -> list[dict]:
    with open(FILA_PATH, "r", encoding="utf-8") as f:
        fila = json.load(f)

    manifest = []
    for batch in fila.get("batches", []):
        bid = batch["batch_id"]
        for it in batch.get("items", []):
            pid = it["praise_id"]
            mid = it["pdf_material_id"]
            pname = it["praise_name"]

            # Locate local .chord file
            f1 = EXTRAIDAS_DIR / bid / f"{pid}.chord"
            f2 = EXTRAIDAS_DIR / bid / f"{pid}_{mid[:8]}.chord"
            if f1.exists():
                local_file = f1
            elif f2.exists():
                local_file = f2
            else:
                raise FileNotFoundError(f"Arquivo de cifra ausente para praise {pid} ({mid}) no lote {bid}")

            content = local_file.read_text(encoding="utf-8")
            m_key = re.search(r"\{key:\s*([A-G][b#]?[m]?)\}", content)
            key = m_key.group(1).strip() if m_key else None
            if not key:
                raise ValueError(f"Cabeçalho {{key: ...}} ausente ou inválido em {local_file}")

            cid = stable_chord_id(mid)
            r2_key = f"assets/praises/{pid}/{cid}.chord"
            r2_obj_path = f"{R2_BUCKET}/storage/{r2_key}"
            local_asset_path = ASSETS_PRAISES_DIR / pid / f"{cid}.chord"

            manifest.append({
                "batch_id": bid,
                "praise_id": pid,
                "praise_name": pname,
                "pdf_material_id": mid,
                "chord_material_id": cid,
                "extracted_path": local_file,
                "local_asset_path": local_asset_path,
                "r2_key": r2_key,
                "r2_obj_path": r2_obj_path,
                "key": key,
                "content_len": len(content),
            })

    return manifest


def copy_local_assets(manifest: list[dict]) -> None:
    print(f"\n📂 [1/4] Copiando {len(manifest)} arquivos para storage/assets/praises/...")
    copied = 0
    for item in manifest:
        dest = item["local_asset_path"]
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(item["extracted_path"], dest)
        copied += 1
    print(f"✅ {copied} arquivos copiados para o espelho local.")


def upload_single_r2(item: dict) -> tuple[bool, str, str]:
    obj_path = item["r2_obj_path"]
    local_path = str(item["local_asset_path"])
    cmd = [
        "wrangler", "r2", "object", "put", obj_path,
        f"--file={local_path}",
        "--content-type=text/plain; charset=utf-8",
        "--remote"
    ]

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            if res.returncode == 0:
                return True, item["r2_key"], ""
            err = res.stderr or res.stdout
            if attempt == MAX_RETRIES:
                return False, item["r2_key"], f"Falha (tentativa {attempt}): {err.strip()}"
            time.sleep(1.0 * attempt)
        except Exception as e:
            if attempt == MAX_RETRIES:
                return False, item["r2_key"], f"Exceção (tentativa {attempt}): {str(e)}"
            time.sleep(1.0 * attempt)

    return False, item["r2_key"], "Tentativas esgotadas"


def upload_all_r2(manifest: list[dict]) -> None:
    print(f"\n☁️  [2/4] Enviando {len(manifest)} arquivos para o Cloudflare R2 ({R2_BUCKET})...")
    t0 = time.time()
    total = len(manifest)
    completed = 0
    failed = []

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_map = {executor.submit(upload_single_r2, item): item for item in manifest}
        for future in as_completed(future_map):
            item = future_map[future]
            ok, r2_key, err = future.result()
            completed += 1
            if ok:
                if completed % 50 == 0 or completed == total:
                    print(f"   Progresso R2: {completed}/{total} ({completed * 100 // total}%)")
            else:
                print(f"❌ Falha no upload de {r2_key}: {err}")
                failed.append((r2_key, err))

    dt = round(time.time() - t0, 1)
    if failed:
        print(f"\n❌ ERRO: {len(failed)} arquivos falharam no upload para R2 após {MAX_RETRIES} tentativas.")
        sys.exit(1)

    print(f"✅ Todos os {total} arquivos foram enviados ao R2 com sucesso em {dt}s!")


def execute_d1_sql(manifest: list[dict]) -> None:
    print(f"\n🗄️  [3/4] Ingerindo registros no Cloudflare D1 (coldigom)...")
    TMP_SQL_DIR.mkdir(parents=True, exist_ok=True)

    # Chunks of 50 items = 100 statements (INSERT material + UPDATE praise tonality)
    CHUNK_SIZE = 50
    chunks = [manifest[i:i + CHUNK_SIZE] for i in range(0, len(manifest), CHUNK_SIZE)]
    print(f"   Dividindo {len(manifest)} itens em {len(chunks)} lotes SQL de até {CHUNK_SIZE} itens...")

    for idx, chunk in enumerate(chunks, 1):
        sql_file = TMP_SQL_DIR / f"chunk_{idx:02d}.sql"
        lines = []

        for it in chunk:
            cid = it["chord_material_id"]
            pid = it["praise_id"]
            mid = it["pdf_material_id"]
            r2_key = it["r2_key"]
            key = it["key"]

            # 1. Insert chord into praise_materials
            insert_stmt = (
                f"INSERT INTO praise_materials ("
                f"id, praise_id, material_kind, type, r2_key, file_path_legacy, "
                f"source_material_id, merged_from_praise_id, url, is_reviewed, reviewed_at, reviewed_by, created_at"
                f") VALUES ("
                f"'{cid}', '{pid}', '{CHORD_KIND_ID}', 'chord', '{r2_key}', NULL, "
                f"'{mid}', NULL, NULL, 0, NULL, NULL, datetime('now')"
                f");"
            )
            lines.append(insert_stmt)

            # 2. Update tonality in praises if empty/null
            update_stmt = (
                f"UPDATE praises SET tonality = {escape_sql(key)}, updated_at = datetime('now') "
                f"WHERE id = '{pid}' AND (tonality IS NULL OR tonality = '');"
            )
            lines.append(update_stmt)

        sql_content = "\n".join(lines) + "\n"
        sql_file.write_text(sql_content, encoding="utf-8")

        # Execute via wrangler d1
        cmd = [
            "wrangler", "d1", "execute", "coldigom", "--remote",
            f"--file={str(sql_file)}"
        ]
        res = subprocess.run(cmd, cwd=str(ROOT / "api"), capture_output=True, text=True)
        if res.returncode != 0:
            print(f"❌ Erro ao executar lote {idx}/{len(chunks)} no D1:")
            print(res.stderr or res.stdout)
            sys.exit(1)
        else:
            print(f"   Lote D1 {idx}/{len(chunks)} executado com sucesso.")

    print(f"✅ Todos os {len(manifest)} registros foram inseridos no D1 com sucesso!")


def update_fila_json(manifest: list[dict]) -> None:
    print(f"\n📝 [4/4] Atualizando data/fila_cifras_avulsos.json para status 'producao'...")
    manifest_by_mid = {m["pdf_material_id"]: m for m in manifest}

    with open(FILA_PATH, "r", encoding="utf-8") as f:
        fila = json.load(f)

    now_iso = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    for batch in fila.get("batches", []):
        batch["status"] = "producao"
        for it in batch.get("items", []):
            mid = it["pdf_material_id"]
            if mid in manifest_by_mid:
                m = manifest_by_mid[mid]
                it["status"] = "producao"
                it["chord_material_id"] = m["chord_material_id"]
                it["chord_r2_key"] = m["r2_key"]
                it["tonality"] = m["key"]
                it["uploaded_at"] = now_iso

    with open(FILA_PATH, "w", encoding="utf-8") as f:
        json.dump(fila, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"✅ data/fila_cifras_avulsos.json atualizado com sucesso!")


def run_verification(manifest: list[dict]) -> None:
    print("\n🔍 Verificação e Auditoria de Produção...")
    # 1. Total count of inserted chord materials in D1
    mids = [m["pdf_material_id"] for m in manifest]
    total_found = 0
    for i in range(0, len(mids), 100):
        chunk = mids[i:i + 100]
        in_clause = ",".join(f"'{m}'" for m in chunk)
        cmd = [
            "wrangler", "d1", "execute", "coldigom", "--remote", "--json",
            "--command", f"SELECT COUNT(*) AS total FROM praise_materials WHERE type = 'chord' AND source_material_id IN ({in_clause})"
        ]
        res = subprocess.run(cmd, cwd=str(ROOT / "api"), capture_output=True, text=True)
        data = json.loads(res.stdout)
        total_found += data[0]["results"][0]["total"]

    print(f"   D1: {total_found}/{len(manifest)} materiais de cifra encontrados vinculados aos PDFs de origem.")
    assert total_found == len(manifest), f"Esperado {len(manifest)}, encontrado {total_found}"

    # 2. Sample praise verification via curl to API
    import urllib.request
    sample = manifest[0]
    sample_pid = sample["praise_id"]
    sample_cid = sample["chord_material_id"]

    url = f"https://coldigom-api.jairofilho79.workers.dev/api/praises/{sample_pid}"
    req = urllib.request.Request(url, headers={"User-Agent": "coldigom-verify"})
    with urllib.request.urlopen(req) as response:
        body = json.loads(response.read().decode())
        praise_data = body.get("data", {})
        materials = praise_data.get("materials", [])
        chord_mat = next((m for m in materials if m["id"] == sample_cid), None)
        assert chord_mat is not None, f"Cifra {sample_cid} não encontrada na resposta da API"
        assert chord_mat.get("has_content") is True, f"has_content não é True na resposta da API: {chord_mat}"
        print(f"   API /api/praises/{sample_pid}: OK! Cifra encontrada com has_content=True.")

    # 3. Sample raw asset verification via curl
    asset_url = f"https://coldigom-api.jairofilho79.workers.dev/{sample['r2_key']}"
    req_asset = urllib.request.Request(asset_url, headers={"User-Agent": "coldigom-verify"})
    with urllib.request.urlopen(req_asset) as response:
        asset_text = response.read().decode()
        assert "{title:" in asset_text and "{key:" in asset_text, "Conteúdo do asset inválido"
        print(f"   Asset R2 /{sample['r2_key']}: OK! Cifra retornada com sucesso ({len(asset_text)} bytes).")

    print("\n🎉 Todas as validações passaram com 100% de sucesso!")


def main() -> None:
    parser = argparse.ArgumentParser(description="Publicar cifras dos avulsos em produção")
    parser.add_argument("--dry-run", action="store_true", help="Apenas gera o plano sem executar uploads")
    parser.add_argument("--skip-r2", action="store_true", help="Pular upload do R2 se já feito")
    parser.add_argument("--skip-d1", action="store_true", help="Pular ingestão no D1 se já feita")
    args = parser.parse_args()

    print("=" * 60)
    print("🚀 PUBLICAÇÃO EM PRODUÇÃO: CIFRAS DOS LOUVORES AVULSOS (517)")
    print("=" * 60)

    manifest = load_manifest()
    print(f"Manifesto validado: {len(manifest)} louvores prontos.")

    if args.dry_run:
        print("\n[DRY RUN] Execução em modo seco concluída.")
        return

    # 1. Local copy
    copy_local_assets(manifest)

    # 2. R2 Upload
    if not args.skip_r2:
        upload_all_r2(manifest)
    else:
        print("\n⏩ Pulo de upload R2 (--skip-r2)")

    # 3. D1 Database
    if not args.skip_d1:
        execute_d1_sql(manifest)
    else:
        print("\n⏩ Pulo de ingestão D1 (--skip-d1)")

    # 4. Fila JSON
    update_fila_json(manifest)

    # 5. Verification
    run_verification(manifest)

    print("\n" + "=" * 60)
    print("🌟 SUCESSO TOTAL! Todas as 517 cifras estão ativas em produção.")
    print("=" * 60)


if __name__ == "__main__":
    main()
