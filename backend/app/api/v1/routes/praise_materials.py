from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Request, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import UUID
import os
import logging
from app.core.dependencies import get_db, get_current_user, get_current_user_optional, get_storage
from app.core.rate_limit_helpers import apply_rate_limit

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
    request: Request,
    skip: int = 0,
    limit: int = 100,
    praise_id: Optional[UUID] = None,
    is_old: Optional[bool] = None,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """Lista todos os materiais de praise.
    
    Rota pública: pode ser acessada sem autenticação, mas com rate limiting.
    Usuários autenticados têm acesso ilimitado.
    """
    if current_user is None:
        apply_rate_limit(request, "600/minute")
    
    service = PraiseMaterialService(db)
    if praise_id:
        materials = service.get_by_praise_id(praise_id, is_old=is_old)
    else:
        materials = service.get_all(skip=skip, limit=limit)
    return materials


@router.get("/batch", response_model=List[PraiseMaterialResponse])
def batch_search_materials(
    request: Request,
    tag_ids: Optional[str] = None,  # Comma-separated UUIDs
    material_kind_ids: Optional[str] = None,  # Comma-separated UUIDs
    operation: str = "union",  # "union" ou "intersection"
    is_old: Optional[bool] = None,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """Busca materiais por critérios múltiplos (tags e material kinds).
    
    Rota pública: pode ser acessada sem autenticação, mas com rate limiting.
    Usuários autenticados têm acesso ilimitado.
    
    Args:
        tag_ids: IDs de tags separados por vírgula
        material_kind_ids: IDs de material kinds separados por vírgula
        operation: "union" (OU) ou "intersection" (E)
        is_old: Filtrar por materiais antigos
    """
    if current_user is None:
        apply_rate_limit(request, "600/minute")
    
    service = PraiseMaterialService(db)
    
    # Parse tag_ids
    parsed_tag_ids = None
    if tag_ids:
        try:
            parsed_tag_ids = [UUID(tid.strip()) for tid in tag_ids.split(',')]
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid tag_ids format. Expected comma-separated UUIDs."
            )
    
    # Parse material_kind_ids
    parsed_material_kind_ids = None
    if material_kind_ids:
        try:
            parsed_material_kind_ids = [UUID(mkid.strip()) for mkid in material_kind_ids.split(',')]
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid material_kind_ids format. Expected comma-separated UUIDs."
            )
    
    if operation not in ["union", "intersection"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="operation must be 'union' or 'intersection'"
        )
    
    materials = service.get_by_criteria(
        tag_ids=parsed_tag_ids,
        material_kind_ids=parsed_material_kind_ids,
        operation=operation,
        is_old=is_old,
    )
    
    return materials


