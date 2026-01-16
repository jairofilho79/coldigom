from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.domain.models.material_type import MaterialType
from app.domain.schemas.material_type import MaterialTypeCreate, MaterialTypeUpdate
from app.infrastructure.database.repositories.material_type_repository import MaterialTypeRepository


class MaterialTypeService:
    def __init__(self, db: Session):
        self.repository = MaterialTypeRepository(db)

    def get_by_id(self, type_id: UUID) -> MaterialType:
        material_type = self.repository.get_by_id(type_id)
        if not material_type:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"MaterialType with id {type_id} not found"
            )
        return material_type

    def get_all(self, skip: int = 0, limit: int = 100) -> List[MaterialType]:
        return self.repository.get_all(skip=skip, limit=limit)

    def create(self, type_data: MaterialTypeCreate) -> MaterialType:
        # Check if type with same name already exists
        existing_type = self.repository.get_by_name(type_data.name)
        if existing_type:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"MaterialType with name '{type_data.name}' already exists"
            )
        
        material_type = MaterialType(name=type_data.name)
        return self.repository.create(material_type)

    def update(self, type_id: UUID, type_data: MaterialTypeUpdate) -> MaterialType:
        material_type = self.get_by_id(type_id)
        
        if type_data.name is not None:
            # Check if another type with same name exists
            existing_type = self.repository.get_by_name(type_data.name)
            if existing_type and existing_type.id != type_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"MaterialType with name '{type_data.name}' already exists"
                )
            material_type.name = type_data.name
        
        return self.repository.update(material_type)

    def delete(self, type_id: UUID) -> bool:
        material_type = self.get_by_id(type_id)
        return self.repository.delete(type_id)
