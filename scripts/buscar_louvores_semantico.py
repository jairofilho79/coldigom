#!/usr/bin/env python3
"""
scripts/buscar_louvores_semantico.py

Motor de Busca Semântica do Coldigom usando Gemma Embedding 2 (Ollama local).
Pesquisa inteligente em praises_semantic (acervo_embeddings.sqlite)
enriquecida com passagens bíblicas, temas homiléticos e significados teológicos.

Uso:
  python3 scripts/buscar_louvores_semantico.py "mulher do fluxo de sangue"
  python3 scripts/buscar_louvores_semantico.py "parábola das dez virgens" --top 5
  python3 scripts/buscar_louvores_semantico.py --test-suite
"""

from __future__ import annotations

import argparse
import json
import math
import sqlite3
import struct
import sys
import time
import urllib.request
from pathlib import Path
from typing import Any

OLLAMA_URL = "http://127.0.0.1:11434/api/embed"
MODEL_NAME = "embeddinggemma-2:latest"
REPO_ROOT = Path(__file__).resolve().parent.parent
DB_PATH = REPO_ROOT / "data" / "embeddings" / "acervo_embeddings.sqlite"


def obter_embedding_consulta(texto: str, url: str = OLLAMA_URL, model: str = MODEL_NAME) -> list[float]:
    """Obtém o vetor de embedding para a query de pesquisa via Ollama."""
    payload = json.dumps({"model": model, "input": [texto]}).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            embs = data.get("embeddings", [])
            if not embs:
                raise RuntimeError("Ollama retornou vetor vazio.")
            return embs[0]
    except Exception as e:
        print(f"❌ Erro ao conectar ao Ollama ({url}): {e}", file=sys.stderr)
        print("Certifique-se de que o Ollama está rodando com `embeddinggemma-2:latest`.", file=sys.stderr)
        sys.exit(1)


def similaridade_cosseno(v1: list[float], v2: list[float]) -> float:
    """Calcula similaridade de cosseno entre dois vetores."""
    dot = sum(a * b for a, b in zip(v1, v2))
    n1 = math.sqrt(sum(a * a for a in v1))
    n2 = math.sqrt(sum(b * b for b in v2))
    if n1 == 0 or n2 == 0:
        return 0.0
    return dot / (n1 * n2)


class BuscadorSemanticoColdigom:
    def __init__(self, db_path: Path = DB_PATH):
        if not db_path.exists():
            print(f"❌ Banco de embeddings não encontrado: {db_path}", file=sys.stderr)
            sys.exit(1)

        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        rows = cursor.execute("""
            SELECT id, number, name, category, rhythm, tonality,
                   biblical_reference, biblical_summary, homiletic_themes,
                   has_lyrics, text_indexed, embedding
            FROM praises_semantic
            WHERE has_lyrics = 1 AND name NOT LIKE "%(NA%USAR)%"
        """).fetchall()

        self.praises = []
        for r in rows:
            blob = r[11]
            if not blob:
                continue
            num_floats = len(blob) // 4
            vec = list(struct.unpack(f"{num_floats}f", blob))
            self.praises.append({
                "id": r[0],
                "number": r[1] or "",
                "name": r[2] or "",
                "category": r[3] or "",
                "rhythm": r[4] or "",
                "tonality": r[5] or "",
                "biblical_reference": r[6] or "",
                "biblical_summary": r[7] or "",
                "homiletic_themes": r[8] or "",
                "text_indexed": r[10] or "",
                "vector": vec,
            })
        conn.close()

    def buscar(self, query: str, top_k: int = 5) -> list[dict[str, Any]]:
        """Busca os louvores mais afins semanticamente à consulta."""
        q_vec = obter_embedding_consulta(query)
        resultados = []

        for p in self.praises:
            score = similaridade_cosseno(q_vec, p["vector"])
            resultados.append({
                "praise": p,
                "similarity": score,
                "similarity_pct": round(score * 100, 1),
            })

        resultados.sort(key=lambda x: x["similarity"], reverse=True)
        return resultados[:top_k]


