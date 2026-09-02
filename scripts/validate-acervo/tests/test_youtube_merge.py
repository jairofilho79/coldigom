from __future__ import annotations

from core.snapshot import conectar
from detectors.youtube_merge import detectar


def _mundo(tmp_path):
    conn = conectar(str(tmp_path / "snap.sqlite"))
    conn.executescript(
        """
        CREATE TABLE praises (id TEXT PRIMARY KEY, name TEXT, number TEXT, author TEXT,
                              rhythm TEXT, tonality TEXT, category TEXT, lyrics TEXT,
                              group_id TEXT, created_at TEXT, updated_at TEXT);
        CREATE TABLE praise_materials (id TEXT PRIMARY KEY, praise_id TEXT, material_kind TEXT,
                              type TEXT, r2_key TEXT, file_path_legacy TEXT,
                              source_material_id TEXT, merged_from_praise_id TEXT, url TEXT,
                              created_at TEXT, is_reviewed INTEGER, reviewed_at TEXT,
                              reviewed_by TEXT);
        """
    )
    return conn


def _so_yt(conn, pid, nome, letra=None):
    conn.execute("INSERT INTO praises (id,name,lyrics) VALUES (?,?,?)", (pid, nome, letra))
    conn.execute(
        "INSERT INTO praise_materials (id,praise_id,type,material_kind,url) VALUES (?,?,?,?,?)",
        (f"mat-{pid}", pid, "youtube", "k-audio", f"https://youtu.be/{pid}"),
    )


def _acervo(conn, pid, nome, letra=None):
    conn.execute("INSERT INTO praises (id,name,lyrics) VALUES (?,?,?)", (pid, nome, letra))
    conn.execute(
        "INSERT INTO praise_materials (id,praise_id,type,material_kind,r2_key) VALUES (?,?,?,?,?)",
        (f"mat-{pid}", pid, "pdf", "k-part", f"assets/{pid}.pdf"),
    )


LETRA = ("Medo tens que o tentador te va vencer nesta batalha "
         "mas o Senhor esta contigo e nao ha de te esquecer jamais")


def test_letra_e_nome_no_mesmo_alvo_e_faixa_alta(tmp_path):
    conn = _mundo(tmp_path)
    _so_yt(conn, "yt1", "Medo tens", LETRA)
    _acervo(conn, "ac1", "Medo tens", LETRA)
    conn.commit()
    findings, _motivos, _alvos = detectar(conn, run_id="r1")
    assert len(findings) == 1
    f = findings[0]
    assert f.confidence == "alta"
    assert f.action == "merge_praise"
    assert f.target_id == "yt1"
    assert f.proposed == "ac1"
    assert "letra" in f.evidence and "nome" in f.evidence


def test_so_nome_e_faixa_media(tmp_path):
    conn = _mundo(tmp_path)
    _so_yt(conn, "yt1", "O amor de Deus é grande", None)
    _acervo(conn, "ac1", "O amor de Deus e grande", "letra diferente qualquer coisa aqui agora")
    conn.commit()
    findings, _m, _a = detectar(conn, run_id="r1")
    assert len(findings) == 1
    assert findings[0].confidence == "media"
    assert findings[0].proposed == "ac1"


def test_so_letra_e_faixa_media(tmp_path):
    conn = _mundo(tmp_path)
    _so_yt(conn, "yt1", "Salmo 130", LETRA)
    _acervo(conn, "ac1", "Das profundezas clamo a ti", LETRA)
    conn.commit()
    findings, _m, _a = detectar(conn, run_id="r1")
    assert len(findings) == 1
    assert findings[0].confidence == "media"


def test_dois_alvos_pela_letra_desce_para_media(tmp_path):
    # Ambiguidade nunca e alta: e exatamente onde a fusao erraria.
    conn = _mundo(tmp_path)
    _so_yt(conn, "yt1", "Medo tens", LETRA)
    _acervo(conn, "ac1", "Medo tens", LETRA)
    _acervo(conn, "ac2", "Medo tens", LETRA)
    conn.commit()
    findings, _m, _a = detectar(conn, run_id="r1")
    assert all(f.confidence == "media" for f in findings)
    assert {f.proposed for f in findings} == {"ac1", "ac2"}


