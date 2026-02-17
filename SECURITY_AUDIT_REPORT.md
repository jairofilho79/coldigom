# Relatório de Análise de Segurança - API-First Application

**Data da Análise:** 16 de Fevereiro de 2026  
**Analista:** Engenheiro de Segurança de Aplicações (AppSec)  
**Escopo:** Backend FastAPI - Definições de API, Autenticação, Lógica de Negócios

---

## Resumo Executivo

Esta análise identificou **7 vulnerabilidades críticas e altas** relacionadas a autorização, autenticação e consumo de recursos. O sistema apresenta falhas graves de controle de acesso que permitem violação de dados entre usuários.

---

## Vulnerabilidades Identificadas

### [CRÍTICO] Broken Object Level Authorization (BOLA/IDOR) - Ausência de Verificação de Propriedade

**Vulnerabilidade:** Broken Object Level Authorization (BOLA/IDOR)

**Cenário de Ataque:**
Um usuário autenticado pode acessar, modificar ou deletar recursos de outros usuários simplesmente alterando o UUID na URL. Por exemplo:
- `GET /api/v1/praises/{praise_id}` - Acessa qualquer praise
- `PUT /api/v1/praises/{praise_id}` - Modifica qualquer praise
- `DELETE /api/v1/praises/{praise_id}` - Deleta qualquer praise
- `POST /api/v1/praises/{praise_id}/review` - Altera estado de revisão de qualquer praise
- `GET /api/v1/praises/{praise_id}/download-zip` - Baixa materiais de qualquer praise

**Código/Trecho Afetado:**
```python
# backend/app/api/v1/routes/praises.py

@router.get("/{praise_id}", response_model=PraiseResponse)
def get_praise(
    praise_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)  # ← current_user não é usado
):
    service = PraiseService(db)
    praise = service.get_by_id(praise_id)  # ← Sem verificação de propriedade
    return praise

@router.put("/{praise_id}", response_model=PraiseResponse)
def update_praise(
    praise_id: UUID,
    praise_data: PraiseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)  # ← current_user não é usado
):
    service = PraiseService(db)
    praise = service.update(praise_id, praise_data)  # ← Sem verificação de propriedade
    return praise

@router.delete("/{praise_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_praise(
    praise_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)  # ← current_user não é usado
):
    service = PraiseService(db)
    service.delete(praise_id)  # ← Sem verificação de propriedade
    return None
```

**Recomendação de Correção:**

1. Adicionar campo `user_id` ou `created_by` no modelo `Praise`:
```python
# backend/app/domain/models/praise.py
class Praise(Base):
    # ... campos existentes ...
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
```

2. Modificar `PraiseService` para verificar propriedade:
```python
# backend/app/application/services/praise_service.py

def get_by_id(self, praise_id: UUID, user_id: UUID = None) -> Praise:
    praise = self.repository.get_by_id(praise_id)
    if not praise:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Praise with id {praise_id} not found"
        )
    # Verificação de propriedade
    if user_id and praise.created_by_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to access this resource"
        )
    return praise

def update(self, praise_id: UUID, praise_data: PraiseUpdate, user_id: UUID) -> Praise:
    praise = self.get_by_id(praise_id, user_id)  # ← Valida propriedade
    # ... resto do código ...
```

3. Atualizar rotas para passar `current_user.id`:
```python
@router.put("/{praise_id}", response_model=PraiseResponse)
def update_praise(
    praise_id: UUID,
    praise_data: PraiseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    service = PraiseService(db)
    praise = service.update(praise_id, praise_data, current_user.id)  # ← Passa user_id
    return praise
```

**Nota:** Se o sistema for multi-tenant ou houver recursos compartilhados, implementar controle de acesso baseado em roles/permissões ao invés de propriedade direta.

---

### [CRÍTICO] Unrestricted Resource Consumption - Ausência de Rate Limiting

**Vulnerabilidade:** Unrestricted Resource Consumption

**Cenário de Ataque:**
1. **Ataque de Força Bruta no Login:** Um atacante pode realizar milhares de tentativas de login por segundo sem limitação, comprometendo contas com senhas fracas.
2. **DoS via Download em Massa:** O endpoint `/api/v1/praises/download-by-material-kind` permite downloads ilimitados de até 10.000 praises por requisição, consumindo recursos de storage, CPU e banda.
3. **DoS via Listagem:** O endpoint `GET /api/v1/praises/` permite `limit=1000`, permitindo que um atacante sobrecarregue o banco de dados com requisições repetidas.

