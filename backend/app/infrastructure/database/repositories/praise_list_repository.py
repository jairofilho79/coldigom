from typing import List, Optional, Dict
from uuid import UUID
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, func
from datetime import datetime
from app.domain.models.praise_list import PraiseList, PraiseListFollow
from app.domain.models.praise import Praise
from app.domain.models.praise_list import praise_list_praise_association
from app.application.repositories import BaseRepository


class PraiseListRepository(BaseRepository):
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, id: UUID, user_id: Optional[UUID] = None) -> Optional[PraiseList]:
        query = (
            self.db.query(PraiseList)
            .options(
                joinedload(PraiseList.user),
                joinedload(PraiseList.praises)
            )
            .filter(PraiseList.id == id)
        )
        if user_id:
            # Only return if public or owned by user
            query = query.filter(
                (PraiseList.user_id == user_id) | (PraiseList.is_public == True)
            )
        return query.first()

    def get_by_user_id(self, user_id: UUID) -> List[PraiseList]:
        return (
            self.db.query(PraiseList)
            .options(
                joinedload(PraiseList.user),
                joinedload(PraiseList.praises)
            )
            .filter(PraiseList.user_id == user_id)
            .order_by(PraiseList.created_at.desc())
            .all()
        )

    def get_by_user_id_filtered(
        self, 
        user_id: UUID, 
        name: Optional[str] = None, 
        date_from: Optional[datetime] = None, 
        date_to: Optional[datetime] = None
    ) -> List[PraiseList]:
        query = (
            self.db.query(PraiseList)
            .options(
                joinedload(PraiseList.user),
                joinedload(PraiseList.praises)
            )
            .filter(PraiseList.user_id == user_id)
        )
        
        if name:
            query = query.filter(PraiseList.name.ilike(f"%{name}%"))
        
        if date_from:
            query = query.filter(PraiseList.created_at >= date_from)
        
        if date_to:
            query = query.filter(PraiseList.created_at <= date_to)
        
        return query.order_by(PraiseList.created_at.desc()).all()

    def get_followed_by_user_filtered(
        self, 
        user_id: UUID, 
        name: Optional[str] = None, 
        date_from: Optional[datetime] = None, 
        date_to: Optional[datetime] = None
    ) -> List[PraiseList]:
        query = (
            self.db.query(PraiseList)
            .join(PraiseListFollow)
            .options(
                joinedload(PraiseList.user),
                joinedload(PraiseList.praises)
            )
            .filter(PraiseListFollow.user_id == user_id)
        )
        
        if name:
            query = query.filter(PraiseList.name.ilike(f"%{name}%"))
        
        if date_from:
            query = query.filter(PraiseList.created_at >= date_from)
        
        if date_to:
            query = query.filter(PraiseList.created_at <= date_to)
        
        return query.order_by(PraiseListFollow.created_at.desc()).all()

    def get_followed_by_user(self, user_id: UUID) -> List[PraiseList]:
        return (
            self.db.query(PraiseList)
            .join(PraiseListFollow)
            .options(
                joinedload(PraiseList.user),
                joinedload(PraiseList.praises)
            )
            .filter(PraiseListFollow.user_id == user_id)
            .order_by(PraiseListFollow.created_at.desc())
            .all()
        )

    def get_public_lists(self, skip: int = 0, limit: int = 100) -> List[PraiseList]:
        return (
            self.db.query(PraiseList)
            .options(
                joinedload(PraiseList.user),
                joinedload(PraiseList.praises)
            )
            .filter(PraiseList.is_public == True)
            .order_by(PraiseList.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    def get_all(self, skip: int = 0, limit: int = 100) -> List[PraiseList]:
        return (
            self.db.query(PraiseList)
            .options(joinedload(PraiseList.user))
            .offset(skip)
            .limit(limit)
            .all()
        )

    def create(self, list: PraiseList) -> PraiseList:
        self.db.add(list)
        self.db.commit()
        self.db.refresh(list)
        return list

    def update(self, list: PraiseList) -> PraiseList:
        self.db.commit()
        self.db.refresh(list)
        return list

    def delete(self, id: UUID, user_id: Optional[UUID] = None) -> bool:
        list = self.get_by_id(id, user_id)
        if list:
            # Verify ownership if user_id provided
            if user_id and list.user_id != user_id:
                return False
            self.db.delete(list)
            self.db.commit()
            return True
        return False

    def add_praise(self, list_id: UUID, praise_id: UUID, order: Optional[int] = None) -> bool:
        # Get max order if not provided
        if order is None:
            max_order = (
                self.db.query(func.max(praise_list_praise_association.c.order))
                .filter(praise_list_praise_association.c.praise_list_id == list_id)
                .scalar()
            )
            order = (max_order or -1) + 1

        # Check if already exists
        existing = (
            self.db.query(praise_list_praise_association)
            .filter(
                and_(
                    praise_list_praise_association.c.praise_list_id == list_id,
                    praise_list_praise_association.c.praise_id == praise_id
                )
            )
            .first()
        )
        if existing:
            return False  # Already exists

        # Insert new association
        self.db.execute(
            praise_list_praise_association.insert().values(
                praise_list_id=list_id,
                praise_id=praise_id,
                order=order
            )
        )
        self.db.commit()
        return True

    def remove_praise(self, list_id: UUID, praise_id: UUID) -> bool:
        result = self.db.execute(
            praise_list_praise_association.delete().where(
                and_(
                    praise_list_praise_association.c.praise_list_id == list_id,
                    praise_list_praise_association.c.praise_id == praise_id
                )
            )
        )
        self.db.commit()
        return result.rowcount > 0

    def reorder_praises(self, list_id: UUID, praise_orders: List[Dict[str, any]]) -> bool:
        """Reorder praises in a list. praise_orders should be list of {praise_id: UUID, order: int}"""
        for item in praise_orders:
            praise_id = item.get('praise_id')
            order = item.get('order')
            if praise_id and order is not None:
                self.db.execute(
                    praise_list_praise_association.update()
                    .where(
                        and_(
                            praise_list_praise_association.c.praise_list_id == list_id,
                            praise_list_praise_association.c.praise_id == praise_id
                        )
                    )
                    .values(order=order)
                )
        self.db.commit()
        return True

    def follow_list(self, user_id: UUID, list_id: UUID) -> bool:
        # Check if already following
        existing = (
            self.db.query(PraiseListFollow)
            .filter(
                and_(
                    PraiseListFollow.user_id == user_id,
                    PraiseListFollow.praise_list_id == list_id
                )
            )
            .first()
        )
        if existing:
            return False  # Already following

        follow = PraiseListFollow(user_id=user_id, praise_list_id=list_id)
        self.db.add(follow)
        self.db.commit()
        return True

    def unfollow_list(self, user_id: UUID, list_id: UUID) -> bool:
        follow = (
            self.db.query(PraiseListFollow)
            .filter(
                and_(
                    PraiseListFollow.user_id == user_id,
                    PraiseListFollow.praise_list_id == list_id
                )
            )
            .first()
        )
        if follow:
            self.db.delete(follow)
            self.db.commit()
            return True
        return False

    def is_following(self, user_id: UUID, list_id: UUID) -> bool:
        follow = (
            self.db.query(PraiseListFollow)
            .filter(
                and_(
                    PraiseListFollow.user_id == user_id,
                    PraiseListFollow.praise_list_id == list_id
                )
            )
            .first()
        )
        return follow is not None

    def copy_list(self, user_id: UUID, list_id: UUID) -> Optional[PraiseList]:
        """Copy a list and all its praises to a new list owned by user_id"""
        original_list = self.get_by_id(list_id)
        if not original_list:
            return None

        # Create new list
        new_list = PraiseList(
            name=f"{original_list.name} (cópia)",
            description=original_list.description,
            user_id=user_id,
            is_public=False  # Copies are private by default
        )
        self.db.add(new_list)
        self.db.flush()  # Get the ID without committing

        # Copy all praises with their order
        praises_with_order = (
            self.db.query(
                praise_list_praise_association.c.praise_id,
                praise_list_praise_association.c.order
            )
            .filter(praise_list_praise_association.c.praise_list_id == list_id)
            .order_by(praise_list_praise_association.c.order)
            .all()
        )

        for praise_id, order in praises_with_order:
            self.db.execute(
                praise_list_praise_association.insert().values(
                    praise_list_id=new_list.id,
                    praise_id=praise_id,
                    order=order
                )
            )

        self.db.commit()
        self.db.refresh(new_list)
        return new_list

    def get_list_with_praises(self, list_id: UUID, user_id: Optional[UUID] = None) -> Optional[PraiseList]:
        """Get list with praises loaded and ordered"""
        list = self.get_by_id(list_id, user_id)
        if list:
            # Praises are already loaded via relationship with order_by
            return list
        return None
