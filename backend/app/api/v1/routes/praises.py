from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import UUID
from app.core.dependencies import get_db, get_current_user
from app.domain.models.user import User
from app.domain.schemas.praise import PraiseCreate, PraiseUpdate, PraiseResponse
from app.application.services.praise_service import PraiseService

router = APIRouter()


@router.get("/", response_model=List[PraiseResponse])
def list_praises(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    name: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lista todos os praises com paginação e busca opcional"""
    service = PraiseService(db)
    praises = service.get_all(skip=skip, limit=limit, name=name)
    return praises


@router.get("/{praise_id}", response_model=PraiseResponse)
def get_praise(
    praise_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtém um praise por ID"""
    service = PraiseService(db)
    praise = service.get_by_id(praise_id)
    return praise


@router.post("/", response_model=PraiseResponse, status_code=status.HTTP_201_CREATED)
def create_praise(
    praise_data: PraiseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Cria um novo praise"""
    service = PraiseService(db)
    praise = service.create(praise_data)
    return praise


@router.put("/{praise_id}", response_model=PraiseResponse)
def update_praise(
    praise_id: UUID,
    praise_data: PraiseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Atualiza um praise"""
    service = PraiseService(db)
    praise = service.update(praise_id, praise_data)
    return praise


@router.delete("/{praise_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_praise(
    praise_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Deleta um praise"""
    service = PraiseService(db)
    service.delete(praise_id)
    return None






