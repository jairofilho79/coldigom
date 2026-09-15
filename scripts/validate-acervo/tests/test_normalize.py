from __future__ import annotations

from core.normalize import norm_nome, norm_letra, shingles


def test_norm_nome_tira_acento_e_pontuacao():
    assert norm_nome("Regozijai-vos!") == "regozijai vos"
    assert norm_nome("Regozijai - vos") == "regozijai vos"
    assert norm_nome("Regozijai-vos -") == "regozijai vos"


def test_norm_nome_preserva_o_conteudo_dos_parenteses():
    # Descartar os parenteses fazia estes dois nao se acharem, e eles sao o
    # mesmo louvor. Foi o erro que derrubou a primeira versao do casamento.
    a = norm_nome("Quão grande amor (Vigiai)")
    b = norm_nome("Vigiai (Quão grande amor)")
    assert set(a.split()) == set(b.split())
    assert "vigiai" in a


def test_norm_nome_aceita_none_e_vazio():
    assert norm_nome(None) == ""
    assert norm_nome("") == ""
    assert norm_nome("   ") == ""


def test_norm_letra_colapsa_espaco_e_quebra_de_linha():
    letra = "Estevão avistou\n  os céus abertos;\n\nO Filho do Deus Pai!"
    assert norm_letra(letra) == "estevao avistou os ceus abertos o filho do deus pai"


def test_shingles_tem_janela_deslizante():
    assert shingles("a b c d", k=2) == {"a b", "b c", "c d"}


def test_shingles_de_texto_curto_devolve_vazio():
    # Texto menor que a janela nao produz shingle nenhum: e isso que impede
    # um louvor de duas palavras de casar com meio acervo.
    assert shingles("a b", k=8) == set()
