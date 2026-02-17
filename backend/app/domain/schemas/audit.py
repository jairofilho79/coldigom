from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any
from uuid import UUID
from datetime import datetime
from app.domain.models.audit_log import AuditActionType


class AuditLogResponse(BaseModel):
    id: UUID
    user_id: UUID
    username: str
    action: AuditActionType
    resource_type: str
    resource_id: Optional[UUID] = None
    resource_name: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    request_method: Optional[str] = None
    request_path: Optional[str] = None
    changes: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None
    created_at: datetime
    success: bool
    error_message: Optional[str] = None
    
    model_config = ConfigDict(from_attributes=True, extra='forbid')


class AuditLogFilter(BaseModel):
    user_id: Optional[UUID] = None
    username: Optional[str] = None
    action: Optional[AuditActionType] = None
    resource_type: Optional[str] = None
    resource_id: Optional[UUID] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    success: Optional[bool] = None
    skip: int = Field(0, ge=0)
    limit: int = Field(100, ge=1, le=1000)
    
    model_config = ConfigDict(extra='forbid')
