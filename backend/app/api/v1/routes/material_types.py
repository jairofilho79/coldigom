from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
from app.core.dependencies import get_db, get_current_user
from app.domain.models.user import User
from app.domain.schemas.material_type import MaterialTypeCreate, MaterialTypeUpdate, MaterialTypeResponse
from app.application.services.material_type_service import MaterialTypeService

router = APIRouter()


@router.get("/", response_model=List[MaterialTypeResponse])
def list_material_types(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lista todos os tipos de material"""
    service = MaterialTypeService(db)
    types = service.get_all(skip=skip, limit=limit)
    return types


@router.get("/{type_id}", response_model=MaterialTypeResponse)
def get_material_type(
    type_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtém um tipo de material por ID"""
    service = MaterialTypeService(db)
    material_type = service.get_by_id(type_id)
    return material_type


@router.post("/", response_model=MaterialTypeResponse, status_code=status.HTTP_201_CREATED)
def create_material_type(
    type_data: MaterialTypeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Cria um novo tipo de material"""
    service = MaterialTypeService(db)
    material_type = service.create(type_data)
    return material_type


@router.put("/{type_id}", response_model=MaterialTypeResponse)
def update_material_type(
    type_id: UUID,
    type_data: MaterialTypeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Atualiza um tipo de material"""
    service = MaterialTypeService(db)
    material_type = service.update(type_id, type_data)
    return material_type


@router.delete("/{type_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_material_type(
    type_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Deleta um tipo de material"""
    service = MaterialTypeService(db)
    service.delete(type_id)
    return None
