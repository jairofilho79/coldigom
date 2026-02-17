from typing import Dict, Any, List
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from app.domain.models.audit_log import AuditLog, AuditActionType
from app.infrastructure.database.database import SessionLocal


class PerformanceMonitor:
    """Monitor de performance do sistema de auditoria"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def get_audit_statistics(
        self,
        start_date: datetime = None,
        end_date: datetime = None
    ) -> Dict[str, Any]:
        """
        Obtém estatísticas de auditoria.
        
        Args:
            start_date: Data inicial (padrão: 30 dias atrás)
            end_date: Data final (padrão: agora)
        
        Returns:
            Dict com estatísticas
        """
        if not start_date:
            start_date = datetime.now(timezone.utc) - timedelta(days=30)
        if not end_date:
            end_date = datetime.now(timezone.utc)
        
        # Total de logs no período
        total_logs = (
            self.db.query(func.count(AuditLog.id))
            .filter(
                and_(
                    AuditLog.created_at >= start_date,
                    AuditLog.created_at <= end_date
                )
            )
            .scalar()
        )
        
        # Logs por tipo de ação
        logs_by_action = (
            self.db.query(
                AuditLog.action,
                func.count(AuditLog.id).label('count')
            )
            .filter(
                and_(
                    AuditLog.created_at >= start_date,
                    AuditLog.created_at <= end_date
                )
            )
            .group_by(AuditLog.action)
            .all()
        )
        
        action_counts = {
            action.value if hasattr(action, 'value') else str(action): count
            for action, count in logs_by_action
        }
        
        # Top usuários por atividade
        top_users = (
            self.db.query(
                AuditLog.user_id,
                AuditLog.username,
                func.count(AuditLog.id).label('count')
            )
            .filter(
                and_(
                    AuditLog.created_at >= start_date,
                    AuditLog.created_at <= end_date
                )
            )
            .group_by(AuditLog.user_id, AuditLog.username)
            .order_by(func.count(AuditLog.id).desc())
            .limit(10)
            .all()
        )
        
        top_users_list = [
            {
                "user_id": str(user_id),
                "username": username,
                "action_count": count
            }
            for user_id, username, count in top_users
        ]
        
        # Média de logs por dia
        days_diff = (end_date - start_date).days or 1
        avg_per_day = total_logs / days_diff
        
        # Taxa de sucesso
        success_count = (
            self.db.query(func.count(AuditLog.id))
            .filter(
                and_(
                    AuditLog.created_at >= start_date,
                    AuditLog.created_at <= end_date,
                    AuditLog.success == True
                )
            )
            .scalar()
        )
        
        success_rate = (success_count / total_logs * 100) if total_logs > 0 else 0
        
        return {
            "period": {
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
                "days": days_diff,
            },
            "total_logs": total_logs,
            "logs_by_action": action_counts,
            "top_users": top_users_list,
            "average_per_day": round(avg_per_day, 2),
            "success_rate": round(success_rate, 2),
            "success_count": success_count,
            "failure_count": total_logs - success_count,
        }
