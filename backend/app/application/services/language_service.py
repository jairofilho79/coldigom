from typing import List, Optional
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.domain.models.language import Language
from app.domain.schemas.language import LanguageCreate, LanguageUpdate
from app.infrastructure.database.repositories.language_repository import LanguageRepository


class LanguageService:
    def __init__(self, db: Session):
        self.repository = LanguageRepository(db)

    def get_by_code(self, code: str) -> Language:
        language = self.repository.get_by_code(code)
        if not language:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Language with code '{code}' not found"
            )
        return language

    def get_all(self, skip: int = 0, limit: int = 100, active_only: bool = False) -> List[Language]:
        return self.repository.get_all(skip=skip, limit=limit, active_only=active_only)

    def create(self, language_data: LanguageCreate) -> Language:
        existing_language = self.repository.get_by_code(language_data.code)
        if existing_language:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Language with code '{language_data.code}' already exists"
            )
        
        language = Language(
            code=language_data.code,
            name=language_data.name,
            is_active=language_data.is_active
        )
        return self.repository.create(language)

    def update(self, code: str, language_data: LanguageUpdate) -> Language:
        language = self.get_by_code(code)
        
        if language_data.name is not None:
            language.name = language_data.name
        
        if language_data.is_active is not None:
            language.is_active = language_data.is_active
        
        return self.repository.update(language)

    def delete(self, code: str) -> bool:
        language = self.get_by_code(code)
        return self.repository.delete(code)
