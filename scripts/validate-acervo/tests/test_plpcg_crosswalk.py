from __future__ import annotations

from core.plpcg import codificar
from core.snapshot import conectar
from detectors.plpcg_crosswalk import (
    Acervo,
    candidatos_louvor,
    chaves_csv,
    chaves_plpcg,
    classe_ok,
    cruzar,
    numero_int,
    slug,
    tags_propostas,
)


# --- fixture: um acervo do coldigom em miniatura ---------------------------

def _mundo(tmp_path):
    conn = conectar(str(tmp_path / "snap.sqlite"))
    conn.executescript(
        """
        CREATE TABLE praises (id TEXT PRIMARY KEY, name TEXT, number TEXT, author TEXT,
                              rhythm TEXT, tonality TEXT, category TEXT, lyrics TEXT,
                              group_id TEXT, created_at TEXT, updated_at TEXT);
        CREATE TABLE material_kinds (id TEXT PRIMARY KEY, name TEXT);
        CREATE TABLE tags (id TEXT PRIMARY KEY, name TEXT, parent_id TEXT);
        CREATE TABLE praise_tags (praise_id TEXT, tag_id TEXT);
        CREATE TABLE praise_materials (id TEXT PRIMARY KEY, praise_id TEXT, material_kind TEXT,
                              type TEXT, r2_key TEXT, file_path_legacy TEXT,
                              source_material_id TEXT, merged_from_praise_id TEXT, url TEXT,
                              created_at TEXT, is_reviewed INTEGER, reviewed_at TEXT,
                              reviewed_by TEXT);
        CREATE TABLE csvmap (file_path TEXT, material_kind_csv TEXT, praise_tags TEXT,
                             praise_number TEXT, praise_name TEXT, praise_id TEXT,
                             to_convert TEXT, praise_material_id TEXT);
        """
    )
    for nome in ("Sheet Music", "Choir", "Score", "Chord Chart", "Chord Chart I",
                 "Chord Chart II", "CIAs Gestures"):
        conn.execute("INSERT INTO material_kinds VALUES (?,?)", ("k-" + slug(nome), nome))
    for nome in ("Coletânea", "CIAs", "PES", "Avulsos", "GLTM"):
        conn.execute("INSERT INTO tags VALUES (?,?,NULL)", ("t-" + slug(nome), nome))
    return conn


def _praise(conn, pid, nome, numero="", tags=()):
    conn.execute("INSERT INTO praises (id, name, number) VALUES (?,?,?)", (pid, nome, numero))
    for t in tags:
        conn.execute("INSERT INTO praise_tags VALUES (?,?)", (pid, "t-" + slug(t)))


def _material(conn, mid, pid, kind, tipo="pdf"):
    conn.execute(
        "INSERT INTO praise_materials (id, praise_id, material_kind, type) VALUES (?,?,?,?)",
        (mid, pid, "k-" + slug(kind), tipo),
    )


def _csv(conn, file_path, mid):
    conn.execute("INSERT INTO csvmap (file_path, praise_material_id) VALUES (?,?)", (file_path, mid))


def _entrada(caminho, nome, numero, classificacao, categoria, group_id, short_id="0001"):
    """Uma linha de louvores do PLPCG, como core.plpcg.entradas() devolve."""
    return {
        "pdf_id": codificar(caminho), "caminho": caminho, "nome": nome, "numero": numero,
        "classificacao": classificacao, "categoria": categoria,
        "pdf": caminho.split("/")[-1], "group_id": group_id, "short_id": short_id,
    }


# --- normalização -------------------------------------------------------------

def test_slug_tira_acento_pontuacao_e_colapsa():
    assert slug("Clamo a ti [003]") == "clamo-a-ti-003"
    assert slug("Ó profundidade das riquezas!") == "o-profundidade-das-riquezas"
    assert slug("  Regozijai - vos ") == "regozijai-vos"
    assert slug(None) == ""


def test_numero_int_le_o_prefixo_numerico():
    assert numero_int("003") == 3
    assert numero_int("12 A") == 12
    assert numero_int("") is None
    assert numero_int(None) is None
    assert numero_int("Avulso") is None


