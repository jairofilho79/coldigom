#!/usr/bin/env python3
"""
scripts/executar_piloto_letras.py

Piloto de Extração e Validação de Letras no Coldigom.
Processa uma amostra representativa de 30 louvores:
- 25 louvores sem letra (de fontes: Letra.pdf, Cifra .chord, Coro PDF, Partitura Geral PDF)
- 5 louvores com letra (para teste de batimento / integridade / detecção de letra errada)

Gera:
1. data/piloto_letras.json (nova fonte de dados dedicada do piloto)
2. scripts/pdf-to-chordpro/out/piloto_letras_review.html (app de revisão visual reutilizada)
"""

from __future__ import annotations

import difflib
import json
import os
import re
import sqlite3
import subprocess
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT_DB = ROOT / "scripts" / "validate-acervo" / "out" / "snapshot.sqlite"
ASSETS_DIR = ROOT / "storage" / "assets" / "praises"
EXTRAIDAS_DIR = ROOT / "storage" / "cifras_avulsos_extraidas"
OUT_JSON = Path("/tmp/coldigom_piloto_letras.json")
OUT_HTML = Path("/tmp/coldigom_piloto_letras_review.html")


def normalize_text_for_comparison(text: str) -> str:
    """Normaliza texto para cálculo de similaridade (minúsculas, sem pontuação/acentos)."""
    if not text:
        return ""
    # Remove acentos
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.lower()
    # Remove pontuação e caracteres não alfanuméricos
    text = re.sub(r"[^\w\s]", " ", text)
    # Colapsa espaços em branco
    text = re.sub(r"\s+", " ", text).strip()
    return text


def calculate_similarity(s1: str, s2: str) -> dict:
    """Calcula métricas de similaridade entre duas letras."""
    norm1 = normalize_text_for_comparison(s1)
    norm2 = normalize_text_for_comparison(s2)

    if not norm1 and not norm2:
        return {"token_overlap": 1.0, "seq_ratio": 1.0, "status": "AMBOS_VAZIOS"}
    if not norm1 or not norm2:
        return {"token_overlap": 0.0, "seq_ratio": 0.0, "status": "UM_VAZIO"}

    tokens1 = set(norm1.split())
    tokens2 = set(norm2.split())

    intersection = tokens1.intersection(tokens2)
    smaller_len = min(len(tokens1), len(tokens2))
    token_overlap = len(intersection) / smaller_len if smaller_len > 0 else 0.0

    seq_ratio = difflib.SequenceMatcher(None, norm1, norm2).ratio()

    # Classificação
    if token_overlap >= 0.85 and seq_ratio >= 0.75:
        status = "MATCH_ALTO"
    elif token_overlap >= 0.60:
        status = "VARIACAO_ESTRUTURAL"
    else:
        status = "LETRA_ERRADA"

    return {
        "token_overlap": round(token_overlap * 100, 1),
        "seq_ratio": round(seq_ratio * 100, 1),
        "status": status,
    }


CHORD_REGEX = re.compile(r"^[A-G][b#]?(?:m|maj|min|dim|aug|sus\d*|\d+)*(?:/[A-G][b#]?)?$", re.IGNORECASE)


def extract_lyrics_from_chordpro(text: str) -> str:
    """Extrai letra limpa a partir de arquivo ChordPro, descartando acordes e linhas puramente harmônicas."""
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
                # É uma linha de cifras, ignorar
                continue

            # Remove acordes isolados que ficaram no final da linha (ex: "Adojnai Cc")
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


