from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.v1.routes import auth, praise_tags, material_kinds, praise_materials, praises
from app.infrastructure.database.database import engine, Base

app = FastAPI(
    title="Praise Manager API",
    description="API para gerenciamento de praises, materiais e tags",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(praise_tags.router, prefix="/api/v1/praise-tags", tags=["Praise Tags"])
app.include_router(material_kinds.router, prefix="/api/v1/material-kinds", tags=["Material Kinds"])
app.include_router(praise_materials.router, prefix="/api/v1/praise-materials", tags=["Praise Materials"])
app.include_router(praises.router, prefix="/api/v1/praises", tags=["Praises"])


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






