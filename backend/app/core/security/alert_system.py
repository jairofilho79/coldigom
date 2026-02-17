from typing import List, Optional
from uuid import UUID
from datetime import datetime, timezone
import logging
from app.core.security.anomaly_detection import AnomalyDetector, Anomaly

logger = logging.getLogger(__name__)


class AlertSystem:
    """Sistema de alertas baseado em detecção de anomalias"""
    
    # Thresholds de risco
    HIGH_RISK_THRESHOLD = 0.7
    MEDIUM_RISK_THRESHOLD = 0.4
    LOW_RISK_THRESHOLD = 0.2
    
    def __init__(self, anomaly_detector: AnomalyDetector):
        self.detector = anomaly_detector
    
    def process_anomalies(self, user_id: UUID, time_window_minutes: int = 60) -> List[dict]:
        """
        Processa anomalias e gera alertas.
        
        Returns:
            Lista de alertas gerados
        """
        anomalies = self.detector.detect_anomalies(user_id, time_window_minutes)
        
        if not anomalies:
            return []
        
        alerts = []
        
        # Agrupar anomalias por severidade
        high_risk = [a for a in anomalies if a.severity == "high"]
        medium_risk = [a for a in anomalies if a.severity == "medium"]
        low_risk = [a for a in anomalies if a.severity == "low"]
        
        # Calcular score de risco geral
        risk_score = self.detector.get_user_risk_score(user_id, time_window_minutes)
        
        # Gerar alertas baseado em thresholds
        if risk_score >= self.HIGH_RISK_THRESHOLD:
            alert = {
                "user_id": str(user_id),
                "severity": "high",
                "risk_score": risk_score,
                "anomalies": [self._anomaly_to_dict(a) for a in anomalies],
                "message": f"High risk detected: {len(high_risk)} high-severity anomalies",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            alerts.append(alert)
            self._log_alert(alert)
            # Aqui pode-se adicionar integração com sistemas externos (email, Slack, etc.)
        
        elif risk_score >= self.MEDIUM_RISK_THRESHOLD:
            alert = {
                "user_id": str(user_id),
                "severity": "medium",
                "risk_score": risk_score,
                "anomalies": [self._anomaly_to_dict(a) for a in anomalies],
                "message": f"Medium risk detected: {len(medium_risk)} medium-severity anomalies",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            alerts.append(alert)
            self._log_alert(alert)
        
        elif risk_score >= self.LOW_RISK_THRESHOLD:
            alert = {
                "user_id": str(user_id),
                "severity": "low",
                "risk_score": risk_score,
                "anomalies": [self._anomaly_to_dict(a) for a in anomalies],
                "message": f"Low risk detected: {len(low_risk)} low-severity anomalies",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            alerts.append(alert)
            self._log_alert(alert)
        
        return alerts
    
    def _anomaly_to_dict(self, anomaly: Anomaly) -> dict:
        """Converte Anomaly para dict"""
        return {
            "type": anomaly.anomaly_type,
            "severity": anomaly.severity,
            "description": anomaly.description,
            "score": anomaly.score,
            "metadata": anomaly.metadata,
        }
    
    def _log_alert(self, alert: dict):
        """Registra alerta no log"""
        logger.warning(
            f"SECURITY ALERT [{alert['severity'].upper()}]: "
            f"User {alert['user_id']} - Risk Score: {alert['risk_score']:.2f} - "
            f"{alert['message']}"
        )
