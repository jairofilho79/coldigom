#!/usr/bin/env python3
"""
scripts/auditar_letras_rigoroso.py

Auditoria Rigorosa e de Alta Precisão do Acervo Coldigom (1.690 Louvores)
Balanceando máxima precisão com ZERO tokens de IA.

Aplica 3 Estratégias Estritas + Higiene Estrutural:
1. Validação Cruzada contra Material Primário:
   - Reconstrução silábica fonética contínua (elimina viés de quebra silábica em partituras vocais).
   - Decodificação de caminhos legados em Base64 e filtro de pastas orquestrais/genéricas.
2. Invariante de Termos-Âncora do Título (TF-IDF Invertido):
   - Se 100% dos termos substantivos do título não existem na letra cadastrada.
3. Matriz Global de Colisões e Duplicatas:
   - Identifica hinos com letra idêntica ou clonada em títulos/números distintos.
4. Higiene Estrutural e OCR Corrompido:
   - Letras com vazamento de acordes/cifras não tratadas e letras truncadas (< 25 palavras).
"""

from __future__ import annotations

import base64
import json
import os
import re
import sqlite3
import subprocess
import unicodedata
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT_DB = ROOT / "scripts" / "validate-acervo" / "out" / "snapshot.sqlite"
ASSETS_DIR = ROOT / "storage" / "assets" / "praises"
OUT_JSON = Path("/tmp/auditoria_letras_suspeitas.json")

# Termos comuns que não devem servir como âncora isolada
STOPWORDS = {
    'a', 'o', 'as', 'os', 'um', 'uma', 'uns', 'umas', 'de', 'do', 'da', 'dos', 'das',
    'em', 'no', 'na', 'nos', 'nas', 'por', 'pelo', 'pela', 'pelos', 'pelas', 'para', 'pra',
    'com', 'sem', 'sob', 'sobre', 'que', 'se', 'mas', 'e', 'ou', 'nem', 'ja', 'so', 'bem',
    'me', 'te', 'lhe', 'nos', 'vos', 'lhes', 'meu', 'minha', 'meus', 'minhas', 'teu', 'tua',
    'teus', 'tuas', 'seu', 'sua', 'seus', 'suas', 'nosso', 'nossa', 'nossos', 'nossas',
    'ele', 'ela', 'eles', 'elas', 'eu', 'tu', 'este', 'esta', 'isto', 'esse',
    'essa', 'isso', 'aquele', 'aquela', 'aquilo', 'quem', 'qual', 'quando', 'onde', 'como',
    'deus', 'senhor', 'jesus', 'cristo', 'pai', 'filho', 'espirito', 'amem', 'aleluia',
    'louvor', 'louvar', 'cantar', 'coro', 'solo', 'misto', 'masculino', 'feminino', 'adaptacao',
    'versao', 'tef', 'pes', 'oracao', 'hino', 'sctb', 'satb', 'ttbb', 'coral', 'let', 'mus',
    'arr', 'arranjo', 'gltm', 'cordas', 'metais', 'madeiras'
}

GENERIC_FOLDERS = {
    'gltm', 'cordas', 'metais', 'madeiras', 'adicionados', 'avulsos diversos',
    'assets', 'praises', 'partituras', 'cifras', 'coletanea', 'canticos', 'novos'
}

def normalize_simple(text: str) -> str:
    if not text:
        return ""
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c)).lower()
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", text)).strip()

def normalize_nospace(text: str) -> str:
    return normalize_simple(text).replace(" ", "")

def extract_anchors(text: str) -> list[str]:
    norm = normalize_simple(text)
    words = re.findall(r"\b[a-z]{3,}\b", norm)
    return [w for w in words if w not in STOPWORDS]

