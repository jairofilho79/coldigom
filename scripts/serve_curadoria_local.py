#!/usr/bin/env python3
"""
scripts/serve_curadoria_local.py

Servidor local unificado para o Coldigom Curadoria (porta 8765).
Integra:
1. Interface com Inteligência Semântica Gemma 2 (diagnóstico de 683 falsos positivos e 998 duplicatas reais).
2. Visualizadores lado a lado sob demanda (PDFs e Áudios).
3. Ações diretas no Cloudflare D1 (remoção de materiais, atualização de kinds e decisões).
"""

import http.server
import json
import os
import subprocess
import sys
import threading
from pathlib import Path
from typing import Any

PORT = 8765
BASE_DIR = Path(__file__).resolve().parent.parent / "curadoria-pages"
ACCOUNT_ID = "246ee6c20c011ae98a226d48a7a38902"
DATABASE_NAME = "coldigom"


def run_d1_query(sql: str) -> list:
    """Executa SQL no D1 remoto via wrangler e retorna os registros JSON."""
    cmd = [
        "npx", "wrangler", "d1", "execute", DATABASE_NAME,
        "--remote",
        f"--command={sql}",
        "--json"
    ]
    env_vars = os.environ.copy()
    env_vars["CLOUDFLARE_ACCOUNT_ID"] = ACCOUNT_ID
    res = subprocess.run(cmd, capture_output=True, text=True, env=env_vars)
    if res.returncode != 0:
        print(f"❌ Erro ao consultar D1: {res.stderr}", file=sys.stderr)
        return []
    try:
        data = json.loads(res.stdout)
        if isinstance(data, list) and len(data) > 0:
            return data[0].get("results", [])
        return []
    except Exception as e:
        print(f"❌ Falha ao parsear JSON do D1: {e}", file=sys.stderr)
        return []


def run_d1_execute(sql: str) -> bool:
    """Executa comando de mutação (INSERT, UPDATE, DELETE) no D1 remoto."""
    cmd = [
        "npx", "wrangler", "d1", "execute", DATABASE_NAME,
        "--remote",
        f"--command={sql}"
    ]
    env_vars = os.environ.copy()
    env_vars["CLOUDFLARE_ACCOUNT_ID"] = ACCOUNT_ID
    res = subprocess.run(cmd, capture_output=True, text=True, env=env_vars)
    if res.returncode != 0:
        print(f"❌ Erro na execução D1: {res.stderr}", file=sys.stderr)
        return False
    return True


class CuradoriaHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def end_headers(self):
        # Desabilita cache para desenvolvimento local
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/duplicatas":
            self.handle_get_duplicatas()
        elif path == "/api/material-kinds":
            self.handle_get_material_kinds()
        else:
            super().do_GET()

    def do_POST(self):
        path = self.path.split("?")[0]
        content_len = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_len) if content_len > 0 else b"{}"
        try:
            payload = json.loads(body.decode("utf-8"))
        except Exception:
            payload = {}

        if path == "/api/material-delete":
            self.handle_material_delete(payload)
        elif path == "/api/material-update-kind":
            self.handle_material_update_kind(payload)
        elif path == "/api/material-decisao":
            self.handle_material_decisao(payload)
        else:
            self.send_response(404)
            self.end_headers()

    def send_json(self, data: Any, status: int = 200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_get_duplicatas(self):
        # Carrega diagnósticos IA do arquivo local para enriquecimento
        def norm_key(k: str) -> str:
            return (k or "").replace(":", "_").strip().lower()

        diag_map = {}
        json_path = BASE_DIR / "data" / "duplicatas.json"
        if json_path.exists():
            try:
                with open(json_path, "r", encoding="utf-8") as f:
                    for item in json.load(f):
                        if item.get("ai_diagnosis") and item.get("group_key"):
                            diag_map[norm_key(item["group_key"])] = item["ai_diagnosis"]
            except Exception as e:
                print(f"⚠️ Erro ao carregar diagnósticos IA locais: {e}")

        # Consulta SQL com apenas duplicatas reais ativas no D1
        sql = """
        WITH dupes AS (
          SELECT 
            pm.praise_id,
            pm.material_kind,
            pm.type,
            COUNT(*) as duplicate_count,
            json_group_array(json_object(
              'id', pm.id,
              'type', pm.type,
              'material_kind', pm.material_kind,
              'r2_key', pm.r2_key,
              'file_path_legacy', pm.file_path_legacy,
              'url', pm.url
            )) as materials_json
          FROM praise_materials pm
          GROUP BY pm.praise_id, pm.material_kind, pm.type
          HAVING COUNT(*) > 1
        ),
        praise_tags_agg AS (
          SELECT 
            pt.praise_id,
            GROUP_CONCAT(t.name, ', ') AS praise_tags
          FROM praise_tags pt
          JOIN tags t ON t.id = pt.tag_id
          GROUP BY pt.praise_id
        )
        SELECT 
          d.praise_id,
          d.material_kind AS material_kind_id,
          d.type AS material_type,
          d.duplicate_count,
          d.materials_json,
          p.name AS praise_name,
          COALESCE(p.number, '') AS praise_number,
          COALESCE(pta.praise_tags, '') AS praise_tags,
          COALESCE(mkt.label, mk.name) AS material_kind_label,
          mk.name AS material_kind_name,
          cd.action AS saved_action,
          cd.note AS saved_note
        FROM dupes d
        JOIN praises p ON p.id = d.praise_id
        JOIN material_kinds mk ON mk.id = d.material_kind
        LEFT JOIN material_kind_translations mkt ON mkt.material_kind_id = mk.id AND mkt.locale = 'pt-BR'
        LEFT JOIN praise_tags_agg pta ON pta.praise_id = p.id
        LEFT JOIN curadoria_decisoes cd ON (cd.group_key = (d.praise_id || ':' || d.material_kind || ':' || d.type) OR cd.group_key = (d.praise_id || '_' || d.material_kind || '_' || d.type))
        ORDER BY 
          CASE WHEN p.number IS NOT NULL AND p.number != '' THEN CAST(p.number AS INTEGER) ELSE 999999 END,
          p.name;
        """
        rows = run_d1_query(sql)

        items = []
        for r in rows:
            materials = []
            try:
                materials = json.loads(r.get("materials_json", "[]"))
            except Exception:
                materials = []

            for m in materials:
                m["asset_url"] = f"https://coldigom-web.pages.dev/assets/praises/{r['praise_id']}/{m['id']}.{m['type']}"

            group_key = f"{r['praise_id']}:{r['material_kind_id']}:{r['material_type']}"
            item = {
                "group_key": group_key,
                "praise_id": r["praise_id"],
                "praise_name": r["praise_name"],
                "praise_number": r["praise_number"],
                "praise_tags": r.get("praise_tags", ""),
                "material_kind_id": r["material_kind_id"],
                "material_kind_label": r["material_kind_label"],
                "material_kind_name": r["material_kind_name"],
                "material_type": r["material_type"],
                "duplicate_count": r["duplicate_count"],
                "saved_action": r.get("saved_action"),
                "saved_note": r.get("saved_note", ""),
                "materials": materials,
                "ai_diagnosis": diag_map.get(norm_key(group_key))
            }
            items.append(item)

        self.send_json(items)

    def handle_get_material_kinds(self):
        sql = """
        SELECT 
          mk.id,
          mk.name,
          mk.class_id,
          COALESCE(mkt.label, mk.name) as label
        FROM material_kinds mk
        LEFT JOIN material_kind_translations mkt ON mkt.material_kind_id = mk.id AND mkt.locale = 'pt-BR'
        ORDER BY mk.class_id, label;
        """
        rows = run_d1_query(sql)
        self.send_json(rows)

    def handle_material_delete(self, payload: dict):
        praise_id = payload.get("praise_id")
        material_id = payload.get("material_id")
        if not praise_id or not material_id:
            self.send_json({"error": "praise_id e material_id são obrigatórios"}, 400)
            return

        sql = f"DELETE FROM praise_materials WHERE id = '{material_id}' AND praise_id = '{praise_id}';"
        ok = run_d1_execute(sql)
        if ok:
            self.send_json({"success": True, "message": "Material removido com sucesso no Coldigom D1!"})
        else:
            self.send_json({"error": "Falha ao remover material no D1"}, 500)

    def handle_material_update_kind(self, payload: dict):
        praise_id = payload.get("praise_id")
        material_id = payload.get("material_id")
        material_kind = payload.get("material_kind")
        if not praise_id or not material_id or not material_kind:
            self.send_json({"error": "praise_id, material_id e material_kind são obrigatórios"}, 400)
            return

        sql = f"UPDATE praise_materials SET material_kind = '{material_kind}' WHERE id = '{material_id}' AND praise_id = '{praise_id}';"
        ok = run_d1_execute(sql)
        if ok:
            self.send_json({"success": True, "message": "Categoria atualizada com sucesso no Coldigom D1!"})
        else:
            self.send_json({"error": "Falha ao atualizar categoria no D1"}, 500)

    def handle_material_decisao(self, payload: dict):
        group_key = payload.get("group_key")
        praise_id = payload.get("praise_id")
        material_kind_id = payload.get("material_kind_id", "")
        material_type = payload.get("material_type", "")
        action = payload.get("action")
        note = payload.get("note", "").replace("'", "''")

        if not group_key or not action:
            self.send_json({"error": "group_key e action são obrigatórios"}, 400)
            return

        if action == "limpar":
            sql = f"DELETE FROM curadoria_decisoes WHERE group_key = '{group_key}';"
        else:
            sql = f"""
            INSERT INTO curadoria_decisoes (group_key, praise_id, material_kind_id, material_type, action, note, updated_at)
            VALUES ('{group_key}', '{praise_id}', '{material_kind_id}', '{material_type}', '{action}', '{note}', datetime('now'))
            ON CONFLICT(group_key) DO UPDATE SET action=excluded.action, note=excluded.note, updated_at=excluded.updated_at;
            """

        ok = run_d1_execute(sql)
        if ok:
            self.send_json({"success": True, "action": action})
        else:
            self.send_json({"error": "Falha ao gravar decisão no D1"}, 500)


def run_server():
    server_address = ("127.0.0.1", PORT)
    httpd = http.server.HTTPServer(server_address, CuradoriaHandler)
    print("=" * 65)
    print("🎵 COLDIGOM CURADORIA - SERVIDOR LOCAL UNIFICADO")
    print(f"📡 Disponível em: http://localhost:{PORT}")
    print(f"📂 Diretório web: {BASE_DIR}")
    print("🧠 Inteligência: Gemma Embedding 2 (683 Falsos Positivos / 998 Duplicatas Reais)")
    print("⚡ Banco de Dados: Cloudflare D1 (Ações Diretas em Produção)")
    print("=" * 65)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor finalizado.")
        httpd.server_close()


if __name__ == "__main__":
    run_server()
