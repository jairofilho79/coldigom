from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID


class PraiseTagBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)


class PraiseTagCreate(PraiseTagBase):
    pass


class PraiseTagUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)


class PraiseTagResponse(PraiseTagBase):
    id: UUID

    class Config:
        from_attributes = True






