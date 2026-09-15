from __future__ import annotations

import base64
import os
import urllib.parse
import urllib.request

from core.paths import PLPCG_BAIXADOS, PLPCG_URL, PLPCJF_ASSETS


# --- caminho e arquivo -------------------------------------------------------

def decodificar(pdf_id: str) -> str:
    """pdf_id é o caminho do PDF em base64 urlsafe, sem o '=' do padding."""
    return base64.urlsafe_b64decode(pdf_id + "=" * (-len(pdf_id) % 4)).decode("utf-8")


def codificar(caminho: str) -> str:
    return base64.urlsafe_b64encode(caminho.encode("utf-8")).decode("ascii").rstrip("=")


def caminho_relativo(caminho: str) -> str:
    """Caminho abaixo de assets/.

    Os pdf_id antigos são 'ColAdultos/001.pdf'; os recentes já vêm com o
    prefixo ('assets/PES/Alto preço - CIFRA.pdf'). Os dois moram debaixo do
    mesmo assets/ — no disco em plpcjf/assets, no site em plpcg.com/assets.
    """
    return caminho[len("assets/"):] if caminho.startswith("assets/") else caminho


def url_publica(caminho: str) -> str:
    return PLPCG_URL + "assets/" + urllib.parse.quote(caminho_relativo(caminho))


def arquivo_local(
    caminho: str, raiz: str = PLPCJF_ASSETS, cache: str = PLPCG_BAIXADOS
) -> str | None:
    """O PDF no disco: primeiro a árvore do plpcjf, depois o que já foi baixado."""
    for base in (raiz, cache):
        p = os.path.join(base, caminho_relativo(caminho))
        if os.path.isfile(p):
            return p
    return None


def baixar(caminho: str, cache: str = PLPCG_BAIXADOS, abrir=urllib.request.urlopen) -> str:
    """Baixa de plpcg.com para o cache.

    Escreve em .part e renomeia no fim: um download interrompido não pode
    passar por arquivo pronto, senão vira um hash errado no cache.
    """
    destino = os.path.join(cache, caminho_relativo(caminho))
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    with abrir(url_publica(caminho)) as resp, open(destino + ".part", "wb") as f:
        while True:
            b = resp.read(1 << 20)
            if not b:
                break
            f.write(b)
    os.replace(destino + ".part", destino)
    return destino