def select_pilot_praises(conn: sqlite3.Connection) -> list[dict]:
    """Seleciona 30 louvores representativos para o piloto."""
    c = conn.cursor()
    selected_pids = set()
    pilot_items = []

    # 1. Louvores SEM letra com arquivo explícito de Letra (Letra.pdf)
    q_letra = """
        SELECT DISTINCT p.id, p.name, p.number, pm.id, pm.file_path_legacy, 'Letra.pdf' as source_type
        FROM praises p
        JOIN praise_materials pm ON p.id = pm.praise_id
        JOIN material_kinds mk ON pm.material_kind = mk.id
        WHERE (p.lyrics IS NULL OR trim(p.lyrics) = '')
          AND (mk.name = 'Lyrics' OR pm.file_path_legacy LIKE '%letra%')
          AND pm.type = 'pdf'
    """
    for r in c.execute(q_letra).fetchall():
        if r[0] not in selected_pids:
            selected_pids.add(r[0])
            pilot_items.append({
                "praise_id": r[0],
                "praise_name": r[1],
                "praise_number": r[2] or "",
                "material_id": r[3],
                "legacy_path": r[4],
                "source_type": "PDF de Letra Original",
                "group": "Sem Letra (Prioridade 1 - Letra.pdf)"
            })
            if len([x for x in pilot_items if x["group"].startswith("Sem Letra (Prioridade 1")]) >= 6:
                break

    # 2. Louvores SEM letra com Cifras (.chord)
    q_chord = """
        SELECT DISTINCT p.id, p.name, p.number, pm.id, pm.file_path_legacy, 'Cifra (.chord)' as source_type
        FROM praises p
        JOIN praise_materials pm ON p.id = pm.praise_id
        WHERE (p.lyrics IS NULL OR trim(p.lyrics) = '')
          AND pm.type = 'chord'
    """
    for r in c.execute(q_chord).fetchall():
        if r[0] not in selected_pids:
            selected_pids.add(r[0])
            pilot_items.append({
                "praise_id": r[0],
                "praise_name": r[1],
                "praise_number": r[2] or "",
                "material_id": r[3],
                "legacy_path": r[4],
                "source_type": "Cifra Estruturada (.chord)",
                "group": "Sem Letra (Prioridade 2 - Cifra)"
            })
            if len([x for x in pilot_items if "Prioridade 2" in x["group"]]) >= 7:
                break

    # 3. Louvores SEM letra com Partitura de Coro (Choir.pdf)
    q_choir = """
        SELECT DISTINCT p.id, p.name, p.number, pm.id, pm.file_path_legacy, 'Partitura de Coro' as source_type
        FROM praises p
        JOIN praise_materials pm ON p.id = pm.praise_id
        JOIN material_kinds mk ON pm.material_kind = mk.id
        WHERE (p.lyrics IS NULL OR trim(p.lyrics) = '')
          AND mk.name IN ('Choir', 'Choir and Piano')
          AND pm.type = 'pdf'
    """
    for r in c.execute(q_choir).fetchall():
        if r[0] not in selected_pids:
            selected_pids.add(r[0])
            pilot_items.append({
                "praise_id": r[0],
                "praise_name": r[1],
                "praise_number": r[2] or "",
                "material_id": r[3],
                "legacy_path": r[4],
                "source_type": "Partitura de Coro (PDF)",
                "group": "Sem Letra (Prioridade 3 - Coro)"
            })
            if len([x for x in pilot_items if "Prioridade 3" in x["group"]]) >= 9:
                break

    # 4. Louvores SEM letra com Partitura Geral (Score.pdf)
    q_score = """
        SELECT DISTINCT p.id, p.name, p.number, pm.id, pm.file_path_legacy, 'Partitura Geral' as source_type
        FROM praises p
        JOIN praise_materials pm ON p.id = pm.praise_id
        JOIN material_kinds mk ON pm.material_kind = mk.id
        WHERE (p.lyrics IS NULL OR trim(p.lyrics) = '')
          AND mk.name IN ('Score', 'Sheet Music')
          AND pm.type = 'pdf'
    """
    for r in c.execute(q_score).fetchall():
        if r[0] not in selected_pids:
            selected_pids.add(r[0])
            pilot_items.append({
                "praise_id": r[0],
                "praise_name": r[1],
                "praise_number": r[2] or "",
                "material_id": r[3],
                "legacy_path": r[4],
                "source_type": "Partitura Geral (PDF)",
                "group": "Sem Letra (Prioridade 4 - Score)"
            })
            if len([x for x in pilot_items if "Prioridade 4" in x["group"]]) >= 3:
                break

    # 5. Louvores COM letra (Controle e Auditoria de Batimento / Letra Errada)
    q_com_letra = """
        SELECT DISTINCT p.id, p.name, p.number, pm.id, pm.file_path_legacy, 'Cifra (.chord)' as source_type
        FROM praises p
        JOIN praise_materials pm ON p.id = pm.praise_id
        WHERE p.lyrics IS NOT NULL AND trim(p.lyrics) != ''
          AND pm.type = 'chord'
    """
    for r in c.execute(q_com_letra).fetchall():
        if r[0] not in selected_pids:
            selected_pids.add(r[0])
            pilot_items.append({
                "praise_id": r[0],
                "praise_name": r[1],
                "praise_number": r[2] or "",
                "material_id": r[3],
                "legacy_path": r[4],
                "source_type": "Cifra Estruturada (.chord)",
                "group": "Auditoria de Letra Existente (Batimento)"
            })
            if len([x for x in pilot_items if "Auditoria" in x["group"]]) >= 5:
                break

    return pilot_items


