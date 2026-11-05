#!/usr/bin/env python3
"""
scripts/aplicar_curadoria.py

Lê as decisões de curadoria (enviadas pelo irmão via Cloudflare Pages ou arquivo JSON local),
gera um relatório detalhado das ações (remoções, alterações de kind, novos arranjos)
e, mediante confirmação, aplica as alterações diretamente no banco D1 remoto do Coldigom.

Uso:
    # 1. Puxar a submissão mais recente direto do D1
    python3 scripts/aplicar_curadoria.py --latest

    # 2. Ler de um arquivo JSON baixado
    python3 scripts/aplicar_curadoria.py --arquivo curadoria_coldigom_2026-10-10.json

    # 3. Aplicar de fato as alterações no D1 (por padrão é apenas simulação / dry-run)
    python3 scripts/aplicar_curadoria.py --latest --apply
"""

import argparse
import json
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path

ACCOUNT_ID = "246ee6c20c011ae98a226d48a7a38902"
DATABASE_NAME = "coldigom"

def run_d1_query(sql: str) -> list:
    """Executa SQL no D1 remoto via wrangler e retorna os registros JSON."""
    cmd = [
        "npx", "wrangler", "d1", "execute", DATABASE_NAME,
        "--remote",
        f"--command={sql}",
        "--json"
    ]
    env_vars = subprocess.os.environ.copy()
    env_vars["CLOUDFLARE_ACCOUNT_ID"] = ACCOUNT_ID
    res = subprocess.run(cmd, capture_output=True, text=True, env=env_vars)
    if res.returncode != 0:
        print(f"❌ Erro ao consultar D1: {res.stderr}", file=sys.stderr)
        sys.exit(1)
    try:
        data = json.loads(res.stdout)
        if isinstance(data, list) and len(data) > 0:
            return data[0].get("results", [])
        return []
    except Exception as e:
        print(f"❌ Falha ao parsear resposta do wrangler: {e}\nSaída:\n{res.stdout}", file=sys.stderr)
        sys.exit(1)

def obter_submissao_d1(submissao_id: str = None) -> tuple:
    """Busca a submissão mais recente ou específica na tabela curadoria_submissoes."""
    if submissao_id:
        sql = f"SELECT id, created_at, autor, total_decisoes, dados_json FROM curadoria_submissoes WHERE id = '{submissao_id}';"
    else:
        sql = "SELECT id, created_at, autor, total_decisoes, dados_json FROM curadoria_submissoes ORDER BY created_at DESC LIMIT 1;"
    
    rows = run_d1_query(sql)
    if not rows:
        print("⚠️ Nenhuma submissão encontrada no banco D1.", file=sys.stderr)
        sys.exit(1)
    
    row = rows[0]
    dados = json.loads(row["dados_json"])
    info = {
        "id": row["id"],
        "created_at": row["created_at"],
        "autor": row["autor"],
        "total_decisoes": row["total_decisoes"]
    }
    return info, dados

def processar_decisoes(decisoes: dict):
    """
    Analisa o dicionário de decisões e gera as instruções SQL correspondentes.
    Retorna (remocoes, alteracoes_kind, outros_arranjos, sql_statements).
    """
    remocoes = []
    alteracoes_kind = []
    outros_arranjos = []
    sql_stmts = []

    for group_key, d in decisoes.items():
        praise_id = d.get("praise_id")
        if not praise_id:
            continue

        remover_id = d.get("remover_id")
        if remover_id:
            remocoes.append({
                "group_key": group_key,
                "praise_id": praise_id,
                "remover_id": remover_id,
                "nota": d.get("note", "")
            })
            # SQL seguro de deleção
            sql_stmts.append(
                f"DELETE FROM praise_materials WHERE id = '{remover_id}' AND praise_id = '{praise_id}';"
            )

        # Alterações de kind
        kind_a = d.get("kind_a")
        kind_b = d.get("kind_b")
        if kind_a and "mat_a_id" in d:
            alteracoes_kind.append({
                "praise_id": praise_id,
                "material_id": d["mat_a_id"],
                "novo_kind": kind_a
            })
            sql_stmts.append(
                f"UPDATE praise_materials SET material_kind_id = '{kind_a}' WHERE id = '{d['mat_a_id']}' AND praise_id = '{praise_id}';"
            )
        if kind_b and "mat_b_id" in d:
            alteracoes_kind.append({
                "praise_id": praise_id,
                "material_id": d["mat_b_id"],
                "novo_kind": kind_b
            })
            sql_stmts.append(
                f"UPDATE praise_materials SET material_kind_id = '{kind_b}' WHERE id = '{d['mat_b_id']}' AND praise_id = '{praise_id}';"
            )

        # Outro arranjo
        if d.get("outro_arranjo"):
            outros_arranjos.append({
                "group_key": group_key,
                "praise_id": praise_id,
                "nota": d.get("note", "")
            })

    return remocoes, alteracoes_kind, outros_arranjos, sql_stmts

