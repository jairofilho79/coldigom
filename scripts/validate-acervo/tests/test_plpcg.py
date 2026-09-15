from __future__ import annotations

import io
import os

from core.plpcg import (
    arquivo_local,
    baixar,
    caminho_relativo,
    codificar,
    decodificar,
    url_publica,
)


def test_decodificar_pdf_id_real():
    assert decodificar("Q29sQWR1bHRvcy8wMDEucGRm") == "ColAdultos/001.pdf"


def test_codificar_e_decodificar_sao_inversos_com_acento():
    caminho = "Adicionados/Ainda há tempo/Cifra.pdf"
    pdf_id = codificar(caminho)
    assert "=" not in pdf_id
    assert decodificar(pdf_id) == caminho


def test_caminho_relativo_tira_o_prefixo_assets_uma_vez():
    assert caminho_relativo("ColAdultos/001.pdf") == "ColAdultos/001.pdf"
    assert caminho_relativo("assets/PES/Alto preço - CIFRA.pdf") == "PES/Alto preço - CIFRA.pdf"


def test_url_publica_sempre_debaixo_de_assets():
    assert url_publica("ColAdultos/001.pdf") == "https://plpcg.com/assets/ColAdultos/001.pdf"
    assert url_publica("assets/Coletânea CIAs/110.pdf") == (
        "https://plpcg.com/assets/Colet%C3%A2nea%20CIAs/110.pdf"
    )


def test_arquivo_local_prefere_a_arvore_depois_o_cache(tmp_path):
    raiz = tmp_path / "assets"
    cache = tmp_path / "baixados"
    (raiz / "ColAdultos").mkdir(parents=True)
    (raiz / "ColAdultos" / "001.pdf").write_bytes(b"a")
    (cache / "PES").mkdir(parents=True)
    (cache / "PES" / "x.pdf").write_bytes(b"b")

    assert arquivo_local("ColAdultos/001.pdf", str(raiz), str(cache)) == str(raiz / "ColAdultos" / "001.pdf")
    assert arquivo_local("assets/PES/x.pdf", str(raiz), str(cache)) == str(cache / "PES" / "x.pdf")
    assert arquivo_local("assets/PES/nao-existe.pdf", str(raiz), str(cache)) is None


class _Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.close()


def test_baixar_grava_no_cache_pela_url_publica_e_nao_deixa_part(tmp_path):
    urls = []

    def abrir(url):
        urls.append(url)
        return _Resp(b"%PDF-fake")

    destino = baixar("assets/PES/Alto preço - CIFRA.pdf", cache=str(tmp_path), abrir=abrir)
    assert destino == str(tmp_path / "PES" / "Alto preço - CIFRA.pdf")
    with open(destino, "rb") as f:
        assert f.read() == b"%PDF-fake"
    assert urls == ["https://plpcg.com/assets/PES/Alto%20pre%C3%A7o%20-%20CIFRA.pdf"]
    assert not os.path.exists(destino + ".part")
