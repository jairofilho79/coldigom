from typing import Generator, Optional
from uuid import UUID
from sqlalchemy.orm import Session
from app.infrastructure.database.database import SessionLocal
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from app.core.security import decode_access_token
from app.domain.models.user import User
from app.infrastructure.database.repositories.user_repository import UserRepository
from app.infrastructure.storage.storage_factory import get_storage_client
from app.infrastructure.storage.storage_client import StorageClient

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


def get_db() -> Generator:
    """Dependência para obter sessão do banco de dados"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    """Obtém o usuário atual através do token JWT"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception

    user_id_str: str = payload.get("sub")
    if user_id_str is None:
        raise credentials_exception

    try:
        user_id = UUID(user_id_str)
    except ValueError:
        raise credentials_exception

    user_repo = UserRepository(db)
    user = user_repo.get_by_id(user_id)
    if user is None:
        raise credentials_exception

    return user


async def get_current_user_optional(
    token: Optional[str] = Depends(oauth2_scheme_optional),
    db: Session = Depends(get_db)
) -> Optional[User]:
    """Obtém o usuário atual se o token for fornecido, caso contrário retorna None.
    
    Útil para rotas públicas que podem funcionar com ou sem autenticação.
    """
    if token is None:
        return None
    
    try:
        payload = decode_access_token(token)
        if payload is None:
            return None

        user_id_str: str = payload.get("sub")
        if user_id_str is None:
            return None

        user_id = UUID(user_id_str)
        user_repo = UserRepository(db)
        user = user_repo.get_by_id(user_id)
        return user
    except Exception:
        # Em caso de qualquer erro, retorna None (rota pública)
        return None


def get_storage() -> Generator[StorageClient, None, None]:
    """Dependência para obter cliente de storage (Wasabi ou Local)"""
    client = get_storage_client()
    yield client


def get_language_code(accept_language: str = None) -> str:
    """Extrai o código da linguagem do header Accept-Language"""
    if not accept_language:
        return "pt-BR"  # Default fallback
    
    # Accept-Language format: "pt-BR,pt;q=0.9,en-US;q=0.8"
    # Extract first language
    first_lang = accept_language.split(',')[0].strip()
    # Remove quality values if present
    lang_code = first_lang.split(';')[0].strip()
    return lang_code

