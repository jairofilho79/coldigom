from pydantic import BaseModel, Field
from typing import Optional, List
from uuid import UUID
from datetime import datetime
from enum import Enum


class RoomAccessType(str, Enum):
    PUBLIC = "public"
    PASSWORD = "password"
    APPROVAL = "approval"


class RoomJoinRequestStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class RoomBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    access_type: RoomAccessType = Field(default=RoomAccessType.PUBLIC)
    password: Optional[str] = Field(None, min_length=4, max_length=50)
    is_open_for_requests: Optional[bool] = Field(default=True)
    auto_destroy_on_empty: bool = Field(default=True)


class RoomCreate(RoomBase):
    pass


class RoomUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    access_type: Optional[RoomAccessType] = None
    password: Optional[str] = Field(None, min_length=4, max_length=50)
    is_open_for_requests: Optional[bool] = None
    auto_destroy_on_empty: Optional[bool] = None


class RoomResponse(BaseModel):
    id: UUID
    code: str
    name: str
    description: Optional[str]
    creator_id: UUID
    access_type: RoomAccessType
    is_open_for_requests: Optional[bool]
    auto_destroy_on_empty: bool
    created_at: datetime
    updated_at: datetime
    last_activity_at: datetime
    participants_count: int = 0
    praises_count: int = 0

    class Config:
        from_attributes = True


class RoomDetailResponse(RoomResponse):
    creator_username: Optional[str] = None
    is_creator: bool = False
    is_participant: bool = False
    praises: List[dict] = []
    participants: List[dict] = []


class RoomJoinRequest(BaseModel):
    password: Optional[str] = Field(None, min_length=4, max_length=50)


class RoomJoinResponse(BaseModel):
    room_id: UUID
    message: str


class RoomMessageCreate(BaseModel):
    message: str = Field(..., min_length=1, max_length=140)


class RoomMessageResponse(BaseModel):
    id: UUID
    room_id: UUID
    user_id: UUID
    username: str
    material_kind_name: Optional[str] = None
    message: str
    created_at: datetime

    class Config:
        from_attributes = True


class RoomParticipantResponse(BaseModel):
    id: UUID
    user_id: UUID
    username: str
    material_kind_name: Optional[str] = None
    joined_at: datetime
    last_seen_at: datetime

    class Config:
        from_attributes = True


class RoomPraiseResponse(BaseModel):
    id: UUID
    praise_id: UUID
    praise_name: str
    praise_number: Optional[int]
    order: int
    added_at: datetime

    class Config:
        from_attributes = True


class RoomPraiseAdd(BaseModel):
    praise_id: UUID


class RoomPraiseReorder(BaseModel):
    praise_orders: List[dict] = Field(..., description="Lista de {praise_id: UUID, order: int}")


class RoomJoinRequestDetail(BaseModel):
    id: UUID
    room_id: UUID
    user_id: UUID
    username: str
    status: RoomJoinRequestStatus
    requested_at: datetime
    responded_at: Optional[datetime]

    class Config:
        from_attributes = True
