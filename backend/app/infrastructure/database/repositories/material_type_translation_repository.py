from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session
from app.domain.models.material_type_translation import MaterialTypeTranslation


class MaterialTypeTranslationRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, id: UUID) -> Optional[MaterialTypeTranslation]:
        return self.db.query(MaterialTypeTranslation).filter(MaterialTypeTranslation.id == id).first()

    def get_by_entity_and_language(self, material_type_id: UUID, language_code: str) -> Optional[MaterialTypeTranslation]:
        return self.db.query(MaterialTypeTranslation).filter(
            MaterialTypeTranslation.material_type_id == material_type_id,
            MaterialTypeTranslation.language_code == language_code
        ).first()

    def get_by_entity(self, material_type_id: UUID) -> List[MaterialTypeTranslation]:
        return self.db.query(MaterialTypeTranslation).filter(
            MaterialTypeTranslation.material_type_id == material_type_id
        ).all()

    def get_by_language(self, language_code: str) -> List[MaterialTypeTranslation]:
        return self.db.query(MaterialTypeTranslation).filter(
            MaterialTypeTranslation.language_code == language_code
        ).all()

    def create(self, translation: MaterialTypeTranslation) -> MaterialTypeTranslation:
        self.db.add(translation)
        self.db.commit()
        self.db.refresh(translation)
        return translation

    def update(self, translation: MaterialTypeTranslation) -> MaterialTypeTranslation:
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
