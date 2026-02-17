from typing import Dict, Any, Optional
from uuid import UUID
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
import json
from app.domain.models.user import User
from app.domain.models.praise import Praise
from app.domain.models.audit_log import AuditLog
from app.infrastructure.database.repositories.user_repository import UserRepository
from app.infrastructure.database.repositories.praise_repository import PraiseRepository
from app.infrastructure.database.repositories.audit_log_repository import AuditLogRepository
import logging

logger = logging.getLogger(__name__)


class DataProtectionService:
    """Serviço para proteção de dados (LGPD/GDPR)"""
    
    def __init__(self, db: Session):
        self.db = db
        self.user_repo = UserRepository(db)
        self.praise_repo = PraiseRepository(db)
        self.audit_repo = AuditLogRepository(db)
    
    def anonymize_user_data(self, user_id: UUID) -> Dict[str, Any]:
        """
        Anonimiza dados do usuário (Right to be Forgotten).
        
        Substitui dados pessoais por valores anonimizados mas mantém
        estrutura de logs para auditoria.
        """
        user = self.user_repo.get_by_id(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Resource not found"
            )
        
        original_email = user.email
        original_username = user.username
        
        # Anonimizar dados do usuário
        user.email = f"anonymized_{user.id}@deleted.local"
        user.username = f"deleted_user_{user.id}"
        user.is_active = False
        
        self.user_repo.update(user)
        
        # Anonimizar logs de auditoria (manter estrutura mas remover dados pessoais)
        # Nota: Em produção, isso pode ser feito em batch para performance
        from sqlalchemy import update
        anonymized_username = f"deleted_user_{user.id}"
        
        # Atualizar logs onde o usuário aparece
        self.db.execute(
            update(AuditLog)
            .where(AuditLog.user_id == user_id)
            .values(username=anonymized_username)
        )
        self.db.commit()
        
        logger.info(f"Anonymized user data for user_id={user_id}")
        
        return {
            "user_id": str(user_id),
            "original_email": original_email,
            "original_username": original_username,
            "anonymized_at": datetime.now(timezone.utc).isoformat(),
            "status": "anonymized"
        }
    
    def export_user_data(self, user_id: UUID) -> Dict[str, Any]:
        """
        Exporta todos os dados do usuário (Right to Data Portability).
        
        Returns:
            Dict com todos os dados do usuário em formato estruturado
        """
        user = self.user_repo.get_by_id(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Resource not found"
            )
        
        # Coletar dados do usuário
        user_data = {
            "user": {
                "id": str(user.id),
                "email": user.email,
                "username": user.username,
                "is_active": user.is_active,
                "created_at": user.created_at.isoformat() if user.created_at else None,
                "updated_at": user.updated_at.isoformat() if user.updated_at else None,
            }
        }
        
        # Coletar praises criados pelo usuário (se houver campo creator_id)
        # Nota: assumindo que não há campo creator_id, vamos buscar por logs
        praise_logs = (
            self.db.query(AuditLog)
            .filter(
                AuditLog.user_id == user_id,
                AuditLog.action == "create",
                AuditLog.resource_type == "praise"
            )
            .all()
        )
        
        praise_ids = [log.resource_id for log in praise_logs if log.resource_id]
        
        user_data["praises"] = []
        for praise_id in praise_ids:
            try:
                praise = self.praise_repo.get_by_id(praise_id)
                if praise:
                    user_data["praises"].append({
                        "id": str(praise.id),
                        "name": praise.name,
                        "number": praise.number,
                        "created_at": praise.created_at.isoformat() if praise.created_at else None,
                        "updated_at": praise.updated_at.isoformat() if praise.updated_at else None,
                    })
            except Exception as e:
                logger.warning(f"Could not export praise {praise_id}: {e}")
        
        # Coletar logs de auditoria do usuário
        audit_logs = (
            self.db.query(AuditLog)
            .filter(AuditLog.user_id == user_id)
            .order_by(AuditLog.created_at.desc())
            .limit(1000)  # Limitar para não gerar arquivo muito grande
            .all()
        )
        
        user_data["audit_logs"] = [
            {
                "id": str(log.id),
                "action": log.action.value if hasattr(log.action, 'value') else str(log.action),
                "resource_type": log.resource_type,
                "resource_id": str(log.resource_id) if log.resource_id else None,
                "created_at": log.created_at.isoformat() if log.created_at else None,
                "success": log.success,
            }
            for log in audit_logs
        ]
        
        # Adicionar metadados
        user_data["export_metadata"] = {
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "format_version": "1.0",
            "total_praises": len(user_data["praises"]),
            "total_audit_logs": len(user_data["audit_logs"]),
        }
        
        return user_data