@router.get("/batch-download")
def batch_download_materials(
    tag_ids: Optional[str] = Query(None, description="IDs de tags separados por vírgula"),
    material_kind_ids: Optional[str] = Query(None, description="IDs de material kinds separados por vírgula"),
    operation: str = Query("union", description="union ou intersection"),
    max_zip_size_mb: int = Query(100, ge=10, le=10000, description="Tamanho máximo por ZIP em MB (10000 = ZIP único)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    storage: StorageClient = Depends(get_storage),
):
    """Baixa materiais por critérios (tags, material kinds) em formato ZIP.
    
    Divide em múltiplos ZIPs quando exceder max_zip_size_mb. Use 10000 para ZIP único.
    Exige pelo menos tag_ids ou material_kind_ids.
    """
    import io
    import zipfile
    import os

    parsed_tag_ids = None
    if tag_ids:
        try:
            parsed_tag_ids = [UUID(tid.strip()) for tid in tag_ids.split(',')]
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid tag_ids format. Expected comma-separated UUIDs."
            )

    parsed_material_kind_ids = None
    if material_kind_ids:
        try:
            parsed_material_kind_ids = [UUID(mkid.strip()) for mkid in material_kind_ids.split(',')]
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid material_kind_ids format. Expected comma-separated UUIDs."
            )

    if not parsed_tag_ids and not parsed_material_kind_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide at least tag_ids or material_kind_ids"
        )

    if operation not in ["union", "intersection"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="operation must be 'union' or 'intersection'"
        )

    service = PraiseMaterialService(db)
    materials = service.get_by_criteria(
        tag_ids=parsed_tag_ids,
        material_kind_ids=parsed_material_kind_ids,
        operation=operation,
    )

    material_type_repo = MaterialTypeRepository(db)
    materials_to_download = []
    for material in materials:
        material_type = material_type_repo.get_by_id(material.material_type_id)
        if not material_type:
            continue
        if material_type.name.lower() in ['pdf', 'audio']:
            materials_to_download.append({
                'material': material,
                'praise': material.praise,
                'material_type': material_type,
                'material_kind': material.material_kind,
            })

    if not materials_to_download:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No file materials found for the given criteria"
        )

    max_zip_size_bytes = max_zip_size_mb * 1024 * 1024
    master_zip_buffer = io.BytesIO()

    with zipfile.ZipFile(master_zip_buffer, 'w', zipfile.ZIP_DEFLATED) as master_zip:
        current_zip_buffer = io.BytesIO()
        current_zip_size = 0
        current_part = 1
        current_zip_file = None
        file_count = 0
        skipped_materials = []
        zip_parts_info = []

        for item in materials_to_download:
            material = item['material']
            praise = item['praise']
            material_type = item['material_type']
            material_kind = item['material_kind']

            try:
                if not storage.file_exists(material.path):
                    logger.warning(f"File does not exist: {material.path}")
                    skipped_materials.append({
                        'material_id': str(material.id),
                        'praise_name': praise.name,
                        'path': material.path,
                        'reason': "File does not exist in storage"
                    })
                    continue

                file_content = storage.download_file(material.path)
                if len(file_content) == 0:
                    logger.warning(f"Downloaded file is empty: {material.path}")
                    skipped_materials.append({
                        'material_id': str(material.id),
                        'praise_name': praise.name,
                        'path': material.path,
                        'reason': "Downloaded file is empty"
                    })
                    continue

                if current_zip_file is None or (current_zip_size + len(file_content) > max_zip_size_bytes and current_zip_size > 0):
                    if current_zip_file is not None:
                        current_zip_file.close()
                        current_zip_buffer.seek(0)
                        part_filename = f"part_{current_part:03d}.zip"
                        master_zip.writestr(part_filename, current_zip_buffer.read())
                        zip_parts_info.append({
                            'filename': part_filename,
                            'size': current_zip_size,
                            'file_count': file_count
                        })
                        logger.info(f"Created ZIP part {current_part} with {file_count} files ({current_zip_size / 1024 / 1024:.2f} MB)")

                    current_zip_buffer = io.BytesIO()
                    current_zip_file = zipfile.ZipFile(current_zip_buffer, 'w', zipfile.ZIP_DEFLATED)
                    current_zip_size = 0
                    current_part += 1
                    file_count = 0

                file_ext = os.path.splitext(material.path)[1] or ('.pdf' if material_type.name.lower() == 'pdf' else '.mp3')
                praise_name_safe = "".join(c if c.isalnum() or c in (' ', '-', '_') else '_' for c in praise.name)
                material_kind_name = material_kind.name if material_kind else "material"
                material_kind_name_safe = "".join(c if c.isalnum() or c in (' ', '-', '_') else '_' for c in material_kind_name)
                zip_filename = f"{praise_name_safe}/{material_kind_name_safe}/{material.id}{file_ext}"

                current_zip_file.writestr(zip_filename, file_content)
                current_zip_size += len(file_content)
                file_count += 1

            except Exception as e:
                logger.error(f"Error processing material {material.id}: {str(e)}", exc_info=True)
                skipped_materials.append({
                    'material_id': str(material.id),
                    'praise_name': praise.name,
                    'path': material.path,
                    'reason': f"Error: {str(e)}"
                })
                continue

        if current_zip_file is not None:
            current_zip_file.close()
            current_zip_buffer.seek(0)
            part_filename = f"part_{current_part:03d}.zip"
            master_zip.writestr(part_filename, current_zip_buffer.read())
            zip_parts_info.append({
                'filename': part_filename,
                'size': current_zip_size,
                'file_count': file_count
            })
            logger.info(f"Created ZIP part {current_part} with {file_count} files ({current_zip_size / 1024 / 1024:.2f} MB)")

        readme_content = "Download de Materiais em Lote\n"
        readme_content += "===========================\n\n"
        readme_content += f"Total de arquivos: {sum(info['file_count'] for info in zip_parts_info)}\n"
        readme_content += f"Total de ZIPs criados: {len(zip_parts_info)}\n"
        readme_content += f"Tamanho máximo por ZIP: {max_zip_size_mb} MB\n\n"
        if zip_parts_info:
            readme_content += "ZIPs incluídos:\n"
            for info in zip_parts_info:
                readme_content += f"- {info['filename']}: {info['file_count']} arquivos ({info['size'] / 1024 / 1024:.2f} MB)\n"
        if skipped_materials:
            readme_content += f"\nMateriais não incluídos ({len(skipped_materials)}):\n"
            for mat in skipped_materials:
                readme_content += f"- {mat['praise_name']} - Material ID {mat['material_id']}: {mat.get('reason', 'Unknown')}\n"

        master_zip.writestr("README.txt", readme_content.encode('utf-8'))

    master_zip_buffer.seek(0)
    zip_filename = "materials_batch.zip"

    return StreamingResponse(
        io.BytesIO(master_zip_buffer.read()),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{zip_filename}"',
            "Content-Type": "application/zip"
        }
    )


