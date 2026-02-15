from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.dependencies import get_db, get_current_user
from app.domain.models.user import User
from app.domain.schemas.language import LanguageCreate, LanguageUpdate, LanguageResponse
from app.application.services.language_service import LanguageService

router = APIRouter()


@router.get("/", response_model=List[LanguageResponse])
def list_languages(
    skip: int = 0,
    limit: int = 100,
    active_only: bool = False,
    db: Session = Depends(get_db),
):
    """Lista todas as linguagens disponíveis (público - dados não sensíveis)"""
    service = LanguageService(db)
    languages = service.get_all(skip=skip, limit=limit, active_only=active_only)
    return languages


@router.get("/{code}", response_model=LanguageResponse)
def get_language(
    code: str,
    db: Session = Depends(get_db),
):
    """Obtém uma linguagem por código (público - dados não sensíveis)"""
    service = LanguageService(db)
    language = service.get_by_code(code)
    return language


@router.post("/", response_model=LanguageResponse, status_code=status.HTTP_201_CREATED)
def create_language(
    language_data: LanguageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Cria uma nova linguagem"""
    service = LanguageService(db)
    language = service.create(language_data)
    return language


@router.put("/{code}", response_model=LanguageResponse)
def update_language(
    code: str,
    language_data: LanguageUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Atualiza uma linguagem"""
    service = LanguageService(db)
    language = service.update(code, language_data)
    return language


@router.delete("/{code}", status_code=status.HTTP_204_NO_CONTENT)
def delete_language(
    code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Deleta uma linguagem"""
    service = LanguageService(db)
    service.delete(code)
    return None
