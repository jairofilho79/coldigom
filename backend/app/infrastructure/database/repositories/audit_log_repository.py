from typing import Optional, List
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from datetime import datetime
from app.domain.models.audit_log import AuditLog, AuditActionType
from app.domain.schemas.audit import AuditLogFilter


class AuditLogRepository:
    def __init__(self, db: Session):
        self.db = db
    
    def get_by_id(self, log_id: UUID) -> Optional[AuditLog]:
        return self.db.query(AuditLog).filter(AuditLog.id == log_id).first()
    
    def get_all(self, filters: AuditLogFilter) -> List[AuditLog]:
        query = self.db.query(AuditLog)
        
        # Aplicar filtros
        if filters.user_id:
            query = query.filter(AuditLog.user_id == filters.user_id)
        
        if filters.username:
            query = query.filter(AuditLog.username.ilike(f"%{filters.username}%"))
        
        if filters.action:
            query = query.filter(AuditLog.action == filters.action)
        
        if filters.resource_type:
            query = query.filter(AuditLog.resource_type == filters.resource_type)
        
        if filters.resource_id:
            query = query.filter(AuditLog.resource_id == filters.resource_id)
        
        if filters.start_date:
            query = query.filter(AuditLog.created_at >= filters.start_date)
        
        if filters.end_date:
            query = query.filter(AuditLog.created_at <= filters.end_date)
        
        if filters.success is not None:
            query = query.filter(AuditLog.success == filters.success)
        
        # Ordenar por data (mais recente primeiro)
        query = query.order_by(AuditLog.created_at.desc())
        
        # Paginação
        return query.offset(filters.skip).limit(filters.limit).all()
    
    def get_by_resource(self, resource_type: str, resource_id: UUID, limit: int = 100) -> List[AuditLog]:
        """Obtém histórico completo de um recurso específico"""
        return (
            self.db.query(AuditLog)
            .filter(
                and_(
                    AuditLog.resource_type == resource_type,
                    AuditLog.resource_id == resource_id
                )
            )
            .order_by(AuditLog.created_at.desc())
            .limit(limit)
            .all()
        )
    
    def create(self, audit_log: AuditLog) -> AuditLog:
        self.db.add(audit_log)
        self.db.commit()
        self.db.refresh(audit_log)
        return audit_log
    
    def count(self, filters: Optional[AuditLogFilter] = None) -> int:
        """Conta total de logs que correspondem aos filtros"""
        query = self.db.query(AuditLog)
        
        if filters:
            if filters.user_id:
                query = query.filter(AuditLog.user_id == filters.user_id)
            if filters.username:
                query = query.filter(AuditLog.username.ilike(f"%{filters.username}%"))
            if filters.action:
                query = query.filter(AuditLog.action == filters.action)
            if filters.resource_type:
                query = query.filter(AuditLog.resource_type == filters.resource_type)
            if filters.resource_id:
                query = query.filter(AuditLog.resource_id == filters.resource_id)
            if filters.start_date:
                query = query.filter(AuditLog.created_at >= filters.start_date)
            if filters.end_date:
                query = query.filter(AuditLog.created_at <= filters.end_date)
            if filters.success is not None:
                query = query.filter(AuditLog.success == filters.success)
        
        return query.count()
