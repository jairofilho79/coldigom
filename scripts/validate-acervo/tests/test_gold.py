from __future__ import annotations

from core.findings import Finding, write_findings
from core.gold import escrever_formulario, ler_gabarito, main, medir, sortear


def _f(tid: str, faixa: str, proposto: str) -> Finding:
    return Finding(
        run_id="r1", detector="youtube_merge", target_type="praise",
        target_id=tid, action="merge_praise", confidence=faixa,
        proposed=proposto, evidence={},
    )


def test_sorteio_e_estratificado_por_faixa():
    fs = ([_f(f"a{i}", "alta", "k") for i in range(10)]
          + [_f(f"m{i}", "media", "k") for i in range(10)]
          + [_f(f"b{i}", "baixa", "k") for i in range(10)])
    amostra = sortear(fs, n=9, seed=42)
    por_faixa = {}
    for f in amostra:
        por_faixa[f.confidence] = por_faixa.get(f.confidence, 0) + 1
    assert por_faixa == {"alta": 3, "media": 3, "baixa": 3}


def test_sorteio_e_reprodutivel_com_a_mesma_semente():
    fs = [_f(f"a{i}", "alta", "k") for i in range(20)]
    a = [f.target_id for f in sortear(fs, n=5, seed=42)]
    b = [f.target_id for f in sortear(fs, n=5, seed=42)]
    c = [f.target_id for f in sortear(fs, n=5, seed=7)]
    assert a == b
    assert a != c


def test_sorteio_pede_mais_do_que_existe_devolve_tudo():
    fs = [_f("a1", "alta", "k"), _f("m1", "media", "k")]
    assert len(sortear(fs, n=50, seed=42)) == 2


def test_formulario_nao_vaza_a_proposta_do_detector(tmp_path):
    # O gabarito so vale se o dono decidir sem ver a resposta. Se a proposta
    # aparecer no formulario, a medicao vira concordancia, nao precisao.
    caminho = str(tmp_path / "gold.tsv")
    escrever_formulario([{
        "target_id": "fonte-1",
        "nome": "Medo tens",
        "letra": "Medo tens que o tentador te va vencer",
        "url": "https://youtu.be/x",
    }], caminho)
    texto = open(caminho, encoding="utf-8").read()
    assert "veredito" in texto.splitlines()[0]
    assert "Medo tens" in texto
    assert "keeper" not in texto
    assert "proposed" not in texto


def test_ler_gabarito_ignora_linha_em_branco_e_cabecalho(tmp_path):
    caminho = str(tmp_path / "gold.tsv")
    open(caminho, "w", encoding="utf-8").write(
        "target_id\tnome\tletra\turl\tveredito\n"
        "fonte-1\tMedo tens\t...\t...\tkeeper-1\n"
        "fonte-2\tGadareno\t...\t...\t\n"
        "\n"
    )
    g = ler_gabarito(caminho)
    assert g == {"fonte-1": "keeper-1"}


def test_medir_calcula_precisao_por_faixa():
    gabarito = {"a1": "k1", "a2": "k2", "m1": "k9"}
    findings = [_f("a1", "alta", "k1"), _f("a2", "alta", "k_errado"), _f("m1", "media", "k9")]
    r = medir(gabarito, findings)
    assert r["alta"]["acertos"] == 1
    assert r["alta"]["total"] == 2
    assert r["alta"]["precisao"] == 50.0
    assert r["media"]["precisao"] == 100.0


def test_medir_conta_alvo_que_o_dono_disse_nenhum_e_o_detector_propos():
    # O pior erro possivel: propor fusao onde o dono disse que nao ha alvo.
    gabarito = {"a1": "NENHUM"}
    r = medir(gabarito, [_f("a1", "alta", "k1")])
    assert r["alta"]["acertos"] == 0
    assert r["alta"]["falso_positivo"] == 1


def test_medir_ignora_finding_que_nao_esta_no_gabarito():
    r = medir({"a1": "k1"}, [_f("a1", "alta", "k1"), _f("zz", "alta", "k2")])
    assert r["alta"]["total"] == 1


def _gabarito(tmp_path, linhas: str) -> str:
    caminho = str(tmp_path / "gabarito.tsv")
    open(caminho, "w", encoding="utf-8").write(
        "target_id\tnome\tletra\turl\tveredito\n" + linhas)
    return caminho


def _findings_jsonl(tmp_path, findings) -> str:
    caminho = str(tmp_path / "findings.jsonl")
    write_findings(findings, caminho)
    return caminho


def test_portao_nao_passa_com_gabarito_vazio(tmp_path, monkeypatch):
    """C3: zero veredito não é zero erro.

    O formulário nasce vazio por construção (veredito = ""), e o plano lê
    saída 0 como "pode aplicar". Sem esta guarda, um gold rodado antes de
    preencher o gabarito libera a fusão destrutiva sem nenhuma medição — o
    portão de promoção (§5.2) passando por vacuidade.
    """
    monkeypatch.setattr("core.gold.OUT", str(tmp_path))
    src = _findings_jsonl(tmp_path, [_f("a1", "alta", "k1")])
    gab = _gabarito(tmp_path, "a1\tMedo tens\t...\t...\t\n")
    assert main(["--from", src, "--gabarito", gab]) != 0


def test_portao_nao_passa_com_veredito_so_de_outra_faixa(tmp_path, monkeypatch):
    # Gabarito preenchido, mas nenhuma linha da faixa que vai escrever: a
    # faixa alta continua sem medição, então o portão continua não avaliado.
    monkeypatch.setattr("core.gold.OUT", str(tmp_path))
    src = _findings_jsonl(tmp_path, [_f("a1", "alta", "k1"), _f("m1", "media", "k2")])
    gab = _gabarito(tmp_path, "m1\tOutro\t...\t...\tk2\n")
    assert main(["--from", src, "--gabarito", gab]) != 0


def test_portao_passa_com_faixa_alta_medida_e_sem_erro(tmp_path, monkeypatch):
    # O caminho feliz continua valendo: há veredito da faixa alta e ele bate
    # com a proposta do detector.
    monkeypatch.setattr("core.gold.OUT", str(tmp_path))
    src = _findings_jsonl(tmp_path, [_f("a1", "alta", "k1")])
    gab = _gabarito(tmp_path, "a1\tMedo tens\t...\t...\tk1\n")
    assert main(["--from", src, "--gabarito", gab]) == 0


def test_portao_reprova_erro_na_faixa_alta(tmp_path, monkeypatch):
    monkeypatch.setattr("core.gold.OUT", str(tmp_path))
    src = _findings_jsonl(tmp_path, [_f("a1", "alta", "k1")])
    gab = _gabarito(tmp_path, "a1\tMedo tens\t...\t...\tNENHUM\n")
    assert main(["--from", src, "--gabarito", gab]) != 0
