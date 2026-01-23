from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import UUID
import os
import logging
from app.core.dependencies import get_db, get_current_user, get_storage

logger = logging.getLogger(__name__)


def _parse_form_bool(val: Optional[str], default: bool = False) -> bool:
    """Converte string de Form (true/false/1/on/yes) para bool."""
    if val is None or (isinstance(val, str) and val.strip() == ''):
        return default
    return str(val).strip().lower() in ('true', '1', 'on', 'yes')


def _parse_form_optional_bool(val: Optional[str]) -> Optional[bool]:
    """Converte string de Form para Optional[bool]; None ou vazio = None (não alterar)."""
    if val is None or (isinstance(val, str) and val.strip() == ''):
        return None
    return str(val).strip().lower() in ('true', '1', 'on', 'yes')
from app.domain.models.user import User
from app.domain.schemas.praise_material import PraiseMaterialCreate, PraiseMaterialUpdate, PraiseMaterialResponse
from app.application.services.praise_material_service import PraiseMaterialService
from app.infrastructure.database.repositories.material_type_repository import MaterialTypeRepository
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


# IMPORTANTE: Rotas mais específicas DEVEM vir antes das rotas genéricas
# Por isso /{material_id}/download e /{material_id}/download-url vêm antes de /{material_id}

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
    
    # Verifica se é tipo de arquivo (PDF ou AUDIO)
    material_type_repo = MaterialTypeRepository(db)
    material_type = material_type_repo.get_by_id(material.material_type_id)
    if not material_type or material_type.name.lower() not in ['pdf', 'audio']:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Download URL only available for file materials (PDF or AUDIO)"
        )
    
    url = storage.generate_url(material.path, expiration=expiration)
    return {"download_url": url, "expires_in": expiration}


@router.get("/{material_id}/download")
def download_material(
    material_id: UUID,
    request: Request,
    token: Optional[str] = None,
    db: Session = Depends(get_db),
    storage: StorageClient = Depends(get_storage)
):
    """Serve o arquivo do material diretamente (apenas para arquivos)
    
    Aceita token via query parameter (para uso com <a>) ou via Authorization header.
    Retorna o arquivo diretamente usando FileResponse para storage local,
    ou redireciona para URL assinada se for Wasabi.
    """
    from fastapi.responses import RedirectResponse, FileResponse
    from pathlib import Path
    from app.core.security import decode_access_token
    from app.core.config import settings
    import mimetypes
    
    # Tenta validar token via query parameter primeiro
    if token:
        payload = decode_access_token(token)
        if payload is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token"
            )
    else:
        # Se não tiver token na query, tenta obter do header
        authorization: Optional[str] = request.headers.get("Authorization")
        if authorization and authorization.startswith("Bearer "):
            token_from_header = authorization.split(" ")[1]
            payload = decode_access_token(token_from_header)
            if payload is None:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid or expired token"
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required"
            )
    
    service = PraiseMaterialService(db)
    material = service.get_by_id(material_id)
    
    # Verifica se é tipo de arquivo (PDF ou AUDIO)
    material_type_repo = MaterialTypeRepository(db)
    material_type = material_type_repo.get_by_id(material.material_type_id)
    if not material_type or material_type.name.lower() not in ['pdf', 'audio']:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Download only available for file materials (PDF or AUDIO)"
        )
    
    # Se for storage local, serve o arquivo diretamente
    if settings.STORAGE_MODE == "local":
        # No Docker, o volume está montado em /storage/assets
        # Mas a variável STORAGE_LOCAL_PATH pode apontar para o caminho do host
        # Vamos tentar ambos os caminhos
        storage_path = Path(settings.STORAGE_LOCAL_PATH)
        
        # Se o caminho configurado não existir, tenta o caminho padrão do container
        if not storage_path.exists():
            container_path = Path("/storage/assets")
            if container_path.exists():
                storage_path = container_path
        
        file_path = storage_path / material.path
        
        if not file_path.exists():
            # Tenta também o caminho absoluto direto do container
            direct_path = Path("/storage/assets") / material.path
            if direct_path.exists():
                file_path = direct_path
            else:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"File not found at {file_path} or {direct_path}"
                )
        
        # Detecta o tipo MIME do arquivo
        content_type, _ = mimetypes.guess_type(str(file_path))
        if not content_type:
            content_type = "application/octet-stream"
        
        return FileResponse(
            path=str(file_path),
            media_type=content_type,
            filename=file_path.name,
            headers={
                "Content-Disposition": f'inline; filename="{file_path.name}"',
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0"
            }
        )
    else:
        # Se for Wasabi, gera URL assinada e redireciona
        url = storage.generate_url(material.path, expiration=3600)
        return RedirectResponse(url=url, status_code=302)


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
    is_old: Optional[str] = Form("false"),
    old_description: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    storage: StorageClient = Depends(get_storage)
):
    """Faz upload de um arquivo e cria um material de praise"""
    is_old_bool = _parse_form_bool(is_old, default=False)
    old_desc_clean = (old_description or '').strip() or None
    logger.info("upload_praise_material form params: is_old=%s->%s, old_description=%s->%s", is_old, is_old_bool, repr(old_description), repr(old_desc_clean))
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
    
    # Detect material type from file extension
    material_type_repo = MaterialTypeRepository(db)
    file_ext = os.path.splitext(file.filename or "")[1]
    
    # Detect type based on extension
    audio_extensions = {'.mp3', '.wav', '.m4a', '.wma', '.ogg', '.flac'}
    if file_ext.lower() == '.pdf':
        material_type = material_type_repo.get_by_name('pdf')
    elif file_ext.lower() in audio_extensions:
        material_type = material_type_repo.get_by_name('audio')
    else:
        # Default to PDF if extension not recognized
        material_type = material_type_repo.get_by_name('pdf')
    
    if not material_type:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="MaterialType not found in database. Please run seed script."
        )
    
    # Create material with specific ID
    material = PraiseMaterial(
        id=material_id,
        material_kind_id=material_kind_id,
        material_type_id=material_type.id,
        path=file_path,
        praise_id=praise_id,
        is_old=is_old_bool,
        old_description=old_desc_clean
    )
    repo = PraiseMaterialRepository(db)
    material = repo.create(material)
    db.commit()
    db.refresh(material)
    logger.info("upload_praise_material created: id=%s is_old=%s old_description=%s", material.id, material.is_old, repr(material.old_description))
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


