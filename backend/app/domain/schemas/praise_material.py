from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID
from app.domain.schemas.material_type import MaterialTypeResponse


class PraiseMaterialBase(BaseModel):
    material_kind_id: UUID
    material_type_id: UUID
    path: str = Field(..., min_length=1)
    is_old: Optional[bool] = False
    old_description: Optional[str] = None


class PraiseMaterialCreate(PraiseMaterialBase):
    praise_id: UUID


class PraiseMaterialUpdate(BaseModel):
    material_kind_id: Optional[UUID] = None
    material_type_id: Optional[UUID] = None
    path: Optional[str] = Field(None, min_length=1)
    is_old: Optional[bool] = None
    old_description: Optional[str] = None


class PraiseMaterialResponse(PraiseMaterialBase):
    id: UUID
    praise_id: UUID
    is_old: bool = False
    old_description: Optional[str] = None
    material_kind: Optional["MaterialKindResponse"] = None
    material_type: Optional[MaterialTypeResponse] = None

    class Config:
        from_attributes = True


# Forward reference resolution
from app.domain.schemas.material_kind import MaterialKindResponse
PraiseMaterialResponse.model_rebuild()