# IMPORTANTE: Rotas mais específicas DEVEM vir antes das rotas genéricas
# Por isso /{material_id}/download e /{material_id}/download-url vêm antes de /{material_id}

@router.get("/{material_id}/download-url")
def get_download_url(
    request: Request,
    material_id: UUID,
    expiration: int = 3600,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
    storage: StorageClient = Depends(get_storage)
):
    """Gera uma URL para download do material (apenas para arquivos).
    
    Rota pública: pode ser acessada sem autenticação, mas com rate limiting rigoroso.
    Usuários autenticados têm acesso ilimitado.
    """
    if current_user is None:
        apply_rate_limit(request, "40/minute")
    
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
    db: Session = Depends(get_db),
    storage: StorageClient = Depends(get_storage),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """Serve o arquivo do material diretamente (apenas para arquivos).
    
    Suporta HTTP Range requests para seek em áudio/vídeo no navegador.
    
    Rota pública: pode ser acessada sem autenticação, mas com rate limiting.
    Usuários autenticados têm acesso ilimitado.
    """
    from fastapi.responses import RedirectResponse, Response
    from pathlib import Path
    from app.core.config import settings
    import mimetypes
    
    if current_user is None:
        apply_rate_limit(request, "40/minute")
    
    service = PraiseMaterialService(db)
    material = service.get_by_id(material_id)
    
    material_type_repo = MaterialTypeRepository(db)
    material_type = material_type_repo.get_by_id(material.material_type_id)
    if not material_type or material_type.name.lower() not in ['pdf', 'audio']:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Download only available for file materials (PDF or AUDIO)"
        )
    
    if settings.STORAGE_MODE == "local":
        storage_path = Path(settings.STORAGE_LOCAL_PATH)
        if not storage_path.exists():
            container_path = Path("/storage/assets")
            if container_path.exists():
                storage_path = container_path
        
        file_path = storage_path / material.path
        
        if not file_path.exists():
            direct_path = Path("/storage/assets") / material.path
            if direct_path.exists():
                file_path = direct_path
            else:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"File not found at {file_path} or {direct_path}"
                )
        
        content_type, _ = mimetypes.guess_type(str(file_path))
        if not content_type:
            content_type = "application/octet-stream"
        
        file_size = file_path.stat().st_size
        range_header = request.headers.get("range")
        
        base_headers = {
            "Accept-Ranges": "bytes",
            "Content-Disposition": f'inline; filename="{file_path.name}"',
            "Cache-Control": "public, max-age=3600",
        }
        
        if range_header:
            range_spec = range_header.strip().lower()
            if range_spec.startswith("bytes="):
                range_spec = range_spec[6:]
                parts = range_spec.split("-", 1)
                start = int(parts[0]) if parts[0] else 0
                end = int(parts[1]) if len(parts) > 1 and parts[1] else file_size - 1
                
                if start >= file_size:
                    return Response(
                        status_code=416,
                        headers={"Content-Range": f"bytes */{file_size}"},
                    )
                
                end = min(end, file_size - 1)
                content_length = end - start + 1
                
                with open(file_path, "rb") as f:
                    f.seek(start)
                    data = f.read(content_length)
                
                base_headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"
                base_headers["Content-Length"] = str(content_length)
                
                return Response(
                    content=data,
                    status_code=206,
                    media_type=content_type,
                    headers=base_headers,
                )
        
        with open(file_path, "rb") as f:
            data = f.read()
        
        base_headers["Content-Length"] = str(file_size)
        
        return Response(
            content=data,
            status_code=200,
            media_type=content_type,
            headers=base_headers,
        )
    else:
        url = storage.generate_url(material.path, expiration=3600)
        return RedirectResponse(url=url, status_code=302)


@router.get("/{material_id}", response_model=PraiseMaterialResponse)
def get_praise_material(
    request: Request,
    material_id: UUID,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """Obtém um material de praise por ID.
    
    Rota pública: pode ser acessada sem autenticação, mas com rate limiting.
    Usuários autenticados têm acesso ilimitado.
    """
    if current_user is None:
        apply_rate_limit(request, "40/minute")
    
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
    await file.seek(0)
    is_old_bool = _parse_form_bool(is_old, default=False)
    old_desc_clean = (old_description or '').strip() or None
    logger.info("upload_praise_material form params: is_old=%s->%s, old_description=%s->%s", is_old, is_old_bool, repr(old_description), repr(old_desc_clean))
    service = PraiseMaterialService(db)
    material = service.create_with_upload(
        file_obj=file.file,
        file_name=file.filename or "file",
        material_kind_id=material_kind_id,
        praise_id=praise_id,
        storage=storage,
        is_old=is_old_bool,
        old_description=old_desc_clean,
    )
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






