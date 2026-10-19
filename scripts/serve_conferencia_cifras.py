#!/usr/bin/env python3
"""
scripts/serve_conferencia_cifras.py

Servidor local para Conferência de Cifras (PDF original vs ChordPro extraído).
Porta padrão: 8765 (ou 8766 se ocupada).

Uso:
  python3 scripts/serve_conferencia_cifras.py
"""

from __future__ import annotations

import html
import http.server
import json
import mimetypes
import os
import re
import socketserver
import subprocess
import sys
import threading
import time
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS_DIR = ROOT / "storage" / "assets" / "praises"
FILA_PATH = ROOT / "data" / "fila_cifras_avulsos.json"
DECISOES_PATH = ROOT / "data" / "conferencia_decisoes.json"
R2_BUCKET = "coldigom-assets"
DEFAULT_PORT = 8765

# 36 Louvores que tiveram ajuste sintático
AJUSTADOS_SINTAXE = {
    "d580214d-f583-4aeb-bf2a-d1423f7f8e7c", "393ecff2-3baf-4878-bd09-04dd69c03e44",
    "a3e6b4f8-99ee-4282-a608-9835f76ec7d7", "031eabb4-d340-48fe-bc25-cb4a00d273bb",
    "2690c944-d5b8-4ed4-b517-0e7a9d524443", "b3f1c6a2-9289-4470-8c73-40941c5a7d15",
    "b0895d70-16ac-4aa8-85a5-67f86eea4cda", "ab302d06-b3d5-4af6-ba3b-1cb67cb09dc8",
    "cd558781-0bef-4b45-9c8f-be48e65998b6", "d06f556e-4315-4814-88b8-15832dcbfcad",
    "04f11681-d814-41c3-aec7-7df54c7f8a12", "be9fc919-744c-4b40-8ba3-ea294a0d397a",
    "f6d5c6d0-20bd-4f06-ad64-13303e643bfc", "91424bea-4fba-4ea6-bce7-d27fc3c1d950",
    "3fbb4096-7d6f-40ff-97f2-19bc306c589b", "845cfd3c-99d8-4f81-8669-eecfc143f60f",
    "b33e5ce0-9efb-424e-9963-7e0d8e3168f3", "c698eb86-9305-43f6-9b37-2ed66c7bf134",
    "305fd8bb-103e-49f9-b939-8ff896c14630", "d838e985-709f-4f86-91d4-83e9ebdb2638",
    "7548fc8e-7389-4171-aa3e-324c08470a6c", "8bee860a-a035-46ae-9562-b91cbbfa16f9",
    "080577bc-0e54-47be-a931-8ae4ff5a7e58", "fdb0173d-8e42-4f06-ab99-d4da76e33db3",
    "b951d8e4-11ad-4b82-87aa-a746c93e5da0", "c0daba3e-4d43-42eb-8287-6e4a2bc9165d",
    "f2252926-d621-4f93-b6d3-24151a690d55", "d36eaff0-b9ea-42a1-af89-b7413119a513",
    "62eea729-37e4-441f-8255-a0d015cbb9ce", "95ef942a-fbba-4673-9a3b-fe66ca7c28eb",
    "c9215559-fae2-45bb-b3b3-579549f471dc", "f8317246-8be7-4cf7-beaf-04b3970b5514",
    "5187c5ee-0160-4c28-98f9-4b6e51086da3", "66bf93bb-064d-4952-b88d-71b563be8257",
    "c8697ff4-ea8b-491a-af13-df8198f8e8f8"
}


