from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
from app.core.dependencies import get_db, get_current_user
from app.domain.models.user import User
from app.domain.schemas.praise_tag import PraiseTagCreate, PraiseTagUpdate, PraiseTagResponse
from app.application.services.praise_tag_service import PraiseTagService

router = APIRouter()


@router.get("/", response_model=List[PraiseTagResponse])
def list_praise_tags(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lista todas as tags de praise"""
    service = PraiseTagService(db)
    tags = service.get_all(skip=skip, limit=limit)
    return tags


@router.get("/{tag_id}", response_model=PraiseTagResponse)
def get_praise_tag(
    tag_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtém uma tag de praise por ID"""
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