def test_sem_candidato_nao_emite_finding_mas_entra_no_formulario(tmp_path):
    conn = _mundo(tmp_path)
    _so_yt(conn, "yt1", "Gadareno", None)
    _acervo(conn, "ac1", "Outro louvor sem relacao nenhuma", "texto totalmente diferente disso")
    conn.commit()
    findings, motivos, alvos = detectar(conn, run_id="r1")
    assert findings == []
    assert "sem candidato" in motivos.tabela()
    assert [a["target_id"] for a in alvos] == ["yt1"]


def test_louvor_com_pdf_nao_e_so_youtube(tmp_path):
    conn = _mundo(tmp_path)
    _acervo(conn, "ac1", "Medo tens", LETRA)
    conn.execute(
        "INSERT INTO praise_materials (id,praise_id,type,material_kind,url) VALUES "
        "('m9','ac1','youtube','k-audio','https://youtu.be/z')"
    )
    conn.commit()
    _f, _m, alvos = detectar(conn, run_id="r1")
    assert alvos == []


def test_o_alvo_do_formulario_traz_evidencia_bruta_e_nao_a_proposta(tmp_path):
    conn = _mundo(tmp_path)
    _so_yt(conn, "yt1", "Medo tens", LETRA)
    _acervo(conn, "ac1", "Medo tens", LETRA)
    conn.commit()
    _f, _m, alvos = detectar(conn, run_id="r1")
    a = alvos[0]
    assert a["target_id"] == "yt1"
    assert a["nome"] == "Medo tens"
    assert a["url"].startswith("https://youtu.be/")
    assert "proposed" not in a
    assert "keeper" not in a


def test_finding_id_e_estavel_entre_execucoes(tmp_path):
    conn = _mundo(tmp_path)
    _so_yt(conn, "yt1", "Medo tens", LETRA)
    _acervo(conn, "ac1", "Medo tens", LETRA)
    conn.commit()
    a, _m, _x = detectar(conn, run_id="r1")
    b, _m2, _x2 = detectar(conn, run_id="r2")
    assert a[0].finding_id == b[0].finding_id


def test_achado_1_field_keeper_discrimina_finding_id_de_multiplos_candidatos_media(tmp_path):
    """Achado 1: field=f'keeper:{alvo}' previne colisão de finding_id quando múltiplos
    candidatos de faixa média surgem da mesma fonte.

    Fonte só-YouTube que casa com dois alvos apenas por letra (não ambos
    letra+nome) gera dois findings de faixa média. Sem field, os dois
    findings colideriam no mesmo finding_id. O field os discrimina.
    """
    conn = _mundo(tmp_path)
    # Fonte só-YouTube com uma letra específica (8+ palavras para gerar shingles)
    _so_yt(conn, "yt1", "Nome fonte generica",
            "uma letra com conteudo suficiente para gerar shingle aqui dentro")
    # Primeiro alvo que casa apenas por letra
    _acervo(conn, "ac1", "Nome alvo 1 diferente",
            "uma letra com conteudo suficiente para gerar shingle aqui dentro")
    # Segundo alvo que casa apenas por letra (mesmo shingle)
    _acervo(conn, "ac2", "Nome alvo 2 diferente",
            "uma letra com conteudo suficiente para gerar shingle aqui dentro")
    conn.commit()

    findings, _motivos, _alvos = detectar(conn, run_id="r1")

    # Dois findings de faixa média (ambiguidade por letra, sem confirmação de nome)
    assert len(findings) == 2
    assert all(f.confidence == "media" for f in findings)
    assert {f.proposed for f in findings} == {"ac1", "ac2"}
    assert all(f.target_id == "yt1" for f in findings)

    # Sem field="keeper:{alvo}", os dois findings teriam o mesmo finding_id.
    # Com o field, são todos distintos.
    finding_ids = {f.finding_id for f in findings}
    assert len(finding_ids) == 2, f"Esperava 2 finding_ids distintos, got {finding_ids}"


