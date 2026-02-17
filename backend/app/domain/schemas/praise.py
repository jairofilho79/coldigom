from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import Optional, List, Literal
from uuid import UUID
from datetime import datetime


class ReviewHistoryEvent(BaseModel):
    type: Literal["in_review", "review_cancelled", "review_finished"]
    date: str  # ISO 8601 datetime string
    
    model_config = ConfigDict(extra='forbid')


class PraiseBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    number: Optional[int] = None
    author: Optional[str] = Field(None, max_length=255)
    rhythm: Optional[str] = Field(None, max_length=100)
    tonality: Optional[str] = Field(None, max_length=50)
    category: Optional[str] = Field(None, max_length=255)
    
    model_config = ConfigDict(extra='forbid')


class PraiseCreate(PraiseBase):
    tag_ids: Optional[List[UUID]] = []
    materials: Optional[List["PraiseMaterialCreate"]] = []
    in_review: Optional[bool] = False
    in_review_description: Optional[str] = None
    
    model_config = ConfigDict(extra='forbid')


class PraiseUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    number: Optional[int] = None
    tag_ids: Optional[List[UUID]] = None
    in_review_description: Optional[str] = None
    author: Optional[str] = Field(None, max_length=255)
    rhythm: Optional[str] = Field(None, max_length=100)
    tonality: Optional[str] = Field(None, max_length=50)
    category: Optional[str] = Field(None, max_length=255)
    
    model_config = ConfigDict(extra='forbid')


class PraiseTagSimple(BaseModel):
    id: UUID
    name: str

    class Config:
        from_attributes = True
        extra = 'forbid'


class PraiseMaterialSimple(BaseModel):
    id: UUID
    material_kind_id: UUID
    material_type_id: UUID
    path: str
    is_old: bool = False
    old_description: Optional[str] = None
    material_kind: Optional["MaterialKindResponse"] = None
    material_type: Optional["MaterialTypeResponse"] = None

    class Config:
        from_attributes = True
        extra = 'forbid'


class PraiseResponse(PraiseBase):
    id: UUID
    created_at: datetime
    updated_at: datetime
    tags: List[PraiseTagSimple] = []
    materials: List[PraiseMaterialSimple] = []
    in_review: bool = False
    in_review_description: Optional[str] = None
    review_history: List[ReviewHistoryEvent] = []

    @field_validator("review_history", mode="before")
    @classmethod
    def coerce_review_history_none(cls, v: object) -> list:
        return v if v is not None else []

    class Config:
        from_attributes = True
        extra = 'forbid'


class ReviewActionRequest(BaseModel):
    action: Literal["start", "cancel", "finish"]
    in_review_description: Optional[str] = None  # used only for "start"
    
    model_config = ConfigDict(extra='forbid')


# Forward reference resolution
from app.domain.schemas.praise_material import PraiseMaterialCreate
from app.domain.schemas.material_kind import MaterialKindResponse
from app.domain.schemas.material_type import MaterialTypeResponse
PraiseCreate.model_rebuild()
PraiseMaterialSimple.model_rebuild()