def process_pilot():
    print(f"🚀 Iniciando processamento do Piloto de Letras (30 louvores)...")
    conn = sqlite3.connect(SNAPSHOT_DB)
    c = conn.cursor()

    conn_emb = None
    emb_db = ROOT / "data" / "embeddings" / "acervo_embeddings.sqlite"
    if emb_db.exists():
        conn_emb = sqlite3.connect(emb_db)

    items = select_pilot_praises(conn)
    print(f"✅ {len(items)} louvores selecionados para a amostra piloto.")

    results = []

    for idx, it in enumerate(items, 1):
        pid = it["praise_id"]
        mid = it["material_id"]
        pname = it["praise_name"]
        pnum = it["praise_number"]
        stype = it["source_type"]
        group = it["group"]

        # Busca dados atuais do louvor no banco
        praise_row = c.execute(
            "SELECT lyrics, tonality, rhythm FROM praises WHERE id = ?", (pid,)
        ).fetchone()
        current_lyrics = (praise_row[0] or "").strip() if praise_row else ""
        tonality = praise_row[1] or "" if praise_row else ""
        rhythm = praise_row[2] or "" if praise_row else ""

        # Localiza o arquivo físico do material
        extracted_lyrics = ""
        material_file_path = ""
        material_found = False

        # Se for busca de cifra ou auditoria de letra, verifica primeiro chords_semantic
        if "Cifra" in stype or "Auditoria" in group:
            if conn_emb:
                c_emb = conn_emb.cursor()
                chord_rows = c_emb.execute(
                    "SELECT material_id, filename, text_indexed FROM chords_semantic WHERE praise_id = ?", (pid,)
                ).fetchall()
                if chord_rows:
                    best_row = None
                    best_score = -1.0
                    norm_pname = normalize_text_for_comparison(pname)
                    for mat_id_c, fname_c, ctext in chord_rows:
                        score = 1
                        if pnum and pnum.isdigit() and f"-{int(pnum)}-" in fname_c:
                            score += 20
                        if norm_pname and (norm_pname in normalize_text_for_comparison(fname_c) or normalize_text_for_comparison(fname_c) in norm_pname):
                            score += 10
                        if score > best_score:
                            best_score = score
                            best_row = (mat_id_c, fname_c, ctext)
                    if best_row:
                        mat_id_c, fname_c, ctext = best_row
                        local_chordpro = ROOT / "storage" / "chordpro_staging" / mat_id_c / fname_c
                        if local_chordpro.exists():
                            extracted_lyrics = extract_lyrics_from_chordpro(local_chordpro.read_text(encoding="utf-8", errors="replace"))
                            material_file_path = str(local_chordpro.relative_to(ROOT))
                            material_found = True
                        elif ctext:
                            extracted_lyrics = extract_lyrics_from_chordpro(ctext)
                            material_file_path = f"storage/chordpro_staging/{mat_id_c}/{fname_c}"
                            material_found = True

            # Se não achou no chords_semantic, tenta avulsos extraídos
            if not extracted_lyrics:
                avulso_candidates = list(EXTRAIDAS_DIR.glob(f"*/{pid}*.chord"))
                if avulso_candidates:
                    target_file = avulso_candidates[0]
                    material_file_path = str(target_file.relative_to(ROOT))
                    material_found = True
                    extracted_lyrics = extract_lyrics_from_chordpro(target_file.read_text(encoding="utf-8", errors="replace"))

        # Caso contrário (ou se for PDF de letra/coro/partitura)
        if not extracted_lyrics:
            candidate_files = list((ASSETS_DIR / pid).glob(f"{mid}.*"))
            if candidate_files:
                target_file = candidate_files[0]
                material_file_path = str(target_file.relative_to(ROOT))
                material_found = True
                if target_file.suffix.lower() == ".chord":
                    extracted_lyrics = extract_lyrics_from_chordpro(target_file.read_text(encoding="utf-8", errors="replace"))
                elif target_file.suffix.lower() == ".pdf":
                    extracted_lyrics = extract_lyrics_from_pdf(target_file)

        # Fallback para louvor sem letra se o material_id específico falhou
        if not extracted_lyrics and (ASSETS_DIR / pid).exists():
            for f in sorted((ASSETS_DIR / pid).iterdir()):
                if f.suffix.lower() == ".pdf" and f.name != f"{mid}.pdf":
                    txt = extract_lyrics_from_pdf(f)
                    if len(txt) > 80:
                        extracted_lyrics = txt
                        material_file_path = str(f.relative_to(ROOT))
                        material_found = True
                        break

        # Comparação / Match
        similarity_data = calculate_similarity(current_lyrics, extracted_lyrics)

        # Determina o status geral e a recomendação
        if not current_lyrics:
            if extracted_lyrics and len(extracted_lyrics) > 50:
                audit_status = "NOVA_LETRA_EXTRAIDA"
                recommendation = "Aprovar Inclusão"
                badge_class = "pass"
            else:
                audit_status = "MATERIAL_INSUFICIENTE"
                recommendation = "Revisar Manualmente"
                badge_class = "fail"
        else:
            if similarity_data["status"] == "MATCH_ALTO":
                audit_status = f"MATCH_VERIFICADO ({similarity_data['token_overlap']}%)"
                recommendation = "Manter / Conforme"
                badge_class = "pass"
            elif similarity_data["status"] == "VARIACAO_ESTRUTURAL":
                audit_status = f"VARIACAO_ESTRUTURAL ({similarity_data['token_overlap']}%)"
                recommendation = "Inspecionar Variações"
                badge_class = "warning"
            else:
                audit_status = f"LETRA_DIVERGENTE ({similarity_data['token_overlap']}%)"
                recommendation = "Atenção: Possível Letra Trocada"
                badge_class = "fail"

        item_result = {
            "i": idx,
            "praise_id": pid,
            "praise_name": pname,
            "praise_number": pnum,
            "coldigom_url": f"https://coldigom-web.pages.dev/praise/{pid}",
            "group": group,
            "source_type": stype,
            "material_file_path": material_file_path or "(Arquivo não localizado)",
            "current_lyrics": current_lyrics,
            "extracted_lyrics": extracted_lyrics or "(Nenhum texto legível extraído)",
            "similarity": similarity_data,
            "audit_status": audit_status,
            "recommendation": recommendation,
            "badge_class": badge_class,
            "tonality": tonality,
            "rhythm": rhythm,
        }
        results.append(item_result)
        print(f"   [{idx:02d}/30] {pname[:30]:30} | {group[:25]:25} | {audit_status}")

    # Salva JSON dedicado
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\n💾 Nova fonte de dados salva em: {OUT_JSON}")

    # Gera o HTML da UI de Revisão Humana
    render_html_review_app(results)