def main():
    parser = argparse.ArgumentParser(description="Aplica decisões da Curadoria no Coldigom D1")
    parser.add_argument("--latest", action="store_true", help="Puxar a submissão mais recente do D1")
    parser.add_argument("--submissao-id", type=str, help="ID específico da submissão no D1")
    parser.add_argument("--arquivo", type=str, help="Caminho para arquivo JSON local baixado")
    parser.add_argument("--apply", action="store_true", help="Aplica de fato as mudanças no D1 (sem essa flag, roda dry-run)")
    args = parser.parse_args()

    if not args.latest and not args.submissao_id and not args.arquivo:
        # Por padrão tenta --latest
        args.latest = True

    meta_info = {}
    if args.arquivo:
        path = Path(args.arquivo)
        if not path.exists():
            print(f"❌ Arquivo não encontrado: {path}", file=sys.stderr)
            sys.exit(1)
        with open(path, "r", encoding="utf-8") as f:
            conteudo = json.load(f)
            decisoes = conteudo.get("decisoes", conteudo)
            meta_info = {
                "origem": str(path),
                "autor": conteudo.get("autor", "Arquivo Local"),
                "data": conteudo.get("data_envio") or conteudo.get("data_geracao", "-")
            }
    else:
        info, decisoes = obter_submissao_d1(args.submissao_id)
        meta_info = {
            "origem": f"D1 (ID: {info['id']})",
            "autor": info["autor"],
            "data": info["created_at"]
        }

    print("\n" + "=" * 65)
    print("📋 RELATÓRIO DE CURADORIA DE DUPLICATAS - COLDIGOM")
    print("=" * 65)
    print(f"Origem dos dados : {meta_info.get('origem')}")
    print(f"Autor da revisão : {meta_info.get('autor')}")
    print(f"Data da submissão: {meta_info.get('data')}")
    print(f"Total de decisões: {len(decisoes)}")
    print("-" * 65)

    remocoes, alteracoes_kind, outros_arranjos, sql_stmts = processar_decisoes(decisoes)

    print(f"🗑️  Materiais para remoção (DELETE)     : {len(remocoes)}")
    print(f"🏷️  Materiais com kind alterado (UPDATE) : {len(alteracoes_kind)}")
    print(f"🎼  Louvores marcados como outro arranjo : {len(outros_arranjos)}")
    print(f"⚡ Total de comandos SQL gerados       : {len(sql_stmts)}")
    print("=" * 65 + "\n")

    if remocoes[:5]:
        print("🔍 Exemplos de remoções que serão efetuadas:")
        for r in remocoes[:5]:
            nota_str = f" (Nota: {r['nota']})" if r['nota'] else ""
            print(f"  • Louvor {r['praise_id']} -> Remover material {r['remover_id']}{nota_str}")
        if len(remocoes) > 5:
            print(f"  ... e mais {len(remocoes) - 5} remoções.")
        print()

    if outros_arranjos[:5]:
        print("🎼 Exemplos marcados como 'Outro Arranjo':")
        for o in outros_arranjos[:5]:
            nota_str = f" (Nota: {o['nota']})" if o['nota'] else ""
            print(f"  • Louvor {o['praise_id']}{nota_str}")
        if len(outros_arranjos) > 5:
            print(f"  ... e mais {len(outros_arranjos) - 5} outros arranjos.")
        print()

    if not sql_stmts:
        print("ℹ️ Nenhuma alteração SQL (remoção ou troca de kind) a ser aplicada.")
        return

    if not args.apply:
        print("⚠️ MODO DRY-RUN: Nenhuma alteração foi feita no banco de dados.")
        print("Para aplicar essas alterações no D1 remoto, execute:")
        if args.arquivo:
            print(f"   python3 scripts/aplicar_curadoria.py --arquivo {args.arquivo} --apply")
        else:
            print("   python3 scripts/aplicar_curadoria.py --latest --apply")
        return

    # Confirmação interativa
    print(f"🚨 ATENÇÃO: Você está prestes a executar {len(sql_stmts)} comandos no banco D1 remoto (produção)!")
    conf = input("Deseja realmente aplicar agora? Digite 'SIM' para continuar: ")
    if conf.strip() != "SIM":
        print("❌ Operação cancelada pelo usuário.")
        return

    print("\n⏳ Gerando lote SQL e executando no Cloudflare D1...")
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False) as tmp:
        tmp.write("BEGIN TRANSACTION;\n")
        for stmt in sql_stmts:
            tmp.write(stmt + "\n")
        tmp.write("COMMIT;\n")
        tmp_path = tmp.name

    try:
        cmd = [
            "npx", "wrangler", "d1", "execute", DATABASE_NAME,
            "--remote",
            f"--file={tmp_path}"
        ]
        env_vars = subprocess.os.environ.copy()
        env_vars["CLOUDFLARE_ACCOUNT_ID"] = ACCOUNT_ID
        res = subprocess.run(cmd, capture_output=True, text=True, env=env_vars)
        if res.returncode != 0:
            print(f"❌ Erro ao executar script no D1:\n{res.stderr}", file=sys.stderr)
            sys.exit(1)
        print("✅ Sucesso! Todas as alterações foram aplicadas no Cloudflare D1.")
        print(res.stdout)
    finally:
        Path(tmp_path).unlink(missing_ok=True)

if __name__ == "__main__":
    main()
