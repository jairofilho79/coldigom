from typing import List, Optional, Dict
from uuid import UUID
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, func, select
from datetime import datetime
import secrets
import string
from app.domain.models.room import (
    Room,
    RoomParticipant,
    RoomMessage,
    RoomPraise,
    RoomJoinRequest,
    RoomAccessType,
    RoomJoinRequestStatus,
)
from app.domain.models.praise import Praise
from app.domain.models.user import User
from app.domain.models.user_material_kind_preference import UserMaterialKindPreference
from app.application.repositories import BaseRepository


class RoomRepository(BaseRepository):
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, id: UUID, user_id: Optional[UUID] = None) -> Optional[Room]:
        query = (
            self.db.query(Room)
            .options(
                joinedload(Room.creator),
                joinedload(Room.participants).joinedload(RoomParticipant.user),
            )
            .filter(Room.id == id)
        )
        return query.first()

    def get_by_code(self, code: str) -> Optional[Room]:
        return (
            self.db.query(Room)
            .options(
                joinedload(Room.creator),
                joinedload(Room.participants).joinedload(RoomParticipant.user),
            )
            .filter(Room.code == code)
            .first()
        )

    def get_all(self, skip: int = 0, limit: int = 100) -> List[Room]:
        return (
            self.db.query(Room)
            .options(joinedload(Room.creator))
            .offset(skip)
            .limit(limit)
            .all()
        )

    def get_user_rooms(self, user_id: UUID) -> List[Room]:
        """Get rooms where user is creator or participant"""
        return (
            self.db.query(Room)
            .join(RoomParticipant)
            .options(joinedload(Room.creator))
            .filter(
                (Room.creator_id == user_id) | (RoomParticipant.user_id == user_id)
            )
            .distinct()
            .order_by(Room.last_activity_at.desc())
            .all()
        )

    def get_public_rooms(self, skip: int = 0, limit: int = 100) -> List[Room]:
        return (
            self.db.query(Room)
            .options(joinedload(Room.creator))
            .filter(Room.access_type == RoomAccessType.PUBLIC)
            .order_by(Room.last_activity_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    def generate_unique_code(self) -> str:
        """Generate a unique 8-character alphanumeric code"""
        alphabet = string.ascii_uppercase + string.digits
        while True:
            code = ''.join(secrets.choice(alphabet) for _ in range(8))
            if not self.get_by_code(code):
                return code

    def create(self, room: Room) -> Room:
        if not room.code:
            room.code = self.generate_unique_code()
        self.db.add(room)
        self.db.commit()
        self.db.refresh(room)
        return room

    def update(self, room: Room) -> Room:
        room.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(room)
        return room

    def delete(self, id: UUID) -> bool:
        room = self.get_by_id(id)
        if room:
            self.db.delete(room)
            self.db.commit()
            return True
        return False

    def add_participant(self, room_id: UUID, user_id: UUID) -> bool:
        # Check if already participant
        existing = (
            self.db.query(RoomParticipant)
            .filter(
                and_(
                    RoomParticipant.room_id == room_id,
                    RoomParticipant.user_id == user_id
                )
            )
            .first()
        )
        if existing:
            existing.last_seen_at = datetime.utcnow()
            self.db.commit()
            return False  # Already participant

        participant = RoomParticipant(room_id=room_id, user_id=user_id)
        self.db.add(participant)
        
        # Update room last_activity_at
        room = self.get_by_id(room_id)
        if room:
            room.last_activity_at = datetime.utcnow()
        
        self.db.commit()
        return True

    def remove_participant(self, room_id: UUID, user_id: UUID) -> bool:
        participant = (
            self.db.query(RoomParticipant)
            .filter(
                and_(
                    RoomParticipant.room_id == room_id,
                    RoomParticipant.user_id == user_id
                )
            )
            .first()
        )
        if participant:
            self.db.delete(participant)
            
            # Update room last_activity_at
            room = self.get_by_id(room_id)
            if room:
                room.last_activity_at = datetime.utcnow()
            
            self.db.commit()
            return True
        return False

    def get_participants(self, room_id: UUID) -> List[RoomParticipant]:
        return (
            self.db.query(RoomParticipant)
            .options(joinedload(RoomParticipant.user))
            .filter(RoomParticipant.room_id == room_id)
            .order_by(RoomParticipant.joined_at)
            .all()
        )

    def is_participant(self, room_id: UUID, user_id: UUID) -> bool:
        participant = (
            self.db.query(RoomParticipant)
            .filter(
                and_(
                    RoomParticipant.room_id == room_id,
                    RoomParticipant.user_id == user_id
                )
            )
            .first()
        )
        return participant is not None

    def get_participants_count(self, room_id: UUID) -> int:
        return (
            self.db.query(RoomParticipant)
            .filter(RoomParticipant.room_id == room_id)
            .count()
        )

    def get_room_praises(self, room_id: UUID) -> List[RoomPraise]:
        return (
            self.db.query(RoomPraise)
            .options(joinedload(RoomPraise.praise))
            .filter(RoomPraise.room_id == room_id)
            .order_by(RoomPraise.order)
            .all()
        )

    def add_praise(self, room_id: UUID, praise_id: UUID, order: Optional[int] = None) -> bool:
        # Check if already exists
        existing = (
            self.db.query(RoomPraise)
            .filter(
                and_(
                    RoomPraise.room_id == room_id,
                    RoomPraise.praise_id == praise_id
                )
            )
            .first()
        )
        if existing:
            return False  # Already exists

        # Get max order if not provided
        if order is None:
            max_order = (
                self.db.query(func.max(RoomPraise.order))
                .filter(RoomPraise.room_id == room_id)
                .scalar()
            )
            order = (max_order or -1) + 1

        room_praise = RoomPraise(room_id=room_id, praise_id=praise_id, order=order)
        self.db.add(room_praise)
        
        # Update room last_activity_at
        room = self.get_by_id(room_id)
        if room:
            room.last_activity_at = datetime.utcnow()
        
        self.db.commit()
        return True

    def remove_praise(self, room_id: UUID, praise_id: UUID) -> bool:
        room_praise = (
            self.db.query(RoomPraise)
            .filter(
                and_(
                    RoomPraise.room_id == room_id,
                    RoomPraise.praise_id == praise_id
                )
            )
            .first()
        )
        if room_praise:
            self.db.delete(room_praise)
            
            # Update room last_activity_at
            room = self.get_by_id(room_id)
            if room:
                room.last_activity_at = datetime.utcnow()
            
            self.db.commit()
            return True
        return False

    def reorder_praises(self, room_id: UUID, praise_orders: List[Dict[str, any]]) -> bool:
        """Reorder praises in a room. praise_orders should be list of {praise_id: UUID, order: int}"""
        for item in praise_orders:
            praise_id = item.get('praise_id')
            order = item.get('order')
            if praise_id and order is not None:
                room_praise = (
                    self.db.query(RoomPraise)
                    .filter(
                        and_(
                            RoomPraise.room_id == room_id,
                            RoomPraise.praise_id == praise_id
                        )
                    )
                    .first()
                )
                if room_praise:
                    room_praise.order = order
        
        # Update room last_activity_at
        room = self.get_by_id(room_id)
        if room:
            room.last_activity_at = datetime.utcnow()
        
        self.db.commit()
        return True

    def get_messages(self, room_id: UUID, limit: int = 100, offset: int = 0) -> List[RoomMessage]:
        return (
            self.db.query(RoomMessage)
            .options(joinedload(RoomMessage.user))
            .filter(RoomMessage.room_id == room_id)
            .order_by(RoomMessage.created_at.desc())
            .limit(limit)
            .offset(offset)
            .all()
        )

    def add_message(self, room_id: UUID, user_id: UUID, message: str) -> RoomMessage:
        room_message = RoomMessage(room_id=room_id, user_id=user_id, message=message)
        self.db.add(room_message)
        
        # Update room last_activity_at
        room = self.get_by_id(room_id)
        if room:
            room.last_activity_at = datetime.utcnow()
        
        self.db.commit()
        self.db.refresh(room_message)
        return room_message

    def get_join_requests(self, room_id: UUID, status: Optional[RoomJoinRequestStatus] = None) -> List[RoomJoinRequest]:
        query = (
            self.db.query(RoomJoinRequest)
            .options(joinedload(RoomJoinRequest.user))
            .filter(RoomJoinRequest.room_id == room_id)
        )
        if status:
            query = query.filter(RoomJoinRequest.status == status)
        return query.order_by(RoomJoinRequest.requested_at.desc()).all()

    def create_join_request(self, room_id: UUID, user_id: UUID) -> Optional[RoomJoinRequest]:
        # Check if already exists
        existing = (
            self.db.query(RoomJoinRequest)
            .filter(
                and_(
                    RoomJoinRequest.room_id == room_id,
                    RoomJoinRequest.user_id == user_id,
                    RoomJoinRequest.status == RoomJoinRequestStatus.PENDING
                )
            )
            .first()
        )
        if existing:
            return None  # Already requested

        join_request = RoomJoinRequest(room_id=room_id, user_id=user_id)
        self.db.add(join_request)
        self.db.commit()
        self.db.refresh(join_request)
        return join_request

    def update_join_request(self, request_id: UUID, status: RoomJoinRequestStatus) -> bool:
        join_request = (
            self.db.query(RoomJoinRequest)
            .filter(RoomJoinRequest.id == request_id)
            .first()
        )
        if join_request:
            join_request.status = status
            join_request.responded_at = datetime.utcnow()
            self.db.commit()
            return True
        return False

    def destroy_if_empty(self, room_id: UUID) -> bool:
        """Destroy room if it has no participants"""
        count = self.get_participants_count(room_id)
        if count == 0:
            return self.delete(room_id)
        return False

    def get_user_material_kind_preference(self, user_id: UUID) -> Optional[UserMaterialKindPreference]:
        """Get first material kind preference for user"""
        return (
            self.db.query(UserMaterialKindPreference)
            .options(joinedload(UserMaterialKindPreference.material_kind))
            .filter(UserMaterialKindPreference.user_id == user_id)
            .order_by(UserMaterialKindPreference.order)
            .first()
        )