def test_classe_ok_segue_o_mapa_de_tags():
    assert classe_ok("Coletânea Adultos", {"Coletânea"})
    assert not classe_ok("Coletânea Adultos", {"Coletânea", "CIAs"})
    assert not classe_ok("Coletânea Adultos", {"Coletânea", "PES"})
    assert classe_ok("Coletânea CIAs", {"Coletânea", "CIAs"})
    assert not classe_ok("Coletânea CIAs", {"Coletânea"})
    assert classe_ok("PES (Trombetas e Festas 2025)", {"PES"})
    assert not classe_ok("PES", {"PES", "CIAs"})
    assert classe_ok("PES CIAs", {"PES", "CIAs"})
    assert classe_ok("Avulsos Diversos", {"Avulsos"})
    assert classe_ok("Avulsos Diversos", set())
    assert not classe_ok("Avulsos Diversos", {"Coletânea"})
    assert classe_ok("Avulsos Diversos", {"Coletânea", "Avulsos"})
    assert classe_ok("Avulsos (cifrado)", {"Coletânea"})  # classe fora do mapa: não filtra


def test_tags_propostas_por_classificacao():
    assert tags_propostas("Coletânea Adultos") == ["Coletânea"]
    assert tags_propostas("Coletânea CIAs (Evangelização CIAs Out 2025)") == ["CIAs", "Coletânea"]
    assert tags_propostas("PES CIAs") == ["CIAs", "PES"]
    assert tags_propostas("Avulsos Diversos") == ["Avulsos"]
    assert tags_propostas("Avulsos Diversos (GLTM)") == ["Avulsos", "GLTM"]


# --- Camada P: chaves de caminho ---------------------------------------------

def test_chaves_csv_indexa_por_numero_e_por_nome_da_pasta():
    assert chaves_csv("Coletânea /031 - Meu Deus, meu Pai/Cifra I.pdf") == [
        ("Coletânea", 31, "cifra-i-pdf"),
        ("Coletânea", "meu-deus-meu-pai", "cifra-i-pdf"),
    ]
    assert chaves_csv("Avulsos Diversos/Alto preço/Coro.pdf") == [
        ("Avulsos Diversos", "alto-preco", "coro-pdf"),
    ]
    assert chaves_csv("solto.pdf") == []


def test_chaves_plpcg_traduz_o_caminho_para_a_forma_do_csvmap():
    assert chaves_plpcg("ColAdultos/031.pdf", 31) == [("Coletânea", 31, "partitura-pdf")]
    assert chaves_plpcg("ColCIAs/031.pdf", 31) == [("Coletânea CIAs", 31, "partitura-pdf")]
    assert chaves_plpcg("ColAdultos/000.pdf", None) == []
    assert chaves_plpcg("Louvores Coletânea de Partituras/031 - Meu Deus/Cifra I.pdf", 31) == [
        ("Coletânea", 31, "cifra-i-pdf"),
        ("Coletânea", "meu-deus", "cifra-i-pdf"),
    ]
    avulso = chaves_plpcg("Adicionados/Alto preço/Cifra.pdf", None)
    assert ("Avulsos Diversos", "alto-preco", "cifra-pdf") in avulso
    assert ("GLTM", "alto-preco", "cifra-pdf") in avulso
    assert all(k[1] == "alto-preco" for k in avulso)
    assert chaves_plpcg("assets/PES/Alto preço - CIFRA.pdf", None) == []
    assert chaves_plpcg("04112025/A luz/Cifra.pdf", None) == []


# --- Camada L: o louvor -------------------------------------------------------

def test_acervo_carrega_indices_e_tolera_snapshot_sem_csvmap(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "p31", "Meu Deus, meu Pai", "031", ("Coletânea",))
    _material(conn, "m31", "p31", "Sheet Music")
    _csv(conn, "Coletânea /031 - Meu Deus, meu Pai/Partitura.pdf", "m31")
    conn.commit()
    a = Acervo.carregar(conn)
    assert a.por_numero == {31: ["p31"]}
    assert a.por_slug == {"meu-deus-meu-pai": ["p31"]}
    assert a.tags == {"p31": {"Coletânea"}}
    assert a.materiais == {"p31": [("m31", "Sheet Music", "pdf")]}
    assert a.praise_do_material == {"m31": "p31"}
    assert a.chave_csv[("Coletânea", 31, "partitura-pdf")] == {"m31"}

    conn.execute("DROP TABLE csvmap")
    conn.commit()
    assert Acervo.carregar(conn).chave_csv == {}


