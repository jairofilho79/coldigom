from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.domain.models.praise_material import PraiseMaterial
from app.domain.schemas.praise_material import PraiseMaterialCreate, PraiseMaterialUpdate
from app.infrastructure.database.repositories.praise_material_repository import PraiseMaterialRepository
from app.infrastructure.database.repositories.material_kind_repository import MaterialKindRepository
from app.infrastructure.database.repositories.praise_repository import PraiseRepository


class PraiseMaterialService:
    def __init__(self, db: Session):
        self.repository = PraiseMaterialRepository(db)
        self.material_kind_repo = MaterialKindRepository(db)
        self.praise_repo = PraiseRepository(db)
        self.praise_repo = PraiseRepository(db)

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

    def get_by_praise_id(self, praise_id: UUID) -> List[PraiseMaterial]:
        return self.repository.get_by_praise_id(praise_id)

    def create(self, material_data: PraiseMaterialCreate) -> PraiseMaterial:
        # Validate material_kind exists
        material_kind = self.material_kind_repo.get_by_id(material_data.material_kind_id)
        if not material_kind:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"MaterialKind with id {material_data.material_kind_id} not found"
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
            path=material_data.path,
            type=material_data.type,
            praise_id=material_data.praise_id
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
        
        if material_data.path is not None:
            material.path = material_data.path
        
        if material_data.type is not None:
            material.type = material_data.type
        
        return self.repository.update(material)

    def delete(self, material_id: UUID) -> bool:
        material = self.get_by_id(material_id)
        return self.repository.delete(material_id)






