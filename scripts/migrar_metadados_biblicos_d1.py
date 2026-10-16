#!/usr/bin/env python3
"""
scripts/migrar_metadados_biblicos_d1.py

Lê data/louvores-biblia-consolidado.json e gera o arquivo SQL de carga
para a tabela praise_biblical do Cloudflare D1:
  api/migrations/033_praise_biblical_data.sql

Uso:
  python3 scripts/migrar_metadados_biblicos_d1.py
"""

from __future__ import annotations

import json
from pathlib import Path


def escape_sql(val: str | None) -> str:
    if val is None:
        return "NULL"
    escaped = val.replace("'", "''")
    return f"'{escaped}'"


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    json_path = root / "data" / "louvores-biblia-consolidado.json"
    out_sql_path = root / "api" / "migrations" / "033_praise_biblical_data.sql"

    if not json_path.exists():
        print(f"Erro: Arquivo {json_path} não encontrado.", flush=True)
        return

    with open(json_path, "r", encoding="utf-8") as f:
        data: dict[str, dict] = json.load(f)

    print(f"Lidos {len(data)} registros bíblicos de {json_path.name}")

    linhas_sql = [
        "-- Carga canônica de metadados bíblicos e homiléticos em praise_biblical",
        "-- Gerado por scripts/migrar_metadados_biblicos_d1.py",
        "",
    ]

    total_inseridos = 0
    for pid, p in data.items():
        # Apenas salvar louvores que têm citação direta, mensagem central, temas ou perícopes
        tem_conteudo = (
            p.get("tem_citacao_direta")
            or p.get("referencia_principal")
            or p.get("mensagem_central")
            or p.get("temas_homileticos")
            or p.get("pericopes_relacionadas")
        )
        if not tem_conteudo:
            continue

        tem_citacao = 1 if p.get("tem_citacao_direta") else 0
        ref_principal = escape_sql(p.get("referencia_principal"))
        resumo_1linha = escape_sql(p.get("resumo_uma_linha") or "")
        resumo_formatado = escape_sql(p.get("resumo_formatado") or "")
        citacoes_json = escape_sql(json.dumps(p.get("citacoes_diretas") or [], ensure_ascii=False))
        msg_central = escape_sql(p.get("mensagem_central"))
        temas_json = escape_sql(json.dumps(p.get("temas_homileticos") or [], ensure_ascii=False))
        passagem_origem = escape_sql(p.get("passagem_origem_direta"))
        pericopes_json = escape_sql(json.dumps(p.get("pericopes_relacionadas") or [], ensure_ascii=False))

        sql = (
            f"INSERT OR REPLACE INTO praise_biblical ("
            f"praise_id, tem_citacao_direta, referencia_principal, resumo_uma_linha, "
            f"resumo_formatado, citacoes_diretas_json, mensagem_central, temas_homileticos_json, "
            f"passagem_origem_direta, pericopes_relacionadas_json"
            f") VALUES ("
            f"{escape_sql(pid)}, {tem_citacao}, {ref_principal}, {resumo_1linha}, "
            f"{resumo_formatado}, {citacoes_json}, {msg_central}, {temas_json}, "
            f"{passagem_origem}, {pericopes_json}"
            f");"
        )
        linhas_sql.append(sql)
        total_inseridos += 1

    out_sql_path.write_text("\n".join(linhas_sql) + "\n", encoding="utf-8")
    print(f"Sucesso: Gerado {out_sql_path.name} com {total_inseridos} instruções SQL.")


if __name__ == "__main__":
    main()