def test_louvor_por_numero_desempata_por_slug_e_depois_por_classe(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "pA", "Clamo a ti", "003", ("Coletânea",))
    _praise(conn, "pB", "Clamo a ti", "003", ("Coletânea", "PES"))
    _praise(conn, "pC", "Outro hino", "003", ("Coletânea", "CIAs"))
    conn.commit()
    a = Acervo.carregar(conn)

    P, evid, aprox = candidatos_louvor("003:clamo-a-ti", "PES", "003", a)
    assert P == ["pB"] and evid == ["num", "slug", "classe"] and aprox is False

    P, evid, _ = candidatos_louvor("003:outro-hino", "Coletânea CIAs", "003", a)
    assert P == ["pC"] and evid == ["num", "slug"]

    # o slug deixa pA e pB; a classe (Coletânea sem PES) resolve
    P, evid, _ = candidatos_louvor("003:clamo-a-ti", "Coletânea Adultos", "003", a)
    assert P == ["pA"] and evid == ["num", "slug", "classe"]


def test_desempate_que_nao_narra_nada_mantem_os_candidatos(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "pA", "Hino um", "003", ("Coletânea",))
    _praise(conn, "pB", "Hino dois", "003", ("Coletânea",))
    conn.commit()
    a = Acervo.carregar(conn)

    # nenhum dos dois casa o slug do grupo: o filtro de slug fica vazio e
    # não estreita nada — sem evidência 'slug'. A classe (Coletânea
    # Adultos) é compatível com os dois: o filtro não estreita a lista,
    # mas como o resultado não é vazio, a evidência 'classe' ainda entra.
    P, evid, aprox = candidatos_louvor("003:clamo-a-ti", "Coletânea Adultos", "003", a)
    assert P == ["pA", "pB"] and evid == ["num", "classe"] and aprox is False

    # PES não é compatível com nenhum dos dois: o filtro de classe fica
    # vazio, então ele é descartado — os candidatos do número sobrevivem
    # como ambiguidade, sem evidência extra.
    P, evid, aprox = candidatos_louvor("003:clamo-a-ti", "PES", "003", a)
    assert P == ["pA", "pB"] and evid == ["num"] and aprox is False


def test_avulso_por_nome_exato_continencia_e_similaridade(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "p1", "A ti que habitas entre os querubins", "", ("Avulsos",))
    _praise(conn, "p2", "Regozijai-vos", "", ("Avulsos",))
    _praise(conn, "p3", "Fé", "", ("Avulsos",))
    conn.commit()
    a = Acervo.carregar(conn)

    assert candidatos_louvor("avulso:regozijai-vos", "Avulsos Diversos", "", a) == (["p2"], ["nome"], False)
    # continência: 'a-ti-que-habitas' é prefixo (>= 10 chars) do slug do acervo
    assert candidatos_louvor("avulso:a-ti-que-habitas", "Avulsos Diversos", "", a) == (["p1"], ["nome~"], True)
    # similaridade >= 0.8 (sem continência: o hífen sumiu)
    assert candidatos_louvor("avulso:regozijaivos", "Avulsos Diversos", "", a) == (["p2"], ["nome~"], True)
    # nome curto não casa por continência nem por similaridade
    assert candidatos_louvor("avulso:fe-do-coracao-meu", "Avulsos Diversos", "", a) == ([], [], False)


def test_nome_aproximado_com_varios_slugs_ainda_desempata(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "p1", "Regozijai-vos", "", ("Avulsos",))
    _praise(conn, "p2", "Regozijai-vos b", "", ("Coletânea",))
    _praise(conn, "p3", "Regozijai-vos c", "", ("Coletânea",))
    conn.commit()
    a = Acervo.carregar(conn)

    # os três slugs entram por similaridade (nenhum bate exato); a classe
    # (Avulsos Diversos) só é compatível com p1 — o desempate sobra nele.
    P, evid, aprox = candidatos_louvor("avulso:regozijaivos", "Avulsos Diversos", "", a)
    assert P == ["p1"] and evid == ["nome~", "classe"] and aprox is True


def test_numero_sem_candidato_cai_para_o_nome(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "p1", "Alto preço", "", ("Avulsos",))
    conn.commit()
    a = Acervo.carregar(conn)
    assert candidatos_louvor("999:alto-preco", "Coletânea Adultos", "999", a) == (["p1"], ["nome"], False)


