from datetime import datetime
from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.domain.models.praise import Praise
from app.domain.models.praise_tag import PraiseTag
from app.domain.schemas.praise import PraiseCreate, PraiseUpdate, ReviewActionRequest
from app.infrastructure.database.repositories.praise_repository import PraiseRepository
from app.infrastructure.database.repositories.praise_tag_repository import PraiseTagRepository
from app.infrastructure.database.repositories.praise_material_repository import PraiseMaterialRepository
from app.domain.models.praise_material import PraiseMaterial


class PraiseService:
    def __init__(self, db: Session):
        self.repository = PraiseRepository(db)
        self.tag_repo = PraiseTagRepository(db)
        self.material_repo = PraiseMaterialRepository(db)

    def get_by_id(self, praise_id: UUID) -> Praise:
        praise = self.repository.get_by_id(praise_id)
        if not praise:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Praise with id {praise_id} not found"
            )
        return praise

    def get_all(self, skip: int = 0, limit: int = 100, name: Optional[str] = None, tag_id: Optional[UUID] = None) -> List[Praise]:
        if tag_id:
            return self.repository.get_by_tag_id(tag_id, skip=skip, limit=limit)
        if name:
            return self.repository.search_by_name(name, skip=skip, limit=limit)
        return self.repository.get_all(skip=skip, limit=limit)

    def create(self, praise_data: PraiseCreate) -> Praise:
        # Check if praise with same number already exists (if number is provided)
        if praise_data.number is not None:
            existing_praise = self.repository.get_by_number(praise_data.number)
            if existing_praise:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Praise with number {praise_data.number} already exists"
                )
        
        in_review = praise_data.in_review or False
        if in_review:
            review_history = [{"type": "in_review", "date": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")}]
        else:
            review_history = []

        praise = Praise(
            name=praise_data.name,
            number=praise_data.number,
            in_review=in_review,
            in_review_description=praise_data.in_review_description or None,
            review_history=review_history,
        )

        # Add tags if provided
        if praise_data.tag_ids:
            tags = []
            for tag_id in praise_data.tag_ids:
                tag = self.tag_repo.get_by_id(tag_id)
                if not tag:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"PraiseTag with id {tag_id} not found"
                    )
                tags.append(tag)
            praise.tags = tags
        
        # Create praise first
        praise = self.repository.create(praise)
        
        # Add materials if provided
        if praise_data.materials:
            for material_data in praise_data.materials:
                material = PraiseMaterial(
                    material_kind_id=material_data.material_kind_id,
                    material_type_id=material_data.material_type_id,
                    path=material_data.path,
                    praise_id=praise.id,
                    is_old=material_data.is_old or False,
                    old_description=material_data.old_description or None
                )
                self.material_repo.create(material)
        
        # Refresh to get all relationships
        return self.repository.get_by_id(praise.id)

    def update(self, praise_id: UUID, praise_data: PraiseUpdate) -> Praise:
        praise = self.get_by_id(praise_id)
        
        if praise_data.name is not None:
            praise.name = praise_data.name
        
        if praise_data.number is not None:
            # Check if another praise with same number exists
            existing_praise = self.repository.get_by_number(praise_data.number)
            if existing_praise and existing_praise.id != praise_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Praise with number {praise_data.number} already exists"
                )
            praise.number = praise_data.number
        
        # Update tags if provided
        if praise_data.tag_ids is not None:
            tags = []
            for tag_id in praise_data.tag_ids:
                tag = self.tag_repo.get_by_id(tag_id)
                if not tag:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"PraiseTag with id {tag_id} not found"
                    )
                tags.append(tag)
            praise.tags = tags

        if praise_data.in_review_description is not None:
            praise.in_review_description = praise_data.in_review_description

        return self.repository.update(praise)

    def delete(self, praise_id: UUID) -> bool:
        praise = self.get_by_id(praise_id)
        return self.repository.delete(praise_id)

    def review_action(self, praise_id: UUID, data: ReviewActionRequest) -> Praise:
        praise = self.get_by_id(praise_id)
        history = list(praise.review_history or [])
        last = history[-1] if history else None
        now_str = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

        if data.action == "start":
            if last and last.get("type") == "in_review":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Already in review",
                )
            history.append({"type": "in_review", "date": now_str})
            praise.review_history = history
            praise.in_review = True
            if data.in_review_description is not None:
                praise.in_review_description = data.in_review_description

        elif data.action == "cancel":
            if not last or last.get("type") != "in_review":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Not in review",
                )
            history.append({"type": "review_cancelled", "date": now_str})
            praise.review_history = history
            praise.in_review = False

        elif data.action == "finish":
            if not last or last.get("type") != "in_review":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Not in review",
                )
            history.append({"type": "review_finished", "date": now_str})
            praise.review_history = history
            praise.in_review = False

        return self.repository.update(praise)






