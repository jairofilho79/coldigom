#!/usr/bin/env python3
"""
scripts/extrair_letras_acervo.py

Extrator Completo e Determinístico de Letras para Louvores sem Letra no Coldigom.
Processa todos os 294 louvores sem letra cadastrada, utilizando a hierarquia de fontes:
1. Arquivos explícitos de Letra (Lyrics.pdf / *Letra.pdf*)
2. Cifras estruturadas (.chord / ChordPro em staging e avulsos extraídos)
3. Partituras de Coro (Choir / Choir and Piano em PDF com de-hifenização silábica)
4. Partituras Gerais (Score / Sheet Music em PDF)
5. Fallback em PDFs secundários presentes no diretório do louvor

Gera:
- /tmp/coldigom_extracao_letras_completa.json
- /tmp/coldigom_extracao_letras_review.html
"""

from __future__ import annotations

import json
import os
import re
import sqlite3
import subprocess
import sys
import time
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT_DB = ROOT / "scripts" / "validate-acervo" / "out" / "snapshot.sqlite"
EMBEDDINGS_DB = ROOT / "data" / "embeddings" / "acervo_embeddings.sqlite"
ASSETS_DIR = ROOT / "storage" / "assets" / "praises"
EXTRAIDAS_DIR = ROOT / "storage" / "cifras_avulsos_extraidas"
CHORDPRO_STAGING_DIR = ROOT / "storage" / "chordpro_staging"

OUT_JSON = Path("/tmp/coldigom_extracao_letras_completa.json")
OUT_HTML = Path("/tmp/coldigom_extracao_letras_review.html")

CHORD_REGEX = re.compile(
    r"^[A-G][b#]?(?:m|maj|min|dim|aug|sus\d*|\d+)*(?:/[A-G][b#]?)?$", re.IGNORECASE
)


def normalize_text_simple(text: str) -> str:
    """Normaliza texto para comparações léxicas."""
    if not text:
        return ""
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c)).lower()
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", text)).strip()


def extract_lyrics_from_chordpro(text: str) -> str:
    """Extrai letra limpa a partir de arquivo ChordPro ou texto indexado de cifra."""
    clean_lines = []

    for line in text.splitlines():
        line = line.strip()
        if not line:
            if clean_lines and clean_lines[-1] != "":
                clean_lines.append("")
            continue

        # Diretivas ChordPro
        if line.startswith("{"):
            m_comment = re.match(r"\{comment:\s*(.+?)\}", line, re.IGNORECASE)
            m_c = re.match(r"\{c:\s*(.+?)\}", line, re.IGNORECASE)
            comm = m_comment.group(1) if m_comment else (m_c.group(1) if m_c else "")
            if comm:
                comm_lower = comm.lower()
                if "coro" in comm_lower or "refr" in comm_lower:
                    clean_lines.append("\n[CORO]")
                elif "final" in comm_lower:
                    clean_lines.append("\n[FINAL]")
            continue

        # Ignora cabeçalhos de metadados se vazados no texto
        if line.startswith("Cifra:") or line.startswith("Tom:") or line.startswith("Conteúdo:"):
            continue

        # Remove acordes inline entre colchetes: [G], [C/E], etc.
        no_chords = re.sub(r"\[[^\]]+\]", "", line).strip()
        # Remove caracteres de compasso / tabulação
        no_chords = no_chords.replace("|", "")
        no_chords = re.sub(r"\s+", " ", no_chords).strip()

        if not no_chords or not any(c.isalpha() for c in no_chords):
            continue

        # Avalia se a linha é composta majoritariamente por nomes de acordes soltos (sem colchetes)
        words = [w.strip("()?,.!:;\"'") for w in no_chords.split() if w.strip("()?,.!:;\"'")]
        if words:
            chord_count = sum(1 for w in words if CHORD_REGEX.match(w))
            ratio = chord_count / len(words)
            if ratio >= 0.5:
                # É linha harmônica
                continue

            # Remove acordes isolados que ficaram no final da linha
            tokens = no_chords.split()
            while tokens and CHORD_REGEX.match(tokens[-1].strip("()?,.!:;\"'")):
                tokens.pop()
            no_chords = " ".join(tokens).strip()

        if no_chords and any(c.isalpha() for c in no_chords):
            clean_lines.append(no_chords)

    result = "\n".join(clean_lines).strip()
    return result


