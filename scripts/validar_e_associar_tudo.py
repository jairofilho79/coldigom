#!/usr/bin/env python3
"""
scripts/validar_e_associar_tudo.py

1. Validação anti-alucinação das passagens bíblicas sugeridas via Gemini:
   - Cruza a letra limpa do louvor contra o texto bíblico real (ARC/BLIVRE).
   - Calcula embedding via Ollama (embeddinggemma-2:latest, 256d normalizado L2).
   - Só aprova se a similaridade de cosseno for >= 82% (0.82).
2. Atualiza louvores-citacoes-biblicas.json (Coldigom + Perícopes).
3. Executa associação matricial das 2.823 perícopes (associar-louvores.py).
4. Executa consolidação canônica dos metadados bíblicos (consolidar_metadados_biblicos.py).
"""

from __future__ import annotations

import json
import re
import sqlite3
import subprocess
import sys
import time
import urllib.request
from collections import defaultdict
from pathlib import Path
import numpy as np

ROOT_COLDIGOM = Path(__file__).resolve().parents[1]
ROOT_PERICOPES = ROOT_COLDIGOM.parent / "biblia-pericopes"

DB_EMBEDDINGS = ROOT_COLDIGOM / "data" / "embeddings" / "acervo_embeddings.sqlite"
ARC_PATH = ROOT_PERICOPES / "data" / "ARC.json"
BLIVRE_PATH = ROOT_PERICOPES / "data" / "BLIVRE.json"

HOMILETICOS_JSON = ROOT_COLDIGOM / "data" / "louvores-temas-homileticos.json"
CITATIONS_PATHS = [
    ROOT_COLDIGOM / "data" / "louvores-citacoes-biblicas.json",
    ROOT_PERICOPES / "data" / "louvores-citacoes-biblicas.json",
    ROOT_PERICOPES / "public" / "data" / "louvores-citacoes-biblicas.json",
]

OLLAMA_URL = "http://127.0.0.1:11434/api/embed"
MODEL_OLLAMA = "embeddinggemma-2:latest"
SIMILARITY_THRESHOLD = 0.82


def normalizar_livro(nome: str) -> str:
    aliases = {
        "Cânticos": "Cantares",
        "Cântico dos Cânticos": "Cantares",
        "Salmo": "Salmos",
        "Sl": "Salmos",
        "Dt": "Deuteronômio",
        "Is": "Isaías",
        "Gn": "Gênesis",
        "Ex": "Êxodo",
        "Êx": "Êxodo",
        "Mt": "Mateus",
        "Mc": "Marcos",
        "Lc": "Lucas",
        "Jo": "João",
        "At": "Atos",
        "Rm": "Romanos",
        "1Co": "1 Coríntios",
        "2Co": "2 Coríntios",
        "1 Co": "1 Coríntios",
        "2 Co": "2 Coríntios",
        "I Coríntios": "1 Coríntios",
        "II Coríntios": "2 Coríntios",
        "I Samuel": "1 Samuel",
        "II Samuel": "2 Samuel",
        "I Reis": "1 Reis",
        "II Reis": "2 Reis",
        "I Crônicas": "1 Crônicas",
        "II Crônicas": "2 Crônicas",
        "I Tessalonicenses": "1 Tessalonicenses",
        "II Tessalonicenses": "2 Tessalonicenses",
        "I Timóteo": "1 Timóteo",
        "II Timóteo": "2 Timóteo",
        "I Pedro": "1 Pedro",
        "II Pedro": "2 Pedro",
        "I João": "1 João",
        "II João": "2 João",
        "III João": "3 João",
        "Ap": "Apocalipse",
        "Hb": "Hebreus",
        "Tg": "Tiago",
    }
    return aliases.get(nome.strip(), nome.strip())


