"""Utilitários para extração de video ID a partir de URLs ou strings do YouTube."""
import re
from typing import Optional

# Padrões comuns: watch?v=, youtu.be/, embed/
_YOUTUBE_ID_PATTERNS = re.compile(
    r"(?:youtube\.com/(?:watch\?v=|embed/)|youtu\.be/)([a-zA-Z0-9_-]{11})(?:[&\s?#]|$)"
)
# ID bruto: 11 caracteres alfanuméricos, hífen ou underscore (padrão do YouTube)
_RAW_ID_PATTERN = re.compile(r"^([a-zA-Z0-9_-]{11})$")


def extract_youtube_video_id(value: Optional[str]) -> Optional[str]:
    """
    Extrai o ID do vídeo YouTube a partir de uma URL ou string.

    Aceita:
    - https://www.youtube.com/watch?v=VIDEO_ID
    - https://youtube.com/embed/VIDEO_ID
    - https://youtu.be/VIDEO_ID
    - String de 11 caracteres (ID puro)

    Retorna o ID (11 caracteres) ou None se não for possível extrair.
    """
    if not value or not value.strip():
        return None
    s = value.strip()
    match = _YOUTUBE_ID_PATTERNS.search(s)
    if match:
        return match.group(1)
    if _RAW_ID_PATTERN.match(s):
        return s
    return None