def decode_legacy_path(leg: str) -> str:
    """Decodifica pastas em Base64 ou nomes codificados na hierarquia de arquivos."""
    if not leg:
        return ""
    parts = leg.split("/")
    decoded_parts = []
    for p in parts:
        clean_p = p.replace(".pdf", "")
        # Tenta decodificar Base64 se começar com padrão típico
        if len(clean_p) > 16 and clean_p.startswith("QWR"):
            try:
                dec = base64.b64decode(clean_p).decode("utf-8", errors="ignore")
                decoded_parts.append(dec)
                continue
            except Exception:
                pass
        decoded_parts.append(p)
    return "/".join(decoded_parts)

def extract_text_from_pdf(pdf_path: Path) -> str:
    if not pdf_path.exists():
        return ""
    try:
        res = subprocess.run(
            ["gs", "-q", "-sDEVICE=txtwrite", "-o", "-", str(pdf_path)],
            capture_output=True,
            text=True,
            check=True,
            timeout=10,
        )
        return res.stdout
    except Exception:
        return ""

def clean_score_stream(raw_text: str) -> str:
    """Extrai fluxo de texto contínuo de partituras eliminando notação musical."""
    lines = []
    for line in raw_text.splitlines():
        line_s = line.strip()
        if not line_s:
            continue
        # Pula linhas com notações de notas musicais
        if any(c in line_s for c in ('œ', '˙', '™', '≤', '≥', '∑', '∏', '&', '#')):
            continue
        lines.append(line_s)
    return normalize_nospace(" ".join(lines))

