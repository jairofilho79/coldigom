from typing import List, Optional, BinaryIO
from uuid import UUID
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
import os
from app.domain.models.praise_material import PraiseMaterial
from app.domain.schemas.praise_material import PraiseMaterialCreate, PraiseMaterialUpdate
from app.infrastructure.database.repositories.praise_material_repository import PraiseMaterialRepository
from app.infrastructure.database.repositories.material_kind_repository import MaterialKindRepository
from app.infrastructure.database.repositories.material_type_repository import MaterialTypeRepository
from app.infrastructure.database.repositories.praise_repository import PraiseRepository
from app.infrastructure.storage.storage_client import StorageClient


class PraiseMaterialService:
    def __init__(self, db: Session):
        self.repository = PraiseMaterialRepository(db)
        self.material_kind_repo = MaterialKindRepository(db)
        self.material_type_repo = MaterialTypeRepository(db)
        self.praise_repo = PraiseRepository(db)
    
    def _detect_material_type_from_extension(self, extension: str) -> UUID:
        """Detecta o tipo de material baseado na extensão do arquivo"""
        ext_lower = extension.lower().lstrip('.')
        
        # Audio extensions
        audio_extensions = {'mp3', 'wav', 'm4a', 'wma', 'ogg', 'flac'}
        
        if ext_lower == 'pdf':
            material_type = self.material_type_repo.get_by_name('pdf')
        elif ext_lower in audio_extensions:
            material_type = self.material_type_repo.get_by_name('audio')
        else:
            # Default to PDF if extension not recognized
            material_type = self.material_type_repo.get_by_name('pdf')
        
        if not material_type:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"MaterialType not found in database. Please run seed script."
            )
        
        return material_type.id
    
    def _is_file_type(self, material_type_name: str) -> bool:
        """Verifica se o tipo é um arquivo (PDF ou AUDIO)"""
        return material_type_name.lower() in ['pdf', 'audio']

    def get_by_id(self, material_id: UUID) -> PraiseMaterial:
        material = self.repository.get_by_id(material_id)
        if not material:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"PraiseMaterial with id {material_id} not found"
            )
        return material

    def get_all(self, skip: int = 0, limit: int = 100) -> List[PraiseMaterial]:
        return self.repository.get_all(skip=skip, limit=limit)

    def get_by_praise_id(self, praise_id: UUID, is_old: Optional[bool] = None) -> List[PraiseMaterial]:
        return self.repository.get_by_praise_id(praise_id, is_old=is_old)

    def create(self, material_data: PraiseMaterialCreate) -> PraiseMaterial:
        # Validate material_kind exists
        material_kind = self.material_kind_repo.get_by_id(material_data.material_kind_id)
        if not material_kind:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"MaterialKind with id {material_data.material_kind_id} not found"
            )
        
        # Validate material_type exists
        material_type = self.material_type_repo.get_by_id(material_data.material_type_id)
        if not material_type:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"MaterialType with id {material_data.material_type_id} not found"
            )
        
        # Validate praise exists
        praise = self.praise_repo.get_by_id(material_data.praise_id)
        if not praise:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Praise with id {material_data.praise_id} not found"
            )
        
        material = PraiseMaterial(
            material_kind_id=material_data.material_kind_id,
            material_type_id=material_data.material_type_id,
            path=material_data.path,
            praise_id=material_data.praise_id,
            is_old=material_data.is_old or False,
            old_description=material_data.old_description or None
        )
        return self.repository.create(material)

    def update(self, material_id: UUID, material_data: PraiseMaterialUpdate) -> PraiseMaterial:
        material = self.get_by_id(material_id)
        
        if material_data.material_kind_id is not None:
            material_kind = self.material_kind_repo.get_by_id(material_data.material_kind_id)
            if not material_kind:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"MaterialKind with id {material_data.material_kind_id} not found"
                )
            material.material_kind_id = material_data.material_kind_id
        
        if material_data.material_type_id is not None:
            material_type = self.material_type_repo.get_by_id(material_data.material_type_id)
            if not material_type:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"MaterialType with id {material_data.material_type_id} not found"
                )
            material.material_type_id = material_data.material_type_id
        
        if material_data.path is not None:
            material.path = material_data.path
        
        if material_data.is_old is not None:
            material.is_old = material_data.is_old
        if material_data.old_description is not None:
            material.old_description = material_data.old_description or None
        
        return self.repository.update(material)

    def update_with_file(
        self,
        material_id: UUID,
        file_obj: BinaryIO,
        file_name: str,
        storage: StorageClient,
        material_kind_id: Optional[UUID] = None,
        is_old: Optional[bool] = None,
        old_description: Optional[str] = None
    ) -> PraiseMaterial:
        """Atualiza um material com um novo arquivo"""
        material = self.get_by_id(material_id)
        
        # Valida que o material é um tipo de arquivo (PDF ou AUDIO)
        material_type = self.material_type_repo.get_by_id(material.material_type_id)
        if not material_type:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"MaterialType with id {material.material_type_id} not found"
            )
        
        if not self._is_file_type(material_type.name):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Can only update file materials (PDF or AUDIO) with file upload"
            )
        
        # Deleta o arquivo antigo do storage
        old_path = material.path
        if old_path:
            try:
                deleted = storage.delete_file(old_path)
                import logging
                logger = logging.getLogger(__name__)
                if deleted:
                    logger.info(f"Arquivo antigo deletado com sucesso: {old_path}")
                else:
                    logger.warning(f"Arquivo antigo não encontrado para deletar: {old_path}")
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Erro ao deletar arquivo antigo {old_path}: {str(e)}")
                # Log error but don't fail the update
        
        # Valida material_kind se fornecido
        if material_kind_id is not None:
            material_kind = self.material_kind_repo.get_by_id(material_kind_id)
            if not material_kind:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"MaterialKind with id {material_kind_id} not found"
                )
            material.material_kind_id = material_kind_id
        
        # Faz upload do novo arquivo
        import mimetypes
        content_type, _ = mimetypes.guess_type(file_name)
        new_path = storage.upload_file(
            file_obj,
            file_name,
            content_type=content_type,
            folder=f"praises/{material.praise_id}",
            material_id=material_id
        )
        
        # Detecta e atualiza o tipo baseado na extensão do novo arquivo
        file_ext = os.path.splitext(file_name)[1]
        new_material_type_id = self._detect_material_type_from_extension(file_ext)
        material.material_type_id = new_material_type_id
        
        # Atualiza o path do material
        material.path = new_path
        
        if is_old is not None:
            material.is_old = is_old
        if old_description is not None:
            material.old_description = old_description or None
        
        return self.repository.update(material)

    def delete(self, material_id: UUID) -> bool:
        material = self.get_by_id(material_id)
        return self.repository.delete(material_id)