def formatar_resultado(res: dict[str, Any], rank: int) -> str:
    p = res["praise"]
    sim = res["similarity_pct"]
    num = f"Nº {p['number']}" if p["number"] else "S/N"
    linhas = [
        f"  #{rank} [{sim:.1f}%] {num} - {p['name']} ({p['category'] or 'Geral'})"
    ]
    if p["biblical_reference"]:
        linhas.append(f"      📖 Referência: {p['biblical_reference']}")
    if p["biblical_summary"]:
        linhas.append(f"      💡 Síntese Bíblica: {p['biblical_summary']}")
    if p["homiletic_themes"]:
        linhas.append(f"      🏷️  Temas: {p['homiletic_themes']}")
    return "\n".join(linhas)


def executar_bateria_testes(buscador: BuscadorSemanticoColdigom) -> None:
    """Executa conjunto de testes canônicos bíblicos e valida assertividade."""
    bateria = [
        {
            "query": "parábola das dez virgens lâmpadas azeite",
            "esperado_keywords": ["143", "527", "candeia", "regozijai"],
        },
        {
            "query": "mulher do fluxo de sangue tocar na orla das vestes",
            "esperado_keywords": ["374", "vestes", "sangue"],
        },
        {
            "query": "o bom pastor que dá a vida pelas ovelhas pastos verdes",
            "esperado_keywords": ["117", "115", "pastor", "ovelha"],
        },
        {
            "query": "cântico de moisés travessia do mar vermelho libertação do egito",
            "esperado_keywords": ["011", "108", "moisés", "egito"],
        },
        {
            "query": "a cura do cego de jericó bartimeu",
            "esperado_keywords": ["062", "cego", "bastimeu", "668"],
        },
    ]

    print("\n" + "=" * 70)
    print("🧪 BATERIA DE VALIDAÇÃO SEMÂNTICA COLDIGOM (Gemma Embedding 2)")
    print("=" * 70)

    total = len(bateria)
    passou = 0

    for i, item in enumerate(bateria, 1):
        q = item["query"]
        print(f"\n[{i}/{total}] Pesquisa: \"{q}\"")
        top = buscador.buscar(q, top_k=3)
        match_encontrado = False

        for rank, res in enumerate(top, 1):
            print(formatar_resultado(res, rank))
            txt_match = f"{res['praise']['number']} {res['praise']['name']}".lower()
            if any(k.lower() in txt_match for k in item["esperado_keywords"]):
                match_encontrado = True

        if match_encontrado:
            print("  ✅ Validação: Louvor bíblico relevante retornado no topo!")
            passou += 1
        else:
            print("  ⚠️ Validação: Louvor esperado ausente no top 3.")

    print("\n" + "=" * 70)
    print(f"📊 Resultado: {passou}/{total} testes validados com sucesso ({passou/total*100:.0f}%)")
    print("=" * 70)


def main():
    parser = argparse.ArgumentParser(description="Busca Semântica de Louvores (Coldigom AI)")
    parser.add_argument("query", nargs="?", default="", help="Termo de busca, passagem ou tema bíblico")
    parser.add_argument("--top", type=int, default=5, help="Quantidade de resultados (padrão: 5)")
    parser.add_argument("--test-suite", action="store_true", help="Executa a bateria de testes de validação")
    args = parser.parse_args()

    buscador = BuscadorSemanticoColdigom()

    if args.test_suite:
        executar_bateria_testes(buscador)
        return

    if not args.query.strip():
        print("Digite um termo para pesquisar ou use --test-suite.")
        print("Exemplo: python3 scripts/buscar_louvores_semantico.py 'parábola das dez virgens'")
        sys.exit(0)

    print(f"\n🔍 Buscando por: \"{args.query}\"...")
    t0 = time.time()
    resultados = buscador.buscar(args.query, top_k=args.top)
    duracao = time.time() - t0

    print(f"✅ {len(resultados)} resultados em {duracao*1000:.0f}ms:\n")
    for rank, res in enumerate(resultados, 1):
        print(formatar_resultado(res, rank))
        print()


if __name__ == "__main__":
    main()
