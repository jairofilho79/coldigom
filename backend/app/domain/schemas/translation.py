from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID


# MaterialKind Translation Schemas
class MaterialKindTranslationBase(BaseModel):
    material_kind_id: UUID
    language_code: str
    translated_name: str = Field(..., min_length=1, max_length=255)


class MaterialKindTranslationCreate(MaterialKindTranslationBase):
    pass


class MaterialKindTranslationUpdate(BaseModel):
    translated_name: Optional[str] = Field(None, min_length=1, max_length=255)


class MaterialKindTranslationResponse(MaterialKindTranslationBase):
    id: UUID

    class Config:
        from_attributes = True


# PraiseTag Translation Schemas
class PraiseTagTranslationBase(BaseModel):
    praise_tag_id: UUID
    language_code: str
    translated_name: str = Field(..., min_length=1, max_length=255)


class PraiseTagTranslationCreate(PraiseTagTranslationBase):
    pass


class PraiseTagTranslationUpdate(BaseModel):
    translated_name: Optional[str] = Field(None, min_length=1, max_length=255)


class PraiseTagTranslationResponse(PraiseTagTranslationBase):
    id: UUID

    class Config:
        from_attributes = True


# MaterialType Translation Schemas
class MaterialTypeTranslationBase(BaseModel):
    material_type_id: UUID
    language_code: str
    translated_name: str = Field(..., min_length=1, max_length=255)


class MaterialTypeTranslationCreate(MaterialTypeTranslationBase):
    pass


class MaterialTypeTranslationUpdate(BaseModel):
    translated_name: Optional[str] = Field(None, min_length=1, max_length=255)


class MaterialTypeTranslationResponse(MaterialTypeTranslationBase):
    id: UUID

    class Config:
        from_attributes = True


# Generic translation query schemas
class TranslationQuery(BaseModel):
    entity_type: str = Field(..., description="Entity type: material_kind, praise_tag, or material_type")
    language_code: Optional[str] = Field(None, description="Filter by language code")
    entity_id: Optional[UUID] = Field(None, description="Filter by entity ID")
