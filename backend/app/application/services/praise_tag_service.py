from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.domain.models.praise_tag import PraiseTag
from app.domain.schemas.praise_tag import PraiseTagCreate, PraiseTagUpdate
from app.infrastructure.database.repositories.praise_tag_repository import PraiseTagRepository


class PraiseTagService:
    def __init__(self, db: Session):
        self.repository = PraiseTagRepository(db)

    def get_by_id(self, tag_id: UUID) -> PraiseTag:
        tag = self.repository.get_by_id(tag_id)
        if not tag:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"PraiseTag with id {tag_id} not found"
            )
        return tag

    def get_all(self, skip: int = 0, limit: int = 100) -> List[PraiseTag]:
        return self.repository.get_all(skip=skip, limit=limit)

    def create(self, tag_data: PraiseTagCreate) -> PraiseTag:
        # Check if tag with same name already exists
        existing_tag = self.repository.get_by_name(tag_data.name)
        if existing_tag:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"PraiseTag with name '{tag_data.name}' already exists"
            )
        
        tag = PraiseTag(name=tag_data.name)
        return self.repository.create(tag)

    def update(self, tag_id: UUID, tag_data: PraiseTagUpdate) -> PraiseTag:
        tag = self.get_by_id(tag_id)
        
        if tag_data.name is not None:
            # Check if another tag with same name exists
            existing_tag = self.repository.get_by_name(tag_data.name)
            if existing_tag and existing_tag.id != tag_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"PraiseTag with name '{tag_data.name}' already exists"
                )
            tag.name = tag_data.name
        
        return self.repository.update(tag)

    def delete(self, tag_id: UUID) -> bool:
        tag = self.get_by_id(tag_id)
        return self.repository.delete(tag_id)






