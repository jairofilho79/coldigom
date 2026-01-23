from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Dict, Optional
from uuid import UUID
from datetime import datetime, date
from app.core.dependencies import get_db, get_current_user
from app.domain.models.user import User
from app.domain.schemas.praise_list import (
    PraiseListCreate,
    PraiseListUpdate,
    PraiseListResponse,
    PraiseListDetailResponse,
    ReorderPraisesRequest
)
from app.application.services.praise_list_service import PraiseListService

router = APIRouter()


@router.get("/", response_model=List[PraiseListResponse])
def list_praise_lists(
    name: Optional[str] = Query(None, description="Filtrar por nome da lista"),
    date_from: Optional[date] = Query(None, description="Data inicial (formato: YYYY-MM-DD)"),
    date_to: Optional[date] = Query(None, description="Data final (formato: YYYY-MM-DD)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lista minhas listas e listas seguidas com filtros opcionais"""
    service = PraiseListService(db)
    
    # Convert date to datetime for filtering (start of day for date_from, end of day for date_to)
    date_from_dt = None
    date_to_dt = None
    if date_from:
        date_from_dt = datetime.combine(date_from, datetime.min.time())
    if date_to:
        date_to_dt = datetime.combine(date_to, datetime.max.time())
    
    if name or date_from_dt or date_to_dt:
        my_lists = service.get_my_lists_filtered(current_user.id, name, date_from_dt, date_to_dt)
        followed_lists = service.get_followed_lists_filtered(current_user.id, name, date_from_dt, date_to_dt)
    else:
        my_lists = service.get_my_lists(current_user.id)
        followed_lists = service.get_followed_lists(current_user.id)
    
    # Combine and format
    all_lists = []
    for list in my_lists:
        all_lists.append({
            "id": list.id,
            "name": list.name,
            "description": list.description,
            "is_public": list.is_public,
            "user_id": list.user_id,
            "owner": list.user.username if list.user else None,
            "praises_count": len(list.praises) if list.praises else 0,
            "created_at": list.created_at,
            "updated_at": list.updated_at
        })
    
    for list in followed_lists:
        all_lists.append({
            "id": list.id,
            "name": list.name,
            "description": list.description,
            "is_public": list.is_public,
            "user_id": list.user_id,
            "owner": list.user.username if list.user else None,
            "praises_count": len(list.praises) if list.praises else 0,
            "created_at": list.created_at,
            "updated_at": list.updated_at
        })
    
    return all_lists


@router.get("/public", response_model=List[PraiseListResponse])
def list_public_praise_lists(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lista listas públicas"""
    service = PraiseListService(db)
    lists = service.get_public_lists(skip=skip, limit=limit)
    
    return [
        {
            "id": list.id,
            "name": list.name,
            "description": list.description,
            "is_public": list.is_public,
            "user_id": list.user_id,
            "owner": list.user.username if list.user else None,
            "praises_count": len(list.praises) if list.praises else 0,
            "created_at": list.created_at,
            "updated_at": list.updated_at
        }
        for list in lists
    ]


@router.get("/{list_id}", response_model=PraiseListDetailResponse)
def get_praise_list(
    list_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtém detalhes de uma lista"""
    service = PraiseListService(db)
    detail = service.get_list_detail(list_id, current_user.id)
    return detail


@router.post("/", response_model=PraiseListResponse, status_code=status.HTTP_201_CREATED)
def create_praise_list(
    list_data: PraiseListCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Cria uma nova lista"""
    service = PraiseListService(db)
    list = service.create(current_user.id, list_data)
    return {
        "id": list.id,
        "name": list.name,
        "description": list.description,
        "is_public": list.is_public,
        "user_id": list.user_id,
        "owner": list.user.username if list.user else None,
        "praises_count": 0,
        "created_at": list.created_at,
        "updated_at": list.updated_at
    }


@router.put("/{list_id}", response_model=PraiseListResponse)
def update_praise_list(
    list_id: UUID,
    list_data: PraiseListUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Atualiza uma lista"""
    service = PraiseListService(db)
    list = service.update(list_id, current_user.id, list_data)
    return {
        "id": list.id,
        "name": list.name,
        "description": list.description,
        "is_public": list.is_public,
        "user_id": list.user_id,
        "owner": list.user.username if list.user else None,
        "praises_count": len(list.praises) if list.praises else 0,
        "created_at": list.created_at,
        "updated_at": list.updated_at
    }


@router.delete("/{list_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_praise_list(
    list_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Deleta uma lista"""
    service = PraiseListService(db)
    service.delete(list_id, current_user.id)
    return None


@router.post("/{list_id}/praises/{praise_id}", status_code=status.HTTP_204_NO_CONTENT)
def add_praise_to_list(
    list_id: UUID,
    praise_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Adiciona um praise à lista"""
    service = PraiseListService(db)
    service.add_praise(list_id, praise_id, current_user.id)
    return None


@router.delete("/{list_id}/praises/{praise_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_praise_from_list(
    list_id: UUID,
    praise_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Remove um praise da lista"""
    service = PraiseListService(db)
    service.remove_praise(list_id, praise_id, current_user.id)
    return None


@router.put("/{list_id}/praises/reorder", status_code=status.HTTP_204_NO_CONTENT)
def reorder_praises_in_list(
    list_id: UUID,
    request: ReorderPraisesRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Reordena os praises na lista"""
    service = PraiseListService(db)
    service.reorder_praises(list_id, current_user.id, request.praise_orders)
    return None


@router.post("/{list_id}/follow", status_code=status.HTTP_204_NO_CONTENT)
def follow_praise_list(
    list_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Segue uma lista"""
    service = PraiseListService(db)
    service.follow_list(current_user.id, list_id)
    return None


@router.delete("/{list_id}/follow", status_code=status.HTTP_204_NO_CONTENT)
def unfollow_praise_list(
    list_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Deixa de seguir uma lista"""
    service = PraiseListService(db)
    service.unfollow_list(current_user.id, list_id)
    return None


@router.post("/{list_id}/copy", response_model=PraiseListResponse, status_code=status.HTTP_201_CREATED)
def copy_praise_list(
    list_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Copia uma lista"""
    service = PraiseListService(db)
    list = service.copy_list(current_user.id, list_id)
    return {
        "id": list.id,
        "name": list.name,
        "description": list.description,
        "is_public": list.is_public,
        "user_id": list.user_id,
        "owner": list.user.username if list.user else None,
        "praises_count": len(list.praises) if list.praises else 0,
        "created_at": list.created_at,
        "updated_at": list.updated_at
    }