def test_achado_2_nome_minimo_8_mata_substring_em_nomes_curtos(tmp_path):
    """Achado 2: NOME_MINIMO = 8 impede substring matching quando o alvo
    tem nome normalizado < 8 caracteres.

    Uma fonte com nome muito curto ('Fé') e um alvo com nome contendo
    a fonte como substring ('Fé do coração') casariam por substring matching
    se o alvo tivesse nome normalizado >= 8. Como tem, casam. Com NOME_MINIMO=999,
    não casariam.
    """
    conn = _mundo(tmp_path)
    # Fonte com nome muito curto, letra vazia para depender só de nome
    _so_yt(conn, "yt1", "Fé", None)
    # Alvo com nome contendo "Fé" como substring, e nome normalizado >= 8
    # "fe do coracao" tem 13 caracteres (contando espaços)
    _acervo(conn, "ac1", "Fé do coração", None)
    conn.commit()

    findings, _motivos, _alvos = detectar(conn, run_id="r1")

    # Com NOME_MINIMO=8, casam por substring matching
    # "fe do coracao" (13 >= 8) contém "fe", então casam
    assert len(findings) == 1
    assert findings[0].proposed == "ac1"
    assert findings[0].confidence == "media"


def test_achado_2_nomes_identicos_casam_independente_de_tamanho(tmp_path):
    """Achado 2b: Nomes idênticos casam sempre, mesmo que sejam muito curtos.

    Mostra que NOME_MINIMO só afeta substring matching, não igualdade exata.
    Quando o nome normalizado da fonte é idêntico ao do alvo, casam regardless.
    """
    conn = _mundo(tmp_path)
    # Fonte e alvo com nome curto idêntico, letra vazia
    _so_yt(conn, "yt1", "Fé", None)
    _acervo(conn, "ac1", "Fé", None)
    conn.commit()

    findings, _motivos, _alvos = detectar(conn, run_id="r1")

    # Casam por igualdade exata de nome, independente do limiar
    assert len(findings) == 1
    assert findings[0].proposed == "ac1"


def test_achado_3_url_deterministica_orderby_id(tmp_path):
    """Achado 3: Subconsulta de URL usa LIMIT 1 sem ORDER BY, resultando em
    não-determinismo se há múltiplos materiais. Adicionar ORDER BY torna
    determinístico.

    Uma fonte com múltiplos materiais YouTube inseridos em ordem reversa (por id)
    terá URL sempre determinística com ORDER BY (retorna a menor por id).
    Sem ORDER BY, a ordem é não-determinística e o teste falha.
    """
    conn = _mundo(tmp_path)
    # Fonte com dois materiais YouTube (múltiplas linhas na subconsulta)
    conn.execute("INSERT INTO praises (id,name,lyrics) VALUES (?,?,?)",
                 ("yt1", "Nome", None))
    # Inserir em ordem reversa por id para forçar que a ordem natural
    # não seja determinística
    conn.execute(
        "INSERT INTO praise_materials (id,praise_id,type,material_kind,url) VALUES (?,?,?,?,?)",
        ("mat-yt1-z", "yt1", "youtube", "k-audio", "https://youtu.be/z"),
    )
    # Depois inserir o que deve ser o primeiro por ORDER BY id
    conn.execute(
        "INSERT INTO praise_materials (id,praise_id,type,material_kind,url) VALUES (?,?,?,?,?)",
        ("mat-yt1-a", "yt1", "youtube", "k-audio", "https://youtu.be/a"),
    )
    # Alvo acervo sem relação para evitar findings
    _acervo(conn, "ac1", "Outro nome", "letra diferente totalmente")
    conn.commit()

    # Rodar múltiplas vezes e coletar URLs da fonte
    # Com ORDER BY m.id, deve sempre pegar "mat-yt1-a" (menor id)
    urls_coletadas = set()
    for run_id in ["r1", "r2", "r3"]:
        _f, _m, alvos = detectar(conn, run_id=run_id)
        url = alvos[0]["url"]
        urls_coletadas.add(url)

    # Com ORDER BY id, sempre retorna a mesma: a menor por id (mat-yt1-a).
    # Sem ORDER BY, a ordem é não-determinística.
    assert len(urls_coletadas) == 1, \
        f"URL deveria ser determinística (sempre a menor por id), mas vimos {urls_coletadas}"
    assert list(urls_coletadas)[0] == "https://youtu.be/a", \
        f"Com ORDER BY id, deveria ser youtu.be/a, mas foi {list(urls_coletadas)[0]}"