**Código/Trecho Afetado:**
```python
# backend/app/api/v1/routes/auth.py
@router.post("/login", response_model=Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    # ← Sem rate limiting
    login_data = UserLogin(username=form_data.username, password=form_data.password)
    service = UserService(db)
    token_data = service.authenticate(login_data)
    return token_data

# backend/app/api/v1/routes/praises.py
@router.get("/download-by-material-kind")
def download_praises_by_material_kind(
    # ...
    praises = service.get_all(skip=0, limit=10000, tag_id=tag_id)  # ← Limite muito alto
    # ... processamento pesado sem limitação de requisições ...
)

@router.get("/", response_model=List[PraiseResponse])
def list_praises(
    limit: int = Query(100, ge=1, le=1000),  # ← Limite alto sem rate limiting
    # ...
):
```

**Recomendação de Correção:**

1. Implementar Rate Limiting usando `slowapi` ou `fastapi-limiter`:
```python
# backend/app/main.py
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# backend/app/api/v1/routes/auth.py
from slowapi import Limiter, _rate_limit_exceeded_handler
from fastapi import Request

limiter = Limiter(key_func=lambda request: request.client.host)

@router.post("/login", response_model=Token)
@limiter.limit("5/minute")  # ← 5 tentativas por minuto por IP
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    login_data = UserLogin(username=form_data.username, password=form_data.password)
    service = UserService(db)
    token_data = service.authenticate(login_data)
    return token_data

# backend/app/api/v1/routes/praises.py
@router.get("/download-by-material-kind")
@limiter.limit("10/hour")  # ← Limitar downloads pesados
def download_praises_by_material_kind(
    request: Request,
    # ...
):
    # ... código existente ...
```

2. Reduzir limites e adicionar validação adicional:
```python
# Reduzir limite máximo de listagem
limit: int = Query(100, ge=1, le=100)  # ← Reduzir de 1000 para 100

# Reduzir limite de download
praises = service.get_all(skip=0, limit=1000, tag_id=tag_id)  # ← Reduzir de 10000
```

3. Implementar Rate Limiting baseado em usuário autenticado para endpoints protegidos:
```python
def get_user_id_for_rate_limit(request: Request, current_user: User = Depends(get_current_user)):
    return str(current_user.id)

limiter = Limiter(key_func=get_user_id_for_rate_limit)

@router.get("/download-by-material-kind")
@limiter.limit("5/hour")  # ← Por usuário autenticado
def download_praises_by_material_kind(
    request: Request,
    current_user: User = Depends(get_current_user),
    # ...
):
```

---

### [ALTO] Broken Authentication - Uso de datetime.utcnow() Deprecated e Falta de Refresh Tokens

**Vulnerabilidade:** Broken Authentication

**Cenário de Ataque:**
1. **Tokens JWT sem Refresh:** Com expiração de 30 minutos, usuários precisam fazer login frequentemente. Se um token for comprometido, ele permanece válido até expirar, sem mecanismo de revogação.
2. **Uso de datetime.utcnow():** A função está deprecated no Python 3.12+, podendo causar problemas de compatibilidade e comportamento inesperado em diferentes timezones.

**Código/Trecho Afetado:**
```python
# backend/app/core/security.py

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Cria token JWT"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta  # ← DEPRECATED
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)  # ← DEPRECATED
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt  # ← Sem refresh token

# backend/app/application/services/praise_service.py
history.append({"type": "in_review", "date": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")})  # ← DEPRECATED
```

**Recomendação de Correção:**

1. Substituir `datetime.utcnow()` por `datetime.now(timezone.utc)`:
```python
# backend/app/core/security.py
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
import bcrypt
from app.core.config import settings

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Cria token JWT"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta  # ← CORRIGIDO
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)  # ← CORRIGIDO
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt

def create_refresh_token(data: dict) -> str:
    """Cria refresh token JWT com expiração longa (7 dias)"""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=7)
    to_encode.update({"exp": expire, "type": "refresh"})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt
```

2. Implementar endpoint de refresh token:
```python
# backend/app/api/v1/routes/auth.py
@router.post("/refresh", response_model=Token)
def refresh_token(
    refresh_token: str = Body(...),
    db: Session = Depends(get_db)
):
    """Renova access token usando refresh token"""
    payload = decode_access_token(refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )
    
    user_id = payload.get("sub")
    user_repo = UserRepository(db)
    user = user_repo.get_by_id(UUID(user_id))
    
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
        "token_type": "bearer"
    }
```

