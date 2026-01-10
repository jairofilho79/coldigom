from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID


class MaterialKindBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)


class MaterialKindCreate(MaterialKindBase):
    pass


class MaterialKindUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)


class MaterialKindResponse(MaterialKindBase):
    id: UUID

    class Config:
        from_attributes = True






