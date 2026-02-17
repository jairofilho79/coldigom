from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from sqlalchemy import and_
from app.domain.models.audit_log import AuditLog
from app.infrastructure.database.database import SessionLocal
import logging

logger = logging.getLogger(__name__)


def cleanup_old_audit_logs(
    retention_days: int = 365,
    dry_run: bool = False
) -> dict:
    """
    Remove logs de auditoria antigos conforme política de retenção.
    
    Args:
        retention_days: Número de dias para manter logs (padrão: 365)
        dry_run: Se True, apenas conta sem deletar
    
    Returns:
        Dict com estatísticas da operação
    """
    db = SessionLocal()
    
    try:
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=retention_days)
        
        # Contar logs que seriam deletados
        logs_to_delete = (
            db.query(AuditLog)
            .filter(AuditLog.created_at < cutoff_date)
            .count()
        )
        
        if dry_run:
            logger.info(f"DRY RUN: Would delete {logs_to_delete} audit logs older than {retention_days} days")
            return {
                "dry_run": True,
                "logs_to_delete": logs_to_delete,
                "cutoff_date": cutoff_date.isoformat(),
                "retention_days": retention_days,
            }
        
        # Deletar logs antigos
        deleted_count = (
            db.query(AuditLog)
            .filter(AuditLog.created_at < cutoff_date)
            .delete()
        )
        
        db.commit()
        
        logger.info(f"Deleted {deleted_count} audit logs older than {retention_days} days")
        
        return {
            "dry_run": False,
            "deleted_count": deleted_count,
            "cutoff_date": cutoff_date.isoformat(),
            "retention_days": retention_days,
        }
    
    except Exception as e:
        db.rollback()
        logger.error(f"Error cleaning up audit logs: {e}", exc_info=True)
        raise
    
    finally:
        db.close()
