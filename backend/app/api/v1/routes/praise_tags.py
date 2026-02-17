from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import UUID
from app.core.dependencies import get_db, get_current_user, get_current_user_optional
from app.core.rate_limit_helpers import apply_rate_limit
from app.domain.models.user import User
from app.domain.schemas.praise_tag import PraiseTagCreate, PraiseTagUpdate, PraiseTagResponse
from app.application.services.praise_tag_service import PraiseTagService

router = APIRouter()


@router.get("/", response_model=List[PraiseTagResponse])
def list_praise_tags(
    request: Request,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """Lista todas as tags de praise.
    
    Rota pública: pode ser acessada sem autenticação, mas com rate limiting.
    Usuários autenticados têm acesso ilimitado.
    """
    # Aplicar rate limiting apenas se não estiver autenticado
    if current_user is None:
        apply_rate_limit(request, "100/hour")
    
    service = PraiseTagService(db)
    tags = service.get_all(skip=skip, limit=limit)
    return tags


@router.get("/{tag_id}", response_model=PraiseTagResponse)
def get_praise_tag(
    request: Request,
    tag_id: UUID,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """Obtém uma tag de praise por ID.
    
    Rota pública: pode ser acessada sem autenticação, mas com rate limiting.
    Usuários autenticados têm acesso ilimitado.
    """
    # Aplicar rate limiting apenas se não estiver autenticado
    if current_user is None:
        apply_rate_limit(request, "200/hour")
    
    service = PraiseTagService(db)
    tag = service.get_by_id(tag_id)
    return tag


@router.post("/", response_model=PraiseTagResponse, status_code=status.HTTP_201_CREATED)
def create_praise_tag(
    tag_data: PraiseTagCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Cria uma nova tag de praise"""
    service = PraiseTagService(db)
    tag = service.create(tag_data)
    return tag


@router.put("/{tag_id}", response_model=PraiseTagResponse)
def update_praise_tag(
    tag_id: UUID,
    tag_data: PraiseTagUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Atualiza uma tag de praise"""
    service = PraiseTagService(db)
    tag = service.update(tag_id, tag_data)
    return tag


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_praise_tag(
    tag_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Deleta uma tag de praise"""
    service = PraiseTagService(db)
    service.delete(tag_id)
    return None