def main():
    print("=" * 70)
    print("INICIANDO AUDITORIA RIGOROSA DO ACERVO COLDIGOM (1.690 LOUVORES)")
    print("=" * 70)

    con = sqlite3.connect(SNAPSHOT_DB)
    cur = con.cursor()
    praises = cur.execute(
        "SELECT id, name, number, author, category, lyrics FROM praises ORDER BY number, name"
    ).fetchall()
    print(f"Total de louvores no banco: {len(praises)}")

    materials_rows = cur.execute(
        "SELECT id, praise_id, material_kind, type, file_path_legacy FROM praise_materials"
    ).fetchall()
    materials_by_praise = defaultdict(list)
    for m in materials_rows:
        materials_by_praise[m[1]].append({
            "id": m[0],
            "kind": m[2],
            "type": m[3],
            "legacy": decode_legacy_path(m[4] or "")
        })

    suspects = {}

    def add_suspect(pid, name, num, flag, detail, severity="ALTA"):
        if pid not in suspects:
            suspects[pid] = {
                "id": pid,
                "name": name,
                "number": num or "(Sem número)",
                "flags": [],
                "details": [],
                "severity": severity
            }
        suspects[pid]["flags"].append(flag)
        suspects[pid]["details"].append(detail)
        if severity == "ALTA":
            suspects[pid]["severity"] = "ALTA"

    # =========================================================================
    # ESTRATÉGIA 3: MATRIZ GLOBAL DE DUPLICATAS E COLISÕES CRUZADAS
    # =========================================================================
    print("\n[Estratégia 3] Matriz Global de Colisões e Duplicatas...")
    norm_lyrics_map = defaultdict(list)
    for pid, name, num, author, cat, lyr in praises:
        nl = normalize_simple(lyr)
        if nl:
            norm_lyrics_map[nl].append((pid, name, num))

    duplicate_groups = [v for v in norm_lyrics_map.values() if len(v) > 1]
    for grp in duplicate_groups:
        names = {normalize_simple(p[1]) for p in grp}
        # Verifica se são títulos de fato diferentes
        is_distinct = len(names) > 1 and not any(
            all(w in n2 for w in n1.split() if w not in STOPWORDS)
            for n1 in names for n2 in names if n1 != n2
        )
        for pid, name, num in grp:
            others = [f"'{p[1]}' ({p[2]})" for p in grp if p[0] != pid]
            others_str = ", ".join(others)
            if is_distinct:
                add_suspect(
                    pid, name, num,
                    "E3_DUPLICATA_TITULO_DISTINTO",
                    f"Letra idêntica a louvor com título totalmente distinto: {others_str}",
                    "ALTA"
                )
            else:
                add_suspect(
                    pid, name, num,
                    "E3_CADASTRO_DUPLICADO",
                    f"Mesmo hino cadastrado sob múltiplos IDs: {others_str}",
                    "MEDIA"
                )

    # =========================================================================
    # ESTRATÉGIA 2: INVARIANTE DE TERMOS-ÂNCORA DO TÍTULO (TF-IDF INVERTIDO)
    # =========================================================================
    print("\n[Estratégia 2] Invariante de Termos-Âncora do Título...")
    for pid, name, num, author, cat, lyr in praises:
        title_anchors = extract_anchors(name)
        lyr_anchors = set(extract_anchors(lyr))
        if not title_anchors:
            continue

        missing = [w for w in title_anchors if w not in lyr_anchors]
        
        # 100% das palavras distintivas ausentes na letra
        if len(missing) == len(title_anchors) and len(title_anchors) >= 1:
            clean_pn = normalize_simple(name)
            if "nacional brasileiro" in clean_pn or "cantico de davi" in clean_pn:
                continue
            add_suspect(
                pid, name, num,
                "E2_TITULO_AUSENTE_NA_LETRA",
                f"Nenhuma palavra distintiva do título ({missing}) existe na letra. Forte indício de hino trocado.",
                "ALTA"
            )

    # =========================================================================
    # ESTRATÉGIA 1: CONFRONTO COM MATERIAL PRIMÁRIO (PDFs e Cifras)
    # =========================================================================
    print("\n[Estratégia 1] Confronto Rigoroso com Partituras Vocais e Pastas de Material...")
    for pid, name, num, author, cat, lyr in praises:
        mats = materials_by_praise.get(pid, [])
        lyr_stream = normalize_nospace(lyr)

        # 1. Checagem de discrepância no nome da pasta de material (apenas pastas legítimas)
        for m in mats:
            leg = m.get("legacy", "")
            parts = [p.strip() for p in leg.split("/") if p.strip()]
            if len(parts) >= 2:
                # O nome do hino na pasta costuma ser a penúltima ou segunda pasta
                candidate_folder = parts[1] if parts[0].lower() in ('gltm', 'adicionados') else parts[0]
                norm_cand = normalize_simple(candidate_folder)
                # Ignora pastas genéricas, instrumentais ou numéricas
                if norm_cand in GENERIC_FOLDERS or norm_cand.isdigit() or norm_cand.endswith(".pdf"):
                    continue
                cand_words = set(extract_anchors(norm_cand))
                pn_words = set(extract_anchors(name))
                if cand_words and pn_words and len(cand_words & pn_words) == 0:
                    add_suspect(
                        pid, name, num,
                        "E1_MATERIAL_TITULO_DIVERGENTE",
                        f"Arquivos do acervo residem na pasta '{candidate_folder}', enquanto o louvor está intitulado '{name}'.",
                        "ALTA"
                    )
                    break

        # 2. Reconstrução contínua de partituras vocais (Voizes / Coro / Choir)
        vocal_pdfs = []
        for m in mats:
            leg = m.get("legacy", "").lower()
            mid = m["id"]
            if m["type"] == "pdf" and any(k in leg for k in ("vozes", "coro", "choir", "vocal")):
                pdf_path = ASSETS_DIR / pid / f"{mid}.pdf"
                if pdf_path.exists():
                    vocal_pdfs.append(pdf_path)

        if vocal_pdfs:
            pdf_txt = extract_text_from_pdf(vocal_pdfs[0])
            score_stream = clean_score_stream(pdf_txt)
            if len(score_stream) >= 80:
                # Pega as primeiras 4 palavras significativas da letra cadastrada
                lyr_words = extract_anchors(lyr)
                if len(lyr_words) >= 4:
                    first_phrase = "".join(lyr_words[:4])
                    # Testa se a frase inicial cantada existe no fluxo da partitura
                    if first_phrase not in score_stream:
                        # Testa também amostra de 30 caracteres contínuos
                        chunk_sample = lyr_stream[:30]
                        if chunk_sample not in score_stream:
                            add_suspect(
                                pid, name, num,
                                "E1_CONTEUDO_PARTITURA_DIVERGENTE",
                                f"Texto cantado na partitura vocal ({vocal_pdfs[0].name}) não corresponde à letra cadastrada.",
                                "ALTA"
                            )

    # =========================================================================
    # HIGIENE ESTRUTURAL & CORRUPÇÃO DE OCR
    # =========================================================================
    print("\n[Higiene Estrutural] Detectando OCR corrompido, letras truncadas e resquícios...")
    ocr_corruption_regex = re.compile(
        r"(\ban ficar\b|\bescollh\b|\btonal\b|\bintrodt\b|\bvilverm\b|\brepeti\b|\bsejnhor\b|\bjrenova\b|\bjme\b)",
        re.IGNORECASE
    )
    score_artifacts_regex = re.compile(
        r"\b(soprano|contralto|tenor|baixo|d\.?c\.? al fine|ritenuto|compasso \d+)\b",
        re.IGNORECASE
    )
    clitics = {'me', 'te', 'se', 'nos', 'vos', 'lhe', 'lhes', 'o', 'a', 'os', 'as'}

    for pid, name, num, author, cat, lyr in praises:
        words = lyr.split()
        
        # Letras ultra-curtas (< 25 palavras)
        if len(words) < 25 and num not in ("722",):
            add_suspect(
                pid, name, num,
                "H_LETRA_TRUNCADA_CURTA",
                f"Letra possui apenas {len(words)} palavras. Provável estrofe isolada ou truncamento.",
                "ALTA"
            )

        # OCR corrompido de cifras
        m_ocr = ocr_corruption_regex.findall(lyr)
        if m_ocr:
            add_suspect(
                pid, name, num,
                "H_OCR_CORROMPIDO",
                f"Letra contém texto de cifra corrompido por OCR ({set(m_ocr)}).",
                "ALTA"
            )

        # Resquícios de partitura
        m_score = score_artifacts_regex.findall(lyr)
        if m_score:
            add_suspect(
                pid, name, num,
                "H_RESQUICIO_PARTITURA",
                f"Letra contém termos de partitura vazados ({set(m_score)}).",
                "MEDIA"
            )

        # Hifenização silábica solta (não ênclise)
        hyphen_matches = re.findall(r"\b([a-záéíóúãõâêîôûç]+)\s*-\s*([a-záéíóúãõâêîôûç]+)\b", lyr, re.IGNORECASE)
        bad_hyphens = [f"{a}-{b}" for a, b in hyphen_matches if b.lower() not in clitics and a.lower() not in ('guia', 'dá', 'faz')]
        if len(bad_hyphens) >= 4:
            add_suspect(
                pid, name, num,
                "H_HIFENIZACAO_SILABICA",
                f"Letra contém sílabas de pauta não unificadas ({bad_hyphens[:5]}...).",
                "MEDIA"
            )

    # Ordenação e Gravação
    suspect_list = list(suspects.values())
    suspect_list.sort(key=lambda s: (0 if s["severity"] == "ALTA" else 1, s["number"], s["name"]))

    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(suspect_list, f, indent=2, ensure_ascii=False)

    print("\n" + "=" * 70)
    print(f"AUDITORIA RIGOROSA CONCLUÍDA!")
    print(f"Total de louvores suspeitos para investigação: {len(suspect_list)} (de 1.690 louvores)")
    print(f"  - Severidade ALTA (Divergências críticas / Letras erradas): {sum(1 for s in suspect_list if s['severity'] == 'ALTA')}")
    print(f"  - Severidade MÉDIA (Cadastros duplicados / Resquícios cosméticos): {sum(1 for s in suspect_list if s['severity'] == 'MEDIA')}")
    print(f"Relatório gravado em: {OUT_JSON}")
    print("=" * 70)

if __name__ == "__main__":
    main()