def extract_lyrics_from_pdf(pdf_path: Path) -> str:
    """Extrai texto vetorial de PDF com Ghostscript em modo quieto e reconstrói versos."""
    try:
        res = subprocess.run(
            ["gs", "-q", "-sDEVICE=txtwrite", "-o", "-", str(pdf_path)],
            capture_output=True,
            text=True,
            check=True,
        )
        raw_text = res.stdout
    except Exception as e:
        return f"(Erro ao extrair via gs: {e})"

    # Limpeza e descarte de banners, licenças e ruídos musicais
    lines = []
    noise_substrings = (
        "ghostscript",
        "copyright",
        "copying",
        "artifex",
        "all rights reserved",
        "gnu agpl",
        "this software is",
        "processing pages",
        "loading font",
    )

    for line in raw_text.splitlines():
        l_str = line.strip()
        if not l_str:
            if lines and lines[-1] != "":
                lines.append("")
            continue

        l_lower = l_str.lower()
        if any(ns in l_lower for ns in noise_substrings):
            continue

        # Remove caracteres/símbolos de notação musical de fontes de partitura (ex: œ, ˙, ™)
        if any(c in l_str for c in ("œ", "˙", "™", "≤", "≥", "∑", "∏")):
            continue

        # Remove numeração de compassos isoladas
        if l_str.isdigit():
            continue

        # Remove indicações de andamento isoladas (ex: q = 80, q. = 50)
        if re.match(r"^q\s*=?\s*\d+", l_str, re.IGNORECASE) or re.match(r"^q\.\s*=?\s*\d+", l_str, re.IGNORECASE):
            continue

        # Remove indicações vocais abreviadas (1 T., 2 T., Bar., Bx., Sopr., Contr., Choir)
        l_str = re.sub(r"^\s*(1\s*T\.|2\s*T\.|Bar\.|Bx\.|Sopr\.|Contr\.|Choir)\s*", "", l_str).strip()

        if any(c.isalpha() for c in l_str):
            lines.append(l_str)

    joined = "\n".join(lines).strip()

    # Reconstrução silábica de partituras (ex: "al - can - ça - rá" -> "alcançará")
    joined = re.sub(r"(\w+)\s*-\s*(\w+)", r"\1\2", joined)

    return joined


