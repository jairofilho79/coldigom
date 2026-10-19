#!/usr/bin/env python3
"""
scripts/sincronizar_e_higienizar_acervo.py

Higieniza e sincroniza as letras do acervo:
1. Aplica limpeza rigorosa anti-ruído:
   - Unificação de quebras silábicas puras de partitura vocal (so - cor - rer -> socorrer),
     preservando ênclises (louvá-lo) e palavras compostas bíblicas (bem-aventurado).
   - Remoção de linhas de acordes residuais e lixo de cifras (ex: C Am Em A, D/F#, Tac, paddo).
   - Remoção de cabeçalhos de naipes vocais e regência (SOPRANO:, BAIXO:, /INSTRUMENTOS/).
2. Atualiza snapshot.sqlite.
3. Sincroniza praises_semantic em acervo_embeddings.sqlite (text_indexed, tags, has_lyrics).
"""

from __future__ import annotations

import re
import sqlite3
import sys
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT_DB = ROOT / "scripts" / "validate-acervo" / "out" / "snapshot.sqlite"
EMBEDDINGS_DB = ROOT / "data" / "embeddings" / "acervo_embeddings.sqlite"

CLITICS = {'me', 'te', 'se', 'nos', 'vos', 'lhe', 'lhes', 'o', 'a', 'os', 'as', 'lo', 'la', 'los', 'las'}
COMPOUND_PREFIXES = {'bem', 'mal', 'todo', 'recém', 'el', 'guia', 'dá', 'faz', 'porta', 'guarda'}

CHORD_LINE_RE = re.compile(
    r'^\s*([A-G][b#]?(?:m|maj|min|dim|aug|sus\d*|\d+)*(?:/[A-G][b#]?)?(?:\s+[A-G][b#]?(?:m|maj|min|dim|aug|sus\d*|\d+)*(?:/[A-G][b#]?)?)*)\s*$',
    re.IGNORECASE
)
VOICE_HEADER_RE = re.compile(
    r'^\s*(soprano|contralto|tenor|baixo|dueto|solista|todos|mulheres|homens)\s*[:\-]\s*',
    re.IGNORECASE
)


def replace_hyphen(m: re.Match) -> str:
    a, b = m.group(1), m.group(2)
    if b.lower() in CLITICS or a.lower() in COMPOUND_PREFIXES or b.lower() in COMPOUND_PREFIXES:
        return f"{a}-{b}"
    return f"{a}{b}"


def higienizar_letra(texto: str) -> str:
    if not texto:
        return ""

    linhas = []
    for line in texto.splitlines():
        l_str = line.strip()
        if not l_str:
            continue

        # Ignora linhas puramente de instrumentos, interlúdios ou acordes isolados
        if l_str.startswith(('*', '/', '(', '[')) and any(k in l_str.upper() for k in ('INSTRUMENT', 'INTERL', 'INTRO')):
            continue
        if "INSTRUMENTOS" in l_str.upper():
            continue

        if CHORD_LINE_RE.match(l_str):
            continue

        # Remove marcadores de naipes/vozes
        l_str = VOICE_HEADER_RE.sub('', l_str)

        # Unifica quebras silábicas iterativamente
        for _ in range(5):
            novo = re.sub(r'\b([A-Za-zÀ-ÖØ-öø-ÿ]+)\s*-\s*([A-Za-zÀ-ÖØ-öø-ÿ]+)\b', replace_hyphen, l_str)
            if novo == l_str:
                break
            l_str = novo

        # Limpa resíduos de OCR de termos musicais / cifras soltas
        l_str = re.sub(r'\b(?:Tac|paddo)\b', '', l_str, flags=re.IGNORECASE)

        if l_str.strip():
            linhas.append(l_str.strip())

    return "\n".join(linhas)


