from typing import Dict, Optional
from uuid import UUID
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from sqlalchemy import and_, func
from fastapi import HTTPException, status
from app.domain.models.audit_log import AuditLog, AuditActionType
import logging

logger = logging.getLogger(__name__)


class ActionRateLimiter:
    """Rate limiter baseado em ações do usuário (não apenas IP)"""
    
    # Limites por tipo de ação (ações por hora)
    LIMITS: Dict[AuditActionType, int] = {
        AuditActionType.DELETE: 20,
        AuditActionType.CREATE: 100,
        AuditActionType.UPDATE: 200,
        AuditActionType.DOWNLOAD: 50,
    }
    
    def __init__(self, db: Session):
        self.db = db
    
    def check_limit(
        self,
        user_id: UUID,
        action: AuditActionType,
        raise_on_exceed: bool = True
    ) -> bool:
        """
        Verifica se o usuário excedeu o limite para uma ação específica.
        
        Args:
            user_id: ID do usuário
            action: Tipo de ação
            raise_on_exceed: Se True, levanta exceção quando limite excedido
        
        Returns:
            True se dentro do limite, False se excedido
        
        Raises:
            HTTPException: Se raise_on_exceed=True e limite excedido
        """
        limit = self.LIMITS.get(action)
        
        if limit is None:
            # Sem limite definido para esta ação
            return True
        
        # Contar ações do usuário na última hora
        one_hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
        count = (
            self.db.query(func.count(AuditLog.id))
            .filter(
                and_(
                    AuditLog.user_id == user_id,
                    AuditLog.action == action,
                    AuditLog.created_at >= one_hour_ago,
                    AuditLog.success == True
                )
            )
            .scalar()
        )
        
        if count >= limit:
            if raise_on_exceed:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Rate limit exceeded for action '{action.value}'. "
                           f"Maximum {limit} actions per hour allowed."
                )
            return False
        
        return True
    
    def get_remaining_quota(self, user_id: UUID, action: AuditActionType) -> int:
        """
        Retorna quantas ações o usuário ainda pode realizar.
        
        Returns:
            Número de ações restantes
        """
        limit = self.LIMITS.get(action)
        
        if limit is None:
            return -1  # Sem limite
        
        one_hour_ago = datetime.utcnow() - timedelta(hours=1)
        count = (
            self.db.query(func.count(AuditLog.id))
            .filter(
                and_(
                    AuditLog.user_id == user_id,
                    AuditLog.action == action,
                    AuditLog.created_at >= one_hour_ago,
                    AuditLog.success == True
                )
            )
            .scalar()
        )
        
        return max(0, limit - count)