# --- o cruzamento -------------------------------------------------------------

def _cruza(conn, entrada, sha=None, hc=None):
    return cruzar(entrada, Acervo.carregar(conn), sha, hc or {})


def test_numero_mais_hash_e_alta(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "p31", "Meu Deus, meu Pai", "031", ("Coletânea",))
    _material(conn, "m31", "p31", "Sheet Music")
    _material(conn, "a31", "p31", "Audio", tipo="mp3")
    conn.commit()
    e = _entrada("ColAdultos/031.pdf", "Meu Deus, meu Pai", "031", "Coletânea Adultos",
                 "Partitura", "031:meu-deus-meu-pai")
    r = _cruza(conn, e, "sha-31", {"sha-31": {"m31"}})
    assert r.faixa == "alta"
    assert r.evidencias == ["num", "hash"]
    assert (r.praise_id, r.material_id, r.kind_coldigom) == ("p31", "m31", "Sheet Music")
    assert r.nota is None
    assert r.candidatos[0]["material_id"] == "m31" and "hash" in r.candidatos[0]["por_que"]


def test_numero_mais_caminho_e_alta_sem_hash(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "p31", "Meu Deus, meu Pai", "031", ("Coletânea",))
    _material(conn, "c31", "p31", "Chord Chart I")
    _csv(conn, "Coletânea /031 - Meu Deus, meu Pai/Cifra I.pdf", "c31")
    conn.commit()
    e = _entrada("Louvores Coletânea de Partituras/031 - Meu Deus, meu Pai/Cifra I.pdf",
                 "Meu Deus, meu Pai", "031", "Coletânea Adultos", "Cifra nível I",
                 "031:meu-deus-meu-pai")
    r = _cruza(conn, e)
    assert r.faixa == "alta" and r.evidencias == ["num", "path"] and r.material_id == "c31"


def test_pagina_compartilhada_casa_dentro_do_proprio_louvor(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "p31", "Meu Deus, meu Pai", "031", ("Coletânea",))
    _praise(conn, "p32", "Vem, Senhor", "032", ("Coletânea",))
    _material(conn, "m31", "p31", "Sheet Music")
    _material(conn, "m32", "p32", "Sheet Music")
    conn.commit()
    hc = {"sha-pag": {"m31", "m32"}}  # a mesma página copiada para os dois louvores
    r31 = _cruza(conn, _entrada("ColAdultos/031.pdf", "Meu Deus, meu Pai", "031",
                                "Coletânea Adultos", "Partitura", "031:meu-deus-meu-pai"), "sha-pag", hc)
    r32 = _cruza(conn, _entrada("ColAdultos/032.pdf", "Vem, Senhor", "032",
                                "Coletânea Adultos", "Partitura", "032:vem-senhor"), "sha-pag", hc)
    assert (r31.faixa, r31.material_id) == ("alta", "m31")
    assert (r32.faixa, r32.material_id) == ("alta", "m32")


def test_grupo_com_coletanea_e_arranjo_pes_escolhe_o_praise_do_material(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "pA", "Clamo a ti", "003", ("Coletânea",))
    _praise(conn, "pB", "Clamo a ti", "003", ("Coletânea", "PES"))
    _material(conn, "mA", "pA", "Sheet Music")
    _material(conn, "mB", "pB", "Choir")
    conn.commit()
    e = _entrada("Avulsos/Clamo a ti/Coro.pdf", "Clamo a ti", "003", "PES", "Partitura", "003:clamo-a-ti")
    r = _cruza(conn, e, "sha-b", {"sha-b": {"mB"}})
    assert r.faixa == "alta" and r.praise_id == "pB" and r.material_id == "mB"
    assert "classe" in r.evidencias and "hash" in r.evidencias


def test_nome_aproximado_com_hash_fica_em_media(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "p1", "A ti que habitas entre os querubins", "", ("Avulsos",))
    _material(conn, "m1", "p1", "Chord Chart")
    conn.commit()
    e = _entrada("Adicionados/A ti que habitas/Cifra.pdf", "A ti que habitas", "",
                 "Avulsos Diversos", "Cifra", "avulso:a-ti-que-habitas")
    r = _cruza(conn, e, "sha-1", {"sha-1": {"m1"}})
    assert r.faixa == "media" and "nome~" in r.evidencias and r.material_id == "m1"


