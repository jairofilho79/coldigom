from pydantic import BaseModel, Field
from typing import Optional, List
from uuid import UUID
from datetime import datetime


class PraiseListBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    is_public: bool = Field(default=True)


class PraiseListCreate(PraiseListBase):
    pass


class PraiseListUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    is_public: Optional[bool] = None


class PraiseListResponse(PraiseListBase):
    id: UUID
    user_id: UUID
    owner: Optional[str] = None  # username do dono
    praises_count: int = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PraiseListDetailResponse(PraiseListResponse):
    praises: List[dict] = []  # Lista de praises com ordem
    is_owner: bool = False
    is_following: bool = False


class ReorderPraisesRequest(BaseModel):
    praise_orders: List[dict] = Field(..., description="Lista de {praise_id: UUID, order: int}")
