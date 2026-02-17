from fastapi import APIRouter, Depends, HTTPException, status, Request, Body
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from slowapi.util import get_remote_address
from uuid import UUID
from datetime import timedelta
from app.core.dependencies import get_db, get_current_user
from app.domain.models.user import User
from app.domain.schemas.user import UserCreate, UserResponse, Token, RefreshTokenRequest
from app.application.services.user_service import UserService
from app.core.security import decode_access_token, create_access_token
from app.core.config import settings
from app.infrastructure.database.repositories.user_repository import UserRepository

router = APIRouter()


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    """Registra um novo usuário"""
    service = UserService(db)
    user = service.create(user_data)
    return user


@router.post("/login", response_model=Token)
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """Autentica um usuário e retorna token JWT"""
    from app.domain.schemas.user import UserLogin
    
    # Rate limiting usando limiter do app.state
    limiter = request.app.state.limiter
    limiter.limit("5/minute")(request)
    
    login_data = UserLogin(username=form_data.username, password=form_data.password)
    service = UserService(db)
    token_data = service.authenticate(login_data)
    return token_data


@router.post("/refresh", response_model=Token)
def refresh_token(
    request: Request,
    refresh_token_data: RefreshTokenRequest = Body(...),
    db: Session = Depends(get_db)
):
    """Renova access token usando refresh token"""
    # Rate limiting usando limiter do app.state
    limiter = request.app.state.limiter
    limiter.limit("10/minute")(request)
    payload = decode_access_token(refresh_token_data.refresh_token)
    
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )
    
    user_id_str = payload.get("sub")
    if not user_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )
    
    try:
        user_id = UUID(user_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )
    
    user_repo = UserRepository(db)
    user = user_repo.get_by_id(user_id)
    
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive"
        )
    
    access_token_expires = timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token_data.refresh_token,
        "token_type": "bearer"
    }


@router.get("/me", response_model=UserResponse)
def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Retorna o usuário atual autenticado"""
    return UserResponse.model_validate(current_user)

