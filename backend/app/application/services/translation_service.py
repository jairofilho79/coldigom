from typing import List, Optional, Dict, Any
from uuid import UUID
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.domain.models.material_kind_translation import MaterialKindTranslation
from app.domain.models.praise_tag_translation import PraiseTagTranslation
from app.domain.models.material_type_translation import MaterialTypeTranslation
from app.domain.schemas.translation import (
    MaterialKindTranslationCreate,
    MaterialKindTranslationUpdate,
    PraiseTagTranslationCreate,
    PraiseTagTranslationUpdate,
    MaterialTypeTranslationCreate,
    MaterialTypeTranslationUpdate,
)
from app.infrastructure.database.repositories.material_kind_translation_repository import MaterialKindTranslationRepository
from app.infrastructure.database.repositories.praise_tag_translation_repository import PraiseTagTranslationRepository
from app.infrastructure.database.repositories.material_type_translation_repository import MaterialTypeTranslationRepository


class TranslationService:
    def __init__(self, db: Session):
        self.db = db
        self.material_kind_repo = MaterialKindTranslationRepository(db)
        self.praise_tag_repo = PraiseTagTranslationRepository(db)
        self.material_type_repo = MaterialTypeTranslationRepository(db)

    # MaterialKind Translation Methods
    def create_material_kind_translation(self, translation_data: MaterialKindTranslationCreate) -> MaterialKindTranslation:
        # Check if translation already exists
        existing = self.material_kind_repo.get_by_entity_and_language(
            translation_data.material_kind_id,
            translation_data.language_code
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Translation for material_kind_id '{translation_data.material_kind_id}' and language '{translation_data.language_code}' already exists"
            )
        
        translation = MaterialKindTranslation(
            material_kind_id=translation_data.material_kind_id,
            language_code=translation_data.language_code,
            translated_name=translation_data.translated_name
        )
        return self.material_kind_repo.create(translation)

    def update_material_kind_translation(self, translation_id: UUID, translation_data: MaterialKindTranslationUpdate) -> MaterialKindTranslation:
        translation = self.material_kind_repo.get_by_id(translation_id)
        if not translation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"MaterialKind translation with id '{translation_id}' not found"
            )
        
        if translation_data.translated_name is not None:
            translation.translated_name = translation_data.translated_name
        
        return self.material_kind_repo.update(translation)

    def get_material_kind_translation(self, translation_id: UUID) -> MaterialKindTranslation:
        translation = self.material_kind_repo.get_by_id(translation_id)
        if not translation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"MaterialKind translation with id '{translation_id}' not found"
            )
        return translation

    def get_material_kind_translations_by_entity(self, material_kind_id: UUID) -> List[MaterialKindTranslation]:
        return self.material_kind_repo.get_by_entity(material_kind_id)

    def get_material_kind_translations_by_language(self, language_code: str) -> List[MaterialKindTranslation]:
        return self.material_kind_repo.get_by_language(language_code)

    def delete_material_kind_translation(self, translation_id: UUID) -> bool:
        translation = self.get_material_kind_translation(translation_id)
        return self.material_kind_repo.delete(translation_id)

    # PraiseTag Translation Methods
    def create_praise_tag_translation(self, translation_data: PraiseTagTranslationCreate) -> PraiseTagTranslation:
        existing = self.praise_tag_repo.get_by_entity_and_language(
            translation_data.praise_tag_id,
            translation_data.language_code
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Translation for praise_tag_id '{translation_data.praise_tag_id}' and language '{translation_data.language_code}' already exists"
            )
        
        translation = PraiseTagTranslation(
            praise_tag_id=translation_data.praise_tag_id,
            language_code=translation_data.language_code,
            translated_name=translation_data.translated_name
        )
        return self.praise_tag_repo.create(translation)

    def update_praise_tag_translation(self, translation_id: UUID, translation_data: PraiseTagTranslationUpdate) -> PraiseTagTranslation:
        translation = self.praise_tag_repo.get_by_id(translation_id)
        if not translation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"PraiseTag translation with id '{translation_id}' not found"
            )
        
        if translation_data.translated_name is not None:
            translation.translated_name = translation_data.translated_name
        
        return self.praise_tag_repo.update(translation)

    def get_praise_tag_translation(self, translation_id: UUID) -> PraiseTagTranslation:
        translation = self.praise_tag_repo.get_by_id(translation_id)
        if not translation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"PraiseTag translation with id '{translation_id}' not found"
            )
        return translation

    def get_praise_tag_translations_by_entity(self, praise_tag_id: UUID) -> List[PraiseTagTranslation]:
        return self.praise_tag_repo.get_by_entity(praise_tag_id)

    def get_praise_tag_translations_by_language(self, language_code: str) -> List[PraiseTagTranslation]:
        return self.praise_tag_repo.get_by_language(language_code)

    def delete_praise_tag_translation(self, translation_id: UUID) -> bool:
        translation = self.get_praise_tag_translation(translation_id)
        return self.praise_tag_repo.delete(translation_id)

    # MaterialType Translation Methods
    def create_material_type_translation(self, translation_data: MaterialTypeTranslationCreate) -> MaterialTypeTranslation:
        existing = self.material_type_repo.get_by_entity_and_language(
            translation_data.material_type_id,
            translation_data.language_code
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Translation for material_type_id '{translation_data.material_type_id}' and language '{translation_data.language_code}' already exists"
            )
        
        translation = MaterialTypeTranslation(
            material_type_id=translation_data.material_type_id,
            language_code=translation_data.language_code,
            translated_name=translation_data.translated_name
        )
        return self.material_type_repo.create(translation)

    def update_material_type_translation(self, translation_id: UUID, translation_data: MaterialTypeTranslationUpdate) -> MaterialTypeTranslation:
        translation = self.material_type_repo.get_by_id(translation_id)
        if not translation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"MaterialType translation with id '{translation_id}' not found"
            )
        
        if translation_data.translated_name is not None:
            translation.translated_name = translation_data.translated_name
        
        return self.material_type_repo.update(translation)

    def get_material_type_translation(self, translation_id: UUID) -> MaterialTypeTranslation:
        translation = self.material_type_repo.get_by_id(translation_id)
        if not translation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"MaterialType translation with id '{translation_id}' not found"
            )
        return translation

    def get_material_type_translations_by_entity(self, material_type_id: UUID) -> List[MaterialTypeTranslation]:
        return self.material_type_repo.get_by_entity(material_type_id)

    def get_material_type_translations_by_language(self, language_code: str) -> List[MaterialTypeTranslation]:
        return self.material_type_repo.get_by_language(language_code)

    def delete_material_type_translation(self, translation_id: UUID) -> bool:
        translation = self.get_material_type_translation(translation_id)
        return self.material_type_repo.delete(translation_id)