3. Atualizar resposta de login para incluir refresh token:
```python
# backend/app/application/services/user_service.py
def authenticate(self, login_data: UserLogin) -> dict:
    # ... código existente ...
    
    access_token_expires = timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=access_token_expires
    )
    
    refresh_token = create_refresh_token(data={"sub": str(user.id)})  # ← NOVO
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,  # ← NOVO
        "token_type": "bearer"
    }
```

4. Corrigir uso de `datetime.utcnow()` em outros arquivos:
```python
# backend/app/application/services/praise_service.py
from datetime import datetime, timezone

# Substituir todas as ocorrências de datetime.utcnow()
now_str = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")  # ← CORRIGIDO
```

---

### [ALTO] Broken Object Level Authorization - Endpoint de Download Expõe Recursos de Todos os Usuários

**Vulnerabilidade:** Broken Object Level Authorization (BOLA)

**Cenário de Ataque:**
O endpoint `/api/v1/praises/download-by-material-kind` permite que qualquer usuário autenticado baixe materiais de TODOS os praises do sistema, independente de quem os criou. Um usuário malicioso pode:
1. Enumerar todos os material_kinds disponíveis
2. Baixar todos os materiais de todos os usuários
3. Extrair dados sensíveis ou propriedade intelectual

**Código/Trecho Afetado:**
```python
# backend/app/api/v1/routes/praises.py

@router.get("/download-by-material-kind")
def download_praises_by_material_kind(
    material_kind_id: UUID = Query(...),
    tag_id: Optional[UUID] = Query(None),
    max_zip_size_mb: int = Query(100, ge=10, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),  # ← Autenticado mas sem verificação
    storage: StorageClient = Depends(get_storage)
):
    # Buscar praises (filtrados por tag se fornecido)
    service = PraiseService(db)
    praises = service.get_all(skip=0, limit=10000, tag_id=tag_id)  # ← TODOS os praises
    
    # Processar TODOS os materiais sem filtrar por usuário
    for praise in praises:
        for material in praise.materials:
            # ← Sem verificação se o praise pertence ao usuário
```

**Recomendação de Correção:**

1. Filtrar praises por usuário (após implementar campo `created_by_id`):
```python
@router.get("/download-by-material-kind")
def download_praises_by_material_kind(
    material_kind_id: UUID = Query(...),
    tag_id: Optional[UUID] = Query(None),
    max_zip_size_mb: int = Query(100, ge=10, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    storage: StorageClient = Depends(get_storage)
):
    # ... validação de material_kind ...
    
    # Buscar APENAS praises do usuário atual
    service = PraiseService(db)
    praises = service.get_all(
        skip=0, 
        limit=1000,  # ← Reduzir limite também
        tag_id=tag_id,
        user_id=current_user.id  # ← FILTRAR POR USUÁRIO
    )
    
    # ... resto do código ...
```

2. Adicionar método no repository para filtrar por usuário:
```python
# backend/app/infrastructure/database/repositories/praise_repository.py

def get_all_filtered_sorted(
    self,
    skip: int = 0,
    limit: int = 100,
    name: Optional[str] = None,
    tag_id: Optional[UUID] = None,
    user_id: Optional[UUID] = None,  # ← NOVO PARÂMETRO
    sort_by: str = "name",
    sort_direction: str = "asc",
    no_number: str = "last",
) -> List[Praise]:
    query = self.db.query(Praise)
    
    # Filtrar por usuário se fornecido
    if user_id:
        query = query.filter(Praise.created_by_id == user_id)  # ← FILTRO
    
    # ... resto dos filtros ...
```

**Alternativa:** Se o sistema for multi-tenant com recursos compartilhados, implementar controle de acesso baseado em roles/permissões específicas para downloads em massa.

---

### [MÉDIO] Broken Object Property Level Authorization - Potencial Mass Assignment em PraiseUpdate

**Vulnerabilidade:** Broken Object Property Level Authorization (Mass Assignment)

**Cenário de Ataque:**
Embora o schema `PraiseUpdate` use campos opcionais, se campos sensíveis forem adicionados ao modelo `Praise` no futuro (ex: `is_approved`, `is_featured`, `view_count`), eles podem ser modificados pelo cliente se não forem explicitamente excluídos do schema.