def find_best_material_and_extract(
    praise_id: str,
    praise_name: str,
    praise_number: str,
    materials: list[dict],
    conn_emb: sqlite3.Connection | None,
) -> tuple[str, str, str, str]:
    """
    Encontra o melhor material para extração e executa o extrator.
    Retorna: (extracted_lyrics, source_category, file_path, status_label)
    """
    norm_pname = normalize_text_simple(praise_name)

    # 1. Prioridade 1: Arquivo explícito de Letra (Lyrics.pdf / *Letra.pdf*)
    for m in materials:
        m_name = m.get("kind_name", "")
        f_path = m.get("file_path_legacy", "") or ""
        mid = m["id"]
        if (m_name == "Lyrics" or "letra" in f_path.lower()) and m["type"] == "pdf":
            cand = list((ASSETS_DIR / praise_id).glob(f"{mid}.pdf"))
            if cand:
                txt = extract_lyrics_from_pdf(cand[0])
                if len(txt) >= 40:
                    return txt, "PDF de Letra Original", str(cand[0].relative_to(ROOT)), "ALTA_CONFIANÇA (Letra.pdf)"

    # 2. Prioridade 2: Cifras estruturadas (.chord ou chords_semantic)
    if conn_emb:
        c_emb = conn_emb.cursor()
        chord_rows = c_emb.execute(
            "SELECT material_id, filename, text_indexed FROM chords_semantic WHERE praise_id = ?",
            (praise_id,),
        ).fetchall()
        if chord_rows:
            best_row = None
            best_score = -1.0
            for mat_id_c, fname_c, ctext in chord_rows:
                score = 1
                if praise_number and praise_number.isdigit() and f"-{int(praise_number)}-" in fname_c:
                    score += 20
                if norm_pname and (norm_pname in normalize_text_simple(fname_c) or normalize_text_simple(fname_c) in norm_pname):
                    score += 10
                if score > best_score:
                    best_score = score
                    best_row = (mat_id_c, fname_c, ctext)
            if best_row:
                mat_id_c, fname_c, ctext = best_row
                local_chordpro = CHORDPRO_STAGING_DIR / mat_id_c / fname_c
                if local_chordpro.exists():
                    txt = extract_lyrics_from_chordpro(local_chordpro.read_text(encoding="utf-8", errors="replace"))
                    if len(txt) >= 40:
                        return txt, "Cifra Estruturada (.chord)", str(local_chordpro.relative_to(ROOT)), "ALTA_CONFIANÇA (Cifra)"
                elif ctext:
                    txt = extract_lyrics_from_chordpro(ctext)
                    if len(txt) >= 40:
                        return txt, "Cifra Estruturada (.chord)", f"storage/chordpro_staging/{mat_id_c}/{fname_c}", "ALTA_CONFIANÇA (Cifra)"

    # 2.b. Verifica na pasta de cifras avulsas extraídas
    avulso_candidates = list(EXTRAIDAS_DIR.glob(f"*/{praise_id}*.chord"))
    if avulso_candidates:
        txt = extract_lyrics_from_chordpro(avulso_candidates[0].read_text(encoding="utf-8", errors="replace"))
        if len(txt) >= 40:
            return txt, "Cifra Estruturada (.chord)", str(avulso_candidates[0].relative_to(ROOT)), "ALTA_CONFIANÇA (Cifra Avulsa)"

    # 2.c. Verifica arquivo .chord diretamente na pasta do louvor
    chord_in_assets = list((ASSETS_DIR / praise_id).glob("*.chord"))
    if chord_in_assets:
        txt = extract_lyrics_from_chordpro(chord_in_assets[0].read_text(encoding="utf-8", errors="replace"))
        if len(txt) >= 40:
            return txt, "Cifra Estruturada (.chord)", str(chord_in_assets[0].relative_to(ROOT)), "ALTA_CONFIANÇA (Cifra Asset)"

    # 3. Prioridade 3: Partituras de Coro (Choir / Choir and Piano)
    for m in materials:
        m_name = m.get("kind_name", "")
        mid = m["id"]
        if m_name in ("Choir", "Choir and Piano") and m["type"] == "pdf":
            cand = list((ASSETS_DIR / praise_id).glob(f"{mid}.pdf"))
            if cand:
                txt = extract_lyrics_from_pdf(cand[0])
                if len(txt) >= 40:
                    return txt, "Partitura de Coro (PDF)", str(cand[0].relative_to(ROOT)), "MÉDIA_CONFIANÇA (Coro)"

    # 4. Prioridade 4: Partituras Gerais (Score / Sheet Music)
    for m in materials:
        m_name = m.get("kind_name", "")
        mid = m["id"]
        if m_name in ("Score", "Sheet Music") and m["type"] == "pdf":
            cand = list((ASSETS_DIR / praise_id).glob(f"{mid}.pdf"))
            if cand:
                txt = extract_lyrics_from_pdf(cand[0])
                if len(txt) >= 40:
                    return txt, "Partitura Geral (PDF)", str(cand[0].relative_to(ROOT)), "MÉDIA_CONFIANÇA (Score)"

    # 5. Fallback: Qualquer outro PDF presente na pasta do louvor
    if (ASSETS_DIR / praise_id).exists():
        for f in sorted((ASSETS_DIR / praise_id).iterdir()):
            if f.suffix.lower() == ".pdf":
                txt = extract_lyrics_from_pdf(f)
                words = [w for w in txt.split() if len(w) > 2]
                if len(words) >= 15:
                    return txt, "PDF Suporte (Fallback)", str(f.relative_to(ROOT)), "REVISÃO_NECESSÁRIA (Fallback)"

    return "(Nenhum material de partitura ou cifra legível encontrado)", "Sem Material Legível", "(Nenhum arquivo aplicável)", "INSUFICIENTE"