def test_louvor_unico_com_um_material_do_kind_e_media_kind_unico(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "p1", "Alto preço", "", ("Avulsos",))
    _material(conn, "m1", "p1", "Choir")
    _material(conn, "c1", "p1", "Chord Chart")
    conn.commit()
    e = _entrada("Adicionados/Alto preço/Partitura.pdf", "Alto preço", "", "Avulsos Diversos",
                 "Partitura", "avulso:alto-preco")
    r = _cruza(conn, e)
    assert r.faixa == "media" and r.evidencias == ["nome", "kind-unico"]
    assert r.material_id == "m1" and r.kind_coldigom == "Choir"


def test_louvor_certo_sem_material_do_kind_e_faltante(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "p31", "Meu Deus, meu Pai", "031", ("Coletânea",))
    _material(conn, "a31", "p31", "Audio", tipo="mp3")
    conn.commit()
    e = _entrada("ColAdultos/031.pdf", "Meu Deus, meu Pai", "031", "Coletânea Adultos",
                 "Partitura", "031:meu-deus-meu-pai")
    r = _cruza(conn, e)
    assert r.faixa == "faltante" and r.praise_id == "p31" and r.material_id is None
    assert r.nota == "louvor casado, sem material desse kind"


def test_dois_materiais_do_kind_sem_corroboracao_e_ambiguo_com_candidatos(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "p1", "Alto preço", "", ("Avulsos",))
    _material(conn, "mA", "p1", "Choir")
    _material(conn, "mB", "p1", "Score")
    conn.commit()
    e = _entrada("Adicionados/Alto preço/Partitura.pdf", "Alto preço", "", "Avulsos Diversos",
                 "Partitura", "avulso:alto-preco")
    r = _cruza(conn, e)
    assert r.faixa == "ambiguo" and r.praise_id == "p1" and r.material_id is None
    assert r.nota == "2 materiais do kind, nenhum corroborado"
    assert [c["material_id"] for c in r.candidatos] == ["mA", "mB"]
    assert r.candidatos[0]["por_que"] == ["nome", "kind"]


def test_dois_louvores_sem_desempate_e_ambiguo(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "pA", "Clamo a ti", "003", ("Coletânea",))
    _praise(conn, "pB", "Clamo a ti", "003", ("Coletânea",))
    conn.commit()
    e = _entrada("ColAdultos/003.pdf", "Clamo a ti", "003", "Coletânea Adultos", "Partitura", "003:clamo-a-ti")
    r = _cruza(conn, e)
    assert r.faixa == "ambiguo" and r.praise_id is None and r.nota == "2 louvores candidatos"


def test_kind_divergente_vira_nota_nao_rebaixa(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "p31", "Meu Deus, meu Pai", "031", ("Coletânea",))
    _material(conn, "x31", "p31", "Chord Chart")
    conn.commit()
    e = _entrada("ColAdultos/031.pdf", "Meu Deus, meu Pai", "031", "Coletânea Adultos",
                 "Partitura", "031:meu-deus-meu-pai")
    r = _cruza(conn, e, "sha-31", {"sha-31": {"x31"}})
    assert r.faixa == "alta" and r.material_id == "x31"
    assert r.nota == "kind divergente: coldigom=Chord Chart"


def test_so_hash_num_louvor_unico_e_media_hash_so(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "p1", "Nome completamente outro", "", ("Avulsos",))
    _material(conn, "m1", "p1", "Chord Chart")
    conn.commit()
    e = _entrada("Adicionados/Zzz qqq/Cifra.pdf", "Zzz qqq", "", "Avulsos Diversos", "Cifra", "avulso:zzz-qqq")
    r = _cruza(conn, e, "sha-1", {"sha-1": {"m1"}})
    assert r.faixa == "media" and r.evidencias == ["hash-so"]
    assert r.praise_id == "p1" and r.material_id == "m1"
    assert r.candidatos[0]["por_que"] == ["hash", "kind"]


