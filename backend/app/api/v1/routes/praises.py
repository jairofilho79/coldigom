from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import UUID
import zipfile
import io
import os
from app.core.dependencies import get_db, get_current_user, get_current_user_optional, get_storage
from app.core.rate_limit_helpers import apply_rate_limit
from app.domain.models.user import User
from app.domain.schemas.praise import PraiseCreate, PraiseUpdate, PraiseResponse, ReviewActionRequest
from app.application.services.praise_service import PraiseService
from app.infrastructure.storage.storage_client import StorageClient
from app.infrastructure.database.repositories.material_type_repository import MaterialTypeRepository
from app.infrastructure.database.repositories.material_kind_repository import MaterialKindRepository

router = APIRouter()


@router.get("/", response_model=List[PraiseResponse])
def list_praises(
    request: Request,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    name: Optional[str] = Query(None),
    tag_id: Optional[UUID] = Query(None),
    sort_by: str = Query("name", description="Ordenar por: name ou number"),
    sort_direction: str = Query("asc", description="Direção: asc ou desc"),
    no_number: str = Query("last", description="Praises sem número: first, last ou hide (apenas quando sort_by=number)"),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """Lista todos os praises com paginação, busca por nome/tag e ordenação no banco.
    
    Rota pública: pode ser acessada sem autenticação, mas com rate limiting.
    Usuários autenticados têm acesso ilimitado.
    """
    # Aplicar rate limiting (usuários autenticados podem ter limites maiores depois)
    apply_rate_limit(request, "100/hour")
    
    service = PraiseService(db)
    praises = service.get_all(
        skip=skip,
        limit=limit,
        name=name,
        tag_id=tag_id,
        sort_by=sort_by,
        sort_direction=sort_direction,
        no_number=no_number,
    )
    return praises


@router.get("/download-by-material-kind")
def download_praises_by_material_kind(
    request: Request,
    material_kind_id: UUID = Query(..., description="ID do material kind para filtrar materiais"),
    tag_id: Optional[UUID] = Query(None, description="ID da tag para filtrar praises (opcional)"),
    max_zip_size_mb: int = Query(100, ge=10, le=1000, description="Tamanho máximo de cada ZIP em MB (padrão: 100)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    storage: StorageClient = Depends(get_storage)
):
    """Baixa materiais de um material_kind específico de múltiplos praises em formato ZIP
    
    Filtra praises por tag (se fornecido) e agrupa materiais do material_kind especificado.
    Divide em múltiplos ZIPs quando exceder o tamanho máximo especificado.
    Retorna um ZIP mestre contendo os ZIPs menores.
    """
    # Rate limiting usando limiter do app.state
    limiter = request.app.state.limiter
    limiter.limit("10/hour")(request)
    
    import logging
    from app.core.config import settings
    
    logger = logging.getLogger(__name__)
    
    # Validar que material_kind existe
    material_kind_repo = MaterialKindRepository(db)
    material_kind = material_kind_repo.get_by_id(material_kind_id)
    if not material_kind:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"MaterialKind with id {material_kind_id} not found"
        )
    
    # Buscar praises (filtrados por tag se fornecido)
    service = PraiseService(db)
    # Usar limite reduzido para evitar sobrecarga
    praises = service.get_all(skip=0, limit=1000, tag_id=tag_id)
    
    logger.info(f"Found {len(praises)} praises (tag_id={tag_id}) for material_kind {material_kind_id}")
    
    # Buscar tipo de material para filtrar apenas arquivos
    material_type_repo = MaterialTypeRepository(db)
    
    # Coletar todos os materiais relevantes
    materials_to_download = []
    for praise in praises:
        for material in praise.materials:
            # Filtrar apenas materiais do material_kind especificado
            if material.material_kind_id != material_kind_id:
                continue
            
            # Verificar se é tipo arquivo
            material_type = material_type_repo.get_by_id(material.material_type_id)
            if not material_type:
                continue
            
            material_type_name = material_type.name.lower()
            if material_type_name in ['pdf', 'audio']:
                materials_to_download.append({
                    'material': material,
                    'praise': praise,
                    'material_type': material_type
                })
    
    logger.info(f"Found {len(materials_to_download)} file materials to download")
    
    if not materials_to_download:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No file materials found for material_kind {material_kind_id}"
        )
    
    # Calcular tamanho máximo em bytes
    max_zip_size_bytes = max_zip_size_mb * 1024 * 1024
    
    # Criar ZIP mestre em memória
    master_zip_buffer = io.BytesIO()
    
    with zipfile.ZipFile(master_zip_buffer, 'w', zipfile.ZIP_DEFLATED) as master_zip:
        # Lista para armazenar informações dos ZIPs criados
        zip_parts_info = []
        
        # Processar materiais em partes (ZIPs menores)
        current_zip_buffer = io.BytesIO()
        current_zip_size = 0
        current_part = 1
        current_zip_file = None
        file_count = 0
        skipped_materials = []
        
        for item in materials_to_download:
            material = item['material']
            praise = item['praise']
            material_type = item['material_type']
            
            try:
                # Verificar se arquivo existe
                if not storage.file_exists(material.path):
                    logger.warning(f"File does not exist: {material.path}")
                    skipped_materials.append({
                        'material_id': str(material.id),
                        'praise_name': praise.name,
                        'path': material.path,
                        'reason': "File does not exist in storage"
                    })
                    continue
                
                # Baixar arquivo
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
                
                # Verificar se precisa criar novo ZIP
                if current_zip_file is None or (current_zip_size + len(file_content) > max_zip_size_bytes and current_zip_size > 0):
                    # Fechar ZIP atual se existir
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
                    
                    # Criar novo ZIP
                    current_zip_buffer = io.BytesIO()
                    current_zip_file = zipfile.ZipFile(current_zip_buffer, 'w', zipfile.ZIP_DEFLATED)
                    current_zip_size = 0
                    current_part += 1
                    file_count = 0
                
                # Obter extensão do arquivo
                file_ext = os.path.splitext(material.path)[1] or ('.pdf' if material_type.name.lower() == 'pdf' else '.mp3')
                
                # Criar nome do arquivo no ZIP: {praise_name}/{material_kind_name}/arquivo.ext
                praise_name_safe = "".join(c if c.isalnum() or c in (' ', '-', '_') else '_' for c in praise.name)
                material_kind_name_safe = "".join(c if c.isalnum() or c in (' ', '-', '_') else '_' for c in material_kind.name)
                zip_filename = f"{praise_name_safe}/{material_kind_name_safe}/{material.id}{file_ext}"
                
                # Adicionar ao ZIP atual
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
        
        # Fechar último ZIP se existir
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
        
        # Criar README.txt no ZIP mestre
        readme_content = f"Download de Materiais por Material Kind\n"
        readme_content += f"==========================================\n\n"
        readme_content += f"Material Kind: {material_kind.name}\n"
        if tag_id:
            # Buscar nome da tag
            from app.infrastructure.database.repositories.praise_tag_repository import PraiseTagRepository
            tag_repo = PraiseTagRepository(db)
            tag = tag_repo.get_by_id(tag_id)
            if tag:
                readme_content += f"Tag filtrada: {tag.name}\n"
        readme_content += f"\nTotal de arquivos: {sum(info['file_count'] for info in zip_parts_info)}\n"
        readme_content += f"Total de ZIPs criados: {len(zip_parts_info)}\n"
        readme_content += f"Tamanho máximo por ZIP: {max_zip_size_mb} MB\n\n"
        
        if zip_parts_info:
            readme_content += "ZIPs incluídos:\n"
            for info in zip_parts_info:
                readme_content += f"- {info['filename']}: {info['file_count']} arquivos ({info['size'] / 1024 / 1024:.2f} MB)\n"
        
        if skipped_materials:
            readme_content += f"\nMateriais que não puderam ser incluídos ({len(skipped_materials)}):\n"
            for mat in skipped_materials:
                readme_content += f"- {mat['praise_name']} - Material ID {mat['material_id']}: {mat.get('reason', 'Unknown reason')}\n"
        
        master_zip.writestr("README.txt", readme_content.encode('utf-8'))
    
    # Preparar resposta
    master_zip_buffer.seek(0)
    
    # Criar nome do arquivo ZIP mestre
    material_kind_name_safe = "".join(c if c.isalnum() or c in (' ', '-', '_') else '_' for c in material_kind.name)
    zip_filename = f"materials_{material_kind_name_safe}.zip"
    
    return StreamingResponse(
        io.BytesIO(master_zip_buffer.read()),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{zip_filename}"',
            "Content-Type": "application/zip"
        }
    )


