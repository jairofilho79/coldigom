from pydantic import BaseModel, Field
from typing import Optional


class LanguageBase(BaseModel):
    code: str = Field(..., description="Language code (e.g., pt-BR, en-US)")
    name: str = Field(..., description="Language display name")
    is_active: bool = Field(default=True, description="Whether the language is active")


class LanguageCreate(LanguageBase):
    pass


class LanguageUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None


class LanguageResponse(LanguageBase):
    class Config:
        from_attributes = True
