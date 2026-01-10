from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import UUID
from app.core.dependencies import get_db, get_current_user, get_storage
from app.domain.models.user import User
from app.domain.schemas.praise_material import PraiseMaterialCreate, PraiseMaterialUpdate, PraiseMaterialResponse
from app.domain.models.praise_material import MaterialType
from app.application.services.praise_material_service import PraiseMaterialService
from app.infrastructure.storage.storage_client import StorageClient
import mimetypes

router = APIRouter()


@router.get("/", response_model=List[PraiseMaterialResponse])
def list_praise_materials(
    skip: int = 0,
    limit: int = 100,
    praise_id: Optional[UUID] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lista todos os materiais de praise"""
    service = PraiseMaterialService(db)
    if praise_id:
        materials = service.get_by_praise_id(praise_id)
    else:
        materials = service.get_all(skip=skip, limit=limit)
    return materials


@router.get("/{material_id}", response_model=PraiseMaterialResponse)
def get_praise_material(
    material_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtém um material de praise por ID"""
    service = PraiseMaterialService(db)
    material = service.get_by_id(material_id)
    return material


@router.post("/upload", response_model=PraiseMaterialResponse, status_code=status.HTTP_201_CREATED)
async def upload_praise_material(
    file: UploadFile = File(...),
    material_kind_id: UUID = Form(...),
    praise_id: UUID = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    storage: StorageClient = Depends(get_storage)
):
    """Faz upload de um arquivo e cria um material de praise"""
    # Generate material ID first
    from uuid import uuid4
    material_id = uuid4()
    
    # Upload file to storage (Wasabi or Local)
    content_type, _ = mimetypes.guess_type(file.filename)
    file_path = storage.upload_file(
        file.file,
        file.filename,
        content_type=content_type,
        folder=f"praises/{praise_id}",
        material_id=material_id
    )
    
    # Create material record with the generated ID
    # Use repository directly to set custom ID
    from app.domain.models.praise_material import PraiseMaterial
    from app.infrastructure.database.repositories.praise_material_repository import PraiseMaterialRepository
    from app.infrastructure.database.repositories.material_kind_repository import MaterialKindRepository
    from app.infrastructure.database.repositories.praise_repository import PraiseRepository
    
    # Validate material_kind exists
    material_kind_repo = MaterialKindRepository(db)
    material_kind = material_kind_repo.get_by_id(material_kind_id)
    if not material_kind:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"MaterialKind with id {material_kind_id} not found"
        )
    
    # Validate praise exists
    praise_repo = PraiseRepository(db)
    praise = praise_repo.get_by_id(praise_id)
    if not praise:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Praise with id {praise_id} not found"
        )
    
    # Create material with specific ID
    material = PraiseMaterial(
        id=material_id,
        material_kind_id=material_kind_id,
        path=file_path,
        type=MaterialType.FILE,
        praise_id=praise_id
    )
    repo = PraiseMaterialRepository(db)
    material = repo.create(material)
    db.commit()
    db.refresh(material)
    return material


@router.post("/", response_model=PraiseMaterialResponse, status_code=status.HTTP_201_CREATED)
def create_praise_material(
    material_data: PraiseMaterialCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Cria um novo material de praise (para links externos, textos, etc.)"""
    service = PraiseMaterialService(db)
    material = service.create(material_data)
    return material


@router.put("/{material_id}", response_model=PraiseMaterialResponse)
def update_praise_material(
    material_id: UUID,
    material_data: PraiseMaterialUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Atualiza um material de praise"""
    service = PraiseMaterialService(db)
    material = service.update(material_id, material_data)
    return material


@router.delete("/{material_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_praise_material(
    material_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    storage: StorageClient = Depends(get_storage)
):
    """Deleta um material de praise"""
    service = PraiseMaterialService(db)
    material = service.get_by_id(material_id)
    
    # Delete file from storage (Wasabi or Local) if it's a file type
    if material.type == MaterialType.FILE:
        try:
            storage.delete_file(material.path)
        except Exception as e:
            # Log error but don't fail the deletion
            pass
    
    service.delete(material_id)
    return None


@router.get("/{material_id}/download-url")
def get_download_url(
    material_id: UUID,
    expiration: int = 3600,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    storage: StorageClient = Depends(get_storage)
):
    """Gera uma URL para download do material (apenas para arquivos)"""
    service = PraiseMaterialService(db)
    material = service.get_by_id(material_id)
    
    if material.type != MaterialType.FILE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Download URL only available for file materials"
        )
    
    url = storage.generate_url(material.path, expiration=expiration)
    return {"download_url": url, "expires_in": expiration}






