from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session
from app.domain.models.material_kind_translation import MaterialKindTranslation


class MaterialKindTranslationRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, id: UUID) -> Optional[MaterialKindTranslation]:
        return self.db.query(MaterialKindTranslation).filter(MaterialKindTranslation.id == id).first()

    def get_by_entity_and_language(self, material_kind_id: UUID, language_code: str) -> Optional[MaterialKindTranslation]:
        return self.db.query(MaterialKindTranslation).filter(
            MaterialKindTranslation.material_kind_id == material_kind_id,
            MaterialKindTranslation.language_code == language_code
        ).first()

    def get_by_entity(self, material_kind_id: UUID) -> List[MaterialKindTranslation]:
        return self.db.query(MaterialKindTranslation).filter(
            MaterialKindTranslation.material_kind_id == material_kind_id
        ).all()

    def get_by_language(self, language_code: str) -> List[MaterialKindTranslation]:
        return self.db.query(MaterialKindTranslation).filter(
            MaterialKindTranslation.language_code == language_code
        ).all()

    def create(self, translation: MaterialKindTranslation) -> MaterialKindTranslation:
        self.db.add(translation)
        self.db.commit()
        self.db.refresh(translation)
        return translation

    def update(self, translation: MaterialKindTranslation) -> MaterialKindTranslation:
        self.db.commit()
        self.db.refresh(translation)
        return translation

    def delete(self, id: UUID) -> bool:
        translation = self.get_by_id(id)
        if translation:
            self.db.delete(translation)
            self.db.commit()
            return True
        return False
