# Implementação de Correções de Segurança - Guia Detalhado

**Data:** 16 de Fevereiro de 2026  
**Objetivo:** Implementar correções de segurança identificadas na auditoria  
**Itens:** 2, 3, 5, 6 e 7

---

## Sumário

1. [Item 2 - Rate Limiting](#item-2---rate-limiting)
2. [Item 3 - Broken Authentication](#item-3---broken-authentication)
3. [Item 5 - Mass Assignment](#item-5---mass-assignment)
4. [Item 6 - CORS](#item-6---cors)
5. [Item 7 - Information Disclosure](#item-7---information-disclosure)

---

## Item 2 - Rate Limiting

### Objetivo
Implementar rate limiting para prevenir ataques de força bruta e DoS.

### Arquivos a Modificar

#### 1. `backend/requirements.txt`

**Mudança:** Adicionar dependência `slowapi`

```diff
fastapi==0.104.1
uvicorn[standard]==0.24.0
sqlalchemy==2.0.23
alembic==1.12.1
psycopg2-binary==2.9.9
pydantic==2.5.0
pydantic-settings==2.1.0
pydantic[email]==2.5.0
python-jose[cryptography]==3.3.0
bcrypt==4.0.1
python-multipart==0.0.6
boto3==1.29.7
python-dotenv==1.0.0
email-validator==2.1.0
PyYAML==6.0.1
+slowapi==0.1.9
```

#### 2. `backend/app/main.py`

**Mudança:** Configurar rate limiter global

```python
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from typing import Tuple
from pathlib import Path
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from app.core.config import settings
from app.api.v1.routes import auth, praise_tags, material_kinds, material_types, praise_materials, praises, languages, translations, snapshots
from app.infrastructure.database.database import engine, Base

# Configurar Rate Limiter
limiter = Limiter(key_func=get_remote_address)
app = FastAPI(
    title="Praise Manager API",
    description="API para gerenciamento de praises, materiais e tags",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ... resto do código existente ...
```

#### 3. `backend/app/api/v1/routes/auth.py`

**Mudança:** Adicionar rate limiting no endpoint de login

```python
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.core.dependencies import get_db, get_current_user
from app.domain.models.user import User
from app.domain.schemas.user import UserCreate, UserResponse, Token
from app.application.services.user_service import UserService

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    """Registra um novo usuário"""
    service = UserService(db)
    user = service.create(user_data)
    return user


@router.post("/login", response_model=Token)
@limiter.limit("5/minute")  # ← NOVO: Rate limiting de 5 tentativas por minuto por IP
def login(
    request: Request,  # ← NOVO: Adicionar Request para rate limiter
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """Autentica um usuário e retorna token JWT"""
    from app.domain.schemas.user import UserLogin
    
    login_data = UserLogin(username=form_data.username, password=form_data.password)
    service = UserService(db)
    token_data = service.authenticate(login_data)
    return token_data


@router.get("/me", response_model=UserResponse)
def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Retorna o usuário atual autenticado"""
    return UserResponse.model_validate(current_user)
```

#### 4. `backend/app/api/v1/routes/praises.py`

**Mudança:** Adicionar rate limiting em endpoints pesados

```python
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import UUID
import zipfile
import io
import os
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.core.dependencies import get_db, get_current_user, get_storage
from app.domain.models.user import User
from app.domain.schemas.praise import PraiseCreate, PraiseUpdate, PraiseResponse, ReviewActionRequest
from app.application.services.praise_service import PraiseService
from app.infrastructure.storage.storage_client import StorageClient
from app.infrastructure.database.repositories.material_type_repository import MaterialTypeRepository
from app.infrastructure.database.repositories.material_kind_repository import MaterialKindRepository

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

# ... código existente ...

@router.get("/download-by-material-kind")
@limiter.limit("10/hour")  # ← NOVO: Limitar downloads pesados a 10 por hora
def download_praises_by_material_kind(
    request: Request,  # ← NOVO: Adicionar Request
    material_kind_id: UUID = Query(...),
    tag_id: Optional[UUID] = Query(None),
    max_zip_size_mb: int = Query(100, ge=10, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    storage: StorageClient = Depends(get_storage)
):
    # ... código existente ...
    # Também reduzir limite de busca de 10000 para 1000
    praises = service.get_all(skip=0, limit=1000, tag_id=tag_id)  # ← MUDANÇA: de 10000 para 1000
    # ... resto do código ...

@router.get("/{praise_id}/download-zip")
@limiter.limit("20/hour")  # ← NOVO: Limitar downloads individuais
def download_praise_zip(
    request: Request,  # ← NOVO: Adicionar Request
    praise_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    storage: StorageClient = Depends(get_storage)
):
    # ... código existente ...

@router.get("/", response_model=List[PraiseResponse])
def list_praises(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),  # ← MUDANÇA: Reduzir de 1000 para 100
    name: Optional[str] = Query(None),
    tag_id: Optional[UUID] = Query(None),
    sort_by: str = Query("name", description="Ordenar por: name ou number"),
    sort_direction: str = Query("asc", description="Direção: asc ou desc"),
    no_number: str = Query("last", description="Praises sem número: first, last ou hide (apenas quando sort_by=number)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # ... código existente ...
```

---

## Item 3 - Broken Authentication

### Objetivo
Corrigir uso de `datetime.utcnow()` deprecated e implementar refresh tokens.

### Arquivos a Modificar

#### 1. `backend/app/core/security.py`

**Mudança:** Substituir `datetime.utcnow()` por `datetime.now(timezone.utc)` e adicionar função de refresh token

```python
from datetime import datetime, timedelta, timezone  # ← MUDANÇA: Adicionar timezone
from typing import Optional
from jose import JWTError, jwt
import bcrypt
from app.core.config import settings


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifica se a senha está correta usando bcrypt diretamente"""
    try:
        # bcrypt.checkpw retorna True se a senha corresponder ao hash
        return bcrypt.checkpw(
            plain_password.encode('utf-8'),
            hashed_password.encode('utf-8')
        )
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    """Gera hash da senha usando bcrypt diretamente"""
    # Gera salt e hash a senha
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Cria token JWT"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta  # ← CORRIGIDO: datetime.utcnow() -> datetime.now(timezone.utc)
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)  # ← CORRIGIDO
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt


def create_refresh_token(data: dict) -> str:
    """Cria refresh token JWT com expiração longa (7 dias)"""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=7)  # ← NOVO: Refresh token válido por 7 dias
    to_encode.update({"exp": expire, "type": "refresh"})  # ← NOVO: Marcar como refresh token
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> Optional[dict]:
    """Decodifica token JWT"""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except JWTError:
        return None
```

#### 2. `backend/app/application/services/user_service.py`

**Mudança:** Incluir refresh token na resposta de autenticação

```python
from typing import Optional
from uuid import UUID
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from datetime import timedelta
from app.domain.models.user import User
from app.domain.schemas.user import UserCreate, UserLogin
from app.core.security import verify_password, get_password_hash, create_access_token, create_refresh_token  # ← MUDANÇA: Adicionar create_refresh_token
from app.core.config import settings
from app.infrastructure.database.repositories.user_repository import UserRepository


class UserService:
    def __init__(self, db: Session):
        self.repository = UserRepository(db)

    def get_by_id(self, user_id: UUID) -> User:
        user = self.repository.get_by_id(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Resource not found"  # ← MUDANÇA: Mensagem genérica
            )
        return user

    def get_by_username(self, username: str) -> Optional[User]:
        return self.repository.get_by_username(username)

    def create(self, user_data: UserCreate) -> User:
        # Check if user with same username exists
        existing_user = self.repository.get_by_username(user_data.username)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already registered"
            )
        
        # Check if user with same email exists
        existing_email = self.repository.get_by_email(user_data.email)
        if existing_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        
        hashed_password = get_password_hash(user_data.password)
        user = User(
            username=user_data.username,
            email=user_data.email,
            hashed_password=hashed_password
        )
        return self.repository.create(user)

    def authenticate(self, login_data: UserLogin) -> dict:
        user = self.repository.get_by_username(login_data.username)
        # ← MUDANÇA: Sempre retornar mesma mensagem para evitar enumeração
        if not user or not verify_password(login_data.password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",  # ← MUDANÇA: Mensagem genérica
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Inactive user"
            )
        
        access_token_expires = timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": str(user.id)},
            expires_delta=access_token_expires
        )
        
        refresh_token = create_refresh_token(data={"sub": str(user.id)})  # ← NOVO: Criar refresh token
        
        return {
            "access_token": access_token,
            "refresh_token": refresh_token,  # ← NOVO: Incluir refresh token
            "token_type": "bearer"
        }
```

#### 3. `backend/app/domain/schemas/user.py`

**Mudança:** Adicionar campo `refresh_token` ao schema `Token`

```python
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from uuid import UUID
from datetime import datetime


class UserBase(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50)


class UserCreate(UserBase):
    password: str = Field(..., min_length=6)


class UserLogin(BaseModel):
    username: str
    password: str


class UserResponse(UserBase):
    id: UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    refresh_token: str  # ← NOVO: Adicionar refresh_token
    token_type: str = "bearer"


class RefreshTokenRequest(BaseModel):  # ← NOVO: Schema para refresh token
    refresh_token: str
```

#### 4. `backend/app/api/v1/routes/auth.py`

**Mudança:** Adicionar endpoint de refresh token

```python
from fastapi import APIRouter, Depends, HTTPException, status, Request, Body
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from slowapi import Limiter
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
limiter = Limiter(key_func=get_remote_address)

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    """Registra um novo usuário"""
    service = UserService(db)
    user = service.create(user_data)
    return user


@router.post("/login", response_model=Token)
@limiter.limit("5/minute")
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """Autentica um usuário e retorna token JWT"""
    from app.domain.schemas.user import UserLogin
    
    login_data = UserLogin(username=form_data.username, password=form_data.password)
    service = UserService(db)
    token_data = service.authenticate(login_data)
    return token_data


@router.post("/refresh", response_model=Token)  # ← NOVO: Endpoint de refresh token
@limiter.limit("10/minute")  # ← Rate limiting para refresh
def refresh_token(
    request: Request,
    refresh_token_data: RefreshTokenRequest = Body(...),
    db: Session = Depends(get_db)
):
    """Renova access token usando refresh token"""
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
        "refresh_token": refresh_token_data.refresh_token,  # Reutilizar refresh token
        "token_type": "bearer"
    }


@router.get("/me", response_model=UserResponse)
def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Retorna o usuário atual autenticado"""
    return UserResponse.model_validate(current_user)
```

#### 5. `backend/app/application/services/praise_service.py`

**Mudança:** Corrigir uso de `datetime.utcnow()`

```python
from datetime import datetime, timezone  # ← MUDANÇA: Adicionar timezone
from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.domain.models.praise import Praise
from app.domain.models.praise_tag import PraiseTag
from app.domain.schemas.praise import PraiseCreate, PraiseUpdate, ReviewActionRequest
from app.infrastructure.database.repositories.praise_repository import PraiseRepository
from app.infrastructure.database.repositories.praise_tag_repository import PraiseTagRepository
from app.infrastructure.database.repositories.praise_material_repository import PraiseMaterialRepository
from app.domain.models.praise_material import PraiseMaterial


class PraiseService:
    def __init__(self, db: Session):
        self.repository = PraiseRepository(db)
        self.tag_repo = PraiseTagRepository(db)
        self.material_repo = PraiseMaterialRepository(db)

    def get_by_id(self, praise_id: UUID) -> Praise:
        praise = self.repository.get_by_id(praise_id)
        if not praise:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Resource not found"  # ← MUDANÇA: Mensagem genérica
            )
        return praise

    # ... código existente ...

    def create(self, praise_data: PraiseCreate) -> Praise:
        in_review = praise_data.in_review or False
        if in_review:
            review_history = [{"type": "in_review", "date": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}]  # ← CORRIGIDO
        else:
            review_history = []

        # ... resto do código existente ...

    # ... código existente ...

    def review_action(self, praise_id: UUID, data: ReviewActionRequest) -> Praise:
        praise = self.get_by_id(praise_id)
        history = list(praise.review_history or [])
        last = history[-1] if history else None
        now_str = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")  # ← CORRIGIDO

        # ... resto do código existente ...
```

---

## Item 5 - Mass Assignment

### Objetivo
Prevenir Mass Assignment adicionando `extra='forbid'` nos schemas.

### Arquivos a Modificar

#### 1. `backend/app/domain/schemas/praise.py`

**Mudança:** Adicionar `extra='forbid'` em todos os schemas de criação/atualização

```python
from pydantic import BaseModel, Field, field_validator, ConfigDict  # ← MUDANÇA: Adicionar ConfigDict
from typing import Optional, List, Literal
from uuid import UUID
from datetime import datetime


class ReviewHistoryEvent(BaseModel):
    type: Literal["in_review", "review_cancelled", "review_finished"]
    date: str  # ISO 8601 datetime string
    
    model_config = ConfigDict(extra='forbid')  # ← NOVO: Prevenir campos extras


class PraiseBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    number: Optional[int] = None
    author: Optional[str] = Field(None, max_length=255)
    rhythm: Optional[str] = Field(None, max_length=100)
    tonality: Optional[str] = Field(None, max_length=50)
    category: Optional[str] = Field(None, max_length=255)
    
    model_config = ConfigDict(extra='forbid')  # ← NOVO: Prevenir campos extras


class PraiseCreate(PraiseBase):
    tag_ids: Optional[List[UUID]] = []
    materials: Optional[List["PraiseMaterialCreate"]] = []
    in_review: Optional[bool] = False
    in_review_description: Optional[str] = None
    
    model_config = ConfigDict(extra='forbid')  # ← NOVO: Prevenir campos extras


class PraiseUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    number: Optional[int] = None
    tag_ids: Optional[List[UUID]] = None
    in_review_description: Optional[str] = None
    author: Optional[str] = Field(None, max_length=255)
    rhythm: Optional[str] = Field(None, max_length=100)
    tonality: Optional[str] = Field(None, max_length=50)
    category: Optional[str] = Field(None, max_length=255)
    
    model_config = ConfigDict(extra='forbid')  # ← NOVO: Prevenir campos extras


class PraiseTagSimple(BaseModel):
    id: UUID
    name: str

    class Config:
        from_attributes = True
        extra = 'forbid'  # ← NOVO: Prevenir campos extras


class PraiseMaterialSimple(BaseModel):
    id: UUID
    material_kind_id: UUID
    material_type_id: UUID
    path: str
    is_old: bool = False
    old_description: Optional[str] = None
    material_kind: Optional["MaterialKindResponse"] = None
    material_type: Optional["MaterialTypeResponse"] = None

    class Config:
        from_attributes = True
        extra = 'forbid'  # ← NOVO: Prevenir campos extras


class PraiseResponse(PraiseBase):
    id: UUID
    created_at: datetime
    updated_at: datetime
    tags: List[PraiseTagSimple] = []
    materials: List[PraiseMaterialSimple] = []
    in_review: bool = False
    in_review_description: Optional[str] = None
    review_history: List[ReviewHistoryEvent] = []

    @field_validator("review_history", mode="before")
    @classmethod
    def coerce_review_history_none(cls, v: object) -> list:
        return v if v is not None else []

    class Config:
        from_attributes = True
        extra = 'forbid'  # ← NOVO: Prevenir campos extras


class ReviewActionRequest(BaseModel):
    action: Literal["start", "cancel", "finish"]
    in_review_description: Optional[str] = None  # used only for "start"
    
    model_config = ConfigDict(extra='forbid')  # ← NOVO: Prevenir campos extras


# Forward reference resolution
from app.domain.schemas.praise_material import PraiseMaterialCreate
from app.domain.schemas.material_kind import MaterialKindResponse
from app.domain.schemas.material_type import MaterialTypeResponse
PraiseCreate.model_rebuild()
PraiseMaterialSimple.model_rebuild()
```

#### 2. `backend/app/domain/schemas/user.py`

**Mudança:** Adicionar `extra='forbid'` nos schemas

```python
from pydantic import BaseModel, EmailStr, Field, ConfigDict  # ← MUDANÇA: Adicionar ConfigDict
from typing import Optional
from uuid import UUID
from datetime import datetime


class UserBase(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50)
    
    model_config = ConfigDict(extra='forbid')  # ← NOVO: Prevenir campos extras


class UserCreate(UserBase):
    password: str = Field(..., min_length=6)
    
    model_config = ConfigDict(extra='forbid')  # ← NOVO: Prevenir campos extras


class UserLogin(BaseModel):
    username: str
    password: str
    
    model_config = ConfigDict(extra='forbid')  # ← NOVO: Prevenir campos extras


class UserResponse(UserBase):
    id: UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
        extra = 'forbid'  # ← NOVO: Prevenir campos extras


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    
    model_config = ConfigDict(extra='forbid')  # ← NOVO: Prevenir campos extras


class RefreshTokenRequest(BaseModel):
    refresh_token: str
    
    model_config = ConfigDict(extra='forbid')  # ← NOVO: Prevenir campos extras
```

#### 3. `backend/app/application/services/praise_service.py`

**Mudança:** Adicionar validação explícita de campos permitidos no método `update`

```python
# ... código existente ...

def update(self, praise_id: UUID, praise_data: PraiseUpdate) -> Praise:
    praise = self.get_by_id(praise_id)
    
    # Lista explícita de campos permitidos para atualização
    ALLOWED_UPDATE_FIELDS = {
        'name', 'number', 'tag_ids', 'in_review_description',
        'author', 'rhythm', 'tonality', 'category'
    }
    
    # Obter apenas campos que foram definidos (não None)
    update_data = praise_data.model_dump(exclude_unset=True, exclude_none=True)
    
    # Validar que apenas campos permitidos estão presentes
    for field in update_data.keys():
        if field not in ALLOWED_UPDATE_FIELDS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Field '{field}' is not allowed to be updated"
            )
    
    # Atualizar campos permitidos
    if 'name' in update_data:
        praise.name = update_data['name']
    
    if 'number' in update_data:
        praise.number = update_data['number']
    
    # ... resto do código existente para outros campos ...
    
    return self.repository.update(praise)
```

---

## Item 6 - CORS

### Objetivo
Melhorar validação de CORS para alertar sobre uso de wildcard em produção.

### Arquivos a Modificar

#### 1. `backend/app/core/config.py`

**Mudança:** Adicionar validação que alerta sobre wildcard em produção

```python
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator
from typing import List, Union
import warnings
import os


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str
    POSTGRES_USER: str = "praise_user"
    POSTGRES_PASSWORD: str = "praise_password"
    POSTGRES_DB: str = "praise_db"
    POSTGRES_PORT: int = 5432

    # Deployment Configuration
    DEPLOYMENT_ENV: str = "local"  # local ou vps
    DEPLOYMENT_HOST: str = ""  # IP local ou URI do VPS

    # Storage Configuration (modo local para produção beta)
    STORAGE_MODE: str = "local"  # local (wasabi desabilitado temporariamente)
    
    # Wasabi Storage (desabilitado temporariamente - será usado após fase beta)
    # WASABI_ACCESS_KEY: str = ""
    # WASABI_SECRET_KEY: str = ""
    # WASABI_ENDPOINT: str = "https://s3.wasabisys.com"
    # WASABI_BUCKET: str = ""
    # WASABI_REGION: str = "us-east-1"
    
    # Local Storage (usado quando STORAGE_MODE=local)
    STORAGE_LOCAL_PATH: str = "/storage/assets"

    # JWT
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # API
    API_PORT: int = 8000
    CORS_ORIGINS: Union[str, List[str]] = "*"
    
    # Nginx (para configuração do docker-compose, não usado pela aplicação Python)
    NGINX_PORT: int = 8080

    @field_validator('CORS_ORIGINS', mode='after')
    @classmethod
    def validate_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        """Valida CORS_ORIGINS e alerta sobre wildcard em produção"""
        if isinstance(v, str):
            if v == "*" or v == "":
                parsed = ["*"]
            else:
                parsed = [origin.strip() for origin in v.split(",") if origin.strip()]
        else:
            parsed = v if isinstance(v, list) else ["*"]
        
        # Verificar se está em produção e usando wildcard
        deployment_env = os.getenv("DEPLOYMENT_ENV", "local")
        if deployment_env == "vps" and "*" in parsed:
            warnings.warn(
                "⚠️  SECURITY WARNING: CORS_ORIGINS is set to '*' in production environment. "
                "This is a security risk. Please set specific origins in your .env file:\n"
                "CORS_ORIGINS=https://your-domain.com,https://www.your-domain.com",
                UserWarning,
                stacklevel=2
            )
        
        return parsed

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
    )


settings = Settings()
```

#### 2. `backend/app/main.py`

**Mudança:** Melhorar configuração de CORS e adicionar validação adicional

```python
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from typing import Tuple
from pathlib import Path
import warnings
from app.core.config import settings
from app.api.v1.routes import auth, praise_tags, material_kinds, material_types, praise_materials, praises, languages, translations, snapshots
from app.infrastructure.database.database import engine, Base

app = FastAPI(
    title="Praise Manager API",
    description="API para gerenciamento de praises, materiais e tags",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Validar CORS antes de aplicar middleware
if settings.DEPLOYMENT_ENV == "vps" and "*" in settings.CORS_ORIGINS:
    warnings.warn(
        "⚠️  SECURITY WARNING: CORS_ORIGINS is set to '*' with allow_credentials=True in production. "
        "This is a security risk. Please set specific origins.",
        UserWarning,
        stacklevel=1
    )

# CORS - IMPORTANTE: deve ser o primeiro middleware para garantir headers em todos os casos
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],  # ← MUDANÇA: Especificar métodos ao invés de "*"
    allow_headers=["Authorization", "Content-Type", "Accept"],  # ← MUDANÇA: Especificar headers ao invés de "*"
    expose_headers=["Content-Disposition"],  # ← MUDANÇA: Especificar headers expostos
)

# ... resto do código existente ...
```

---

## Item 7 - Information Disclosure

### Objetivo
Usar mensagens de erro genéricas para evitar exposição de informações sensíveis.

### Arquivos a Modificar

#### 1. `backend/app/application/services/user_service.py`

**Mudança:** Usar mensagens genéricas

```python
from typing import Optional
from uuid import UUID
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from datetime import timedelta
from app.domain.models.user import User
from app.domain.schemas.user import UserCreate, UserLogin
from app.core.security import verify_password, get_password_hash, create_access_token, create_refresh_token
from app.core.config import settings
from app.infrastructure.database.repositories.user_repository import UserRepository


class UserService:
    def __init__(self, db: Session):
        self.repository = UserRepository(db)

    def get_by_id(self, user_id: UUID) -> User:
        user = self.repository.get_by_id(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Resource not found"  # ← MUDANÇA: Mensagem genérica ao invés de f"User with id {user_id} not found"
            )
        return user

    def get_by_username(self, username: str) -> Optional[User]:
        return self.repository.get_by_username(username)

    def create(self, user_data: UserCreate) -> User:
        # Check if user with same username exists
        existing_user = self.repository.get_by_username(user_data.username)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already registered"
            )
        
        # Check if user with same email exists
        existing_email = self.repository.get_by_email(user_data.email)
        if existing_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        
        hashed_password = get_password_hash(user_data.password)
        user = User(
            username=user_data.username,
            email=user_data.email,
            hashed_password=hashed_password
        )
        return self.repository.create(user)

    def authenticate(self, login_data: UserLogin) -> dict:
        user = self.repository.get_by_username(login_data.username)
        # ← MUDANÇA: Sempre retornar mesma mensagem, independente se usuário existe ou senha está errada
        if not user or not verify_password(login_data.password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",  # ← MUDANÇA: Mensagem genérica ao invés de "Incorrect username or password"
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Inactive user"
            )
        
        access_token_expires = timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": str(user.id)},
            expires_delta=access_token_expires
        )
        
        refresh_token = create_refresh_token(data={"sub": str(user.id)})
        
        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer"
        }
```

#### 2. `backend/app/application/services/praise_service.py`

**Mudança:** Usar mensagens genéricas em todos os erros

```python
# ... código existente ...

def get_by_id(self, praise_id: UUID) -> Praise:
    praise = self.repository.get_by_id(praise_id)
    if not praise:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resource not found"  # ← MUDANÇA: Mensagem genérica
        )
    return praise

# ... código existente ...

def create(self, praise_data: PraiseCreate) -> Praise:
    # ... código existente ...
    
    # Add tags if provided
    if praise_data.tag_ids:
        tags = []
        for tag_id in praise_data.tag_ids:
            tag = self.tag_repo.get_by_id(tag_id)
            if not tag:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Resource not found"  # ← MUDANÇA: Mensagem genérica ao invés de f"PraiseTag with id {tag_id} not found"
                )
            tags.append(tag)
        praise.tags = tags
    
    # ... resto do código ...

def update(self, praise_id: UUID, praise_data: PraiseUpdate) -> Praise:
    praise = self.get_by_id(praise_id)
    
    # ... código existente ...
    
    # Update tags if provided
    if praise_data.tag_ids is not None:
        tags = []
        for tag_id in praise_data.tag_ids:
            tag = self.tag_repo.get_by_id(tag_id)
            if not tag:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Resource not found"  # ← MUDANÇA: Mensagem genérica
                )
            tags.append(tag)
        praise.tags = tags
    
    # ... resto do código ...
```

#### 3. `backend/app/main.py`

**Mudança:** Melhorar exception handlers para não expor detalhes do sistema

```python
# ... código existente ...

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handler para erros gerais (500), garantindo headers CORS"""
    origin = request.headers.get("origin")
    headers = {}
    allowed, allowed_origin = is_origin_allowed(origin or "")
    if allowed:
        headers["Access-Control-Allow-Origin"] = allowed_origin
        headers["Access-Control-Allow-Credentials"] = "true"
    
    import traceback
    import logging
    
    # Logar erro detalhado internamente
    logger = logging.getLogger(__name__)
    logger.error(f"Internal Server Error: {exc}", exc_info=True)
    
    # Retornar mensagem genérica ao cliente
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An error occurred processing your request"},  # ← MUDANÇA: Mensagem genérica
        headers=headers
    )

# ... código existente ...
```

#### 4. `backend/app/core/dependencies.py`

**Mudança:** Manter mensagem genérica em get_current_user (já está correto, mas documentar)

```python
# ... código existente ...

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    """Obtém o usuário atual através do token JWT"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",  # ← JÁ ESTÁ GENÉRICO: Manter assim
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
        raise credentials_exception  # ← CORRETO: Usa exception genérica

    return user

# ... resto do código ...
```

---

## Checklist de Implementação

### Pré-requisitos
- [ ] Fazer backup do código atual
- [ ] Criar branch para as correções: `git checkout -b security-fixes`

### Item 2 - Rate Limiting
- [ ] Adicionar `slowapi==0.1.9` ao `requirements.txt`
- [ ] Instalar dependência: `pip install slowapi==0.1.9`
- [ ] Configurar limiter global em `main.py`
- [ ] Adicionar rate limiting no endpoint `/api/v1/auth/login` (5/minuto)
- [ ] Adicionar rate limiting em endpoints de download (10-20/hora)
- [ ] Reduzir limite máximo de listagem de 1000 para 100
- [ ] Reduzir limite de busca em download de 10000 para 1000
- [ ] Testar rate limiting fazendo múltiplas requisições

### Item 3 - Broken Authentication
- [ ] Substituir `datetime.utcnow()` por `datetime.now(timezone.utc)` em `security.py`
- [ ] Adicionar função `create_refresh_token()` em `security.py`
- [ ] Atualizar `user_service.py` para incluir refresh token
- [ ] Atualizar schema `Token` para incluir `refresh_token`
- [ ] Criar schema `RefreshTokenRequest`
- [ ] Adicionar endpoint `/api/v1/auth/refresh`
- [ ] Corrigir `datetime.utcnow()` em `praise_service.py`
- [ ] Atualizar mensagens de erro para genéricas em `user_service.py`
- [ ] Testar criação de tokens e refresh

### Item 5 - Mass Assignment
- [ ] Adicionar `ConfigDict` import em `praise.py`
- [ ] Adicionar `extra='forbid'` em todos os schemas de `praise.py`
- [ ] Adicionar `ConfigDict` import em `user.py`
- [ ] Adicionar `extra='forbid'` em todos os schemas de `user.py`
- [ ] Adicionar validação explícita de campos em `praise_service.update()`
- [ ] Testar tentativa de enviar campos extras (deve retornar erro)

### Item 6 - CORS
- [ ] Adicionar validação em `config.py` que alerta sobre wildcard em produção
- [ ] Melhorar configuração de CORS em `main.py` (especificar métodos e headers)
- [ ] Configurar `CORS_ORIGINS` específico no `.env` de produção
- [ ] Testar CORS em ambiente local e produção

### Item 7 - Information Disclosure
- [ ] Atualizar mensagens de erro em `user_service.py` para genéricas
- [ ] Atualizar mensagens de erro em `praise_service.py` para genéricas
- [ ] Melhorar exception handler geral em `main.py`
- [ ] Verificar que `get_current_user` já usa mensagens genéricas
- [ ] Testar que mensagens de erro não expõem informações sensíveis

### Testes Finais
- [ ] Executar testes unitários
- [ ] Testar autenticação e refresh token
- [ ] Testar rate limiting
- [ ] Testar validação de schemas (Mass Assignment)
- [ ] Verificar logs de erro não expõem informações sensíveis
- [ ] Testar CORS em diferentes origens

### Deploy
- [ ] Revisar todas as mudanças
- [ ] Atualizar documentação da API se necessário
- [ ] Fazer commit: `git commit -m "fix: implement security fixes (items 2, 3, 5, 6, 7)"`
- [ ] Criar Pull Request
- [ ] Revisar código em PR
- [ ] Fazer merge após aprovação
- [ ] Deploy em ambiente de staging
- [ ] Testar em staging
- [ ] Deploy em produção

---

## Notas Importantes

### Compatibilidade
- Todas as mudanças são retrocompatíveis com a API existente
- O refresh token é opcional - clientes antigos continuarão funcionando
- Rate limiting pode causar 429 (Too Many Requests) - clientes devem tratar isso

### Configuração de Ambiente
Após implementar as correções, atualizar `.env` de produção:

```env
# CORS - Especificar origens ao invés de wildcard
CORS_ORIGINS=https://seu-dominio.com,https://www.seu-dominio.com

# JWT - Manter configurações existentes
JWT_SECRET_KEY=your-secret-key-here-change-in-production
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=30

# Deployment
DEPLOYMENT_ENV=vps
```

### Migração de Clientes
Se clientes frontend precisam ser atualizados:

1. **Refresh Token**: Clientes devem armazenar e usar refresh token
2. **Rate Limiting**: Implementar retry com backoff exponencial ao receber 429
3. **Mensagens de Erro**: Atualizar tratamento de erros para mensagens genéricas

---

## Referências

- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)
- [FastAPI Rate Limiting](https://github.com/laurents/slowapi)
- [Pydantic Extra Fields](https://docs.pydantic.dev/latest/concepts/models/#extra-fields)
- [CORS Best Practices](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)

---

**Documento criado em:** 16 de Fevereiro de 2026  
**Versão:** 1.0  
**Autor:** Engenheiro de Segurança de Aplicações (AppSec)
