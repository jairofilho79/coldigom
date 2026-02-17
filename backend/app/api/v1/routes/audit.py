from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from uuid import UUID
from datetime import datetime
from app.core.dependencies import get_db, get_current_user
from app.domain.models.user import User
from app.domain.models.audit_log import AuditActionType
from app.domain.schemas.audit import AuditLogResponse, AuditLogFilter
from app.infrastructure.database.repositories.audit_log_repository import AuditLogRepository
from app.core.monitoring.performance_monitor import PerformanceMonitor

router = APIRouter()


@router.get("/", response_model=List[AuditLogResponse])
def list_audit_logs(
    user_id: Optional[UUID] = Query(None),
    username: Optional[str] = Query(None),
    action: Optional[AuditActionType] = Query(None),
    resource_type: Optional[str] = Query(None),
    resource_id: Optional[UUID] = Query(None),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    success: Optional[bool] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lista logs de auditoria com filtros e paginação"""
    filters = AuditLogFilter(
        user_id=user_id,
        username=username,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        start_date=start_date,
        end_date=end_date,
        success=success,
        skip=skip,
        limit=limit,
    )
    
    repo = AuditLogRepository(db)
    logs = repo.get_all(filters)
    return logs


@router.get("/{log_id}", response_model=AuditLogResponse)
def get_audit_log(
    log_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtém um log de auditoria específico"""
    repo = AuditLogRepository(db)
    log = repo.get_by_id(log_id)
    
    if not log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resource not found"
        )
    
    return log


@router.get("/resource/{resource_type}/{resource_id}", response_model=List[AuditLogResponse])
def get_resource_history(
    resource_type: str,
    resource_id: UUID,
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtém histórico completo de um recurso específico"""
    repo = AuditLogRepository(db)
    logs = repo.get_by_resource(resource_type, resource_id, limit=limit)
    return logs


@router.get("/stats")
def get_audit_statistics(
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtém estatísticas de auditoria"""
    monitor = PerformanceMonitor(db)
    stats = monitor.get_audit_statistics(start_date=start_date, end_date=end_date)
    return stats
