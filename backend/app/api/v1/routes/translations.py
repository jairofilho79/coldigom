from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import UUID
from app.core.dependencies import get_db, get_current_user
from app.domain.models.user import User
from app.domain.schemas.translation import (
    MaterialKindTranslationCreate,
    MaterialKindTranslationUpdate,
    MaterialKindTranslationResponse,
    PraiseTagTranslationCreate,
    PraiseTagTranslationUpdate,
    PraiseTagTranslationResponse,
    MaterialTypeTranslationCreate,
    MaterialTypeTranslationUpdate,
    MaterialTypeTranslationResponse,
)
from app.application.services.translation_service import TranslationService

router = APIRouter()


# MaterialKind Translation Routes
@router.post("/material-kinds", response_model=MaterialKindTranslationResponse, status_code=status.HTTP_201_CREATED)
def create_material_kind_translation(
    translation_data: MaterialKindTranslationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Cria uma nova tradução para MaterialKind"""
    service = TranslationService(db)
    return service.create_material_kind_translation(translation_data)


@router.get("/material-kinds/{translation_id}", response_model=MaterialKindTranslationResponse)
def get_material_kind_translation(
    translation_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtém uma tradução de MaterialKind por ID"""
    service = TranslationService(db)
    return service.get_material_kind_translation(translation_id)


@router.get("/material-kinds", response_model=List[MaterialKindTranslationResponse])
def list_material_kind_translations(
    material_kind_id: Optional[UUID] = Query(None, description="Filter by material_kind_id"),
    language_code: Optional[str] = Query(None, description="Filter by language_code"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lista traduções de MaterialKind com filtros opcionais"""
    service = TranslationService(db)
    if material_kind_id:
        return service.get_material_kind_translations_by_entity(material_kind_id)
    elif language_code:
        return service.get_material_kind_translations_by_language(language_code)
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either material_kind_id or language_code must be provided"
        )


@router.put("/material-kinds/{translation_id}", response_model=MaterialKindTranslationResponse)
def update_material_kind_translation(
    translation_id: UUID,
    translation_data: MaterialKindTranslationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Atualiza uma tradução de MaterialKind"""
    service = TranslationService(db)
    return service.update_material_kind_translation(translation_id, translation_data)


@router.delete("/material-kinds/{translation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_material_kind_translation(
    translation_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Deleta uma tradução de MaterialKind"""
    service = TranslationService(db)
    service.delete_material_kind_translation(translation_id)
    return None


# PraiseTag Translation Routes
@router.post("/praise-tags", response_model=PraiseTagTranslationResponse, status_code=status.HTTP_201_CREATED)
def create_praise_tag_translation(
    translation_data: PraiseTagTranslationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Cria uma nova tradução para PraiseTag"""
    service = TranslationService(db)
    return service.create_praise_tag_translation(translation_data)


@router.get("/praise-tags/{translation_id}", response_model=PraiseTagTranslationResponse)
def get_praise_tag_translation(
    translation_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtém uma tradução de PraiseTag por ID"""
    service = TranslationService(db)
    return service.get_praise_tag_translation(translation_id)


@router.get("/praise-tags", response_model=List[PraiseTagTranslationResponse])
def list_praise_tag_translations(
    praise_tag_id: Optional[UUID] = Query(None, description="Filter by praise_tag_id"),
    language_code: Optional[str] = Query(None, description="Filter by language_code"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lista traduções de PraiseTag com filtros opcionais"""
    service = TranslationService(db)
    if praise_tag_id:
        return service.get_praise_tag_translations_by_entity(praise_tag_id)
    elif language_code:
        return service.get_praise_tag_translations_by_language(language_code)
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either praise_tag_id or language_code must be provided"
        )


@router.put("/praise-tags/{translation_id}", response_model=PraiseTagTranslationResponse)
def update_praise_tag_translation(
    translation_id: UUID,
    translation_data: PraiseTagTranslationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Atualiza uma tradução de PraiseTag"""
    service = TranslationService(db)
    return service.update_praise_tag_translation(translation_id, translation_data)


@router.delete("/praise-tags/{translation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_praise_tag_translation(
    translation_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Deleta uma tradução de PraiseTag"""
    service = TranslationService(db)
    service.delete_praise_tag_translation(translation_id)
    return None


# MaterialType Translation Routes
@router.post("/material-types", response_model=MaterialTypeTranslationResponse, status_code=status.HTTP_201_CREATED)
def create_material_type_translation(
    translation_data: MaterialTypeTranslationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Cria uma nova tradução para MaterialType"""
    service = TranslationService(db)
    return service.create_material_type_translation(translation_data)


@router.get("/material-types/{translation_id}", response_model=MaterialTypeTranslationResponse)
def get_material_type_translation(
    translation_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtém uma tradução de MaterialType por ID"""
    service = TranslationService(db)
    return service.get_material_type_translation(translation_id)


@router.get("/material-types", response_model=List[MaterialTypeTranslationResponse])
def list_material_type_translations(
    material_type_id: Optional[UUID] = Query(None, description="Filter by material_type_id"),
    language_code: Optional[str] = Query(None, description="Filter by language_code"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lista traduções de MaterialType com filtros opcionais"""
    service = TranslationService(db)
    if material_type_id:
        return service.get_material_type_translations_by_entity(material_type_id)
    elif language_code:
        return service.get_material_type_translations_by_language(language_code)
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either material_type_id or language_code must be provided"
        )


@router.put("/material-types/{translation_id}", response_model=MaterialTypeTranslationResponse)
def update_material_type_translation(
    translation_id: UUID,
    translation_data: MaterialTypeTranslationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Atualiza uma tradução de MaterialType"""
    service = TranslationService(db)
    return service.update_material_type_translation(translation_id, translation_data)


@router.delete("/material-types/{translation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_material_type_translation(
    translation_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Deleta uma tradução de MaterialType"""
    service = TranslationService(db)
    service.delete_material_type_translation(translation_id)
    return None
