from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.domain.models.material_kind import MaterialKind
from app.domain.schemas.material_kind import MaterialKindCreate, MaterialKindUpdate
from app.infrastructure.database.repositories.material_kind_repository import MaterialKindRepository
from app.application.services.changelog_helper import record_changelog


class MaterialKindService:
    def __init__(self, db: Session):
        self.db = db
        self.repository = MaterialKindRepository(db)

    def get_by_id(self, kind_id: UUID) -> MaterialKind:
        kind = self.repository.get_by_id(kind_id)
        if not kind:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"MaterialKind with id {kind_id} not found"
            )
        return kind

    def get_all(self, skip: int = 0, limit: int = 100) -> List[MaterialKind]:
        return self.repository.get_all(skip=skip, limit=limit)

    def create(self, kind_data: MaterialKindCreate) -> MaterialKind:
        # Check if kind with same name already exists
        existing_kind = self.repository.get_by_name(kind_data.name)
        if existing_kind:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"MaterialKind with name '{kind_data.name}' already exists"
            )
        
        kind = MaterialKind(name=kind_data.name)
        kind = self.repository.create(kind)
        record_changelog(self.db, "material_kind", kind.id, "created")
        return kind

    def update(self, kind_id: UUID, kind_data: MaterialKindUpdate) -> MaterialKind:
        kind = self.get_by_id(kind_id)
        
        if kind_data.name is not None:
            # Check if another kind with same name exists
            existing_kind = self.repository.get_by_name(kind_data.name)
            if existing_kind and existing_kind.id != kind_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"MaterialKind with name '{kind_data.name}' already exists"
                )
            kind.name = kind_data.name

        kind = self.repository.update(kind)
        record_changelog(self.db, "material_kind", kind.id, "updated")
        return kind

    def delete(self, kind_id: UUID) -> bool:
        kind = self.get_by_id(kind_id)
        result = self.repository.delete(kind_id)
        record_changelog(self.db, "material_kind", kind_id, "deleted")
        return result