def load_decisoes() -> dict[str, dict]:
    if DECISOES_PATH.exists():
        try:
            return json.loads(DECISOES_PATH.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def save_decisoes(data: dict[str, dict]) -> None:
    DECISOES_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def get_all_items() -> list[dict]:
    items = []
    decisoes = load_decisoes()

    # 1. Louvor 506 (Cifra I e II)
    p506_id = "70845455-7bb1-455a-990b-c6082b75261f"
    c506_items = [
        {
            "id": f"{p506_id}_c1",
            "praise_id": p506_id,
            "praise_name": "Tu Que Estás Assentado",
            "praise_number": "506",
            "kind_label": "Cifra I",
            "pdf_material_id": "249f4dca-16c0-4df0-89dd-0c81e3f6ac89",
            "chord_material_id": "f0e9fbb2-8b77-5efc-b6c0-5d51e0d9d3d0",
            "tag": "recem_extraido",
            "batch_id": "coletanea",
        },
        {
            "id": f"{p506_id}_c2",
            "praise_id": p506_id,
            "praise_name": "Tu Que Estás Assentado",
            "praise_number": "506",
            "kind_label": "Cifra II",
            "pdf_material_id": "2349f5b0-96b7-499f-8b75-0a211cbbf394",
            "chord_material_id": "d0a04183-4f84-5343-afcc-c51546ac356d",
            "tag": "recem_extraido",
            "batch_id": "coletanea",
        }
    ]
    items.extend(c506_items)

    # 2. Os 517 Louvores Avulsos
    if FILA_PATH.exists():
        with open(FILA_PATH, "r", encoding="utf-8") as f:
            fila = json.load(f)
        for b in fila.get("batches", []):
            bid = b["batch_id"]
            for it in b.get("items", []):
                pid = it["praise_id"]
                cid = it.get("chord_material_id")
                mid = it.get("pdf_material_id")
                tag = "ajustado_sintaxe" if pid in AJUSTADOS_SINTAXE else "avulso"
                items.append({
                    "id": f"{pid}_{cid}",
                    "praise_id": pid,
                    "praise_name": it.get("praise_name", ""),
                    "praise_number": it.get("praise_number", ""),
                    "kind_label": "Cifra",
                    "pdf_material_id": mid,
                    "chord_material_id": cid,
                    "tag": tag,
                    "batch_id": bid,
                })

    # Adicionar status de decisão
    for it in items:
        cid = it.get("chord_material_id")
        dec = decisoes.get(cid, {})
        it["status"] = dec.get("status", "pendente")
        it["notes"] = dec.get("notes", "")
        it["reviewed_at"] = dec.get("reviewed_at", "")

    return items


def render_chordpro_html(chord_text: str) -> str:
    """Renderiza ChordPro em blocos HTML com acordes destacados sobre a letra."""
    lines = chord_text.splitlines()
    html_lines = []
    in_comment = False

    for line in lines:
        s = line.strip()
        if not s:
            html_lines.append('<div class="cp-empty">&nbsp;</div>')
            continue

        # Diretivas
        m_dir = re.match(r"^\{([^:]+)(?::\s*(.*))?\}$", s)
        if m_dir:
            d_key = m_dir.group(1).lower()
            d_val = m_dir.group(2) or ""
            if d_key in {"title", "t"}:
                html_lines.append(f'<div class="cp-title">{html.escape(d_val)}</div>')
            elif d_key in {"subtitle", "st"}:
                html_lines.append(f'<div class="cp-subtitle">{html.escape(d_val)}</div>')
            elif d_key in {"key", "k"}:
                html_lines.append(f'<div class="cp-meta"><span class="badge key">Tom: {html.escape(d_val)}</span></div>')
            elif d_key in {"rhythm", "time"}:
                html_lines.append(f'<div class="cp-meta"><span class="badge rhythm">Ritmo: {html.escape(d_val)}</span></div>')
            elif d_key in {"comment", "c"}:
                html_lines.append(f'<div class="cp-comment">{html.escape(d_val)}</div>')
            continue

        # Linha de acordes e letra
        # Parse tokens [Acorde]Letra
        tokens = re.split(r"(\[[^\]]+\])", line)
        cells = []
        current_chord = ""
        for tok in tokens:
            if not tok:
                continue
            if tok.startswith("[") and tok.endswith("]"):
                current_chord = tok[1:-1]
            else:
                cells.append((current_chord, tok))
                current_chord = ""
        if current_chord:
            cells.append((current_chord, ""))

        if cells:
            row_html = ['<div class="cp-row">']
            for c, lyr in cells:
                chord_html = f'<span class="cp-chord">{html.escape(c)}</span>' if c else '<span class="cp-chord empty">&nbsp;</span>'
                lyr_html = f'<span class="cp-lyric">{html.escape(lyr)}</span>' if lyr else '<span class="cp-lyric empty">&nbsp;</span>'
                row_html.append(f'<div class="cp-cell">{chord_html}{lyr_html}</div>')
            row_html.append('</div>')
            html_lines.append("".join(row_html))
        else:
            html_lines.append(f'<div class="cp-raw">{html.escape(line)}</div>')

    return "\n".join(html_lines)


class ConferenciaHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        path = url.path

        if path == "/":
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(HTML_INDEX.encode("utf-8"))
            return

        if path == "/api/items":
            items = get_all_items()
            total = len(items)
            aprovados = sum(1 for it in items if it.get("status") == "aprovado")
            ajustados = sum(1 for it in items if it.get("tag") == "ajustado_sintaxe")
            resumo = {
                "total": total,
                "aprovados": aprovados,
                "pendentes": total - aprovados,
                "ajustados_sintaxe": ajustados,
                "items": items,
            }
            self.send_json(resumo)
            return

        if path == "/api/item":
            qs = urllib.parse.parse_qs(url.query)
            pid = qs.get("praise_id", [""])[0]
            cid = qs.get("chord_material_id", [""])[0]
            chord_file = ASSETS_DIR / pid / f"{cid}.chord"

            raw_chord = ""
            if chord_file.exists():
                raw_chord = chord_file.read_text(encoding="utf-8", errors="replace")

            rendered = render_chordpro_html(raw_chord)
            self.send_json({
                "raw": raw_chord,
                "rendered": rendered,
                "exists": chord_file.exists(),
            })
            return

        if path == "/api/pdf":
            qs = urllib.parse.parse_qs(url.query)
            pid = qs.get("praise_id", [""])[0]
            mid = qs.get("material_id", [""])[0]
            pdf_path = ASSETS_DIR / pid / f"{mid}.pdf"

            if not pdf_path.exists():
                # Tenta baixar do R2 temporariamente
                r2_path = f"{R2_BUCKET}/storage/assets/praises/{pid}/{mid}.pdf"
                pdf_path.parent.mkdir(parents=True, exist_ok=True)
                cmd = ["wrangler", "r2", "object", "get", r2_path, f"--file={str(pdf_path)}", "--remote"]
                subprocess.run(cmd, cwd=str(ROOT / "api"), capture_output=True)

            if pdf_path.exists():
                self.send_response(200)
                self.send_header("Content-Type", "application/pdf")
                self.send_header("Content-Length", str(pdf_path.stat().st_size))
                self.end_headers()
                with open(pdf_path, "rb") as f:
                    self.wfile.write(f.read())
            else:
                self.send_error(404, "PDF não encontrado")
            return

        self.send_error(404, "Endpoint não encontrado")

    def do_POST(self):
        url = urllib.parse.urlparse(self.path)
        path = url.path
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length > 0 else b"{}"
        try:
            payload = json.loads(body.decode("utf-8"))
        except Exception:
            payload = {}

        if path == "/api/save":
            pid = payload.get("praise_id")
            cid = payload.get("chord_material_id")
            content = payload.get("content", "")
            if not pid or not cid or not content.strip():
                self.send_json({"error": "Parâmetros inválidos"}, status=400)
                return

            local_path = ASSETS_DIR / pid / f"{cid}.chord"
            local_path.parent.mkdir(parents=True, exist_ok=True)
            local_path.write_text(content, encoding="utf-8")

            # Upload para R2
            r2_obj = f"{R2_BUCKET}/storage/assets/praises/{pid}/{cid}.chord"
            cmd = ["wrangler", "r2", "object", "put", r2_obj, f"--file={str(local_path)}", "--remote"]
            res = subprocess.run(cmd, cwd=str(ROOT / "api"), capture_output=True, text=True)
            r2_ok = (res.returncode == 0)

            self.send_json({"ok": True, "r2_synced": r2_ok, "rendered": render_chordpro_html(content)})
            return

        if path == "/api/decide":
            cid = payload.get("chord_material_id")
            status = payload.get("status", "aprovado")
            notes = payload.get("notes", "")

            if not cid:
                self.send_json({"error": "chord_material_id ausente"}, status=400)
                return

            decisoes = load_decisoes()
            decisoes[cid] = {
                "status": status,
                "notes": notes,
                "reviewed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            }
            save_decisoes(decisoes)
            self.send_json({"ok": True})
            return

        self.send_error(404, "Endpoint não encontrado")

    def send_json(self, data: dict, status: int = 200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


HTML_INDEX = r"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Coldigom — Conferência de Cifras (PDF vs ChordPro)</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0c0e14;
      --surface: #141824;
      --surface-2: #1c2234;
      --border: #2a334d;
      --text: #f0f4fc;
      --text-muted: #8b9bb4;
      --primary: #4f7df9;
      --primary-hover: #3d6be6;
      --accent-chord: #ff6b6b;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    /* Topbar */
    header {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 10px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      z-index: 10;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 700;
      font-size: 16px;
    }
    .brand-tag {
      background: rgba(79, 125, 249, 0.15);
      color: var(--primary);
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .stats {
      font-size: 13px;
      color: var(--text-muted);
      display: flex;
      gap: 16px;
      align-items: center;
    }
    .stats strong { color: var(--text); }
    .filters {
      display: flex;
      gap: 8px;
    }
    .filter-btn {
      background: var(--surface-2);
      border: 1px solid var(--border);
      color: var(--text-muted);
      padding: 5px 12px;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .filter-btn:hover { color: var(--text); border-color: var(--primary); }
    .filter-btn.active { background: var(--primary); color: #fff; border-color: var(--primary); }

    /* Layout Principal */
    .workspace {
      display: flex;
      flex: 1;
      overflow: hidden;
    }
    /* Sidebar da lista */
    .sidebar {
      width: 320px;
      background: var(--surface);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .search-box {
      padding: 12px;
      border-bottom: 1px solid var(--border);
    }
    .search-box input {
      width: 100%;
      background: var(--surface-2);
      border: 1px solid var(--border);
      padding: 8px 12px;
      border-radius: 6px;
      color: var(--text);
      font-size: 13px;
      outline: none;
    }
    .search-box input:focus { border-color: var(--primary); }
    .song-list {
      flex: 1;
      overflow-y: auto;
    }
    .song-item {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 4px;
      transition: background 0.1s;
    }
    .song-item:hover { background: var(--surface-2); }
    .song-item.active { background: rgba(79, 125, 249, 0.12); border-left: 3px solid var(--primary); }
    .song-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text);
    }
    .song-sub {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: var(--text-muted);
    }
    .badge-status {
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .badge-status.pendente { background: rgba(245, 158, 11, 0.15); color: var(--warning); }
    .badge-status.aprovado { background: rgba(16, 185, 129, 0.15); color: var(--success); }
    .badge-tag {
      background: rgba(255, 107, 107, 0.12);
      color: var(--accent-chord);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
    }

    /* Painel Lado a Lado */
    .split-pane {
      flex: 1;
      display: flex;
      overflow: hidden;
    }
    /* Coluna PDF */
    .pane-pdf {
      flex: 1;
      background: #000;
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
    }
    .pane-header {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 8px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
    }
    .pane-pdf iframe, .pane-pdf embed {
      flex: 1;
      width: 100%;
      height: 100%;
      border: none;
    }

    /* Coluna ChordPro */
    .pane-chord {
      flex: 1;
      display: flex;
      flex-direction: column;
      background: var(--bg);
      overflow: hidden;
    }
    .tabs-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 16px;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
    }
    .tab-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 12px;
      font-weight: 600;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
    }
    .tab-btn.active {
      color: var(--text);
      background: var(--surface-2);
    }
    .chord-actions {
      display: flex;
      gap: 8px;
    }
    .btn {
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
      transition: all 0.15s;
    }
    .btn-save { background: var(--surface-2); border-color: var(--border); color: var(--text); }
    .btn-save:hover { border-color: var(--primary); }
    .btn-approve { background: var(--success); color: #fff; }
    .btn-approve:hover { opacity: 0.9; }

    .chord-body {
      flex: 1;
      padding: 24px 32px;
      overflow-y: auto;
      font-family: 'JetBrains Mono', monospace;
    }
    /* Estilos do ChordPro Renderizado */
    .cp-title { font-size: 20px; font-weight: 700; margin-bottom: 4px; font-family: 'Plus Jakarta Sans', sans-serif; }
    .cp-subtitle { font-size: 13px; color: var(--text-muted); margin-bottom: 12px; font-family: 'Plus Jakarta Sans', sans-serif; }
    .cp-meta { margin-bottom: 12px; }
    .badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      margin-right: 6px;
    }
    .badge.key { background: rgba(79, 125, 249, 0.15); color: var(--primary); }
    .badge.rhythm { background: rgba(139, 155, 180, 0.15); color: var(--text-muted); }
    .cp-comment {
      font-size: 13px;
      font-style: italic;
      color: var(--warning);
      margin: 16px 0 6px 0;
      padding: 4px 8px;
      background: rgba(245, 158, 11, 0.08);
      border-left: 2px solid var(--warning);
      border-radius: 0 4px 4px 0;
      width: fit-content;
    }
    .cp-row {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      min-height: 38px;
      margin-bottom: 4px;
    }
    .cp-cell {
      display: inline-flex;
      flex-direction: column;
      align-items: flex-start;
      margin-right: 2px;
    }
    .cp-chord {
      color: var(--accent-chord);
      font-weight: 600;
      font-size: 14px;
      height: 18px;
      line-height: 18px;
    }
    .cp-lyric {
      color: var(--text);
      font-size: 14px;
      height: 20px;
      line-height: 20px;
    }
    .cp-empty { height: 16px; }

    /* Editor raw */
    .chord-editor {
      width: 100%;
      height: 100%;
      background: var(--bg);
      color: var(--text);
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      line-height: 1.6;
      padding: 20px;
      border: none;
      outline: none;
      resize: none;
    }
  </style>
</head>
<body>

  <header>
    <div class="brand">
      <span>🎼 Coldigom</span>
      <span class="brand-tag">Conferência de Cifras</span>
    </div>
    <div class="stats" id="stats">Carregando métricas...</div>
    <div class="filters">
      <button class="filter-btn active" data-filter="todos" onclick="setFilter('todos')">Todos</button>
      <button class="filter-btn" data-filter="pendente" onclick="setFilter('pendente')">Pendentes</button>
      <button class="filter-btn" data-filter="aprovado" onclick="setFilter('aprovado')">Aprovados</button>
      <button class="filter-btn" data-filter="ajustado_sintaxe" onclick="setFilter('ajustado_sintaxe')">36 Sintáticos</button>
      <button class="filter-btn" data-filter="recem_extraido" onclick="setFilter('recem_extraido')">Louvor 506</button>
    </div>
  </header>

  <div class="workspace">
    <!-- Lista lateral -->
    <div class="sidebar">
      <div class="search-box">
        <input type="text" id="searchInput" placeholder="Buscar por título ou número..." oninput="filterList()">
      </div>
      <div class="song-list" id="songList"></div>
    </div>

    <!-- Divisão lado a lado -->
    <div class="split-pane">
      <!-- PDF Original -->
      <div class="pane-pdf">
        <div class="pane-header">
          <span>📄 PDF Original de Produção</span>
          <span id="pdfStatus">Carregando...</span>
        </div>
        <iframe id="pdfFrame" src="about:blank"></iframe>
      </div>

      <!-- Cifra Extraída -->
      <div class="pane-chord">
        <div class="tabs-bar">
          <div style="display:flex; gap:4px;">
            <button class="tab-btn active" id="tabRender" onclick="setTab('render')">Formatado</button>
            <button class="tab-btn" id="tabRaw" onclick="setTab('raw')">Editor Código</button>
          </div>
          <div class="chord-actions">
            <button class="btn btn-save" onclick="saveChord()">💾 Salvar (Ctrl+S)</button>
            <button class="btn btn-approve" onclick="approveAndNext()">✅ Aprovar e Próximo (Alt+A)</button>
          </div>
        </div>

        <div class="chord-body" id="chordRender"></div>
        <textarea class="chord-editor" id="chordEditor" style="display:none;" spellcheck="false"></textarea>
      </div>
    </div>
  </div>

  <script>
    let allItems = [];
    let currentFilter = 'todos';
    let currentIndex = 0;
    let currentItem = null;
    let currentTab = 'render';

    async function loadItems() {
      const res = await fetch('/api/items');
      const data = await res.json();
      allItems = data.items;
      updateStats(data);
      filterList();
      if (allItems.length > 0) {
        selectItem(0);
      }
    }

    function updateStats(data) {
      document.getElementById('stats').innerHTML = `
        <span>Total: <strong>${data.total}</strong></span>
        <span>Aprovados: <strong style="color:var(--success)">${data.aprovados}</strong></span>
        <span>Pendentes: <strong style="color:var(--warning)">${data.pendentes}</strong></span>
        <span>Sintáticos Corrigidos: <strong style="color:var(--accent-chord)">${data.ajustados_sintaxe}</strong></span>
      `;
    }

    function setFilter(filt) {
      currentFilter = filt;
      document.querySelectorAll('.filter-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.filter === filt);
      });
      filterList();
    }

    function filterList() {
      const q = document.getElementById('searchInput').value.toLowerCase().trim();
      const listEl = document.getElementById('songList');
      listEl.innerHTML = '';

      const filtered = allItems.filter(it => {
        const matchQ = !q || it.praise_name.toLowerCase().includes(q) || (it.praise_number && it.praise_number.includes(q));
        if (!matchQ) return false;
        if (currentFilter === 'pendente') return it.status === 'pendente';
        if (currentFilter === 'aprovado') return it.status === 'aprovado';
        if (currentFilter === 'ajustado_sintaxe') return it.tag === 'ajustado_sintaxe';
        if (currentFilter === 'recem_extraido') return it.tag === 'recem_extraido';
        return true;
      });

      filtered.forEach((it, idx) => {
        const div = document.createElement('div');
        div.className = 'song-item' + (currentItem && currentItem.id === it.id ? ' active' : '');
        div.onclick = () => selectItemById(it.id);

        const tagLabel = it.tag === 'ajustado_sintaxe' ? '<span class="badge-tag">Sintaxe</span>' : (it.tag === 'recem_extraido' ? '<span class="badge-tag" style="background:rgba(16,185,129,0.15);color:var(--success)">Novo 506</span>' : '');
        const numLabel = it.praise_number ? `#${it.praise_number} - ` : '';

        div.innerHTML = `
          <div class="song-title">${numLabel}${it.praise_name} (${it.kind_label})</div>
          <div class="song-sub">
            <span>${tagLabel} ${it.batch_id}</span>
            <span class="badge-status ${it.status}">${it.status}</span>
          </div>
        `;
        listEl.appendChild(div);
      });
    }

    async function selectItemById(id) {
      const idx = allItems.findIndex(it => it.id === id);
      if (idx !== -1) selectItem(idx);
    }

    async function selectItem(idx) {
      currentIndex = idx;
      currentItem = allItems[idx];
      filterList();

      // Carregar PDF
      const pdfUrl = `/api/pdf?praise_id=${currentItem.praise_id}&material_id=${currentItem.pdf_material_id}`;
      document.getElementById('pdfFrame').src = pdfUrl;
      document.getElementById('pdfStatus').textContent = `${currentItem.praise_name} (${currentItem.kind_label})`;

      // Carregar Cifra
      const res = await fetch(`/api/item?praise_id=${currentItem.praise_id}&chord_material_id=${currentItem.chord_material_id}`);
      const data = await res.json();

      document.getElementById('chordRender').innerHTML = data.rendered;
      document.getElementById('chordEditor').value = data.raw;
    }

    function setTab(tab) {
      currentTab = tab;
      document.getElementById('tabRender').classList.toggle('active', tab === 'render');
      document.getElementById('tabRaw').classList.toggle('active', tab === 'raw');
      document.getElementById('chordRender').style.display = tab === 'render' ? 'block' : 'none';
      document.getElementById('chordEditor').style.display = tab === 'raw' ? 'block' : 'none';

      if (tab === 'render') {
        // Atualiza renderização ao voltar para a aba formatada
        saveChord(false);
      }
    }

    async function saveChord(showFeedback = true) {
      if (!currentItem) return;
      const content = document.getElementById('chordEditor').value;
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          praise_id: currentItem.praise_id,
          chord_material_id: currentItem.chord_material_id,
          content: content,
        })
      });
      const data = await res.json();
      if (data.ok) {
        document.getElementById('chordRender').innerHTML = data.rendered;
        if (showFeedback) alert('Cifra salva e sincronizada no Cloudflare R2 com sucesso!');
      }
    }

    async function approveAndNext() {
      if (!currentItem) return;
      await fetch('/api/decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chord_material_id: currentItem.chord_material_id,
          status: 'aprovado',
        })
      });
      currentItem.status = 'aprovado';
      filterList();

      // Próximo
      if (currentIndex + 1 < allItems.length) {
        selectItem(currentIndex + 1);
      } else {
        alert('🎉 Todos os louvores filtrados foram revisados!');
      }
    }

    // Atalhos de teclado
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveChord();
      } else if (e.altKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        approveAndNext();
      }
    });

    loadItems();
  </script>
