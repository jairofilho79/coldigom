from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from typing import Tuple
from pathlib import Path
from app.core.config import settings
from app.api.v1.routes import auth, praise_tags, material_kinds, material_types, praise_materials, praises, languages, translations, user_preferences
from app.infrastructure.database.database import engine, Base

app = FastAPI(
    title="Praise Manager API",
    description="API para gerenciamento de praises, materiais e tags",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS - IMPORTANTE: deve ser o primeiro middleware para garantir headers em todos os casos
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Servir arquivos estáticos de /assets/
# IMPORTANTE: StaticFiles deve ser montado ANTES dos routers para evitar conflitos
storage_path = Path(settings.STORAGE_LOCAL_PATH)
storage_path.mkdir(parents=True, exist_ok=True)
try:
    app.mount("/assets", StaticFiles(directory=str(storage_path)), name="assets")
    print(f"Static files mounted at /assets from {storage_path}")
except Exception as e:
    # Se o diretório não existir ou houver erro, apenas loga mas não quebra a aplicação
    print(f"Warning: Could not mount static files directory: {e}")

# Include routers
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(praise_tags.router, prefix="/api/v1/praise-tags", tags=["Praise Tags"])
app.include_router(material_kinds.router, prefix="/api/v1/material-kinds", tags=["Material Kinds"])
app.include_router(material_types.router, prefix="/api/v1/material-types", tags=["Material Types"])
app.include_router(praise_materials.router, prefix="/api/v1/praise-materials", tags=["Praise Materials"])
app.include_router(praises.router, prefix="/api/v1/praises", tags=["Praises"])
app.include_router(languages.router, prefix="/api/v1/languages", tags=["Languages"])
app.include_router(translations.router, prefix="/api/v1/translations", tags=["Translations"])
app.include_router(user_preferences.router, prefix="/api/v1/user-preferences", tags=["User Preferences"])


# Helper function para verificar origem permitida
def is_origin_allowed(origin: str) -> Tuple[bool, str]:
    """Verifica se a origem é permitida e retorna o header apropriado"""
    if not origin:
        return False, ""
    
    cors_origins = settings.CORS_ORIGINS
    if isinstance(cors_origins, list):
        if "*" in cors_origins:
            return True, "*"
        if origin in cors_origins:
            return True, origin
    elif cors_origins == "*":
        return True, "*"
    
    return False, ""


# Exception handlers para garantir CORS mesmo em erros
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """Handler para erros HTTP, garantindo headers CORS"""
    origin = request.headers.get("origin")
    headers = {}
    allowed, allowed_origin = is_origin_allowed(origin or "")
    if allowed:
        headers["Access-Control-Allow-Origin"] = allowed_origin
        headers["Access-Control-Allow-Credentials"] = "true"
    
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=headers
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handler para erros de validação, garantindo headers CORS"""
    origin = request.headers.get("origin")
    headers = {}
    allowed, allowed_origin = is_origin_allowed(origin or "")
    if allowed:
        headers["Access-Control-Allow-Origin"] = allowed_origin
        headers["Access-Control-Allow-Credentials"] = "true"
    
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": exc.errors()},
        headers=headers
    )


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
    print(f"Internal Server Error: {exc}")
    traceback.print_exc()
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error"},
        headers=headers
    )


@app.on_event("startup")
async def startup_event():
    # Create tables (migrations should handle this, but this is a fallback)
    pass


@app.get("/")
async def root():
    return {"message": "Praise Manager API", "version": "1.0.0"}


@app.get("/health")
async def health():
    return {"status": "healthy"}






