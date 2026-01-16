from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session
from app.domain.models.praise_tag_translation import PraiseTagTranslation


class PraiseTagTranslationRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, id: UUID) -> Optional[PraiseTagTranslation]:
        return self.db.query(PraiseTagTranslation).filter(PraiseTagTranslation.id == id).first()

    def get_by_entity_and_language(self, praise_tag_id: UUID, language_code: str) -> Optional[PraiseTagTranslation]:
        return self.db.query(PraiseTagTranslation).filter(
            PraiseTagTranslation.praise_tag_id == praise_tag_id,
            PraiseTagTranslation.language_code == language_code
        ).first()

    def get_by_entity(self, praise_tag_id: UUID) -> List[PraiseTagTranslation]:
        return self.db.query(PraiseTagTranslation).filter(
            PraiseTagTranslation.praise_tag_id == praise_tag_id
        ).all()

    def get_by_language(self, language_code: str) -> List[PraiseTagTranslation]:
        return self.db.query(PraiseTagTranslation).filter(
            PraiseTagTranslation.language_code == language_code
        ).all()

    def create(self, translation: PraiseTagTranslation) -> PraiseTagTranslation:
        self.db.add(translation)
        self.db.commit()
        self.db.refresh(translation)
        return translation

    def update(self, translation: PraiseTagTranslation) -> PraiseTagTranslation:
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
