"""
Serviço de sincronização bidirecional: backend <-> metadata.yml

Escreve o arquivo metadata.yml sempre que praises ou materiais forem
criados/alterados/removidos via API, mantendo compatibilidade com o
script import_colDigOS.py.
"""

import logging
import os
from pathlib import Path
from typing import Optional
from uuid import UUID

import yaml

from app.core.config import settings
from app.domain.models.praise import Praise

logger = logging.getLogger(__name__)


def _infer_material_type(path: str, material_type_name: Optional[str] = None) -> str:
    """Infer type string for metadata from path extension or material_type."""
    ext = os.path.splitext(path)[1].lower()
    if ext == ".pdf":
        return "pdf"
    if ext in (".mp3", ".wav", ".m4a", ".wma", ".ogg", ".flac"):
        return "mp3"
    if ext in (".mid",):
        return "mid"
    if material_type_name:
        mt = material_type_name.lower()
        if mt == "pdf":
            return "pdf"
        if mt == "audio":
            return "mp3"
    return "pdf"


def sync_praise_to_metadata(praise: Praise) -> None:
    """
    Escreve ou atualiza o metadata.yml do praise.
    O praise deve ter materials e tags carregados (com material_kind e material_type).
    """
    try:
        base_path = Path(settings.STORAGE_LOCAL_PATH)
        if not base_path.exists():
            # Fallback para path dentro do container
            alt = Path("/storage/assets")
            if alt.exists():
                base_path = alt

        praise_folder = base_path / "praises" / str(praise.id)
        praise_folder.mkdir(parents=True, exist_ok=True)
        metadata_path = praise_folder / "metadata.yml"

        praise_lyrics = ""
        praise_materiais = []

        for material in praise.materials or []:
            material_kind_name = material.material_kind.name if material.material_kind else ""
            material_type_name = material.material_type.name if material.material_type else ""

            # Lyrics: material text com kind Lyrics -> praise_lyrics
            if (
                material_type_name.lower() == "text"
                and material_kind_name.lower() == "lyrics"
            ):
                praise_lyrics = (material.path or "").strip()
                continue

            # Demais materiais -> praise_materiais (apenas arquivos/pdf/audio)
            mat_type = _infer_material_type(material.path, material_type_name)
            praise_materiais.append(
                {
                    "praise_material_id": str(material.id),
                    "material_kind": str(material.material_kind_id),
                    "type": mat_type,
                    "file_path_legacy": "",
                }
            )

        metadata = {
            "praise_id": str(praise.id),
            "praise_name": praise.name or "",
            "praise_number": str(praise.number) if praise.number is not None else "",
            "praise_author": praise.author or "",
            "praise_rhythm": praise.rhythm or "",
            "praise_tonality": praise.tonality or "",
            "praise_category": praise.category or "",
            "praise_lyrics": praise_lyrics or "",
            "praise_tags": [str(t.id) for t in (praise.tags or [])],
            "praise_materiais": praise_materiais,
        }

        with open(metadata_path, "w", encoding="utf-8") as f:
            yaml.dump(
                metadata,
                f,
                default_flow_style=False,
                allow_unicode=True,
                sort_keys=False,
            )
        logger.info("metadata.yml atualizado: %s", metadata_path)
    except Exception as e:
        logger.exception("Erro ao sincronizar metadata.yml para praise %s: %s", praise.id, e)
        # Fail-safe: não propagar exceção para não quebrar a operação principal


def delete_metadata(praise_id: UUID) -> None:
    """Remove o metadata.yml quando o praise é deletado."""
    try:
        base_path = Path(settings.STORAGE_LOCAL_PATH)
        if not base_path.exists():
            alt = Path("/storage/assets")
            if alt.exists():
                base_path = alt
        metadata_path = base_path / "praises" / str(praise_id) / "metadata.yml"
        if metadata_path.exists():
            metadata_path.unlink()
            logger.info("metadata.yml removido: %s", metadata_path)
        else:
            logger.debug("metadata.yml não existia: %s", metadata_path)
    except Exception as e:
        logger.exception("Erro ao remover metadata.yml para praise %s: %s", praise_id, e)
