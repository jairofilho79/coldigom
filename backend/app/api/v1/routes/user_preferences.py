from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.core.dependencies import get_db, get_current_user
from app.domain.models.user import User
from app.domain.schemas.user_preference import (
    UserMaterialKindPreferenceResponse,
    MaterialKindOrderUpdate
)
from app.application.services.user_preference_service import UserPreferenceService

router = APIRouter()


@router.put("/material-kinds/order", response_model=List[UserMaterialKindPreferenceResponse])
def update_material_kind_order(
    order_data: MaterialKindOrderUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Atualiza ordem de preferência de material kinds do usuário (máximo 5)"""
    service = UserPreferenceService(db)
    preferences = service.update_material_kind_order(current_user.id, order_data)
    return preferences


@router.get("/material-kinds", response_model=List[UserMaterialKindPreferenceResponse])
def get_user_material_kind_preferences(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retorna preferências de material kinds do usuário atual"""
    service = UserPreferenceService(db)
    preferences = service.get_user_preferences(current_user.id)
    return preferences


@router.delete("/material-kinds", status_code=status.HTTP_204_NO_CONTENT)
def delete_user_material_kind_preferences(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Remove todas as preferências de material kinds do usuário"""
    service = UserPreferenceService(db)
    service.delete_user_preferences(current_user.id)
    return None
