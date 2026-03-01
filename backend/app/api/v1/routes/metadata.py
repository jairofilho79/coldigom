"""Metadata manifest endpoint for cache revalidation (id + version per resource)."""
from typing import Optional

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, get_current_user_optional
from app.core.rate_limit_helpers import apply_rate_limit
from app.domain.models.user import User
from app.domain.schemas.metadata_manifest import (
    MetadataManifestResponse,
    MetadataManifestItem,
)
from app.infrastructure.database.repositories.praise_repository import PraiseRepository
from app.infrastructure.database.repositories.praise_tag_repository import PraiseTagRepository
from app.infrastructure.database.repositories.material_kind_repository import MaterialKindRepository

router = APIRouter()


@router.get("/manifest", response_model=MetadataManifestResponse)
def get_metadata_manifest(
    request: Request,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """Returns a lightweight manifest of all metadata (id + version) for cache revalidation.
    Public route with rate limiting for anonymous users.
    """
    if current_user is None:
        apply_rate_limit(request, "200/minute")

    praise_repo = PraiseRepository(db)
    tag_repo = PraiseTagRepository(db)
    kind_repo = MaterialKindRepository(db)

    praises = [
        MetadataManifestItem(id=str(uid), version=upd.isoformat() if upd else "")
        for uid, upd in praise_repo.get_all_ids_and_updated_at()
    ]

    tags = tag_repo.get_all(skip=0, limit=10000)
    praise_tags = [
        MetadataManifestItem(id=str(t.id), version=t.version) for t in tags
    ]

    kinds = kind_repo.get_all(skip=0, limit=10000)
    material_kinds = [
        MetadataManifestItem(id=str(k.id), version=k.version) for k in kinds
    ]

    return MetadataManifestResponse(
        praises=praises,
        praise_tags=praise_tags,
        material_kinds=material_kinds,
    )
