from __future__ import annotations

import os

from core.d1 import sql_str, write_sql_chunks


def test_sql_str_escapa_aspas_simples():
    assert sql_str("Regozijai-vos") == "'Regozijai-vos'"
    assert sql_str("Ouvi, ó céus") == "'Ouvi, ó céus'"
    assert sql_str("d'água") == "'d''água'"


def test_sql_str_none_vira_null_sem_aspas():
    assert sql_str(None) == "NULL"


def test_sql_str_string_vazia_nao_vira_null():
    # Campo vazio e campo ausente sao coisas diferentes no acervo: number=''
    # existe em 484 louvores e nao e o mesmo que number IS NULL.
    assert sql_str("") == "''"


def test_write_sql_chunks_quebra_por_tamanho(tmp_path):
    stmts = [f"UPDATE praises SET name = 'n{i}' WHERE id = 'i{i}';" for i in range(7)]
    arquivos = write_sql_chunks(stmts, str(tmp_path), prefix="teste", per_file=3)
    assert len(arquivos) == 3
    assert [os.path.basename(a) for a in arquivos] == [
        "teste_000.sql", "teste_001.sql", "teste_002.sql"
    ]
    primeiro = open(arquivos[0], encoding="utf-8").read().splitlines()
    assert len(primeiro) == 3
    assert primeiro[0].startswith("UPDATE praises SET name = 'n0'")
    ultimo = open(arquivos[2], encoding="utf-8").read().splitlines()
    assert len(ultimo) == 1


def test_write_sql_chunks_lista_vazia_nao_cria_arquivo(tmp_path):
    assert write_sql_chunks([], str(tmp_path), prefix="teste") == []
    assert os.listdir(tmp_path) == []