def render_html_review_app(results: list[dict]):
    """Gera aplicação web de revisão com design baseado na fase 2 de cifras."""
    payload_json = json.dumps(results, ensure_ascii=False)

    html_content = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Coldigom — Piloto de Curadoria de Letras (30 Louvores)</title>
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
    padding: 14px 24px;
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
    font-size: 1.2rem;
    font-weight: 700;
    color: var(--primary);
  }}
  .brand .tag {{
    font-size: 0.75rem;
    background: rgba(56, 189, 248, 0.2);
    color: var(--primary);
    padding: 3px 10px;
    border-radius: 999px;
  }}
  .stats-bar {{
    display: flex;
    gap: 18px;
    align-items: center;
    font-size: 0.88rem;
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
    padding: 8px 14px;
    border-radius: 8px;
    font-size: 0.85rem;
    font-weight: 500;
    transition: all 0.2s;
  }}
  button:hover {{ background: #475569; }}
  button.primary {{
    background: #0284c7;
    border-color: #0284c7;
  }}
  button.primary:hover {{ background: #0369a1; }}

  main {{
    max-width: 1300px;
    margin: 0 auto;
    padding: 24px 20px 80px;
  }}

  /* Filter bar */
  .filter-bar {{
    display: flex;
    gap: 10px;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }}
  .filter-btn {{
    padding: 6px 14px;
    border-radius: 20px;
    background: var(--panel);
    border: 1px solid var(--card-border);
    color: var(--text-muted);
    font-size: 0.82rem;
  }}
  .filter-btn.active {{
    background: var(--primary);
    color: #0f172a;
    border-color: var(--primary);
    font-weight: 600;
  }}

  /* Card */
  .card {{
    background: var(--card);
    border: 1px solid var(--card-border);
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 20px;
    transition: border-color 0.2s, box-shadow 0.2s;
  }}
  .card:hover {{
    border-color: #475569;
  }}
  .card.verdict-approved {{ border-color: var(--success); }}
  .card.verdict-adjust {{ border-color: var(--warning); }}
  .card.verdict-rejected {{ border-color: var(--danger); }}

  .card-header {{
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    margin-bottom: 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    padding-bottom: 12px;
  }}
  .title-group {{
    display: flex;
    flex-direction: column;
    gap: 4px;
  }}
  .title-group h2 {{
    font-size: 1.15rem;
    color: var(--text);
  }}
  .title-meta {{
    display: flex;
    gap: 12px;
    font-size: 0.82rem;
    color: var(--text-muted);
    align-items: center;
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
  }}
  .badge {{
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 0.78rem;
    font-weight: 600;
  }}
  .badge.pass {{ background: var(--success-bg); color: var(--success); }}
  .badge.warning {{ background: var(--warning-bg); color: var(--warning); }}
  .badge.fail {{ background: var(--danger-bg); color: var(--danger); }}
  .badge.source {{ background: #334155; color: #cbd5e1; }}

  /* Columns Grid */
  .grid-2 {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin: 14px 0;
  }}
  .grid-1 {{
    display: grid;
    grid-template-columns: 1fr;
    gap: 16px;
    margin: 14px 0;
  }}
  .panel-box {{
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 14px;
    display: flex;
    flex-direction: column;
  }}
  .panel-box h3 {{
    font-size: 0.82rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    margin-bottom: 10px;
    display: flex;
    justify-content: space-between;
  }}
  pre.lyrics-preview {{
    white-space: pre-wrap;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.82rem;
    line-height: 1.45;
    color: #e2e8f0;
    max-height: 320px;
    overflow-y: auto;
    padding-right: 8px;
  }}

  /* Actions & Decisions */
  .card-footer {{
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }}
  .decision-choices {{
    display: flex;
    gap: 10px;
  }}
  .choice-btn {{
    padding: 8px 14px;
    border-radius: 8px;
    font-size: 0.82rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 6px;
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

  .file-origin {{
    font-size: 0.78rem;
    color: #64748b;
    font-family: monospace;
    max-width: 450px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }}
</style>
</head>
<body>
<header>
  <div class="brand">
    <h1>Coldigom Letras</h1>
    <span class="tag">Piloto 30 Louvores</span>
  </div>
  <div class="stats-bar" id="statsBar">
    Carregando estatísticas...
  </div>
  <div class="header-actions">
    <button type="button" onclick="exportVerdicts()">Exportar Vereditos (JSON)</button>
    <button type="button" class="primary" onclick="window.print()">Imprimir / Salvar PDF</button>
  </div>
</header>

<main>
  <div class="filter-bar">
    <button class="filter-btn active" onclick="setFilter('all')">Todos (30)</button>
    <button class="filter-btn" onclick="setFilter('sem_letra')">Sem Letra (25)</button>
    <button class="filter-btn" onclick="setFilter('auditoria')">Auditoria / Com Letra (5)</button>
    <button class="filter-btn" onclick="setFilter('pendentes')">Pendentes</button>
    <button class="filter-btn" onclick="setFilter('aprovados')">Aprovados</button>
  </div>

  <div id="cardsList"></div>
</main>

<script>
const DATA = {payload_json};
const STORAGE_KEY = 'coldigom_piloto_letras_v1';
let currentFilter = 'all';

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

function setFilter(f) {{
  currentFilter = f;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
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
    <span class="stat-item">Progresso: <strong>${{reviewed}}/${{total}}</strong></span>
    <span class="stat-item" style="color: var(--success);">Aprovados: <strong>${{approved}}</strong></span>
    <span class="stat-item" style="color: var(--warning);">Ajuste: <strong>${{adjust}}</strong></span>
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
    if (currentFilter === 'sem_letra') return d.group.includes('Sem Letra');
    if (currentFilter === 'auditoria') return d.group.includes('Auditoria');
    if (currentFilter === 'pendentes') return !v;
    if (currentFilter === 'aprovados') return v === 'approve';
    return true;
  }});

  listEl.innerHTML = filtered.map(d => {{
    const v = verdicts[d.praise_id];
    let cardClass = '';
    if (v === 'approve') cardClass = 'verdict-approved';
    else if (v === 'adjust') cardClass = 'verdict-adjust';
    else if (v === 'reject') cardClass = 'verdict-rejected';

    const hasBoth = d.current_lyrics && d.extracted_lyrics;
    const gridClass = hasBoth ? 'grid-2' : 'grid-1';

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
              <span>Grupo: ${{escapeHtml(d.group)}}</span>
            </div>
          </div>
          <div class="badge-row">
            <span class="badge source">${{escapeHtml(d.source_type)}}</span>
            <span class="badge ${{d.badge_class}}">${{escapeHtml(d.audit_status)}}</span>
          </div>
        </div>

        <div class="${{gridClass}}">
          ${{hasBoth ? `
            <div class="panel-box">
              <h3><span>Letra Cadastrada no Banco</span> <span style="color:#64748b;">(Tamanho: ${{d.current_lyrics.length}} chars)</span></h3>
              <pre class="lyrics-preview">${{escapeHtml(d.current_lyrics)}}</pre>
            </div>
          ` : ''}}

          <div class="panel-box">
            <h3><span>Letra Extraída do Material</span> <span style="color:var(--primary);">${{escapeHtml(d.recommendation)}}</span></h3>
            <pre class="lyrics-preview">${{escapeHtml(d.extracted_lyrics)}}</pre>
          </div>
        </div>

        <div class="card-footer">
          <div class="file-origin" title="${{escapeHtml(d.material_file_path)}}">
            Arquivo fonte: ${{escapeHtml(d.material_file_path)}}
          </div>
          <div class="decision-choices">
            <button class="choice-btn ${{v === 'approve' ? 'selected-approve' : ''}}" onclick="saveVerdict('${{d.praise_id}}', 'approve')">
              ✓ Aprovar Letra
            </button>
            <button class="choice-btn ${{v === 'adjust' ? 'selected-adjust' : ''}}" onclick="saveVerdict('${{d.praise_id}}', 'adjust')">
              ⚠ Precisa de Ajuste
            </button>
            <button class="choice-btn ${{v === 'reject' ? 'selected-reject' : ''}}" onclick="saveVerdict('${{d.praise_id}}', 'reject')">
              ✕ Rejeitar / Descartar
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
    group: d.group,
    verdict: verdicts[d.praise_id] || 'pendente',
    source_type: d.source_type,
    audit_status: d.audit_status,
    extracted_lyrics: d.extracted_lyrics,
    timestamp: new Date().toISOString()
  }}));

  const blob = new Blob([JSON.stringify(exportData, null, 2)], {{ type: 'application/json' }});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'piloto_letras_vereditos.json';
  a.click();
}}

// Inicialização
render();
</script>
</body>
</html>
"""
    OUT_HTML.parent.mkdir(parents=True, exist_ok=True)
    OUT_HTML.write_text(html_content, encoding="utf-8")
    print(f"🖥️  Aplicação de Revisão gerada em: {OUT_HTML}")


if __name__ == "__main__":
    process_pilot()
