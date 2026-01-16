from typing import List, Optional
from sqlalchemy.orm import Session
from app.domain.models.language import Language
from app.application.repositories import BaseRepository


class LanguageRepository(BaseRepository):
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, id: str) -> Optional[Language]:
        # For Language, id is the code (string)
        return self.get_by_code(id)

    def get_by_code(self, code: str) -> Optional[Language]:
        return self.db.query(Language).filter(Language.code == code).first()

    def get_all(self, skip: int = 0, limit: int = 100, active_only: bool = False) -> List[Language]:
        query = self.db.query(Language)
        if active_only:
            query = query.filter(Language.is_active == True)
        return query.offset(skip).limit(limit).all()

    def create(self, language: Language) -> Language:
        self.db.add(language)
        self.db.commit()
        self.db.refresh(language)
        return language

    def update(self, language: Language) -> Language:
        self.db.commit()
        self.db.refresh(language)
        return language

    def delete(self, id: str) -> bool:
        language = self.get_by_code(id)
        if language:
            self.db.delete(language)
            self.db.commit()
            return True
        return False