@router.get("/{praise_id}/download-zip")
def download_praise_zip(
    request: Request,
    praise_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    storage: StorageClient = Depends(get_storage)
):
    """Baixa um praise completo em formato ZIP com todos os materiais de arquivo"""
    # Rate limiting usando limiter do app.state
    limiter = request.app.state.limiter
    limiter.limit("20/hour")(request)
    
    import logging
    from app.core.config import settings
    
    logger = logging.getLogger(__name__)
    
    # Log da configuração de storage
    logger.info(f"Storage mode: {settings.STORAGE_MODE}, Local path: {settings.STORAGE_LOCAL_PATH}")
    
    # Buscar praise e materiais
    service = PraiseService(db)
    praise = service.get_by_id(praise_id)
    
    # Garantir que os materiais estão carregados (refresh se necessário)
    # O repository já carrega com joinedload, mas vamos garantir
    db.refresh(praise, ['materials'])
    
    # Buscar tipo de material para filtrar apenas arquivos
    material_type_repo = MaterialTypeRepository(db)
    
    # Log inicial: listar todos os materiais encontrados
    logger.info(f"Processing {len(praise.materials)} materials for praise {praise_id} ({praise.name})")
    
    # Log detalhado de cada material encontrado
    for idx, material in enumerate(praise.materials):
        logger.info(f"Material {idx+1}/{len(praise.materials)}: ID={material.id}, path={material.path}, type_id={material.material_type_id}, kind_id={material.material_kind_id}")
    
    # Criar ZIP em memória
    zip_buffer = io.BytesIO()
    
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        file_count = 0
        non_file_materials = []
        skipped_materials = []
        
        # Processar cada material
        for material in praise.materials:
            logger.info(f"Processing material {material.id}, path: {material.path}, type_id: {material.material_type_id}")
            
            material_type = material_type_repo.get_by_id(material.material_type_id)
            
            if not material_type:
                logger.warning(f"Material type not found for material {material.id} (type_id: {material.material_type_id})")
                skipped_materials.append({
                    'material_id': str(material.id),
                    'reason': f"Material type not found (type_id: {material.material_type_id})"
                })
                continue
            
            material_type_name = material_type.name.lower()
            logger.info(f"Material {material.id} has type: {material_type.name} (normalized: {material_type_name})")
            
            # Se for arquivo (PDF ou AUDIO), baixar e adicionar ao ZIP
            if material_type_name in ['pdf', 'audio']:
                try:
                    logger.info(f"Attempting to download file for material {material.id} from path: {material.path}")
                    
                    # Verificar se arquivo existe no storage ANTES de tentar baixar
                    file_exists = storage.file_exists(material.path)
                    logger.info(f"File exists check for {material.path}: {file_exists}")
                    
                    if not file_exists:
                        logger.warning(f"✗ File does not exist in storage: {material.path} for material {material.id}")
                        skipped_materials.append({
                            'material_id': str(material.id),
                            'path': material.path,
                            'reason': "File does not exist in storage"
                        })
                        continue
                    
                    # Baixar arquivo do storage
                    logger.info(f"Downloading file from storage: {material.path}")
                    file_content = storage.download_file(material.path)
                    logger.info(f"✓ Downloaded {len(file_content)} bytes for material {material.id}")
                    
                    if len(file_content) == 0:
                        logger.warning(f"Downloaded file is empty for material {material.id}, path: {material.path}")
                        skipped_materials.append({
                            'material_id': str(material.id),
                            'path': material.path,
                            'reason': "Downloaded file is empty"
                        })
                        continue
                    
                    # Obter nome do material_kind para nomear o arquivo
                    material_kind_name = "Unknown"
                    if material.material_kind:
                        material_kind_name = material.material_kind.name
                    else:
                        # Buscar material_kind se não estiver carregado
                        from app.infrastructure.database.repositories.material_kind_repository import MaterialKindRepository
                        material_kind_repo = MaterialKindRepository(db)
                        material_kind = material_kind_repo.get_by_id(material.material_kind_id)
                        if material_kind:
                            material_kind_name = material_kind.name
                    
                    # Obter extensão do arquivo original
                    file_ext = os.path.splitext(material.path)[1] or ('.pdf' if material_type_name == 'pdf' else '.mp3')
                    
                    # Criar nome do arquivo no ZIP: {material_kind_name}_{material_id}.{ext}
                    # Sanitizar nome do material_kind para evitar problemas com caracteres especiais
                    safe_material_kind_name = "".join(c if c.isalnum() or c in (' ', '-', '_') else '_' for c in material_kind_name)
                    zip_filename = f"{safe_material_kind_name}_{material.id}{file_ext}"
                    
                    # Adicionar ao ZIP
                    zip_file.writestr(zip_filename, file_content)
                    file_count += 1
                    logger.info(f"✓ Added file to ZIP: {zip_filename} ({len(file_content)} bytes)")
                    
                except Exception as e:
                    logger.error(f"✗ Error downloading file {material.path} for material {material.id}: {str(e)}", exc_info=True)
                    skipped_materials.append({
                        'material_id': str(material.id),
                        'path': material.path,
                        'reason': f"Error: {str(e)}"
                    })
                    # Continuar com outros arquivos mesmo se um falhar
                    continue
            else:
                # Para materiais não-arquivo, adicionar informações ao README
                logger.info(f"Material {material.id} is not a file type ({material_type.name}), skipping download")
                non_file_materials.append({
                    'material_kind': material.material_kind.name if material.material_kind else "Unknown",
                    'material_type': material_type.name,
                    'path': material.path
                })
        
        logger.info(f"Total files added to ZIP: {file_count}")
        if skipped_materials:
            logger.warning(f"Skipped {len(skipped_materials)} materials: {skipped_materials}")
        
        # Criar arquivo README.txt com informações do praise e links externos
        readme_content = f"Praise: {praise.name}\n"
        if praise.number:
            readme_content += f"Número: {praise.number}\n"
        readme_content += f"\nMateriais de arquivo incluídos: {file_count}\n"
        
        if skipped_materials:
            readme_content += f"\nMateriais que não puderam ser incluídos ({len(skipped_materials)}):\n"
            for mat in skipped_materials:
                readme_content += f"- Material ID {mat['material_id']}: {mat.get('reason', 'Unknown reason')}\n"
                if 'path' in mat:
                    readme_content += f"  Path: {mat['path']}\n"
        
        if non_file_materials:
            readme_content += "\nMateriais externos (não incluídos no ZIP):\n"
            for mat in non_file_materials:
                readme_content += f"- {mat['material_kind']} ({mat['material_type']}): {mat['path']}\n"
        
        if praise.tags:
            readme_content += "\nTags:\n"
            for tag in praise.tags:
                readme_content += f"- {tag.name}\n"
        
        zip_file.writestr("README.txt", readme_content.encode('utf-8'))
        
        # Criar arquivo README.txt com informações do praise e links externos
        readme_content = f"Praise: {praise.name}\n"
        if praise.number:
            readme_content += f"Número: {praise.number}\n"
        readme_content += f"\nMateriais de arquivo incluídos: {file_count}\n"
        
        if non_file_materials:
            readme_content += "\nMateriais externos (não incluídos no ZIP):\n"
            for mat in non_file_materials:
                readme_content += f"- {mat['material_kind']} ({mat['material_type']}): {mat['path']}\n"
        
        if praise.tags:
            readme_content += "\nTags:\n"
            for tag in praise.tags:
                readme_content += f"- {tag.name}\n"
        
        zip_file.writestr("README.txt", readme_content.encode('utf-8'))
    
    # Se não houver arquivos, ainda retornar ZIP com apenas o README
    if file_count == 0:
        logger.warning(f"No file materials found for praise {praise_id}")
    
    # Preparar resposta
    zip_buffer.seek(0)
    
    # Criar nome do arquivo ZIP
    praise_name_safe = "".join(c if c.isalnum() or c in (' ', '-', '_') else '_' for c in praise.name)
    if praise.number:
        zip_filename = f"{praise_name_safe}_{praise.number}.zip"
    else:
        zip_filename = f"{praise_name_safe}.zip"
    
    return StreamingResponse(
        io.BytesIO(zip_buffer.read()),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{zip_filename}"',
            "Content-Type": "application/zip"
        }
    )


