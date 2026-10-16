#!/usr/bin/env python3
"""Site local de revisão e remoção de duplicatas de materiais do Coldigom.

Permite:
- Visualização lado a lado de 2 PDFs ou 2 Áudios (sob demanda, sem pré-carregar).
- Escolha com 1 clique de qual material remover.
- Exclusão direta no Cloudflare D1 (opcional/automática).
- Persistência local das decisões em SQLite (localhost).
- Botão direto para abrir a página do louvor no Coldigom.

Uso:
    python3 scripts/revisao-duplicatas/serve.py [--port 8766] [--sem-abrir]
"""
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import subprocess
import sys
import urllib.parse
import webbrowser
from http.server import HTTPServer, SimpleHTTPRequestHandler
from typing import Any

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(DATA_DIR, "decisoes.sqlite")
JSON_PATH = os.path.join(DATA_DIR, "duplicatas.json")
INDEX_PATH = os.path.join(BASE_DIR, "index.html")
REPO_ROOT = os.path.dirname(os.path.dirname(BASE_DIR))
API_DIR = os.path.join(REPO_ROOT, "api")

os.makedirs(DATA_DIR, exist_ok=True)


def init_db() -> None:
    """Inicializa banco SQLite para persistência local das decisões."""
    conn = sqlite3.connect(DB_PATH)
    with conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS decisions (
                group_key TEXT PRIMARY KEY,
                praise_id TEXT NOT NULL,
                material_kind_id TEXT NOT NULL,
                material_type TEXT NOT NULL,
                action TEXT NOT NULL, -- 'remover_material', 'manter_ambos', 'pular'
                removed_material_id TEXT,
                status_remocao TEXT NOT NULL DEFAULT 'pendente', -- 'removido_d1', 'marcado_local', 'erro_d1'
                error_message TEXT,
                note TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );
        """)
    conn.close()


def carregar_decisoes() -> dict[str, dict[str, Any]]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute("SELECT * FROM decisions").fetchall()
        return {r["group_key"]: dict(r) for r in rows}
    finally:
        conn.close()


def salvar_decisao(group_key: str, praise_id: str, material_kind_id: str, material_type: str,
                   action: str, removed_material_id: str | None = None,
                   status_remocao: str = "concluido", error_message: str | None = None,
                   note: str | None = None) -> dict[str, Any]:
    conn = sqlite3.connect(DB_PATH)
    with conn:
        conn.execute("""
            INSERT INTO decisions (group_key, praise_id, material_kind_id, material_type,
                                   action, removed_material_id, status_remocao, error_message, note, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(group_key) DO UPDATE SET
                action = excluded.action,
                removed_material_id = excluded.removed_material_id,
                status_remocao = excluded.status_remocao,
                error_message = excluded.error_message,
                note = excluded.note,
                updated_at = datetime('now');
        """, (group_key, praise_id, material_kind_id, material_type, action,
              removed_material_id, status_remocao, error_message, note))
    conn.close()
    return carregar_decisoes().get(group_key, {})


def excluir_decisao(group_key: str) -> None:
    conn = sqlite3.connect(DB_PATH)
    with conn:
        conn.execute("DELETE FROM decisions WHERE group_key = ?", (group_key,))
    conn.close()


def executar_remocao_d1(material_id: str) -> tuple[bool, str]:
    """Executa DELETE no Cloudflare D1 via wrangler CLI."""
    sql = (
        f"DELETE FROM gesture_usage WHERE material_id = '{material_id}'; "
        f"DELETE FROM gesture_video_occurrences WHERE material_id = '{material_id}'; "
        f"DELETE FROM praise_materials WHERE id = '{material_id}';"
    )
    try:
        proc = subprocess.run(
            ["wrangler", "d1", "execute", "coldigom", "--remote", f"--command={sql}"],
            cwd=API_DIR,
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        if proc.returncode == 0:
            return True, "Material removido do D1 com sucesso."
        return False, proc.stderr or proc.stdout or "Falha ao executar comando no D1."
    except Exception as e:
        return False, str(e)


def carregar_duplicatas() -> list[dict[str, Any]]:
    if not os.path.isfile(JSON_PATH):
        return []
    with open(JSON_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        # Apenas logs de erro ou ações
        if args and str(args[1]).startswith(("4", "5")):
            sys.stderr.write(f"[HTTP] {self.address_string()} - {fmt % args}\n")

    def _enviar_json(self, status: int, data: Any):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        url = urllib.parse.urlsplit(self.path)
        path = urllib.parse.unquote(url.path)

        if path in ("/", "/index.html"):
            with open(INDEX_PATH, "rb") as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
            return

        if path == "/api/dados":
            dups = carregar_duplicatas()
            decisoes = carregar_decisoes()

            # Enriquecer os grupos com as decisões
            concluidos = 0
            removidos = 0
            for item in dups:
                d = decisoes.get(item["group_key"])
                item["decisao"] = d
                if d:
                    if d.get("action") == "remover_material":
                        removidos += 1
                        concluidos += 1
                    elif d.get("action") in ("manter_ambos", "concluido"):
                        concluidos += 1

            total = len(dups)
            pendentes = total - concluidos

            self._enviar_json(200, {
                "groups": dups,
                "stats": {
                    "total": total,
                    "concluidos": concluidos,
                    "removidos": removidos,
                    "pendentes": pendentes,
                }
            })
            return

        self.send_error(404, "Not Found")

    def do_POST(self):
        url = urllib.parse.urlsplit(self.path)
        path = urllib.parse.unquote(url.path)

        length = int(self.headers.get("Content-Length", 0))
        raw_body = self.rfile.read(length) if length > 0 else b"{}"
        try:
            body = json.loads(raw_body.decode("utf-8"))
        except Exception:
            self._enviar_json(400, {"error": "Invalid JSON"})
            return

        if path == "/api/decidir":
            group_key = body.get("group_key")
            praise_id = body.get("praise_id")
            material_kind_id = body.get("material_kind_id")
            material_type = body.get("material_type")
            action = body.get("action")  # 'remover_material' | 'manter_ambos' | 'pular'
            removed_id = body.get("removed_material_id")
            executar_d1 = body.get("delete_d1", True)

            if not group_key or not action:
                self._enviar_json(400, {"error": "group_key e action obrigatórios"})
                return

            status_remocao = "concluido"
            error_msg = None

            if action == "remover_material":
                if not removed_id:
                    self._enviar_json(400, {"error": "removed_material_id obrigatório para remoção"})
                    return
                if executar_d1:
                    ok, msg = executar_remocao_d1(removed_id)
                    if ok:
                        status_remocao = "removido_d1"
                    else:
                        status_remocao = "erro_d1"
                        error_msg = msg
                else:
                    status_remocao = "marcado_local"

            decisao = salvar_decisao(
                group_key=group_key,
                praise_id=praise_id or "",
                material_kind_id=material_kind_id or "",
                material_type=material_type or "",
                action=action,
                removed_material_id=removed_id,
                status_remocao=status_remocao,
                error_message=error_msg,
                note=body.get("note")
            )

            self._enviar_json(200, {
                "ok": True,
                "decisao": decisao,
                "msg": "Decisão salva com sucesso." if not error_msg else f"Salvo localmente, erro D1: {error_msg}"
            })
            return

        if path == "/api/desfazer":
            group_key = body.get("group_key")
            if not group_key:
                self._enviar_json(400, {"error": "group_key obrigatório"})
                return
            excluir_decisao(group_key)
            self._enviar_json(200, {"ok": True, "msg": "Decisão revertida para pendente."})
            return

        self.send_error(404, "Not Found")


def main():
    parser = argparse.ArgumentParser(description="Revisor de Duplicatas do Coldigom")
    parser.add_argument("--port", type=int, default=8766, help="Porta HTTP (padrão: 8766)")
    parser.add_argument("--sem-abrir", action="store_true", help="Não abre o navegador automaticamente")
    args = parser.parse_args()

    init_db()

    server = HTTPServer(("localhost", args.port), Handler)
    url = f"http://localhost:{args.port}"
    print(f"\n=======================================================")
    print(f"🎵 Coldigom - Revisor de Duplicatas")
    print(f"📡 Rodando em: {url}")
    print(f"💾 Persistência local: {DB_PATH}")
    print(f"=======================================================\n")

    if not args.sem_abrir:
        webbrowser.open(url)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor encerrado.")
        server.server_close()


if __name__ == "__main__":
    main()
