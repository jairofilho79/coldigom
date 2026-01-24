from typing import List, Optional, Dict
from uuid import UUID
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from datetime import datetime
from app.domain.models.room import (
    Room,
    RoomParticipant,
    RoomMessage,
    RoomPraise,
    RoomJoinRequest,
    RoomAccessType,
    RoomJoinRequestStatus,
)
from app.domain.schemas.room import (
    RoomCreate,
    RoomUpdate,
    RoomDetailResponse,
    RoomJoinRequest as RoomJoinRequestSchema,
    RoomMessageCreate,
    RoomPraiseAdd,
    RoomPraiseReorder,
)
from app.infrastructure.database.repositories.room_repository import RoomRepository
from app.infrastructure.database.repositories.praise_repository import PraiseRepository
from app.infrastructure.database.repositories.praise_list_repository import PraiseListRepository
from app.core.security import get_password_hash, verify_password


class RoomService:
    def __init__(self, db: Session):
        self.db = db
        self.repository = RoomRepository(db)
        self.praise_repository = PraiseRepository(db)
        self.praise_list_repository = PraiseListRepository(db)

    def create_room(self, user_id: UUID, room_data: RoomCreate) -> Room:
        """Create a new room"""
        # Convert schema enum (lowercase) to model enum (uppercase)
        access_type_map = {
            "public": RoomAccessType.PUBLIC,
            "password": RoomAccessType.PASSWORD,
            "approval": RoomAccessType.APPROVAL,
        }
        
        if isinstance(room_data.access_type, str):
            access_type_enum = access_type_map.get(room_data.access_type.lower(), RoomAccessType.PUBLIC)
        else:
            # If it's already an enum from schema, get its value and map it
            access_type_str = room_data.access_type.value if hasattr(room_data.access_type, 'value') else str(room_data.access_type)
            access_type_enum = access_type_map.get(access_type_str.lower(), RoomAccessType.PUBLIC)
        
        room = Room(
            name=room_data.name,
            description=room_data.description,
            creator_id=user_id,
            access_type=access_type_enum,
            is_open_for_requests=room_data.is_open_for_requests if access_type_enum == RoomAccessType.APPROVAL else None,
            auto_destroy_on_empty=room_data.auto_destroy_on_empty,
        )
        
        # Hash password if access type is PASSWORD
        if access_type_enum == RoomAccessType.PASSWORD:
            if not room_data.password:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Password is required for password-protected rooms"
                )
            room.password_hash = get_password_hash(room_data.password)
        
        room = self.repository.create(room)
        
        # Add creator as participant
        self.repository.add_participant(room.id, user_id)
        
        return room

    def get_room_by_id(self, room_id: UUID, user_id: Optional[UUID] = None) -> Room:
        """Get room by ID"""
        room = self.repository.get_by_id(room_id, user_id)
        if not room:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Room with id {room_id} not found"
            )
        return room

    def get_room_by_code(self, code: str, user_id: Optional[UUID] = None) -> Room:
        """Get room by code"""
        room = self.repository.get_by_code(code)
        if not room:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Room with code {code} not found"
            )
        return room

    def get_user_rooms(self, user_id: UUID) -> List[Room]:
        """Get all rooms for a user"""
        return self.repository.get_user_rooms(user_id)

    def get_public_rooms(self, skip: int = 0, limit: int = 100) -> List[Room]:
        """Get public rooms"""
        return self.repository.get_public_rooms(skip=skip, limit=limit)

    def update_room(self, room_id: UUID, user_id: UUID, room_data: RoomUpdate) -> Room:
        """Update room (only creator)"""
        room = self.get_room_by_id(room_id, user_id)
        
        if room.creator_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the creator can update the room"
            )
        
        # Map for converting schema enum to model enum
        access_type_map = {
            "public": RoomAccessType.PUBLIC,
            "password": RoomAccessType.PASSWORD,
            "approval": RoomAccessType.APPROVAL,
        }
        
        if room_data.name is not None:
            room.name = room_data.name
        if room_data.description is not None:
            room.description = room_data.description
        if room_data.access_type is not None:
            # Convert schema enum (lowercase) to model enum (uppercase)
            if isinstance(room_data.access_type, str):
                room.access_type = access_type_map.get(room_data.access_type.lower(), RoomAccessType.PUBLIC)
            else:
                access_type_str = room_data.access_type.value if hasattr(room_data.access_type, 'value') else str(room_data.access_type)
                room.access_type = access_type_map.get(access_type_str.lower(), RoomAccessType.PUBLIC)
            # Reset password if changing from PASSWORD to another type
            if room.access_type != RoomAccessType.PASSWORD:
                room.password_hash = None
        if room_data.password is not None:
            if room.access_type == RoomAccessType.PASSWORD:
                room.password_hash = get_password_hash(room_data.password)
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Password can only be set for password-protected rooms"
                )
        if room_data.is_open_for_requests is not None:
            if room.access_type == RoomAccessType.APPROVAL:
                room.is_open_for_requests = room_data.is_open_for_requests
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="is_open_for_requests can only be set for approval-type rooms"
                )
        if room_data.auto_destroy_on_empty is not None:
            room.auto_destroy_on_empty = room_data.auto_destroy_on_empty
        
        return self.repository.update(room)

    def delete_room(self, room_id: UUID, user_id: UUID) -> bool:
        """Delete room (only creator)"""
        room = self.get_room_by_id(room_id, user_id)
        
        if room.creator_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the creator can delete the room"
            )
        
        return self.repository.delete(room_id)

    def join_room(self, code: str, user_id: UUID, password: Optional[str] = None) -> Room:
        """Join a room"""
        room = self.get_room_by_code(code)
        
        # Check access type
        if room.access_type == RoomAccessType.PASSWORD:
            if not password:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Password is required"
                )
            if not verify_password(password, room.password_hash):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Invalid password"
                )
        elif room.access_type == RoomAccessType.APPROVAL:
            # Check if user already has a pending request
            join_requests = self.repository.get_join_requests(room.id, RoomJoinRequestStatus.PENDING)
            user_request = next((r for r in join_requests if r.user_id == user_id), None)
            if not user_request:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You must request to join this room first"
                )
            if user_request.status != RoomJoinRequestStatus.APPROVED:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Your join request has not been approved yet"
                )
        
        # Add as participant
        self.repository.add_participant(room.id, user_id)
        
        return room

    def request_join(self, code: str, user_id: UUID) -> RoomJoinRequest:
        """Request to join a room (for approval type)"""
        room = self.get_room_by_code(code)
        
        if room.access_type != RoomAccessType.APPROVAL:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This room does not require approval to join"
            )
        
        if not room.is_open_for_requests:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Room is not accepting new join requests"
            )
        
        # Check if already participant
        if self.repository.is_participant(room.id, user_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You are already a participant in this room"
            )
        
        join_request = self.repository.create_join_request(room.id, user_id)
        if not join_request:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You already have a pending join request"
            )
        
        return join_request

    def approve_join_request(self, room_id: UUID, request_id: UUID, creator_id: UUID) -> RoomJoinRequest:
        """Approve a join request (only creator)"""
        room = self.get_room_by_id(room_id)
        
        if room.creator_id != creator_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the creator can approve join requests"
            )
        
        join_request = (
            self.db.query(RoomJoinRequest)
            .filter(RoomJoinRequest.id == request_id)
            .first()
        )
        
        if not join_request or join_request.room_id != room_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Join request not found"
            )
        
        if join_request.status != RoomJoinRequestStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Join request is not pending"
            )
        
        self.repository.update_join_request(request_id, RoomJoinRequestStatus.APPROVED)
        
        # Add user as participant
        self.repository.add_participant(room_id, join_request.user_id)
        
        self.db.refresh(join_request)
        return join_request

    def reject_join_request(self, room_id: UUID, request_id: UUID, creator_id: UUID) -> RoomJoinRequest:
        """Reject a join request (only creator)"""
        room = self.get_room_by_id(room_id)
        
        if room.creator_id != creator_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the creator can reject join requests"
            )
        
        join_request = (
            self.db.query(RoomJoinRequest)
            .filter(RoomJoinRequest.id == request_id)
            .first()
        )
        
        if not join_request or join_request.room_id != room_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Join request not found"
            )
        
        if join_request.status != RoomJoinRequestStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Join request is not pending"
            )
        
        self.repository.update_join_request(request_id, RoomJoinRequestStatus.REJECTED)
        self.db.refresh(join_request)
        return join_request

    def leave_room(self, room_id: UUID, user_id: UUID) -> bool:
        """Leave a room"""
        room = self.get_room_by_id(room_id)
        
        if not self.repository.is_participant(room_id, user_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You are not a participant in this room"
            )
        
        # Cannot leave if you're the creator and there are other participants
        if room.creator_id == user_id:
            participants_count = self.repository.get_participants_count(room_id)
            if participants_count > 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Creator cannot leave room while there are other participants"
                )
        
        self.repository.remove_participant(room_id, user_id)
        
        # Destroy room if empty and auto_destroy is enabled
        if room.auto_destroy_on_empty:
            self.repository.destroy_if_empty(room_id)
        
        return True

    def add_praise(self, room_id: UUID, praise_id: UUID, creator_id: UUID) -> bool:
        """Add praise to room (only creator)"""
        room = self.get_room_by_id(room_id)
        
        if room.creator_id != creator_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the creator can add praises"
            )
        
        # Verify praise exists
        praise = self.praise_repository.get_by_id(praise_id)
        if not praise:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Praise with id {praise_id} not found"
            )
        
        result = self.repository.add_praise(room_id, praise_id)
        if not result:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Praise is already in this room"
            )
        
        return True

    def remove_praise(self, room_id: UUID, praise_id: UUID, creator_id: UUID) -> bool:
        """Remove praise from room (only creator)"""
        room = self.get_room_by_id(room_id)
        
        if room.creator_id != creator_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the creator can remove praises"
            )
        
        result = self.repository.remove_praise(room_id, praise_id)
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Praise not found in this room"
            )
        
        return True

    def reorder_praises(self, room_id: UUID, orders: RoomPraiseReorder, creator_id: UUID) -> bool:
        """Reorder praises in room (only creator)"""
        room = self.get_room_by_id(room_id)
        
        if room.creator_id != creator_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the creator can reorder praises"
            )
        
        return self.repository.reorder_praises(room_id, orders.praise_orders)

    def import_praise_list(self, room_id: UUID, list_id: UUID, creator_id: UUID) -> bool:
        """Import praises from a praise list (only creator)"""
        room = self.get_room_by_id(room_id)
        
        if room.creator_id != creator_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the creator can import lists"
            )
        
        # Get praise list
        praise_list = self.praise_list_repository.get_by_id(list_id, creator_id)
        if not praise_list:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Praise list not found"
            )
        
        # Get praises from list with order
        from app.domain.models.praise_list import praise_list_praise_association
        from sqlalchemy import select
        
        stmt = (
            select(
                praise_list_praise_association.c.praise_id,
                praise_list_praise_association.c.order
            )
            .where(praise_list_praise_association.c.praise_list_id == list_id)
            .order_by(praise_list_praise_association.c.order)
        )
        
        results = self.db.execute(stmt).all()
        
        # Add praises to room
        for praise_id, order in results:
            self.repository.add_praise(room_id, praise_id, order)
        
        return True

    def send_message(self, room_id: UUID, user_id: UUID, message_data: RoomMessageCreate) -> RoomMessage:
        """Send a message to room"""
        room = self.get_room_by_id(room_id)
        
        # Check if user is participant
        if not self.repository.is_participant(room_id, user_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You must be a participant to send messages"
            )
        
        # Validate message length
        if len(message_data.message) > 140:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Message must be 140 characters or less"
            )
        
        return self.repository.add_message(room_id, user_id, message_data.message)

    def get_room_detail(self, room_id: UUID, user_id: Optional[UUID] = None) -> Dict:
        """Get room detail with all related data"""
        room = self.get_room_by_id(room_id, user_id)
        
        # Get participants
        participants = self.repository.get_participants(room_id)
        participants_data = []
        for p in participants:
            material_kind_pref = self.repository.get_user_material_kind_preference(p.user_id)
            participants_data.append({
                "id": str(p.id),
                "user_id": str(p.user_id),
                "username": p.user.username if p.user else None,
                "material_kind_name": material_kind_pref.material_kind.name if material_kind_pref and material_kind_pref.material_kind else None,
                "joined_at": p.joined_at,
                "last_seen_at": p.last_seen_at,
            })
        
        # Get praises
        room_praises = self.repository.get_room_praises(room_id)
        praises_data = []
        for rp in room_praises:
            praises_data.append({
                "id": str(rp.id),
                "praise_id": str(rp.praise_id),
                "praise_name": rp.praise.name if rp.praise else None,
                "praise_number": rp.praise.number if rp.praise else None,
                "order": rp.order,
                "added_at": rp.added_at,
            })
        
        is_creator = user_id is not None and room.creator_id == user_id
        is_participant = user_id is not None and self.repository.is_participant(room_id, user_id)
        
        # Convert access_type from model enum (uppercase) to schema enum (lowercase)
        access_type_map = {
            "PUBLIC": "public",
            "PASSWORD": "password",
            "APPROVAL": "approval",
        }
        access_type_value = room.access_type.value if hasattr(room.access_type, 'value') else str(room.access_type)
        access_type_schema = access_type_map.get(access_type_value, "public")
        
        return {
            "id": room.id,
            "code": room.code,
            "name": room.name,
            "description": room.description,
            "creator_id": room.creator_id,
            "creator_username": room.creator.username if room.creator else None,
            "access_type": access_type_schema,
            "is_open_for_requests": room.is_open_for_requests,
            "auto_destroy_on_empty": room.auto_destroy_on_empty,
            "created_at": room.created_at,
            "updated_at": room.updated_at,
            "last_activity_at": room.last_activity_at,
            "participants_count": len(participants_data),
            "praises_count": len(praises_data),
            "is_creator": is_creator,
            "is_participant": is_participant,
            "praises": praises_data,
            "participants": participants_data,
        }

    def get_messages(self, room_id: UUID, limit: int = 100, offset: int = 0) -> List[Dict]:
        """Get room messages"""
        messages = self.repository.get_messages(room_id, limit=limit, offset=offset)
        messages_data = []
        for msg in reversed(messages):  # Reverse to show oldest first
            material_kind_pref = self.repository.get_user_material_kind_preference(msg.user_id)
            messages_data.append({
                "id": str(msg.id),
                "room_id": str(msg.room_id),
                "user_id": str(msg.user_id),
                "username": msg.user.username if msg.user else None,
                "material_kind_name": material_kind_pref.material_kind.name if material_kind_pref and material_kind_pref.material_kind else None,
                "message": msg.message,
                "created_at": msg.created_at,
            })
        return messages_data

    def get_join_requests(self, room_id: UUID, creator_id: UUID, status: Optional[RoomJoinRequestStatus] = None) -> List[Dict]:
        """Get join requests for a room (only creator)"""
        room = self.get_room_by_id(room_id)
        
        if room.creator_id != creator_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the creator can view join requests"
            )
        
        requests = self.repository.get_join_requests(room_id, status)
        requests_data = []
        
        # Map to convert model enum (uppercase) to schema enum (lowercase)
        status_map = {
            "PENDING": "pending",
            "APPROVED": "approved",
            "REJECTED": "rejected",
        }
        
        for req in requests:
            status_value = req.status.value if hasattr(req.status, 'value') else str(req.status)
            status_schema = status_map.get(status_value, "pending")
            requests_data.append({
                "id": str(req.id),
                "room_id": str(req.room_id),
                "user_id": str(req.user_id),
                "username": req.user.username if req.user else None,
                "status": status_schema,
                "requested_at": req.requested_at,
                "responded_at": req.responded_at,
            })
        return requests_data
