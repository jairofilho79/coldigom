from __future__ import annotations

import re
import unicodedata

_NAO_ALFANUM = re.compile(r"[^a-z0-9\s]")


def _base(s: str | None) -> str:
    """Minúsculas, sem acento, sem pontuação, espaço colapsado."""
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return " ".join(_NAO_ALFANUM.sub(" ", s.lower()).split())


def norm_nome(s: str | None) -> str:
    """Normaliza nome de louvor.

    O conteúdo dos parênteses É PRESERVADO. Descartá-lo fazia
    'Quão grande amor (Vigiai)' e 'Vigiai (Quão grande amor)' — que são o
    mesmo louvor — não se acharem.
    """
    return _base(s)


def norm_letra(s: str | None) -> str:
    """Normaliza letra para comparação. Quebra de linha vira espaço."""
    return _base(s)


def shingles(texto: str, k: int = 8) -> set[str]:
    """Janelas deslizantes de k palavras.

    Texto menor que a janela devolve conjunto vazio de propósito: é o que
    impede um louvor de título curto de casar com meio acervo.
    """
    palavras = texto.split()
    if len(palavras) < k:
        return set()
    return {" ".join(palavras[i:i + k]) for i in range(len(palavras) - k + 1)}
