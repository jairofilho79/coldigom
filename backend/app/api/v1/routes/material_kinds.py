from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import UUID
from app.core.dependencies import get_db, get_current_user, get_current_user_optional
from app.core.rate_limit_helpers import apply_rate_limit
from app.domain.models.user import User
from app.domain.schemas.material_kind import MaterialKindCreate, MaterialKindUpdate, MaterialKindResponse
from app.application.services.material_kind_service import MaterialKindService

router = APIRouter()


@router.get("/", response_model=List[MaterialKindResponse])
def list_material_kinds(
    request: Request,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """Lista todos os tipos de material.
    
    Rota pública: pode ser acessada sem autenticação, mas com rate limiting.
    Usuários autenticados têm acesso ilimitado.
    """
    if current_user is None:
        apply_rate_limit(request, "20/minute")
    
    service = MaterialKindService(db)
    kinds = service.get_all(skip=skip, limit=limit)
    return kinds


@router.get("/{kind_id}", response_model=MaterialKindResponse)
def get_material_kind(
    request: Request,
    kind_id: UUID,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """Obtém um tipo de material por ID.
    
    Rota pública: pode ser acessada sem autenticação, mas com rate limiting.
    Usuários autenticados têm acesso ilimitado.
    """
    if current_user is None:
        apply_rate_limit(request, "40/minute")
    
    service = MaterialKindService(db)
    kind = service.get_by_id(kind_id)
    return kind


@router.post("/", response_model=MaterialKindResponse, status_code=status.HTTP_201_CREATED)
def create_material_kind(
    kind_data: MaterialKindCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Cria um novo tipo de material"""
    service = MaterialKindService(db)
    kind = service.create(kind_data)
    return kind


@router.put("/{kind_id}", response_model=MaterialKindResponse)
def update_material_kind(
    kind_id: UUID,
    kind_data: MaterialKindUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Atualiza um tipo de material"""
    service = MaterialKindService(db)
    kind = service.update(kind_id, kind_data)
    return kind


@router.delete("/{kind_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_material_kind(
    kind_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Deleta um tipo de material"""
    service = MaterialKindService(db)
    service.delete(kind_id)
    return None