</body>
</html>
"""


def run_server():
    port = DEFAULT_PORT
    handler = ConferenciaHandler
    httpd = None

    for attempt_port in [DEFAULT_PORT, 8766, 8767, 8768]:
        try:
            httpd = socketserver.TCPServer(("", attempt_port), handler)
            port = attempt_port
            break
        except OSError:
            continue

    if not httpd:
        print(f"❌ Não foi possível vincular o servidor em nenhuma porta próxima de {DEFAULT_PORT}")
        sys.exit(1)

    print(f"\n=======================================================")
    print(f"🚀 Painel de Conferência de Cifras (Coldigom) no ar!")
    print(f"👉 Acesse no navegador: http://localhost:{port}")
    print(f"=======================================================\n")
    print("Recursos disponíveis:")
    print("  ✓ Split-view nativo: PDF original à esquerda vs ChordPro à direita")
    print("  ✓ Visualização formatada com acordes sobre sílabas")
    print("  ✓ Editor de código com salvamento automático e sync no R2 (Ctrl+S)")
    print("  ✓ Aprovação com 1 clique (Alt+A) e avanço automático")
    print("  ✓ Filtros rápidos: Todos, 36 Sintáticos, Louvor 506, Pendentes, Aprovados")
    print("\nPressione Ctrl+C para encerrar o servidor.\n")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n🛑 Servidor encerrado.")
        httpd.server_close()


if __name__ == "__main__":
    run_server()