def test_nada_em_l_nem_em_h_e_sem_louvor(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "p1", "Nome completamente outro", "", ("Avulsos",))
    conn.commit()
    e = _entrada("Adicionados/Zzz qqq/Cifra.pdf", "Zzz qqq", "", "Avulsos Diversos", "Cifra", "avulso:zzz-qqq")
    r = _cruza(conn, e)
    assert r.faixa == "sem_louvor" and r.praise_id is None and r.candidatos == []
    assert r.nota == "nenhum louvor candidato"


def test_hash_em_varios_louvores_sem_l_e_sem_louvor(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "p1", "Um", "", ("Avulsos",))
    _praise(conn, "p2", "Dois", "", ("Avulsos",))
    _material(conn, "m1", "p1", "Sheet Music")
    _material(conn, "m2", "p2", "Sheet Music")
    conn.commit()
    e = _entrada("Adicionados/Zzz qqq/Partitura.pdf", "Zzz qqq", "", "Avulsos Diversos",
                 "Partitura", "avulso:zzz-qqq")
    r = _cruza(conn, e, "sha-pag", {"sha-pag": {"m1", "m2"}})
    assert r.faixa == "sem_louvor" and r.nota == "hash bate em 2 louvores"
    assert {c["praise_id"] for c in r.candidatos} == {"p1", "p2"}


def test_candidatos_no_maximo_cinco_ordenados_por_score(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "p1", "Alto preço", "", ("Avulsos",))
    for i in range(7):
        _material(conn, f"m{i}", "p1", "Choir")
    conn.commit()
    e = _entrada("Adicionados/Alto preço/Partitura.pdf", "Alto preço", "", "Avulsos Diversos",
                 "Partitura", "avulso:alto-preco")
    r = _cruza(conn, e, "sha-3", {"sha-3": {"m3"}})
    assert r.faixa == "alta" and r.material_id == "m3"
    assert len(r.candidatos) == 5
    assert r.candidatos[0]["material_id"] == "m3"
    assert r.candidatos[0]["score"] > r.candidatos[1]["score"]


def test_dois_materiais_corroborados_no_mesmo_louvor_e_ambiguo(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "p31", "Meu Deus, meu Pai", "031", ("Coletânea",))
    _material(conn, "mA", "p31", "Sheet Music")
    _material(conn, "mB", "p31", "Sheet Music")
    conn.commit()
    e = _entrada("ColAdultos/031.pdf", "Meu Deus, meu Pai", "031", "Coletânea Adultos",
                 "Partitura", "031:meu-deus-meu-pai")
    r = _cruza(conn, e, "sha-pag", {"sha-pag": {"mA", "mB"}})
    assert r.faixa == "ambiguo" and r.praise_id == "p31" and r.material_id is None
    assert r.nota == "2 materiais corroborados em 1 louvor(es)"
    assert {c["material_id"] for c in r.candidatos} == {"mA", "mB"}
    assert all("hash" in c["por_que"] for c in r.candidatos)


def test_materiais_corroborados_em_dois_louvores_e_ambiguo_sem_praise(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "pA", "Clamo a ti", "003", ("Coletânea",))
    _praise(conn, "pB", "Clamo a ti", "003", ("Coletânea",))
    _material(conn, "mA", "pA", "Sheet Music")
    _material(conn, "mB", "pB", "Sheet Music")
    conn.commit()
    e = _entrada("ColAdultos/003.pdf", "Clamo a ti", "003", "Coletânea Adultos", "Partitura", "003:clamo-a-ti")
    r = _cruza(conn, e, "sha-pag", {"sha-pag": {"mA", "mB"}})
    assert r.faixa == "ambiguo" and r.praise_id is None
    assert r.nota == "2 materiais corroborados em 2 louvor(es)"


def test_nome_aproximado_sem_material_do_kind_fica_em_media_nao_faltante(tmp_path):
    conn = _mundo(tmp_path)
    _praise(conn, "p1", "A ti que habitas entre os querubins", "", ("Avulsos",))
    _material(conn, "a1", "p1", "Audio", tipo="mp3")
    conn.commit()
    e = _entrada("Adicionados/A ti que habitas/Cifra.pdf", "A ti que habitas", "",
                 "Avulsos Diversos", "Cifra", "avulso:a-ti-que-habitas")
    r = _cruza(conn, e)
    assert r.faixa == "media" and "nome~" in r.evidencias
    assert r.praise_id == "p1" and r.material_id is None
    assert r.nota == "louvor casado, sem material desse kind"