**Código/Trecho Afetado:**
```python
# backend/app/domain/schemas/praise.py

class PraiseUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    number: Optional[int] = None
    tag_ids: Optional[List[UUID]] = None
    in_review_description: Optional[str] = None
    author: Optional[str] = Field(None, max_length=255)
    rhythm: Optional[str] = Field(None, max_length=100)
    tonality: Optional[str] = Field(None, max_length=50)
    category: Optional[str] = Field(None, max_length=255)
    # ← Se campos como 'is_approved', 'created_by_id', 'view_count' forem adicionados
    # ao modelo Praise, eles podem ser modificados se não excluídos aqui

# backend/app/application/services/praise_service.py

def update(self, praise_id: UUID, praise_data: PraiseUpdate) -> Praise:
    praise = self.get_by_id(praise_id)
    
    # Atualização campo por campo - BOM
    if praise_data.name is not None:
        praise.name = praise_data.name
    # ... outros campos ...
    
    # ← Mas se usar dict.update() ou **praise_data.dict(), campos extras podem ser incluídos
```

**Recomendação de Correção:**

1. Usar `model_dump(exclude_unset=True)` e validar campos permitidos:
```python
# backend/app/application/services/praise_service.py

def update(self, praise_id: UUID, praise_data: PraiseUpdate, user_id: UUID) -> Praise:
    praise = self.get_by_id(praise_id, user_id)
    
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
    # ... resto dos campos ...
    
    return self.repository.update(praise)
```

2. Usar `model_config` com `extra='forbid'` nos schemas:
```python
# backend/app/domain/schemas/praise.py

class PraiseUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    # ... outros campos ...
    
    class Config:
        extra = 'forbid'  # ← Rejeita campos extras não definidos no schema
```

3. Adicionar campos protegidos explicitamente excluídos:
```python
class PraiseUpdate(BaseModel):
    # Campos permitidos
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    # ... outros campos ...
    
    # Campos EXPLICITAMENTE excluídos (se existirem no modelo)
    # is_approved: Optional[bool] = Field(None, exclude=True)  # ← Se campo existir
    # created_by_id: Optional[UUID] = Field(None, exclude=True)  # ← Se campo existir
```

---

### [MÉDIO] Unsafe Consumption of APIs - CORS Configurado com Wildcard em Produção

**Vulnerabilidade:** Unsafe Consumption of APIs / Misconfiguration

**Cenário de Ataque:**
A configuração `CORS_ORIGINS: Union[str, List[str]] = "*"` permite que QUALQUER origem faça requisições à API, incluindo requisições com credenciais (`allow_credentials=True`). Isso permite:
1. Sites maliciosos fazerem requisições autenticadas à API em nome do usuário
2. Ataques CSRF (Cross-Site Request Forgery)
3. Exposição de dados através de requisições cross-origin não autorizadas

**Código/Trecho Afetado:**
```python
# backend/app/core/config.py

class Settings(BaseSettings):
    # ...
    CORS_ORIGINS: Union[str, List[str]] = "*"  # ← PERIGOSO em produção

# backend/app/main.py

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,  # ← Permite qualquer origem
    allow_credentials=True,  # ← Com credenciais, wildcard é especialmente perigoso
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)
```

**Recomendação de Correção:**

1. Configurar origens específicas em produção:
```python
# backend/app/core/config.py

class Settings(BaseSettings):
    # ...
    CORS_ORIGINS: Union[str, List[str]] = "*"
    
    @field_validator('CORS_ORIGINS', mode='before')
    @classmethod
    def parse_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            if v == "*" or v == "":
                # Em produção, não permitir wildcard
                if cls._is_production():
                    raise ValueError("CORS_ORIGINS cannot be '*' in production")
                return ["*"]
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v if isinstance(v, list) else ["*"]
    
    @staticmethod
    def _is_production() -> bool:
        import os
        return os.getenv("DEPLOYMENT_ENV", "local") == "vps"
```

2. Configurar variável de ambiente em produção:
```bash
# .env.production
CORS_ORIGINS=https://seu-dominio.com,https://www.seu-dominio.com
```

3. Adicionar validação adicional no middleware:
```python
# backend/app/main.py

# Validar que não estamos usando wildcard com credentials em produção
if settings.DEPLOYMENT_ENV == "vps":
    if "*" in settings.CORS_ORIGINS and app.middleware_stack:
        import warnings
        warnings.warn(
            "CORS_ORIGINS is set to '*' with allow_credentials=True in production. "
            "This is a security risk. Please set specific origins.",
            SecurityWarning
        )

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS if "*" not in settings.CORS_ORIGINS else ["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],  # ← Especificar métodos
    allow_headers=["Authorization", "Content-Type"],  # ← Especificar headers
    expose_headers=["Content-Disposition"],  # ← Especificar headers expostos
)
```