def main():
    print("=" * 70)
    print("🚀 EXTRATOR COMPLETO DE LETRAS — COLDIGOM (294 LOUVORES)")
    print("=" * 70)
    t0 = time.time()

    conn_snap = sqlite3.connect(SNAPSHOT_DB)
    c_snap = conn_snap.cursor()

    conn_emb = None
    if EMBEDDINGS_DB.exists():
        conn_emb = sqlite3.connect(EMBEDDINGS_DB)

    # 1. Carrega todos os louvores sem letra
    q_praises = """
        SELECT p.id, p.name, p.number, p.tonality, p.rhythm, GROUP_CONCAT(DISTINCT t.name) as tags
        FROM praises p
        LEFT JOIN praise_tags pt ON p.id = pt.praise_id
        LEFT JOIN tags t ON pt.tag_id = t.id
        WHERE p.lyrics IS NULL OR trim(p.lyrics) = ''
        GROUP BY p.id
        ORDER BY p.name;
    """
    praises = c_snap.execute(q_praises).fetchall()
    total_praises = len(praises)
    print(f"📊 {total_praises} louvores sem letra carregados do acervo oficial.")

    # 2. Carrega materiais de cada louvor
    q_materials = """
        SELECT pm.praise_id, pm.id, pm.material_kind, pm.type, pm.file_path_legacy, mk.name as kind_name
        FROM praise_materials pm
        JOIN material_kinds mk ON pm.material_kind = mk.id
        WHERE pm.praise_id IN (SELECT id FROM praises WHERE lyrics IS NULL OR trim(lyrics) = '');
    """
    materials_by_praise = {}
    for r in c_snap.execute(q_materials).fetchall():
        pid = r[0]
        materials_by_praise.setdefault(pid, []).append({
            "id": r[1],
            "kind_id": r[2],
            "type": r[3],
            "file_path_legacy": r[4],
            "kind_name": r[5],
        })

    results = []
    stats = {
        "Letra.pdf": 0,
        "Cifra": 0,
        "Coro": 0,
        "Score": 0,
        "Fallback": 0,
        "Insuficiente": 0,
    }

    for idx, (pid, pname, pnum, ton, rhy, tags) in enumerate(praises, 1):
        mats = materials_by_praise.get(pid, [])
        extracted_lyrics, source_cat, file_path, status_label = find_best_material_and_extract(
            pid, pname, pnum, mats, conn_emb
        )

        # Atualiza estatísticas
        if "Letra.pdf" in status_label:
            stats["Letra.pdf"] += 1
            badge_class = "pass"
        elif "Cifra" in status_label:
            stats["Cifra"] += 1
            badge_class = "pass"
        elif "Coro" in status_label:
            stats["Coro"] += 1
            badge_class = "pass"
        elif "Score" in status_label:
            stats["Score"] += 1
            badge_class = "warning"
        elif "Fallback" in status_label:
            stats["Fallback"] += 1
            badge_class = "warning"
        else:
            stats["Insuficiente"] += 1
            badge_class = "fail"

        results.append({
            "i": idx,
            "praise_id": pid,
            "praise_name": pname,
            "praise_number": pnum or "",
            "tags": tags or "",
            "tonality": ton or "",
            "rhythm": rhy or "",
            "coldigom_url": f"https://coldigom-web.pages.dev/praise/{pid}",
            "source_category": source_cat,
            "file_path": file_path,
            "status_label": status_label,
            "badge_class": badge_class,
            "char_count": len(extracted_lyrics) if status_label != "INSUFICIENTE" else 0,
            "extracted_lyrics": extracted_lyrics,
        })

        if idx % 50 == 0 or idx == total_praises:
            print(f"   Progresso: {idx:03d}/{total_praises} ({idx * 100 // total_praises}%)")

    dt = round(time.time() - t0, 2)
    print("\n" + "=" * 70)
    print(f"✅ Extração de todos os {total_praises} louvores concluída em {dt}s!")
    print("📈 Resumo da extração por fonte:")
    print(f"   - Letra.pdf (Original): {stats['Letra.pdf']}")
    print(f"   - Cifras Estruturadas (.chord): {stats['Cifra']}")
    print(f"   - Partituras de Coro (Choir PDF): {stats['Coro']}")
    print(f"   - Partituras Gerais (Score PDF): {stats['Score']}")
    print(f"   - PDFs Suporte (Fallback): {stats['Fallback']}")
    print(f"   - Sem material viável (Insuficiente): {stats['Insuficiente']}")
    recuperados = total_praises - stats["Insuficiente"]
    print(f"🎯 Total Recuperado com Sucesso: {recuperados}/{total_praises} ({recuperados*100//total_praises}%)")
    print("=" * 70)

    # 3. Salva JSON estruturado
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"💾 Base de dados JSON completa salva em: {OUT_JSON}")

    # 4. Gera aplicação HTML de revisão
    render_full_review_app(results, stats, dt)


