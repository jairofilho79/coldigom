from pydantic import BaseModel, EmailStr, Field, ConfigDict
from typing import Optional
from uuid import UUID
from datetime import datetime


class UserBase(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50)
    
    model_config = ConfigDict(extra='forbid')


class UserCreate(UserBase):
    password: str = Field(..., min_length=6)
    
    model_config = ConfigDict(extra='forbid')


class UserLogin(BaseModel):
    username: str
    password: str
    
    model_config = ConfigDict(extra='forbid')


class UserResponse(UserBase):
    id: UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
        extra = 'forbid'


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    
    model_config = ConfigDict(extra='forbid')


class RefreshTokenRequest(BaseModel):
    refresh_token: str
    
    model_config = ConfigDict(extra='forbid')






