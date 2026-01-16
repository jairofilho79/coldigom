from pydantic import BaseModel, Field
from typing import Optional, List
from uuid import UUID
from datetime import datetime


class PraiseBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    number: Optional[int] = None


class PraiseCreate(PraiseBase):
    tag_ids: Optional[List[UUID]] = []
    materials: Optional[List["PraiseMaterialCreate"]] = []


class PraiseUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    number: Optional[int] = None
    tag_ids: Optional[List[UUID]] = None


class PraiseTagSimple(BaseModel):
    id: UUID
    name: str

    class Config:
        from_attributes = True


class PraiseMaterialSimple(BaseModel):
    id: UUID
    material_kind_id: UUID
    material_type_id: UUID
    path: str
    material_kind: Optional["MaterialKindResponse"] = None
    material_type: Optional["MaterialTypeResponse"] = None

    class Config:
        from_attributes = True


class PraiseResponse(PraiseBase):
    id: UUID
    created_at: datetime
    updated_at: datetime
    tags: List[PraiseTagSimple] = []
    materials: List[PraiseMaterialSimple] = []

    class Config:
        from_attributes = True


# Forward reference resolution
from app.domain.schemas.praise_material import PraiseMaterialCreate
from app.domain.schemas.material_kind import MaterialKindResponse
from app.domain.schemas.material_type import MaterialTypeResponse
PraiseCreate.model_rebuild()
PraiseMaterialSimple.model_rebuild()






