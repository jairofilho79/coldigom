from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.domain.models.praise import Praise
from app.domain.models.praise_tag import PraiseTag
from app.domain.schemas.praise import PraiseCreate, PraiseUpdate, ReviewActionRequest
from app.core.search_normalizer import normalize_search_query
from app.core.youtube_utils import extract_youtube_video_id
from app.infrastructure.database.repositories.praise_repository import PraiseRepository
from app.infrastructure.database.repositories.praise_tag_repository import PraiseTagRepository
from app.infrastructure.database.repositories.praise_material_repository import PraiseMaterialRepository
from app.domain.models.praise_material import PraiseMaterial
from app.application.services.metadata_sync_service import sync_praise_to_metadata, delete_metadata


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
                detail="Resource not found"
            )
        return praise

    def get_all(
        self,
        skip: int = 0,
        limit: int = 100,
        name: Optional[str] = None,
        tag_id: Optional[UUID] = None,
        tonality: Optional[str] = None,
        rhythm: Optional[str] = None,
        category: Optional[str] = None,
        youtube_url: Optional[str] = None,
        search_in_lyrics: bool = False,
        sort_by: str = "name",
        sort_direction: str = "asc",
        no_number: str = "last",
    ) -> List[Praise]:
        """Lista praises com filtros e ordenação aplicados no banco."""
        normalized_name = normalize_search_query(name) if name else None
        youtube_video_id = extract_youtube_video_id(youtube_url) if youtube_url else None
        return self.repository.get_all_filtered_sorted(
            skip=skip,
            limit=limit,
            name=normalized_name,
            tag_id=tag_id,
            tonality=tonality,
            rhythm=rhythm,
            category=category,
            youtube_video_id=youtube_video_id,
            search_in_lyrics=search_in_lyrics,
            sort_by=sort_by,
            sort_direction=sort_direction,
            no_number=no_number,
        )

    def create(self, praise_data: PraiseCreate) -> Praise:
        in_review = praise_data.in_review or False
        if in_review:
            review_history = [{"type": "in_review", "date": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}]
        else:
            review_history = []

        praise = Praise(
            name=praise_data.name,
            number=praise_data.number,
            in_review=in_review,
            in_review_description=praise_data.in_review_description or None,
            review_history=review_history,
            author=praise_data.author or None,
            rhythm=praise_data.rhythm or None,
            tonality=praise_data.tonality or None,
            category=praise_data.category or None,
        )

        # Add tags if provided
        if praise_data.tag_ids:
            tags = []
            for tag_id in praise_data.tag_ids:
                tag = self.tag_repo.get_by_id(tag_id)
                if not tag:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Resource not found"
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
        result = self.repository.get_by_id(praise.id)
        sync_praise_to_metadata(result)
        return result

    def update(self, praise_id: UUID, praise_data: PraiseUpdate) -> Praise:
        praise = self.get_by_id(praise_id)
        
        # Lista explícita de campos permitidos para atualização
        ALLOWED_UPDATE_FIELDS = {
            'name', 'number', 'tag_ids', 'in_review_description',
            'author', 'rhythm', 'tonality', 'category'
        }
        
        # Obter apenas campos que foram definidos (não None)
        update_data = praise_data.model_dump(exclude_unset=True, exclude_none=True)
        
        # Validar que apenas campos permitidos estão presentes
        for field in update_data.keys():
            if field not in ALLOWED_UPDATE_FIELDS:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Field '{field}' is not allowed to be updated"
                )
        
        if praise_data.name is not None:
            praise.name = praise_data.name
        
        if praise_data.number is not None:
            praise.number = praise_data.number
        
        # Update tags if provided
        if praise_data.tag_ids is not None:
            tags = []
            for tag_id in praise_data.tag_ids:
                tag = self.tag_repo.get_by_id(tag_id)
                if not tag:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Resource not found"
                    )
                tags.append(tag)
            praise.tags = tags

        if praise_data.in_review_description is not None:
            praise.in_review_description = praise_data.in_review_description

        if praise_data.author is not None:
            praise.author = praise_data.author
        if praise_data.rhythm is not None:
            praise.rhythm = praise_data.rhythm
        if praise_data.tonality is not None:
            praise.tonality = praise_data.tonality
        if praise_data.category is not None:
            praise.category = praise_data.category

        self.repository.update(praise)
        praise_with_relations = self.repository.get_by_id(praise_id)
        sync_praise_to_metadata(praise_with_relations)
        return praise_with_relations

    def delete(self, praise_id: UUID) -> bool:
        praise = self.get_by_id(praise_id)
        delete_metadata(praise_id)
        return self.repository.delete(praise_id)

    def review_action(self, praise_id: UUID, data: ReviewActionRequest) -> Praise:
        praise = self.get_by_id(praise_id)
        history = list(praise.review_history or [])
        last = history[-1] if history else None
        now_str = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

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