def main():
    print("=" * 70)
    print("🧹 HIGIENIZAÇÃO & SINCRONIZAÇÃO DE LETRAS (Snapshot -> Embeddings)")
    print("=" * 70)

    if not SNAPSHOT_DB.exists():
        print(f"❌ snapshot.sqlite não encontrado em {SNAPSHOT_DB}", file=sys.stderr)
        sys.exit(1)

    if not EMBEDDINGS_DB.exists():
        print(f"❌ acervo_embeddings.sqlite não encontrado em {EMBEDDINGS_DB}", file=sys.stderr)
        sys.exit(1)

    # 1. Carrega tags do snapshot
    snap_conn = sqlite3.connect(SNAPSHOT_DB)
    snap_cur = snap_conn.cursor()

    tags_by_praise = defaultdict(list)
    try:
        snap_cur.execute("""
            SELECT pt.praise_id, t.name
            FROM praise_tags pt
            JOIN tags t ON t.id = pt.tag_id
        """)
        for pid, tname in snap_cur.fetchall():
            if tname:
                tags_by_praise[pid].append(tname.strip())
    except Exception as e:
        print(f"⚠️ Aviso ao ler tags: {e}")

    # 2. Carrega louvores do snapshot
    snap_cur.execute("""
        SELECT id, name, number, author, category, rhythm, tonality, lyrics
        FROM praises
    """)
    praises_snap = snap_cur.fetchall()
    print(f"📖 Louvores carregados de snapshot.sqlite: {len(praises_snap)}")

    # 3. Higieniza e prepara atualizações
    cleaned_count = 0
    updates_snap = []
    emb_rows = []

    emb_conn = sqlite3.connect(EMBEDDINGS_DB)
    emb_cur = emb_conn.cursor()

    # Preserva metadados bíblicos já gravados em praises_semantic se existirem
    existing_meta = {}
    try:
        emb_cur.execute("""
            SELECT id, biblical_reference, biblical_summary, homiletic_themes
            FROM praises_semantic
        """)
        for r in emb_cur.fetchall():
            existing_meta[r[0]] = {
                "biblical_reference": r[1] or "",
                "biblical_summary": r[2] or "",
                "homiletic_themes": r[3] or "",
            }
    except Exception:
        pass

    for pid, name, num, auth, cat, rhy, ton, lyr in praises_snap:
        raw_lyrics = lyr or ""
        clean_lyr = higienizar_letra(raw_lyrics)

        if raw_lyrics != clean_lyr:
            cleaned_count += 1
            updates_snap.append((clean_lyr, pid))

        has_lyrics = 1 if len(clean_lyr) >= 20 else 0
        tags_str = ", ".join(tags_by_praise.get(pid, []))

        meta = existing_meta.get(pid, {})
        ref_bib = meta.get("biblical_reference", "")
        sum_bib = meta.get("biblical_summary", "")
        tem_bib = meta.get("homiletic_themes", "")

        linhas_idx = [
            f"Louvor: {name} (Nº {num or 'S/N'})",
            f"Autor: {auth or 'Desconhecido'} | Categoria: {cat or 'Geral'}",
            f"Ritmo: {rhy or '-'} | Tom: {ton or '-'} | Tags: {tags_str or '-'}",
        ]
        if ref_bib:
            linhas_idx.append(f"Referência Bíblica: {ref_bib}")
        if tem_bib:
            linhas_idx.append(f"Temas Homiléticos: {tem_bib}")
        if sum_bib:
            linhas_idx.append(f"Mensagem Teológica: {sum_bib}")
        linhas_idx.append(f"Letra Completa:\n{clean_lyr or '(sem letra cadastrada)'}")
        text_indexed = "\n".join(linhas_idx)

        emb_rows.append((
            clean_lyr,
            text_indexed,
            has_lyrics,
            auth or "",
            cat or "",
            rhy or "",
            ton or "",
            tags_str,
            pid
        ))

    # 4. Grava no snapshot se houve limpeza
    if updates_snap:
        print(f"✨ Atualizando {len(updates_snap)} louvores com letra higienizada no snapshot.sqlite...")
        snap_cur.executemany("UPDATE praises SET lyrics = ?, updated_at = datetime('now') WHERE id = ?", updates_snap)
        snap_conn.commit()
    snap_conn.close()

    # 5. Grava no acervo_embeddings.sqlite
    print(f"🧠 Atualizando {len(emb_rows)} louvores em acervo_embeddings.sqlite...")
    emb_cur.executemany("""
        UPDATE praises_semantic
        SET text_indexed = ?,
            has_lyrics = ?,
            author = ?,
            category = ?,
            rhythm = ?,
            tonality = ?,
            tags = ?
        WHERE id = ?
    """, [(r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8]) for r in emb_rows])
    emb_conn.commit()

    emb_cur.execute("SELECT COUNT(*), COUNT(has_lyrics) FROM praises_semantic WHERE has_lyrics = 1")
    count_active = emb_cur.fetchone()
    print(f"✅ Louvores ativos com letra no acervo_embeddings: {count_active[0]}")
    emb_conn.close()

    print("\n" + "=" * 70)
    print("🎉 PASSO 1 CONCLUÍDO COM SUCESSO!")
    print("=" * 70)


if __name__ == "__main__":
    main()