@router.get("/{praise_id}", response_model=PraiseResponse)
def get_praise(
    request: Request,
    praise_id: UUID,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """Obtém um praise por ID.
    
    Rota pública: pode ser acessada sem autenticação, mas com rate limiting.
    Usuários autenticados têm acesso ilimitado.
    """
    # Aplicar rate limiting
    apply_rate_limit(request, "200/hour")
    
    service = PraiseService(db)
    praise = service.get_by_id(praise_id)
    return praise


@router.post("/{praise_id}/review", response_model=PraiseResponse)
def review_action(
    praise_id: UUID,
    data: ReviewActionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Inicia, cancela ou finaliza a revisão do praise (action: start, cancel, finish)."""
    service = PraiseService(db)
    return service.review_action(praise_id, data)


@router.post("/", response_model=PraiseResponse, status_code=status.HTTP_201_CREATED)
def create_praise(
    praise_data: PraiseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Cria um novo praise"""
    service = PraiseService(db)
    praise = service.create(praise_data)
    return praise


@router.put("/{praise_id}", response_model=PraiseResponse)
def update_praise(
    praise_id: UUID,
    praise_data: PraiseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Atualiza um praise"""
    service = PraiseService(db)
    praise = service.update(praise_id, praise_data)
    return praise


@router.delete("/{praise_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_praise(
    praise_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Deleta um praise"""
    service = PraiseService(db)
    service.delete(praise_id)
    return None






