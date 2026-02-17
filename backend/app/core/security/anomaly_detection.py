from typing import List, Dict, Any, Optional
from uuid import UUID
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from sqlalchemy import and_, func
from app.domain.models.audit_log import AuditLog, AuditActionType
from app.infrastructure.database.database import SessionLocal
import logging

logger = logging.getLogger(__name__)


class Anomaly:
    """Representa uma anomalia detectada"""
    def __init__(
        self,
        user_id: UUID,
        username: str,
        anomaly_type: str,
        severity: str,
        description: str,
        score: float,
        metadata: Optional[Dict[str, Any]] = None
    ):
        self.user_id = user_id
        self.username = username
        self.anomaly_type = anomaly_type
        self.severity = severity  # "low", "medium", "high"
        self.description = description
        self.score = score  # 0.0 a 1.0
        self.metadata = metadata or {}


class AnomalyDetector:
    """Detecta comportamentos anômalos baseado em logs de auditoria"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def detect_anomalies(self, user_id: UUID, time_window_minutes: int = 60) -> List[Anomaly]:
        """
        Detecta anomalias para um usuário específico em uma janela de tempo.
        
        Args:
            user_id: ID do usuário
            time_window_minutes: Janela de tempo em minutos (padrão: 60)
        
        Returns:
            Lista de anomalias detectadas
        """
        anomalies: List[Anomaly] = []
        
        # Obter logs do usuário na janela de tempo
        cutoff_time = datetime.now(timezone.utc) - timedelta(minutes=time_window_minutes)
        logs = (
            self.db.query(AuditLog)
            .filter(
                and_(
                    AuditLog.user_id == user_id,
                    AuditLog.created_at >= cutoff_time
                )
            )
            .all()
        )
        
        if not logs:
            return anomalies
        
        # Obter username
        username = logs[0].username if logs else "unknown"
        
        # 1. Muitas ações em pouco tempo (>50 em 5 minutos)
        five_min_cutoff = datetime.now(timezone.utc) - timedelta(minutes=5)
        recent_logs = [log for log in logs if log.created_at >= five_min_cutoff]
        if len(recent_logs) > 50:
            score = min(1.0, len(recent_logs) / 100.0)
            anomalies.append(Anomaly(
                user_id=user_id,
                username=username,
                anomaly_type="high_activity_rate",
                severity="high" if score > 0.7 else "medium",
                description=f"User performed {len(recent_logs)} actions in 5 minutes",
                score=score,
                metadata={"action_count": len(recent_logs), "window_minutes": 5}
            ))
        
        # 2. Muitas tentativas de login falhadas (>5 em 1 hora)
        failed_logins = [
            log for log in logs
            if log.action == AuditActionType.LOGIN and not log.success
        ]
        if len(failed_logins) > 5:
            score = min(1.0, len(failed_logins) / 10.0)
            anomalies.append(Anomaly(
                user_id=user_id,
                username=username,
                anomaly_type="failed_login_attempts",
                severity="high" if score > 0.7 else "medium",
                description=f"User had {len(failed_logins)} failed login attempts",
                score=score,
                metadata={"failed_count": len(failed_logins)}
            ))
        
        # 3. Acesso de múltiplos IPs (>3 em 1 hora)
        unique_ips = set(log.ip_address for log in logs if log.ip_address)
        if len(unique_ips) > 3:
            score = min(1.0, len(unique_ips) / 5.0)
            anomalies.append(Anomaly(
                user_id=user_id,
                username=username,
                anomaly_type="multiple_ip_access",
                severity="medium" if score > 0.5 else "low",
                description=f"User accessed from {len(unique_ips)} different IP addresses",
                score=score,
                metadata={"ip_count": len(unique_ips), "ips": list(unique_ips)}
            ))
        
        # 4. Muitas deleções (>10 em 1 hora)
        deletions = [
            log for log in logs
            if log.action == AuditActionType.DELETE and log.success
        ]
        if len(deletions) > 10:
            score = min(1.0, len(deletions) / 20.0)
            anomalies.append(Anomaly(
                user_id=user_id,
                username=username,
                anomaly_type="high_deletion_rate",
                severity="high" if score > 0.7 else "medium",
                description=f"User deleted {len(deletions)} resources",
                score=score,
                metadata={"deletion_count": len(deletions)}
            ))
        
        # 5. Horários não usuais de acesso (entre 2h e 5h da manhã)
        unusual_hour_logs = [
            log for log in logs
            if 2 <= log.created_at.hour < 5
        ]
        if len(unusual_hour_logs) > 5:
            score = 0.3  # Baixa severidade mas ainda anômalo
            anomalies.append(Anomaly(
                user_id=user_id,
                username=username,
                anomaly_type="unusual_access_time",
                severity="low",
                description=f"User accessed system {len(unusual_hour_logs)} times during unusual hours (2-5 AM)",
                score=score,
                metadata={"unusual_count": len(unusual_hour_logs)}
            ))
        
        return anomalies
    
    def get_user_risk_score(self, user_id: UUID, time_window_minutes: int = 60) -> float:
        """
        Calcula score de risco geral para um usuário (0.0 a 1.0).
        
        Returns:
            Score de risco agregado
        """
        anomalies = self.detect_anomalies(user_id, time_window_minutes)
        
        if not anomalies:
            return 0.0
        
        # Calcular score agregado (média ponderada por severidade)
        weights = {"high": 1.0, "medium": 0.6, "low": 0.3}
        weighted_sum = sum(anom.score * weights.get(anom.severity, 0.3) for anom in anomalies)
        total_weight = sum(weights.get(anom.severity, 0.3) for anom in anomalies)
        
        if total_weight == 0:
            return 0.0
        
        return min(1.0, weighted_sum / total_weight)
