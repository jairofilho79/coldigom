from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from uuid import UUID
from datetime import datetime
from app.domain.schemas.material_kind import MaterialKindResponse


class UserMaterialKindPreferenceBase(BaseModel):
    user_id: UUID
    material_kind_id: UUID
    order: int = Field(..., ge=0, le=4)


class UserMaterialKindPreferenceCreate(UserMaterialKindPreferenceBase):
    pass


class UserMaterialKindPreferenceUpdate(BaseModel):
    order: Optional[int] = Field(None, ge=0, le=4)


class UserMaterialKindPreferenceResponse(BaseModel):
    id: UUID
    user_id: UUID
    material_kind_id: UUID
    order: int
    created_at: datetime
    updated_at: datetime
    material_kind: Optional[MaterialKindResponse] = None

    class Config:
        from_attributes = True


class MaterialKindOrderUpdate(BaseModel):
    material_kind_ids: List[UUID] = Field(..., min_length=0, max_length=5)

    @field_validator('material_kind_ids')
    @classmethod
    def validate_no_duplicates(cls, v: List[UUID]) -> List[UUID]:
        if len(v) != len(set(v)):
            raise ValueError('material_kind_ids não pode conter duplicatas')
        return v