@router.put("/{material_id}/upload", response_model=PraiseMaterialResponse)
async def update_praise_material_with_file(
    material_id: UUID,
    file: UploadFile = File(...),
    material_kind_id: Optional[UUID] = Form(None),
    is_old: Optional[str] = Form(None),
    old_description: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    storage: StorageClient = Depends(get_storage)
):
    """Atualiza um material de praise com um novo arquivo"""
    # Form envia strings: is_old chega como "true"/"false"
    is_old_parsed = _parse_form_optional_bool(is_old)
    _old_desc = None if old_description is None else (old_description or '').strip()
    logger.info("update_praise_material_with_file form: is_old=%s->%s, old_description=%s->%s", repr(is_old), is_old_parsed, repr(old_description), repr(_old_desc))
    
    # Resetar o ponteiro do arquivo para o início
    await file.seek(0)
    logger.info("Updating material %s with new file: %s", material_id, file.filename)
    
    service = PraiseMaterialService(db)
    material_before = service.get_by_id(material_id)
    logger.info("Material before update - path: %s is_old: %s old_description: %s", material_before.path, material_before.is_old, repr(material_before.old_description))
    
    material = service.update_with_file(
        material_id=material_id,
        file_obj=file.file,
        file_name=file.filename,
        storage=storage,
        material_kind_id=material_kind_id,
        is_old=is_old_parsed,
        old_description=_old_desc
    )
    db.commit()
    db.refresh(material)
    logger.info("Material after update - path: %s, is_old: %s, old_description: %s", material.path, material.is_old, repr(material.old_description))
    
    # Verificar se o arquivo foi realmente substituído
    if material.path == material_before.path:
        logger.warning("AVISO: O path não mudou após atualização. Pode ser que o arquivo não foi substituído no storage.")
    else:
        logger.info("Path atualizado de %s para %s", material_before.path, material.path)
    
    return material


@router.put("/{material_id}", response_model=PraiseMaterialResponse)
def update_praise_material(
    material_id: UUID,
    material_data: PraiseMaterialUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Atualiza um material de praise"""
    logger.info("update_praise_material JSON: id=%s is_old=%s old_description=%s", material_id, material_data.is_old, repr(material_data.old_description))
    service = PraiseMaterialService(db)
    material = service.update(material_id, material_data)
    logger.info("update_praise_material after: is_old=%s old_description=%s", material.is_old, repr(material.old_description))
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
    material_type_repo = MaterialTypeRepository(db)
    material_type = material_type_repo.get_by_id(material.material_type_id)
    if material_type and material_type.name.lower() in ['pdf', 'audio']:
        try:
            storage.delete_file(material.path)
        except Exception as e:
            # Log error but don't fail the deletion
            pass
    
    service.delete(material_id)
    return None






