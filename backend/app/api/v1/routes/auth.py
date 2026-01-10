from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.core.dependencies import get_db
from app.domain.schemas.user import UserCreate, UserResponse, Token
from app.application.services.user_service import UserService

router = APIRouter()


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    """Registra um novo usuário"""
    service = UserService(db)
    user = service.create(user_data)
    return user


@router.post("/login", response_model=Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """Autentica um usuário e retorna token JWT"""
    from app.domain.schemas.user import UserLogin
    
    login_data = UserLogin(username=form_data.username, password=form_data.password)
    service = UserService(db)
    token_data = service.authenticate(login_data)
    return token_data

