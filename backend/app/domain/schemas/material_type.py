from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID


class MaterialTypeBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)


class MaterialTypeCreate(MaterialTypeBase):
    pass


class MaterialTypeUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)


class MaterialTypeResponse(MaterialTypeBase):
    id: UUID

    class Config:
        from_attributes = True