def carregar_biblia(caminho: Path) -> dict[tuple[str, int, int], str]:
    if not caminho.exists():
        return {}
    with open(caminho, "r", encoding="utf-8") as f:
        dados = json.load(f)
    versos = {}
    for book in dados:
        b_name = normalizar_livro(book["name"])
        for c_idx, chap in enumerate(book.get("chapters", []), 1):
            for v_idx, v in enumerate(chap, 1):
                txt = v.get("t") or v.get("texto") or ""
                if txt:
                    versos[(b_name, c_idx, v_idx)] = txt.strip()
    return versos


def parse_passagem(p_str: str) -> tuple[str, int, int, int] | None:
    if not p_str:
        return None
    p = p_str.split(",")[0].strip()
    m = re.match(r"^([\d\s]*[A-Za-zÀ-ÖØ-öø-ÿ]+)\s+(\d+)(?::(\d+)(?:-(\d+))?)?$", p)
    if not m:
        return None
    livro = normalizar_livro(m.group(1))
    cap = int(m.group(2))
    v_ini = int(m.group(3)) if m.group(3) else 1
    v_fim = int(m.group(4)) if m.group(4) else (v_ini if m.group(3) else 999)
    return livro, cap, v_ini, v_fim


def obter_embeddings_ollama(textos: list[str]) -> list[np.ndarray]:
    payload = json.dumps({"model": MODEL_OLLAMA, "input": textos}).encode("utf-8")
    req = urllib.request.Request(OLLAMA_URL, data=payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        vetores = []
        for raw in data.get("embeddings", []):
            vec256 = np.array(raw[:256], dtype=np.float32)
            norm = np.linalg.norm(vec256)
            if norm > 0:
                vec256 /= norm
            vetores.append(vec256)
        return vetores


def main():
    print("=" * 70)
    print("🛡️ VALIDAÇÃO ANTI-ALUCINAÇÃO & ASSOCIAÇÃO FINAL (Ollama Gemma 2)")
    print("=" * 70)

    # 1. Carrega louvores do SQLite
    conn = sqlite3.connect(DB_EMBEDDINGS)
    c = conn.cursor()
    c.execute("SELECT id, number, name, category, text_indexed FROM praises_semantic WHERE has_lyrics = 1")
    praises_db = {}
    for pid, num, name, cat, text_idx in c.fetchall():
        lyrics_part = text_idx.split("Letra Completa:")[1] if "Letra Completa:" in text_idx else text_idx
        praises_db[pid] = {
            "id": pid,
            "number": (num or "").strip(),
            "name": name.strip(),
            "category": (cat or "").strip(),
            "lyrics": lyrics_part.strip(),
        }
    conn.close()

    # 2. Carrega temas homiléticos
    with open(HOMILETICOS_JSON, "r", encoding="utf-8") as f:
        homileticos_data = json.load(f)

    # 3. Carrega citações existentes
    citacoes_data = defaultdict(list)
    if CITATIONS_PATHS[0].exists():
        with open(CITATIONS_PATHS[0], "r", encoding="utf-8") as f:
            citacoes_data = defaultdict(list, json.load(f))

    # 4. Carrega Bíblias
    print("📖 Carregando ARC e BLIVRE...")
    arc = carregar_biblia(ARC_PATH)
    blivre = carregar_biblia(BLIVRE_PATH)

    # 5. Prepara candidatos a validação
    candidatos = []
    for pid, item in homileticos_data.items():
        p_str = item.get("passagem_origem_direta")
        if not p_str or pid not in praises_db:
            continue

        # Verifica se já está em citacoes_data
        already_has = any(c.get("referencia") == p_str for c in citacoes_data.get(pid, []))
        if already_has:
            continue

        parsed = parse_passagem(p_str)
        if not parsed:
            continue
        livro, cap, v_ini, v_fim = parsed

        versos = []
        for v in range(v_ini, (v_fim + 1) if v_fim != 999 else (v_ini + 1)):
            if (livro, cap, v) in arc:
                versos.append(arc[(livro, cap, v)])
            elif (livro, cap, v) in blivre:
                versos.append(blivre[(livro, cap, v)])

        txt_biblia = " ".join(versos)
        if txt_biblia:
            candidatos.append({
                "pid": pid,
                "pr": praises_db[pid],
                "passagem_str": p_str,
                "livro": livro,
                "cap": cap,
                "v_ini": v_ini,
                "v_fim": v_fim if v_fim != 999 else v_ini,
                "texto_biblico": txt_biblia,
                "lyrics": praises_db[pid]["lyrics"][:1200],
            })

    print(f"🔍 {len(candidatos)} candidatos a validação semântica cruzada contra ARC/BLIVRE...")

    novas_aprovadas = 0
    batch_size = 25
    for i in range(0, len(candidatos), batch_size):
        lote = candidatos[i:i + batch_size]
        textos_embed = []
        for c_val in lote:
            textos_embed.append(c_val["lyrics"])
            textos_embed.append(c_val["texto_biblico"])

        try:
            vetores = obter_embeddings_ollama(textos_embed)
            for idx, c_val in enumerate(lote):
                sim = float(np.dot(vetores[idx * 2], vetores[idx * 2 + 1]))
                if sim >= SIMILARITY_THRESHOLD:
                    citacoes_data[c_val["pid"]].append({
                        "praiseId": c_val["pid"],
                        "praiseNumber": c_val["pr"]["number"],
                        "praiseName": c_val["pr"]["name"],
                        "livro": c_val["livro"],
                        "capitulo": c_val["cap"],
                        "versiculoInicio": c_val["v_ini"],
                        "versiculoFim": c_val["v_fim"],
                        "referencia": c_val["passagem_str"],
                        "similaridade": round(sim * 100, 1),
                        "tipo": "citacao_direta",
                        "origem": "gemini_validado_semanticamente",
                    })
                    novas_aprovadas += 1
                    print(f"   ✅ Aprovada: {c_val['pr']['name']} -> {c_val['passagem_str']} ({sim * 100:.1f}%)")
                else:
                    print(f"   ❌ Rejeitada: {c_val['pr']['name']} -> {c_val['passagem_str']} ({sim * 100:.1f}% < 82%)")
        except Exception as e:
            print(f"⚠️ Erro no lote {i}: {e}")

    print(f"\n🎉 Validação concluída: {novas_aprovadas} novas citações diretas aprovadas!")

    # 6. Salva citações consolidadas
    for p in CITATIONS_PATHS:
        if p.parent.exists():
            with open(p, "w", encoding="utf-8") as f:
                json.dump(citacoes_data, f, indent=2, ensure_ascii=False)
            print(f"💾 Citações salvas em: {p.relative_to(ROOT_COLDIGOM.parent)}")

    # 7. Executa associação matricial final
    print("\n🎯 Executando associação matricial completa (2.823 perícopes × louvores)...")
    script_associar = ROOT_PERICOPES / "scripts" / "associar-louvores.py"
    res = subprocess.run([sys.executable, str(script_associar)], capture_output=True, text=True)
    if res.returncode == 0:
        print("   ✅ Associação e índice invertido atualizados com sucesso!")
        print(res.stdout[-300:])
    else:
        print(f"   ❌ Erro na associação:\n{res.stderr}", file=sys.stderr)

    # 8. Executa consolidação de metadados bíblicos canônicos
    print("\n📦 Consolidando metadados bíblicos canônicos (louvores-biblia-consolidado.json)...")
    if str(ROOT_COLDIGOM) not in sys.path:
        sys.path.insert(0, str(ROOT_COLDIGOM))
    from scripts.consolidar_metadados_biblicos import consolidar_metadados
    consolidar_metadados(repo_coldigom=ROOT_COLDIGOM, repo_pericopes=ROOT_PERICOPES, verbose=True)

    print("\n" + "=" * 70)
    print("🎉 ESTEIRA DE RECONCILIAÇÃO E VALIDAÇÃO CONCLUÍDA COM SUCESSO!")
    print("=" * 70)


if __name__ == "__main__":
    main()
