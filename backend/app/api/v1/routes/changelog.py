from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from typing import Optional
from app.core.dependencies import get_db, get_current_user_optional
from app.core.rate_limit_helpers import apply_rate_limit
from app.domain.models.user import User
from app.domain.schemas.changelog import ChangelogResponse, ChangelogVersionResponse
from app.application.services.changelog_service import ChangelogService

router = APIRouter()


@router.get("/", response_model=ChangelogResponse)
def get_changelog(
    request: Request,
    since_version: int = 0,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """Retorna mudanças desde a versão informada.

    Use since_version=0 para sync inicial (retorna tudo).
    """
    if current_user is None:
        apply_rate_limit(request, "200/minute")

    service = ChangelogService(db)
    return service.get_changes_since(since_version)


@router.get("/version", response_model=ChangelogVersionResponse)
def get_current_version(
    request: Request,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """Retorna apenas a versão atual do changelog (leve, para polling)."""
    if current_user is None:
        apply_rate_limit(request, "600/minute")

    service = ChangelogService(db)
    return {"current_version": service.get_current_version()}
