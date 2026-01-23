from typing import List, Optional, Dict
from uuid import UUID
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from datetime import datetime
from app.domain.models.praise_list import PraiseList
from app.domain.models.praise import Praise
from app.domain.schemas.praise_list import PraiseListCreate, PraiseListUpdate, PraiseListDetailResponse, ReorderPraisesRequest
from app.infrastructure.database.repositories.praise_list_repository import PraiseListRepository
from app.infrastructure.database.repositories.praise_repository import PraiseRepository


class PraiseListService:
    def __init__(self, db: Session):
        self.db = db
        self.repository = PraiseListRepository(db)
        self.praise_repository = PraiseRepository(db)

    def get_by_id(self, list_id: UUID, user_id: Optional[UUID] = None) -> PraiseList:
        list = self.repository.get_by_id(list_id, user_id)
        if not list:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"PraiseList with id {list_id} not found"
            )
        return list

    def get_my_lists(self, user_id: UUID) -> List[PraiseList]:
        return self.repository.get_by_user_id(user_id)

    def get_my_lists_filtered(
        self, 
        user_id: UUID, 
        name: Optional[str] = None, 
        date_from: Optional[datetime] = None, 
        date_to: Optional[datetime] = None
    ) -> List[PraiseList]:
        return self.repository.get_by_user_id_filtered(user_id, name, date_from, date_to)

    def get_followed_lists(self, user_id: UUID) -> List[PraiseList]:
        return self.repository.get_followed_by_user(user_id)

    def get_followed_lists_filtered(
        self, 
        user_id: UUID, 
        name: Optional[str] = None, 
        date_from: Optional[datetime] = None, 
        date_to: Optional[datetime] = None
    ) -> List[PraiseList]:
        return self.repository.get_followed_by_user_filtered(user_id, name, date_from, date_to)

    def get_public_lists(self, skip: int = 0, limit: int = 100) -> List[PraiseList]:
        return self.repository.get_public_lists(skip=skip, limit=limit)

    def create(self, user_id: UUID, list_data: PraiseListCreate) -> PraiseList:
        list = PraiseList(
            name=list_data.name,
            description=list_data.description,
            user_id=user_id,
            is_public=list_data.is_public
        )
        return self.repository.create(list)

    def update(self, list_id: UUID, user_id: UUID, list_data: PraiseListUpdate) -> PraiseList:
        list = self.get_by_id(list_id, user_id)
        
        # Verify ownership
        if list.user_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only update your own lists"
            )
        
        if list_data.name is not None:
            list.name = list_data.name
        if list_data.description is not None:
            list.description = list_data.description
        if list_data.is_public is not None:
            list.is_public = list_data.is_public
        
        return self.repository.update(list)

    def delete(self, list_id: UUID, user_id: UUID) -> bool:
        list = self.get_by_id(list_id, user_id)
        
        # Verify ownership
        if list.user_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only delete your own lists"
            )
        
        return self.repository.delete(list_id, user_id)

    def add_praise(self, list_id: UUID, praise_id: UUID, user_id: UUID) -> bool:
        # Verify list exists and user has access
        list = self.get_by_id(list_id, user_id)
        
        # Check if user owns the list or follows it
        has_access = (list.user_id == user_id) or self.repository.is_following(user_id, list_id)
        if not has_access:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only add praises to lists you own or follow"
            )
        
        # Verify praise exists
        praise = self.praise_repository.get_by_id(praise_id)
        if not praise:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Praise with id {praise_id} not found"
            )
        
        # Try to add praise, check if already exists
        result = self.repository.add_praise(list_id, praise_id)
        if not result:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Praise is already in this list"
            )
        
        return True

    def remove_praise(self, list_id: UUID, praise_id: UUID, user_id: UUID) -> bool:
        # Verify list exists and user has access
        list = self.get_by_id(list_id, user_id)
        
        # Check if user owns the list or follows it
        has_access = (list.user_id == user_id) or self.repository.is_following(user_id, list_id)
        if not has_access:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only remove praises from lists you own or follow"
            )
        
        return self.repository.remove_praise(list_id, praise_id)

    def reorder_praises(self, list_id: UUID, user_id: UUID, praise_orders: List[Dict[str, any]]) -> bool:
        # Verify list exists and user owns it
        list = self.get_by_id(list_id, user_id)
        
        # Only owner can reorder
        if list.user_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only reorder praises in your own lists"
            )
        
        return self.repository.reorder_praises(list_id, praise_orders)

    def follow_list(self, user_id: UUID, list_id: UUID) -> bool:
        # Verify list exists and is public
        list = self.get_by_id(list_id)
        
        if not list.is_public:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only follow public lists"
            )
        
        if list.user_id == user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot follow your own list"
            )
        
        return self.repository.follow_list(user_id, list_id)

    def unfollow_list(self, user_id: UUID, list_id: UUID) -> bool:
        return self.repository.unfollow_list(user_id, list_id)

    def copy_list(self, user_id: UUID, list_id: UUID) -> PraiseList:
        # Verify list exists and is accessible
        list = self.get_by_id(list_id, user_id)
        
        # Can copy public lists or own lists
        if not list.is_public and list.user_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only copy public lists or your own lists"
            )
        
        new_list = self.repository.copy_list(user_id, list_id)
        if not new_list:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to copy list"
            )
        
        return new_list

    def get_list_detail(self, list_id: UUID, user_id: Optional[UUID] = None) -> Dict:
        """Get list with praises and metadata"""
        list = self.get_by_id(list_id, user_id)
        
        # Get praises with order from association table in one query
        from app.domain.models.praise_list import praise_list_praise_association
        from sqlalchemy import select
        
        # Query praises with their order
        stmt = (
            select(
                Praise.id,
                Praise.name,
                Praise.number,
                praise_list_praise_association.c.order
            )
            .select_from(
                praise_list_praise_association.join(Praise, praise_list_praise_association.c.praise_id == Praise.id)
            )
            .where(praise_list_praise_association.c.praise_list_id == list_id)
            .order_by(praise_list_praise_association.c.order)
        )
        
        results = self.db.execute(stmt).all()
        
        praises = [
            {
                "id": str(row.id),
                "name": row.name,
                "number": row.number,
                "order": row.order or 0
            }
            for row in results
        ]
        
        is_owner = user_id is not None and list.user_id == user_id
        is_following = user_id is not None and self.repository.is_following(user_id, list_id) if user_id else False
        
        return {
            "id": list.id,
            "name": list.name,
            "description": list.description,
            "is_public": list.is_public,
            "user_id": list.user_id,
            "owner": list.user.username if list.user else None,
            "praises_count": len(praises),
            "praises": praises,
            "is_owner": is_owner,
            "is_following": is_following,
            "created_at": list.created_at,
            "updated_at": list.updated_at
        }
