"""Normalização de termos de busca: remoção de acentos e stop words (PT-BR)."""
import unicodedata
from typing import Optional

# Stop words em português (minúsculas, sem acento para comparação)
_STOP_WORDS = frozenset({
    "a", "o", "e", "de", "da", "do", "em", "um", "uma", "os", "as",
    "dos", "das", "no", "na", "nos", "nas", "por", "para", "com", "sem",
    "ao", "aos", "que", "se", "su", "sua", "sao", "mais", "mas",
    "ele", "ela", "esta", "eu", "isso", "entre", "era", "depois",
    "mesmo", "ter", "seus", "quem", "ja", "estao",
    "voce", "tinha", "eles", "essa", "esse", "num", "nem", "suas",
    "meu", "minha", "teu", "tua", "nosso", "vosso", "dela", "dele",
    "tu", "ti", "lhe", "lhes", "te", "vos", "nos", "voces",
})


def _remove_accents(text: str) -> str:
    """Remove acentos usando NFD e filtrando caracteres de combinação (Mn)."""
    nfd = unicodedata.normalize("NFD", text)
    return "".join(c for c in nfd if unicodedata.category(c) != "Mn")


def normalize_search_query(text: Optional[str]) -> Optional[str]:
    """
    Normaliza um termo de busca para uso em queries:
    - Remove acentos (glória -> gloria)
    - Aplica lower e strip
    - Remove stop words em português
    - Retorna None ou string vazia quando não sobra termo relevante.
    """
    if not text or not isinstance(text, str):
        return None
    raw = text.strip()
    if not raw:
        return None
    lower = raw.lower()
    unaccented = _remove_accents(lower)
    words = unaccented.split()
    # Remover stop words (já sem acento)
    kept = [w for w in words if w and w not in _STOP_WORDS]
    result = " ".join(kept).strip()
    return result if result else None
