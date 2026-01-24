from sqlalchemy import Column, String, DateTime, ForeignKey, Boolean, Integer, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum
from app.infrastructure.database.database import Base


class RoomAccessType(enum.Enum):
    PUBLIC = "PUBLIC"
    PASSWORD = "PASSWORD"
    APPROVAL = "APPROVAL"


class Room(Base):
    __tablename__ = "rooms"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    code = Column(String(8), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(String(1000), nullable=True)
    creator_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    access_type = Column(SQLEnum(RoomAccessType), nullable=False, default=RoomAccessType.PUBLIC)
    password_hash = Column(String(255), nullable=True)
    is_open_for_requests = Column(Boolean, nullable=False, default=True)
    auto_destroy_on_empty = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    last_activity_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    creator = relationship("User", backref="created_rooms")
    participants = relationship("RoomParticipant", back_populates="room", cascade="all, delete-orphan")
    messages = relationship("RoomMessage", back_populates="room", cascade="all, delete-orphan")
    room_praises = relationship("RoomPraise", back_populates="room", cascade="all, delete-orphan")
    join_requests = relationship("RoomJoinRequest", back_populates="room", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Room(id={self.id}, code='{self.code}', name='{self.name}')>"


class RoomParticipant(Base):
    __tablename__ = "room_participants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    room_id = Column(UUID(as_uuid=True), ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    joined_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_seen_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    room = relationship("Room", back_populates="participants")
    user = relationship("User", backref="room_participations")

    def __repr__(self):
        return f"<RoomParticipant(id={self.id}, room_id={self.room_id}, user_id={self.user_id})>"


class RoomMessage(Base):
    __tablename__ = "room_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    room_id = Column(UUID(as_uuid=True), ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    message = Column(String(140), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    # Relationships
    room = relationship("Room", back_populates="messages")
    user = relationship("User", backref="room_messages")

    def __repr__(self):
        return f"<RoomMessage(id={self.id}, room_id={self.room_id}, user_id={self.user_id}, message='{self.message[:20]}...')>"


class RoomPraise(Base):
    __tablename__ = "room_praises"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    room_id = Column(UUID(as_uuid=True), ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    praise_id = Column(UUID(as_uuid=True), ForeignKey("praises.id", ondelete="CASCADE"), nullable=False, index=True)
    order = Column(Integer, nullable=False, default=0)
    added_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    room = relationship("Room", back_populates="room_praises")
    praise = relationship("Praise", backref="room_praises")

    def __repr__(self):
        return f"<RoomPraise(id={self.id}, room_id={self.room_id}, praise_id={self.praise_id}, order={self.order})>"


class RoomJoinRequestStatus(enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class RoomJoinRequest(Base):
    __tablename__ = "room_join_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    room_id = Column(UUID(as_uuid=True), ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(SQLEnum(RoomJoinRequestStatus), nullable=False, default=RoomJoinRequestStatus.PENDING)
    requested_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    responded_at = Column(DateTime, nullable=True)

    # Relationships
    room = relationship("Room", back_populates="join_requests")
    user = relationship("User", backref="room_join_requests")

    def __repr__(self):
        return f"<RoomJoinRequest(id={self.id}, room_id={self.room_id}, user_id={self.user_id}, status={self.status})>"