def render_full_review_app(results: list[dict], stats: dict, elapsed_s: float):
    payload_json = json.dumps(results, ensure_ascii=False)

    html_content = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Coldigom — Curadoria Completa de Letras (294 Louvores)</title>
<style>
  :root {{
    --bg: #0f172a;
    --panel: #1e293b;
    --card: #1e293b;
    --card-border: #334155;
    --text: #f8fafc;
    --text-muted: #94a3b8;
    --primary: #38bdf8;
    --primary-hover: #0ea5e9;
    --success: #22c55e;
    --success-bg: rgba(34, 197, 94, 0.15);
    --warning: #f59e0b;
    --warning-bg: rgba(245, 158, 11, 0.15);
    --danger: #ef4444;
    --danger-bg: rgba(239, 68, 68, 0.15);
  }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
  }}
  header {{
    position: sticky;
    top: 0;
    background: var(--panel);
    border-bottom: 1px solid var(--card-border);
    padding: 12px 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    z-index: 100;
  }}
  .brand {{
    display: flex;
    align-items: center;
    gap: 12px;
  }}
  .brand h1 {{
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--primary);
  }}
  .brand .tag {{
    font-size: 0.75rem;
    background: rgba(56, 189, 248, 0.2);
    color: var(--primary);
    padding: 2px 10px;
    border-radius: 999px;
  }}
  .stats-bar {{
    display: flex;
    gap: 16px;
    align-items: center;
    font-size: 0.85rem;
    color: var(--text-muted);
  }}
  .stat-item strong {{
    color: var(--text);
  }}
  .header-actions {{
    display: flex;
    gap: 10px;
  }}
  button {{
    cursor: pointer;
    border: 1px solid var(--card-border);
    background: #334155;
    color: var(--text);
    padding: 7px 14px;
    border-radius: 8px;
    font-size: 0.82rem;
    font-weight: 500;
    transition: all 0.2s;
  }}
  button:hover {{ background: #475569; }}
  button.primary {{
    background: #0284c7;
    border-color: #0284c7;
  }}
  button.primary:hover {{ background: #0369a1; }}
  button.batch-approve {{
    background: #15803d;
    border-color: #15803d;
  }}
  button.batch-approve:hover {{ background: #166534; }}

  main {{
    max-width: 1240px;
    margin: 0 auto;
    padding: 20px 20px 80px;
  }}

  /* Controls bar */
  .controls-bar {{
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 14px;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }}
  .filter-group {{
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }}
  .filter-btn {{
    padding: 6px 12px;
    border-radius: 20px;
    background: var(--panel);
    border: 1px solid var(--card-border);
    color: var(--text-muted);
    font-size: 0.8rem;
  }}
  .filter-btn.active {{
    background: var(--primary);
    color: #0f172a;
    border-color: var(--primary);
    font-weight: 600;
  }}
  .search-input {{
    padding: 7px 14px;
    border-radius: 20px;
    background: #0f172a;
    border: 1px solid var(--card-border);
    color: var(--text);
    font-size: 0.82rem;
    width: 260px;
  }}
  .search-input:focus {{
    outline: none;
    border-color: var(--primary);
  }}

  /* Cards */
  .card {{
    background: var(--card);
    border: 1px solid var(--card-border);
    border-radius: 10px;
    padding: 16px 20px;
    margin-bottom: 16px;
    transition: border-color 0.2s;
  }}
  .card:hover {{ border-color: #475569; }}
  .card.verdict-approved {{ border-color: var(--success); background: rgba(34, 197, 94, 0.03); }}
  .card.verdict-adjust {{ border-color: var(--warning); background: rgba(245, 158, 11, 0.03); }}
  .card.verdict-rejected {{ border-color: var(--danger); background: rgba(239, 68, 68, 0.03); }}

  .card-header {{
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 14px;
    margin-bottom: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    padding-bottom: 10px;
  }}
  .title-group h2 {{
    font-size: 1.1rem;
    color: var(--text);
  }}
  .title-meta {{
    display: flex;
    gap: 10px;
    font-size: 0.8rem;
    color: var(--text-muted);
    align-items: center;
    margin-top: 3px;
  }}
  .title-meta a {{
    color: var(--primary);
    text-decoration: none;
  }}
  .title-meta a:hover {{ text-decoration: underline; }}

  .badge-row {{
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
  }}
  .badge {{
    padding: 3px 9px;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 600;
  }}
  .badge.pass {{ background: var(--success-bg); color: var(--success); }}
  .badge.warning {{ background: var(--warning-bg); color: var(--warning); }}
  .badge.fail {{ background: var(--danger-bg); color: var(--danger); }}
  .badge.source {{ background: #334155; color: #cbd5e1; }}

  .panel-box {{
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 14px;
    margin: 12px 0;
  }}
  .panel-box h3 {{
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    margin-bottom: 8px;
    display: flex;
    justify-content: space-between;
  }}
  pre.lyrics-preview {{
    white-space: pre-wrap;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.82rem;
    line-height: 1.45;
    color: #e2e8f0;
    max-height: 280px;
    overflow-y: auto;
  }}

  .card-footer {{
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
  }}
  .file-origin {{
    font-size: 0.75rem;
    color: #64748b;
    font-family: monospace;
    max-width: 500px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }}
  .decision-choices {{
    display: flex;
    gap: 8px;
  }}
  .choice-btn {{
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 0.78rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 5px;
    border: 1px solid #475569;
    background: #1e293b;
    color: #cbd5e1;
  }}
  .choice-btn:hover {{ background: #334155; }}
  .choice-btn.selected-approve {{
    background: var(--success-bg);
    border-color: var(--success);
    color: var(--success);
  }}
  .choice-btn.selected-adjust {{
    background: var(--warning-bg);
    border-color: var(--warning);
    color: var(--warning);
  }}
  .choice-btn.selected-reject {{
    background: var(--danger-bg);
    border-color: var(--danger);
    color: var(--danger);
  }}
</style>
</head>
<body>
<header>
  <div class="brand">
    <h1>Coldigom Letras</h1>
    <span class="tag">Acervo Completo (294 Louvores)</span>
  </div>
  <div class="stats-bar" id="statsBar">
    Carregando estatísticas...
  </div>
  <div class="header-actions">
    <button type="button" class="batch-approve" onclick="batchApproveHighConfidence()">Aprovar Alta Confiança ({stats['Letra.pdf'] + stats['Cifra'] + stats['Coro']})</button>
    <button type="button" class="primary" onclick="exportVerdicts()">Exportar Vereditos (JSON)</button>
  </div>
</header>

<main>
  <div class="controls-bar">
    <div class="filter-group">
      <button class="filter-btn active" onclick="setFilter('all')">Todos (294)</button>
      <button class="filter-btn" onclick="setFilter('letra_pdf')">Letra.pdf ({stats['Letra.pdf']})</button>
      <button class="filter-btn" onclick="setFilter('cifra')">Cifras ({stats['Cifra']})</button>
      <button class="filter-btn" onclick="setFilter('coro')">Coro PDF ({stats['Coro']})</button>
      <button class="filter-btn" onclick="setFilter('pendentes')">Pendentes</button>
      <button class="filter-btn" onclick="setFilter('aprovados')">Aprovados</button>
      <button class="filter-btn" onclick="setFilter('insuficiente')">Insuficientes ({stats['Insuficiente']})</button>
    </div>
    <input type="text" class="search-input" id="searchBox" placeholder="Buscar por título ou número..." oninput="handleSearch(this.value)"/>
  </div>

  <div id="cardsList"></div>
</main>

<script>
const DATA = {payload_json};
const STORAGE_KEY = 'coldigom_letras_completa_v1';
let currentFilter = 'all';
let searchQuery = '';

function getVerdicts() {{
  try {{
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{{}}');
  }} catch(e) {{
    return {{}};
  }}
}}

function saveVerdict(praiseId, verdict) {{
  const verdicts = getVerdicts();
  verdicts[praiseId] = verdict;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(verdicts));
  render();
}}

function batchApproveHighConfidence() {{
  if (!confirm('Deseja aprovar automaticamente todos os louvores extraídos com Alta e Média Confiança (Letra.pdf, Cifras e Coro)?')) return;
  const verdicts = getVerdicts();
  DATA.forEach(d => {{
    if (d.badge_class === 'pass' && !verdicts[d.praise_id]) {{
      verdicts[d.praise_id] = 'approve';
    }}
  }});
  localStorage.setItem(STORAGE_KEY, JSON.stringify(verdicts));
  render();
}}

function setFilter(f) {{
  currentFilter = f;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  render();
}}

function handleSearch(val) {{
  searchQuery = val.toLowerCase().trim();
  render();
}}

function updateStats() {{
  const verdicts = getVerdicts();
  const total = DATA.length;
  let approved = 0;
  let adjust = 0;
  let rejected = 0;

  DATA.forEach(d => {{
    const v = verdicts[d.praise_id];
    if (v === 'approve') approved++;
    else if (v === 'adjust') adjust++;
    else if (v === 'reject') rejected++;
  }});
  const reviewed = approved + adjust + rejected;

  document.getElementById('statsBar').innerHTML = `
    <span class="stat-item">Revisados: <strong>${{reviewed}}/${{total}}</strong></span>
    <span class="stat-item" style="color: var(--success);">Aprovados: <strong>${{approved}}</strong></span>
    <span class="stat-item" style="color: var(--warning);">Ajustes: <strong>${{adjust}}</strong></span>
    <span class="stat-item" style="color: var(--danger);">Rejeitados: <strong>${{rejected}}</strong></span>
  `;
}}

function escapeHtml(s) {{
  if (!s) return '';
  return s.replace(/[&<>"']/g, c => ({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}})[c]);
}}

function render() {{
  updateStats();
  const verdicts = getVerdicts();
  const listEl = document.getElementById('cardsList');

  const filtered = DATA.filter(d => {{
    const v = verdicts[d.praise_id];
    if (currentFilter === 'letra_pdf' && !d.status_label.includes('Letra.pdf')) return false;
    if (currentFilter === 'cifra' && !d.status_label.includes('Cifra')) return false;
    if (currentFilter === 'coro' && !d.status_label.includes('Coro')) return false;
    if (currentFilter === 'pendentes' && v) return false;
    if (currentFilter === 'aprovados' && v !== 'approve') return false;
    if (currentFilter === 'insuficiente' && d.status_label !== 'INSUFICIENTE') return false;

    if (searchQuery) {{
      const matchName = d.praise_name.toLowerCase().includes(searchQuery);
      const matchNum = d.praise_number.toLowerCase().includes(searchQuery);
      if (!matchName && !matchNum) return false;
    }}
    return true;
  }});

  listEl.innerHTML = filtered.map(d => {{
    const v = verdicts[d.praise_id];
    let cardClass = '';
    if (v === 'approve') cardClass = 'verdict-approved';
    else if (v === 'adjust') cardClass = 'verdict-adjust';
    else if (v === 'reject') cardClass = 'verdict-rejected';

    return `
      <article class="card ${{cardClass}}" id="card-${{d.praise_id}}">
        <div class="card-header">
          <div class="title-group">
            <h2>#${{d.i}} · ${{escapeHtml(d.praise_name)}} ${{d.praise_number ? '(# ' + d.praise_number + ')' : ''}}</h2>
            <div class="title-meta">
              <span>ID: ${{d.praise_id}}</span>
              <span>·</span>
              <a href="${{d.coldigom_url}}" target="_blank" rel="noopener">Abrir no Coldigom ↗</a>
              <span>·</span>
              <span>${{escapeHtml(d.tags || 'Sem tags')}}</span>
            </div>
          </div>
          <div class="badge-row">
            <span class="badge source">${{escapeHtml(d.source_category)}}</span>
            <span class="badge ${{d.badge_class}}">${{escapeHtml(d.status_label)}}</span>
          </div>
        </div>

        <div class="panel-box">
          <h3>
            <span>Letra Extraída do Material</span>
            <span style="color:#64748b;">${{d.char_count}} caracteres</span>
          </h3>
          <pre class="lyrics-preview">${{escapeHtml(d.extracted_lyrics)}}</pre>
        </div>

        <div class="card-footer">
          <div class="file-origin" title="${{escapeHtml(d.file_path)}}">
            Fonte: ${{escapeHtml(d.file_path)}}
          </div>
          <div class="decision-choices">
            <button class="choice-btn ${{v === 'approve' ? 'selected-approve' : ''}}" onclick="saveVerdict('${{d.praise_id}}', 'approve')">
              ✓ Aprovar Letra
            </button>
            <button class="choice-btn ${{v === 'adjust' ? 'selected-adjust' : ''}}" onclick="saveVerdict('${{d.praise_id}}', 'adjust')">
              ⚠ Precisa de Ajuste
            </button>
            <button class="choice-btn ${{v === 'reject' ? 'selected-reject' : ''}}" onclick="saveVerdict('${{d.praise_id}}', 'reject')">
              ✕ Rejeitar
            </button>
          </div>
        </div>
      </article>
    `;
  }}).join('');
}}

function exportVerdicts() {{
  const verdicts = getVerdicts();
  const exportData = DATA.map(d => ({{
    praise_id: d.praise_id,
    praise_name: d.praise_name,
    praise_number: d.praise_number,
    verdict: verdicts[d.praise_id] || 'pendente',
    source_category: d.source_category,
    status_label: d.status_label,
    file_path: d.file_path,
    extracted_lyrics: d.extracted_lyrics,
    timestamp: new Date().toISOString()
  }}));

  const blob = new Blob([JSON.stringify(exportData, null, 2)], {{ type: 'application/json' }});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'coldigom_letras_vereditos_completo.json';
  a.click();
}}

render();
</script>
</body>
</html>
"""
    OUT_HTML.parent.mkdir(parents=True, exist_ok=True)
    OUT_HTML.write_text(html_content, encoding="utf-8")
    print(f"🖥️  Aplicação de Revisão gerada em: {OUT_HTML}")


if __name__ == "__main__":
    main()
