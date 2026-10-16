#!/usr/bin/env python3
"""
scripts/consolidar_metadados_biblicos.py

Consolida as três fontes de dados bíblicos e homiléticos dos louvores em um único
arquivo canônico indexado por praise_id (UUID):
  1. data/louvores-citacoes-biblicas.json (citações literais e semanticamente validadas)
  2. data/louvores-temas-homileticos.json (mensagem central, temas e passagem de origem via Gemini)
  3. data/louvores-pericopes.json (índice invertido louvor -> perícopes bíblicas)
  4. data/embeddings/acervo_embeddings.sqlite (metadados canônicos do acervo: número, nome, categoria)

Gera:
  - data/louvores-biblia-consolidado.json
Com:
  - praise_id, praise_number, praise_name, category
  - tem_citacao_direta (bool)
  - referencia_principal (string ou null)
  - resumo_uma_linha (string de 1 linha sem emoji, perfeito para Coldigui e APIs compactas)
  - resumo_formatado (string de 1 linha com emoji 📖 ou 🕊️)
  - citacoes_diretas (lista normalizada)
  - mensagem_central (resumo teológico)
  - temas_homileticos (tags temáticas)
  - passagem_origem_direta (string ou null)
  - pericopes_relacionadas (top perícopes com título, referência e afinidade)
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path
from typing import Any


def detectar_repositorios() -> tuple[Path, Path]:
    script_dir = Path(__file__).resolve().parent
    repo_atual = script_dir.parent

    if repo_atual.name == "coldigom":
        repo_coldigom = repo_atual
        repo_pericopes = repo_atual.parent / "biblia-pericopes"
    elif repo_atual.name == "biblia-pericopes":
        repo_pericopes = repo_atual
        repo_coldigom = repo_atual.parent / "coldigom"
    else:
        repo_coldigom = repo_atual
        repo_pericopes = repo_atual.parent / "biblia-pericopes"

    return repo_coldigom, repo_pericopes


def carregar_dados_sqlite(db_path: Path) -> dict[str, dict[str, Any]]:
    if not db_path.exists():
        return {}
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute(
        """
        SELECT id, number, name, category, rhythm, tonality, tags, has_lyrics
        FROM praises_semantic
        """
    )
    praises: dict[str, dict[str, Any]] = {}
    for pid, num, name, cat, rhythm, ton, tags, has_lyrics in c.fetchall():
        if "(NA" in name.upper() and "USAR" in name.upper():
            continue
        praises[pid] = {
            "id": pid,
            "number": (num or "").strip(),
            "name": (name or "").strip(),
            "category": (cat or "").strip(),
            "rhythm": (rhythm or "").strip(),
            "tonality": (ton or "").strip(),
            "tags": (tags or "").strip(),
            "has_lyrics": bool(has_lyrics),
        }
    conn.close()
    return praises


def normalizar_citacoes(raw_citacoes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    resultado = []
    for c in raw_citacoes:
        ref = c.get("referencia", "")
        if not ref:
            continue
        resultado.append({
            "referencia": ref,
            "livro": c.get("livro", ""),
            "capitulo": c.get("capitulo"),
            "versiculo_inicio": c.get("versiculoInicio") or c.get("versiculo_inicio"),
            "versiculo_fim": c.get("versiculoFim") or c.get("versiculo_fim"),
            "tipo": c.get("tipo", "citacao_direta"),
            "qtd_ngrams": c.get("qtdNgrams") or c.get("qtd_ngrams", 0),
            "similaridade": c.get("similaridade"),
            "origem": c.get("origem", "ngram_literal"),
        })
    return resultado


def normalizar_pericopes(raw_pericopes: list[dict[str, Any]], max_items: int = 5) -> list[dict[str, Any]]:
    resultado = []
    for p in raw_pericopes[:max_items]:
        ref = p.get("referencia", "")
        if not ref:
            continue
        resultado.append({
            "ordem": p.get("ordem"),
            "livro": p.get("livro", ""),
            "referencia": ref,
            "titulo": p.get("titulo", ""),
            "similarity": p.get("similarity", 0.0),
            "match_tipo": p.get("matchTipo") or p.get("match_tipo", "tematico"),
        })
    return resultado


def gerar_resumos_uma_linha(
    citacoes: list[dict[str, Any]],
    passagem_origem: str | None,
    temas_homileticos: list[str],
    pericopes: list[dict[str, Any]],
) -> tuple[str, str, str | None]:
    """
    Retorna (resumo_uma_linha, resumo_formatado, referencia_principal).
    - resumo_uma_linha: texto limpo de 1 linha sem emojis, ideal para Coldigui e APIs.
    - resumo_formatado: texto limpo prefixado com emoji temático (📖 ou 🕊️).
    - referencia_principal: passagem bíblica mais relevante ou None.
    """
    top_pericope = pericopes[0] if pericopes else None

    # Prioridade 1: Citação Direta Determinística ou Validada
    if citacoes:
        ref = citacoes[0]["referencia"]
        if top_pericope and top_pericope.get("titulo"):
            resumo_limpo = f"{ref} · {top_pericope['titulo']}"
        elif temas_homileticos:
            resumo_limpo = f"{ref} · {temas_homileticos[0]}"
        else:
            resumo_limpo = ref
        return resumo_limpo, f"📖 {resumo_limpo}", ref

    # Prioridade 2: Passagem de Origem Teológica (Gemini)
    if passagem_origem:
        ref = passagem_origem.strip()
        if top_pericope and top_pericope.get("similarity", 0) >= 75 and top_pericope.get("titulo"):
            resumo_limpo = f"{ref} · {top_pericope['titulo']}"
        elif temas_homileticos:
            resumo_limpo = f"{ref} · {temas_homileticos[0]}"
        else:
            resumo_limpo = ref
        return resumo_limpo, f"📖 {resumo_limpo}", ref

    # Prioridade 3: Temas Homiléticos Curados pelo Gemini Flash
    # Se não há citação nem passagem de origem explícita, os temas homiléticos
    # representam o verdadeiro coração espiritual do louvor com precisão.
    if temas_homileticos:
        # Se a perícope tiver altíssima afinidade (>= 82%), podemos incluir a referência
        if top_pericope and top_pericope.get("similarity", 0) >= 82.0 and top_pericope.get("titulo"):
            ref = top_pericope["referencia"]
            resumo_limpo = f"{ref} · {top_pericope['titulo']}"
            return resumo_limpo, f"📖 {resumo_limpo}", ref

        if len(temas_homileticos) >= 2:
            resumo_limpo = f"{temas_homileticos[0]} · {temas_homileticos[1]}"
        else:
            resumo_limpo = temas_homileticos[0]
        return resumo_limpo, f"🕊️ {resumo_limpo}", None

    # Prioridade 4: Perícope Relacionada com Boa Afinidade (>= 75%) quando não há temas
    if top_pericope and top_pericope.get("similarity", 0) >= 75 and top_pericope.get("titulo"):
        ref = top_pericope["referencia"]
        resumo_limpo = f"{ref} · {top_pericope['titulo']}"
        return resumo_limpo, f"📖 {resumo_limpo}", ref

    # Sem dados bíblicos/homiléticos
    return "", "", None


def consolidar_metadados(
    repo_coldigom: Path | None = None,
    repo_pericopes: Path | None = None,
    output_path: Path | None = None,
    verbose: bool = True,
) -> dict[str, dict[str, Any]]:
    if repo_coldigom is None or repo_pericopes is None:
        c_repo, p_repo = detectar_repositorios()
        repo_coldigom = repo_coldigom or c_repo
        repo_pericopes = repo_pericopes or p_repo

    if verbose:
        print("=" * 70)
        print("📚 CONSOLIDAÇÃO DE METADADOS BÍBLICOS E HOMILÉTICOS")
        print(f"Coldigom : {repo_coldigom}")
        print(f"Perícopes: {repo_pericopes}")
        print("=" * 70)

    # 1. Carregar SQLite
    db_path = repo_coldigom / "data" / "embeddings" / "acervo_embeddings.sqlite"
    if not db_path.exists():
        db_path = repo_pericopes / "data" / "embeddings" / "acervo_embeddings.sqlite"
    praises_db = carregar_dados_sqlite(db_path)
    if verbose:
        print(f"📖 Louvores carregados do SQLite: {len(praises_db)}")

    # 2. Carregar Citações
    citacoes_file = repo_coldigom / "data" / "louvores-citacoes-biblicas.json"
    if not citacoes_file.exists():
        citacoes_file = repo_pericopes / "data" / "louvores-citacoes-biblicas.json"
    citacoes_data: dict[str, list[dict[str, Any]]] = {}
    if citacoes_file.exists():
        with open(citacoes_file, "r", encoding="utf-8") as f:
            citacoes_data = json.load(f)
    if verbose:
        print(f"📌 Louvores com citações literais/validadas: {len(citacoes_data)}")

    # 3. Carregar Temas Homiléticos
    temas_file = repo_coldigom / "data" / "louvores-temas-homileticos.json"
    if not temas_file.exists():
        temas_file = repo_pericopes / "data" / "louvores-temas-homileticos.json"
    temas_data: dict[str, dict[str, Any]] = {}
    if temas_file.exists():
        with open(temas_file, "r", encoding="utf-8") as f:
            temas_data = json.load(f)
    if verbose:
        print(f"🕊️ Louvores com temas homiléticos (Gemini): {len(temas_data)}")

    # 4. Carregar Perícopes Invertidas
    pericopes_file = repo_coldigom / "data" / "louvores-pericopes.json"
    if not pericopes_file.exists():
        pericopes_file = repo_pericopes / "data" / "louvores-pericopes.json"
    pericopes_data: dict[str, list[dict[str, Any]]] = {}
    if pericopes_file.exists():
        with open(pericopes_file, "r", encoding="utf-8") as f:
            pericopes_data = json.load(f)
    if verbose:
        print(f"🔗 Louvores com perícopes associadas: {len(pericopes_data)}")

    # Coletar todos os IDs de louvores
    todos_os_ids = set(praises_db.keys()) | set(citacoes_data.keys()) | set(temas_data.keys()) | set(pericopes_data.keys())

    consolidado: dict[str, dict[str, Any]] = {}
    stats_citacao = 0
    stats_origem = 0
    stats_pericope = 0
    stats_tema = 0

    for pid in sorted(todos_os_ids):
        p_db = praises_db.get(pid, {})
        name = p_db.get("name") or (temas_data.get(pid, {}).get("praise_name")) or ""
        number = p_db.get("number") or (temas_data.get(pid, {}).get("praise_number")) or ""
        category = p_db.get("category") or (temas_data.get(pid, {}).get("category")) or ""

        # Citações
        raw_cits = citacoes_data.get(pid, [])
        citacoes_norm = normalizar_citacoes(raw_cits)

        # Temas
        t_entry = temas_data.get(pid, {})
        msg_central = t_entry.get("mensagem_central") or None
        temas_list = t_entry.get("temas_homileticos") or []
        passagem_origem = t_entry.get("passagem_origem_direta") or None

        # Perícopes
        raw_pers = pericopes_data.get(pid, [])
        pericopes_norm = normalizar_pericopes(raw_pers)

        # Resumos
        resumo_limpo, resumo_formatado, ref_principal = gerar_resumos_uma_linha(
            citacoes=citacoes_norm,
            passagem_origem=passagem_origem,
            temas_homileticos=temas_list,
            pericopes=pericopes_norm,
        )

        tem_citacao = len(citacoes_norm) > 0
        if tem_citacao:
            stats_citacao += 1
        elif passagem_origem:
            stats_origem += 1
        elif pericopes_norm and pericopes_norm[0].get("similarity", 0) >= 75:
            stats_pericope += 1
        elif temas_list:
            stats_tema += 1

        consolidado[pid] = {
            "praise_id": pid,
            "praise_number": number,
            "praise_name": name,
            "category": category,
            "tem_citacao_direta": tem_citacao,
            "referencia_principal": ref_principal,
            "resumo_uma_linha": resumo_limpo,
            "resumo_formatado": resumo_formatado,
            "citacoes_diretas": citacoes_norm,
            "mensagem_central": msg_central,
            "temas_homileticos": temas_list,
            "passagem_origem_direta": passagem_origem,
            "pericopes_relacionadas": pericopes_norm,
        }

    # Salvar nos destinos
    destinos = []
    if output_path:
        destinos.append(output_path)
    else:
        destinos.append(repo_coldigom / "data" / "louvores-biblia-consolidado.json")
        if repo_pericopes.exists():
            destinos.append(repo_pericopes / "data" / "louvores-biblia-consolidado.json")
            pub_data = repo_pericopes / "public" / "data"
            if pub_data.exists():
                destinos.append(pub_data / "louvores-biblia-consolidado.json")

    for dest in destinos:
        dest.parent.mkdir(parents=True, exist_ok=True)
        with open(dest, "w", encoding="utf-8") as f:
            json.dump(consolidado, f, indent=2, ensure_ascii=False)
        if verbose:
            size_kb = dest.stat().st_size / 1024
            print(f"💾 Salvo com sucesso: {dest} ({size_kb:.1f} KB)")

    if verbose:
        total = len(consolidado)
        com_insight = stats_citacao + stats_origem + stats_pericope + stats_tema
        print("\n📊 ESTATÍSTICAS DA BASE BÍBLICA CONSOLIDADA:")
        print(f"  • Total de Louvores Consolidados : {total}")
        print(f"  • Com Citação Bíblica Direta     : {stats_citacao} ({stats_citacao/total*100:.1f}%)")
        print(f"  • Com Passagem Origem Teológica : {stats_origem} ({stats_origem/total*100:.1f}%)")
        print(f"  • Com Perícope de Alta Afinidade: {stats_pericope} ({stats_pericope/total*100:.1f}%)")
        print(f"  • Com Temas Homiléticos Puros   : {stats_tema} ({stats_tema/total*100:.1f}%)")
        print(f"  • Cobertura Total de Insights   : {com_insight} / {total} ({com_insight/total*100:.1f}%)")
        print("=" * 70)

    return consolidado


def main() -> None:
    parser = argparse.ArgumentParser(description="Consolida metadados bíblicos e homiléticos dos louvores.")
    parser.add_argument("--output", type=Path, help="Caminho customizado de saída para o JSON.")
    parser.add_argument("--silent", action="store_true", help="Executa sem imprimir logs no stdout.")
    args = parser.parse_args()

    consolidar_metadados(output_path=args.output, verbose=not args.silent)


if __name__ == "__main__":
    main()