---

### [BAIXO] Information Disclosure - Mensagens de Erro Expõem Estrutura do Sistema

**Vulnerabilidade:** Information Disclosure

**Cenário de Ataque:**
Mensagens de erro detalhadas podem expor informações sobre a estrutura do banco de dados, nomes de tabelas, campos e lógica de negócios, facilitando ataques de enumeração.

**Código/Trecho Afetado:**
```python
# backend/app/application/services/user_service.py

def get_by_id(self, user_id: UUID) -> User:
    user = self.repository.get_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with id {user_id} not found"  # ← Expõe que o ID existe ou não
        )
    return user

# backend/app/core/dependencies.py

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    # ...
    if user is None:
        raise credentials_exception  # ← Mensagem genérica é melhor
```

**Recomendação de Correção:**

1. Usar mensagens genéricas para evitar enumeração:
```python
# backend/app/application/services/user_service.py

def get_by_id(self, user_id: UUID) -> User:
    user = self.repository.get_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resource not found"  # ← Mensagem genérica
        )
    return user

# Para autenticação, sempre usar mensagens idênticas:
def authenticate(self, login_data: UserLogin) -> dict:
    user = self.repository.get_by_username(login_data.username)
    # Sempre retornar mesma mensagem, independente se usuário existe ou senha está errada
    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",  # ← Não diferencia entre usuário inexistente e senha errada
            headers={"WWW-Authenticate": "Bearer"},
        )
```

2. Configurar tratamento de exceções do SQLAlchemy:
```python
# backend/app/main.py

from sqlalchemy.exc import IntegrityError, DatabaseError

@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError):
    """Handler para erros de integridade do banco"""
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"detail": "Invalid request data"}  # ← Não expor detalhes do DB
    )

@app.exception_handler(DatabaseError)
async def database_error_handler(request: Request, exc: DatabaseError):
    """Handler para erros de banco de dados"""
    # Log detalhado internamente
    logger.error(f"Database error: {exc}", exc_info=True)
    # Retornar mensagem genérica ao cliente
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An error occurred processing your request"}
    )
```

---

## Recomendações Adicionais

### 1. Implementar Logging de Segurança
Adicionar logging de todas as tentativas de acesso não autorizado, falhas de autenticação e operações sensíveis:

```python
import logging
security_logger = logging.getLogger("security")

# Em get_current_user após falha de autenticação
security_logger.warning(
    f"Failed authentication attempt - Token: {token[:10]}..., IP: {request.client.host}"
)

# Em operações de modificação/deleção
security_logger.info(
    f"User {current_user.id} {action} resource {resource_id}"
)
```

### 2. Implementar Validação de Entrada Mais Rigorosa
Adicionar sanitização e validação adicional em todos os inputs do usuário, especialmente em campos de texto livre.

### 3. Adicionar Headers de Segurança HTTP
```python
from fastapi.middleware.trustedhost import TrustedHostMiddleware

app.add_middleware(
    TrustedHostMiddleware, 
    allowed_hosts=["seu-dominio.com", "*.seu-dominio.com"]
)

# Adicionar headers de segurança
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response
```

### 4. Implementar Auditoria de Mudanças
Adicionar tabela de auditoria para rastrear todas as modificações em recursos críticos.

---

## Priorização de Correções

1. **URGENTE (Corrigir imediatamente):**
   - Broken Object Level Authorization (BOLA/IDOR) - Endpoints de praises
   - Unrestricted Resource Consumption - Rate limiting no login
   - CORS com wildcard em produção

2. **ALTA PRIORIDADE (Corrigir esta semana):**
   - Broken Authentication - datetime.utcnow() e refresh tokens
   - Broken Object Level Authorization - Endpoint de download

3. **MÉDIA PRIORIDADE (Corrigir este mês):**
   - Mass Assignment - Validação de campos
   - Information Disclosure - Mensagens de erro

---

## Conclusão

O sistema apresenta vulnerabilidades críticas de autorização que permitem violação massiva de dados entre usuários. A implementação de controle de acesso baseado em propriedade de recursos e rate limiting são essenciais antes de qualquer deploy em produção.

**Status Geral:** 🔴 **CRÍTICO** - Não recomendado para produção sem correções urgentes.
