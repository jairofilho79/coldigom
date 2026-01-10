from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID
from app.domain.models.praise_material import MaterialType


class PraiseMaterialBase(BaseModel):
    material_kind_id: UUID
    path: str = Field(..., min_length=1)
    type: MaterialType = MaterialType.FILE


class PraiseMaterialCreate(PraiseMaterialBase):
    praise_id: UUID


class PraiseMaterialUpdate(BaseModel):
    material_kind_id: Optional[UUID] = None
    path: Optional[str] = Field(None, min_length=1)
    type: Optional[MaterialType] = None


class PraiseMaterialResponse(PraiseMaterialBase):
    id: UUID
    praise_id: UUID
    material_kind: Optional["MaterialKindResponse"] = None

    class Config:
        from_attributes = True


# Forward reference resolution
from app.domain.schemas.material_kind import MaterialKindResponse
PraiseMaterialResponse.model_rebuild()






