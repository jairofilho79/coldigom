# Segurança em Sistemas Colaborativos - Guia de Implementação

**Data:** 16 de Fevereiro de 2026  
**Contexto:** Sistema colaborativo onde todos os usuários têm o mesmo nível de acesso  
**Objetivo:** Implementar auditoria, rastreabilidade e proteção sem restringir colaboração

---

## Sumário Executivo

Mesmo em sistemas colaborativos onde todos os usuários têm acesso igual, é essencial implementar:
- **Auditoria completa** de todas as ações
- **Rastreabilidade** de mudanças e acessos
- **Proteção contra contas comprometidas**
- **Conformidade** com LGPD/GDPR
- **Boas práticas** de segurança em camadas

Este documento detalha soluções práticas e implementáveis para cada aspecto.

---

## 1. Sistema de Auditoria e Rastreabilidade

### 1.1 Arquitetura de Auditoria

#### Modelo de Dados

```python
# backend/app/domain/models/audit_log.py
from sqlalchemy import Column, String, DateTime, JSON, Text, Enum
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid
import enum
from app.infrastructure.database.database import Base

class AuditActionType(str, enum.Enum):
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    READ = "read"
    LOGIN = "login"
    LOGOUT = "logout"
    DOWNLOAD = "download"
    UPLOAD = "upload"
    EXPORT = "export"
    IMPORT = "import"
    REVIEW_START = "review_start"
    REVIEW_FINISH = "review_finish"
    REVIEW_CANCEL = "review_cancel"

class AuditLog(Base):
    __tablename__ = "audit_logs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    username = Column(String, nullable=False)  # Denormalizado para auditoria mesmo se usuário for deletado
    action = Column(Enum(AuditActionType), nullable=False, index=True)
    resource_type = Column(String, nullable=False, index=True)  # "praise", "user", "material", etc.
    resource_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    resource_name = Column(String, nullable=True)  # Nome do recurso para facilitar busca
    
    # Dados da requisição
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    request_method = Column(String, nullable=True)  # GET, POST, PUT, DELETE
    request_path = Column(String, nullable=True)
    
    # Dados de mudança
    changes = Column(JSON, nullable=True)  # {"field": {"old": "value", "new": "value"}}
    metadata = Column(JSON, nullable=True)  # Dados adicionais contextuais
    
    # Timestamp
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    
    # Status da operação
    success = Column(Boolean, default=True, nullable=False)
    error_message = Column(Text, nullable=True)
    
    def __repr__(self):
        return f"<AuditLog(user={self.username}, action={self.action}, resource={self.resource_type})>"
```

#### Middleware de Auditoria

```python
# backend/app/core/middleware/audit_middleware.py
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
from typing import Callable
from datetime import datetime
from uuid import UUID
import json
from app.domain.models.audit_log import AuditLog, AuditActionType
from app.infrastructure.database.database import SessionLocal
from sqlalchemy.orm import Session

class AuditMiddleware(BaseHTTPMiddleware):
    """Middleware para registrar automaticamente todas as ações dos usuários"""
    
    # Rotas que devem ser auditadas
    AUDITABLE_ROUTES = {
        "POST": ["/api/v1/praises", "/api/v1/praise-tags", "/api/v1/users"],
        "PUT": ["/api/v1/praises", "/api/v1/praise-tags"],
        "DELETE": ["/api/v1/praises", "/api/v1/praise-tags"],
        "GET": ["/api/v1/praises/{id}/download-zip", "/api/v1/praises/download-by-material-kind"],
    }
    
    # Rotas que NÃO devem ser auditadas (para evitar ruído)
    EXCLUDED_ROUTES = [
        "/health",
        "/docs",
        "/redoc",
        "/openapi.json",
        "/api/v1/auth/login",  # Será auditado separadamente
    ]
    
    def __init__(self, app: ASGIApp):
        super().__init__(app)
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Verificar se a rota deve ser auditada
        if not self._should_audit(request):
            return await call_next(request)
        
        # Obter usuário atual (se autenticado)
        user_id = None
        username = None
        if hasattr(request.state, "user"):
            user_id = request.state.user.id
            username = request.state.user.username
        
        # Executar requisição
        start_time = datetime.utcnow()
        response = await call_next(request)
        end_time = datetime.utcnow()
        
        # Registrar auditoria (após resposta para capturar status)
        if user_id:  # Apenas se usuário autenticado
            await self._log_audit(
                request=request,
                response=response,
                user_id=user_id,
                username=username,
                duration_ms=(end_time - start_time).total_seconds() * 1000
            )
        
        return response
    
    def _should_audit(self, request: Request) -> bool:
        """Verifica se a rota deve ser auditada"""
        path = request.url.path
        method = request.method
        
        # Excluir rotas específicas
        if any(path.startswith(excluded) for excluded in self.EXCLUDED_ROUTES):
            return False
        
        # Verificar se método e rota estão na lista de auditáveis
        if method in self.AUDITABLE_ROUTES:
            return any(path.startswith(route) for route in self.AUDITABLE_ROUTES[method])
        
        return False
    
    async def _log_audit(
        self,
        request: Request,
        response: Response,
        user_id: UUID,
        username: str,
        duration_ms: float
    ):
        """Registra evento de auditoria"""
        db = SessionLocal()
        try:
            # Determinar tipo de ação
            action = self._determine_action(request.method, request.url.path)
            
            # Extrair informações do recurso
            resource_type, resource_id, resource_name = self._extract_resource_info(
                request.url.path
            )
            
            # Capturar mudanças (se aplicável)
            changes = None
            if request.method in ["POST", "PUT", "PATCH"]:
                # Tentar capturar body (se disponível)
                try:
                    body = await request.body()
                    if body:
                        changes = {"request_body": json.loads(body.decode())}
                except:
                    pass
            
            # Criar log de auditoria
            audit_log = AuditLog(
                user_id=user_id,
                username=username,
                action=action,
                resource_type=resource_type,
                resource_id=resource_id,
                resource_name=resource_name,
                ip_address=request.client.host if request.client else None,
                user_agent=request.headers.get("user-agent"),
                request_method=request.method,
                request_path=request.url.path,
                changes=changes,
                metadata={
                    "duration_ms": duration_ms,
                    "status_code": response.status_code,
                    "query_params": dict(request.query_params),
                },
                success=response.status_code < 400,
                error_message=None if response.status_code < 400 else f"HTTP {response.status_code}",
            )
            
            db.add(audit_log)
            db.commit()
        except Exception as e:
            # Logar erro mas não quebrar a aplicação
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Erro ao registrar auditoria: {e}", exc_info=True)
            db.rollback()
        finally:
            db.close()
    
    def _determine_action(self, method: str, path: str) -> AuditActionType:
        """Determina o tipo de ação baseado no método HTTP e path"""
        if method == "GET":
            if "download" in path:
                return AuditActionType.DOWNLOAD
            return AuditActionType.READ
        elif method == "POST":
            if "review" in path:
                if "start" in path:
                    return AuditActionType.REVIEW_START
                elif "finish" in path:
                    return AuditActionType.REVIEW_FINISH
                elif "cancel" in path:
                    return AuditActionType.REVIEW_CANCEL
            return AuditActionType.CREATE
        elif method == "PUT" or method == "PATCH":
            return AuditActionType.UPDATE
        elif method == "DELETE":
            return AuditActionType.DELETE
        return AuditActionType.READ
    
    def _extract_resource_info(self, path: str) -> tuple:
        """Extrai informações do recurso da URL"""
        parts = path.strip("/").split("/")
        
        # Padrão: /api/v1/{resource_type}/{resource_id}
        if len(parts) >= 4:
            resource_type = parts[2].replace("-", "_")  # praise-tags -> praise_tags
            resource_id = parts[3] if len(parts) > 3 else None
            
            # Tentar converter para UUID
            try:
                resource_id = UUID(resource_id) if resource_id else None
            except:
                resource_id = None
            
            return resource_type, resource_id, None
        
        return "unknown", None, None
```

#### Integração no Main

```python
# backend/app/main.py (adição)
from app.core.middleware.audit_middleware import AuditMiddleware

# Adicionar após CORS middleware
app.add_middleware(AuditMiddleware)
```

### 1.2 Auditoria Detalhada em Operações Críticas

#### Decorator para Auditoria Manual

```python
# backend/app/core/decorators/audit.py
from functools import wraps
from typing import Callable, Any
from app.domain.models.audit_log import AuditLog, AuditActionType
from app.infrastructure.database.database import SessionLocal
from uuid import UUID

def audit_action(
    action: AuditActionType,
    resource_type: str,
    capture_changes: bool = True
):
    """Decorator para registrar ações específicas com detalhes"""
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Extrair informações do contexto
            db = kwargs.get('db') or args[0] if args else None
            current_user = kwargs.get('current_user') or None
            
            # Capturar estado antes (se necessário)
            old_state = None
            if capture_changes and current_user:
                # Implementar captura de estado anterior
                pass
            
            # Executar função
            result = func(*args, **kwargs)
            
            # Capturar estado depois e registrar mudanças
            if capture_changes and current_user and db:
                new_state = result
                changes = _calculate_changes(old_state, new_state)
                
                audit_log = AuditLog(
                    user_id=current_user.id,
                    username=current_user.username,
                    action=action,
                    resource_type=resource_type,
                    resource_id=getattr(result, 'id', None),
                    resource_name=getattr(result, 'name', None),
                    changes=changes,
                )
                db.add(audit_log)
                db.commit()
            
            return result
        return wrapper
    return decorator
```

#### Uso em Serviços

```python
# backend/app/application/services/praise_service.py (exemplo)

from app.core.decorators.audit import audit_action
from app.domain.models.audit_log import AuditActionType

class PraiseService:
    @audit_action(AuditActionType.CREATE, "praise", capture_changes=True)
    def create(self, praise_data: PraiseCreate, current_user: User) -> Praise:
        # ... código existente ...
        pass
    
    @audit_action(AuditActionType.UPDATE, "praise", capture_changes=True)
    def update(self, praise_id: UUID, praise_data: PraiseUpdate, current_user: User) -> Praise:
        # Capturar estado anterior
        old_praise = self.get_by_id(praise_id)
        old_state = {
            "name": old_praise.name,
            "number": old_praise.number,
            "in_review": old_praise.in_review,
            # ... outros campos ...
        }
        
        # Executar atualização
        updated_praise = self._update_internal(praise_id, praise_data)
        
        # Calcular mudanças
        changes = {
            field: {
                "old": old_state.get(field),
                "new": getattr(updated_praise, field, None)
            }
            for field in old_state.keys()
            if old_state.get(field) != getattr(updated_praise, field, None)
        }
        
        # Registrar auditoria manualmente com mudanças detalhadas
        self._log_changes(current_user, praise_id, changes)
        
        return updated_praise
    
    def _log_changes(self, user: User, resource_id: UUID, changes: dict):
        """Registra mudanças detalhadas"""
        db = SessionLocal()
        try:
            audit_log = AuditLog(
                user_id=user.id,
                username=user.username,
                action=AuditActionType.UPDATE,
                resource_type="praise",
                resource_id=resource_id,
                changes=changes,
            )
            db.add(audit_log)
            db.commit()
        finally:
            db.close()
```

### 1.3 Endpoint de Consulta de Auditoria

```python
# backend/app/api/v1/routes/audit.py
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from uuid import UUID
from app.core.dependencies import get_db, get_current_user
from app.domain.models.user import User
from app.domain.models.audit_log import AuditLog, AuditActionType
from app.domain.schemas.audit import AuditLogResponse, AuditLogFilter

router = APIRouter()

@router.get("/audit-logs", response_model=List[AuditLogResponse])
def get_audit_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    user_id: Optional[UUID] = Query(None),
    action: Optional[AuditActionType] = Query(None),
    resource_type: Optional[str] = Query(None),
    resource_id: Optional[UUID] = Query(None),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Consulta logs de auditoria com filtros"""
    query = db.query(AuditLog)
    
    # Filtros
    if user_id:
        query = query.filter(AuditLog.user_id == user_id)
    if action:
        query = query.filter(AuditLog.action == action)
    if resource_type:
        query = query.filter(AuditLog.resource_type == resource_type)
    if resource_id:
        query = query.filter(AuditLog.resource_id == resource_id)
    if start_date:
        query = query.filter(AuditLog.created_at >= start_date)
    if end_date:
        query = query.filter(AuditLog.created_at <= end_date)
    
    # Ordenar por data mais recente
    query = query.order_by(AuditLog.created_at.desc())
    
    # Paginação
    logs = query.offset(skip).limit(limit).all()
    
    return [AuditLogResponse.model_validate(log) for log in logs]

@router.get("/audit-logs/{log_id}", response_model=AuditLogResponse)
def get_audit_log(
    log_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtém um log de auditoria específico"""
    log = db.query(AuditLog).filter(AuditLog.id == log_id).first()
    if not log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audit log not found"
        )
    return AuditLogResponse.model_validate(log)

@router.get("/audit-logs/resource/{resource_type}/{resource_id}", response_model=List[AuditLogResponse])
def get_resource_audit_history(
    resource_type: str,
    resource_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtém histórico completo de auditoria de um recurso específico"""
    logs = db.query(AuditLog).filter(
        AuditLog.resource_type == resource_type,
        AuditLog.resource_id == resource_id
    ).order_by(AuditLog.created_at.desc()).all()
    
    return [AuditLogResponse.model_validate(log) for log in logs]
```

---

## 2. Proteção Contra Contas Comprometidas

### 2.1 Detecção de Comportamento Anômalo

#### Sistema de Monitoramento

```python
# backend/app/core/security/anomaly_detection.py
from datetime import datetime, timedelta
from typing import List, Dict
from sqlalchemy.orm import Session
from app.domain.models.audit_log import AuditLog, AuditActionType
from app.domain.models.user import User
import logging

logger = logging.getLogger(__name__)

class AnomalyDetector:
    """Detecta comportamentos anômalos que podem indicar conta comprometida"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def check_user_activity(self, user_id: UUID) -> Dict[str, any]:
        """Verifica atividade do usuário por sinais de comprometimento"""
        anomalies = []
        
        # 1. Muitas ações em pouco tempo
        recent_actions = self._get_recent_actions(user_id, minutes=5)
        if len(recent_actions) > 50:
            anomalies.append({
                "type": "high_activity",
                "severity": "medium",
                "message": f"Usuário realizou {len(recent_actions)} ações nos últimos 5 minutos",
                "threshold": 50,
                "actual": len(recent_actions)
            })
        
        # 2. Muitas tentativas de login falhadas
        failed_logins = self._get_failed_logins(user_id, hours=1)
        if len(failed_logins) > 5:
            anomalies.append({
                "type": "failed_login_attempts",
                "severity": "high",
                "message": f"{len(failed_logins)} tentativas de login falhadas na última hora",
                "threshold": 5,
                "actual": len(failed_logins)
            })
        
        # 3. Acesso de múltiplos IPs em pouco tempo
        unique_ips = self._get_unique_ips(user_id, hours=1)
        if len(unique_ips) > 3:
            anomalies.append({
                "type": "multiple_ips",
                "severity": "medium",
                "message": f"Acesso de {len(unique_ips)} IPs diferentes na última hora",
                "ips": unique_ips
            })
        
        # 4. Muitas deleções
        deletions = self._get_actions_by_type(user_id, AuditActionType.DELETE, hours=1)
        if len(deletions) > 10:
            anomalies.append({
                "type": "excessive_deletions",
                "severity": "high",
                "message": f"{len(deletions)} deleções na última hora",
                "threshold": 10,
                "actual": len(deletions)
            })
        
        # 5. Padrão de acesso incomum (horário não usual)
        unusual_hours = self._check_unusual_hours(user_id)
        if unusual_hours:
            anomalies.append({
                "type": "unusual_hours",
                "severity": "low",
                "message": "Acesso em horário não usual",
                "details": unusual_hours
            })
        
        return {
            "user_id": user_id,
            "anomalies": anomalies,
            "risk_score": self._calculate_risk_score(anomalies),
            "checked_at": datetime.utcnow()
        }
    
    def _get_recent_actions(self, user_id: UUID, minutes: int) -> List[AuditLog]:
        cutoff = datetime.utcnow() - timedelta(minutes=minutes)
        return self.db.query(AuditLog).filter(
            AuditLog.user_id == user_id,
            AuditLog.created_at >= cutoff
        ).all()
    
    def _get_failed_logins(self, user_id: UUID, hours: int) -> List[AuditLog]:
        cutoff = datetime.utcnow() - timedelta(hours=hours)
        return self.db.query(AuditLog).filter(
            AuditLog.user_id == user_id,
            AuditLog.action == AuditActionType.LOGIN,
            AuditLog.success == False,
            AuditLog.created_at >= cutoff
        ).all()
    
    def _get_unique_ips(self, user_id: UUID, hours: int) -> List[str]:
        cutoff = datetime.utcnow() - timedelta(hours=hours)
        logs = self.db.query(AuditLog.ip_address).filter(
            AuditLog.user_id == user_id,
            AuditLog.created_at >= cutoff,
            AuditLog.ip_address.isnot(None)
        ).distinct().all()
        return [ip[0] for ip in logs]
    
    def _get_actions_by_type(self, user_id: UUID, action_type: AuditActionType, hours: int) -> List[AuditLog]:
        cutoff = datetime.utcnow() - timedelta(hours=hours)
        return self.db.query(AuditLog).filter(
            AuditLog.user_id == user_id,
            AuditLog.action == action_type,
            AuditLog.created_at >= cutoff
        ).all()
    
    def _check_unusual_hours(self, user_id: UUID) -> Dict:
        """Verifica se há acesso em horários não usuais"""
        # Obter histórico de acesso do usuário
        recent_logs = self._get_recent_actions(user_id, minutes=1440)  # 24 horas
        
        if not recent_logs:
            return None
        
        # Calcular horários mais comuns de acesso
        hours = [log.created_at.hour for log in recent_logs]
        most_common_hours = set(hours[-20:])  # Últimas 20 ações
        
        # Verificar se acesso atual está fora do padrão
        current_hour = datetime.utcnow().hour
        if current_hour not in most_common_hours and current_hour not in range(9, 18):
            return {
                "current_hour": current_hour,
                "usual_hours": list(most_common_hours)
            }
        
        return None
    
    def _calculate_risk_score(self, anomalies: List[Dict]) -> float:
        """Calcula score de risco baseado nas anomalias"""
        severity_weights = {
            "high": 3.0,
            "medium": 2.0,
            "low": 1.0
        }
        
        score = sum(severity_weights.get(anomaly.get("severity", "low"), 1.0) for anomaly in anomalies)
        return min(score / 10.0, 1.0)  # Normalizar entre 0 e 1
```

### 2.2 Sistema de Alertas e Notificações

```python
# backend/app/core/security/alert_system.py
from typing import Dict, List
from app.domain.models.user import User
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

class AlertSystem:
    """Sistema de alertas para comportamentos suspeitos"""
    
    def __init__(self):
        self.alert_thresholds = {
            "high_risk": 0.7,
            "medium_risk": 0.4,
            "low_risk": 0.2
        }
    
    def process_anomalies(self, anomaly_report: Dict, user: User):
        """Processa relatório de anomalias e gera alertas"""
        risk_score = anomaly_report.get("risk_score", 0)
        anomalies = anomaly_report.get("anomalies", [])
        
        if risk_score >= self.alert_thresholds["high_risk"]:
            self._send_high_risk_alert(user, anomaly_report)
            # Opcional: Desabilitar conta temporariamente
            # self._temporarily_disable_account(user)
        
        elif risk_score >= self.alert_thresholds["medium_risk"]:
            self._send_medium_risk_alert(user, anomaly_report)
        
        elif risk_score >= self.alert_thresholds["low_risk"]:
            self._log_low_risk_anomaly(user, anomaly_report)
    
    def _send_high_risk_alert(self, user: User, report: Dict):
        """Envia alerta de alto risco"""
        logger.critical(
            f"ALERTA DE ALTO RISCO - Usuário: {user.username} ({user.id})",
            extra={
                "user_id": str(user.id),
                "username": user.username,
                "risk_score": report.get("risk_score"),
                "anomalies": report.get("anomalies"),
                "timestamp": datetime.utcnow().isoformat()
            }
        )
        
        # TODO: Enviar email para administradores
        # TODO: Enviar notificação no sistema
        # TODO: Registrar em sistema de monitoramento externo
    
    def _send_medium_risk_alert(self, user: User, report: Dict):
        """Envia alerta de risco médio"""
        logger.warning(
            f"ALERTA DE RISCO MÉDIO - Usuário: {user.username} ({user.id})",
            extra={
                "user_id": str(user.id),
                "username": user.username,
                "risk_score": report.get("risk_score"),
                "anomalies": report.get("anomalies"),
            }
        )
    
    def _log_low_risk_anomaly(self, user: User, report: Dict):
        """Registra anomalia de baixo risco"""
        logger.info(
            f"Anomalia detectada - Usuário: {user.username}",
            extra={
                "user_id": str(user.id),
                "anomalies": report.get("anomalies"),
            }
        )
```

### 2.3 Limitação de Ações por Período

```python
# backend/app/core/security/rate_limiter.py
from datetime import datetime, timedelta
from typing import Dict
from collections import defaultdict
from app.domain.models.audit_log import AuditLog, AuditActionType
from sqlalchemy.orm import Session

class ActionRateLimiter:
    """Limita ações por usuário para prevenir abuso"""
    
    LIMITS = {
        AuditActionType.DELETE: {"count": 20, "period_minutes": 60},
        AuditActionType.CREATE: {"count": 100, "period_minutes": 60},
        AuditActionType.UPDATE: {"count": 200, "period_minutes": 60},
        AuditActionType.DOWNLOAD: {"count": 50, "period_minutes": 60},
    }
    
    def __init__(self, db: Session):
        self.db = db
    
    def check_limit(self, user_id: UUID, action: AuditActionType) -> tuple[bool, str]:
        """Verifica se usuário pode realizar ação"""
        if action not in self.LIMITS:
            return True, ""  # Sem limite para esta ação
        
        limit_config = self.LIMITS[action]
        period_start = datetime.utcnow() - timedelta(minutes=limit_config["period_minutes"])
        
        # Contar ações do usuário no período
        count = self.db.query(AuditLog).filter(
            AuditLog.user_id == user_id,
            AuditLog.action == action,
            AuditLog.created_at >= period_start
        ).count()
        
        if count >= limit_config["count"]:
            return False, f"Limite de {limit_config['count']} {action.value} por {limit_config['period_minutes']} minutos atingido"
        
        return True, ""
```

### 2.4 Integração com Detecção de Anomalias

```python
# backend/app/core/dependencies.py (adição)

from app.core.security.anomaly_detection import AnomalyDetector
from app.core.security.alert_system import AlertSystem
from app.core.security.rate_limiter import ActionRateLimiter

async def get_current_user_with_checks(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    """Obtém usuário atual com verificações de segurança"""
    user = await get_current_user(token, db)
    
    # Verificar anomalias periodicamente (a cada 10 requisições)
    # Em produção, usar cache Redis para evitar sobrecarga
    detector = AnomalyDetector(db)
    anomaly_report = detector.check_user_activity(user.id)
    
    if anomaly_report.get("risk_score", 0) > 0.5:
        alert_system = AlertSystem()
        alert_system.process_anomalies(anomaly_report, user)
    
    return user
```

---

## 3. Conformidade com LGPD/GDPR

### 3.1 Registro de Consentimento

```python
# backend/app/domain/models/consent.py
from sqlalchemy import Column, String, DateTime, Boolean, Text
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid
from app.infrastructure.database.database import Base

class UserConsent(Base):
    __tablename__ = "user_consents"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    
    # Tipo de consentimento
    consent_type = Column(String, nullable=False)  # "data_processing", "cookies", "marketing"
    
    # Status
    granted = Column(Boolean, default=False, nullable=False)
    granted_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)
    
    # Informações adicionais
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    consent_text = Column(Text, nullable=True)  # Texto do consentimento no momento
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
```

### 3.2 Direito ao Esquecimento (Right to be Forgotten)

```python
# backend/app/application/services/data_protection_service.py
from uuid import UUID
from sqlalchemy.orm import Session
from datetime import datetime
from app.domain.models.user import User
from app.domain.models.audit_log import AuditLog
from app.infrastructure.database.repositories.user_repository import UserRepository
import logging

logger = logging.getLogger(__name__)

class DataProtectionService:
    """Serviço para gerenciar direitos de proteção de dados"""
    
    def __init__(self, db: Session):
        self.db = db
        self.user_repo = UserRepository(db)
    
    def anonymize_user_data(self, user_id: UUID) -> bool:
        """Anonimiza dados do usuário conforme LGPD/GDPR"""
        try:
            user = self.user_repo.get_by_id(user_id)
            if not user:
                return False
            
            # 1. Anonimizar dados pessoais do usuário
            user.email = f"anonymized_{user_id}@deleted.local"
            user.username = f"deleted_user_{user_id}"
            # Manter hashed_password para evitar reuso de conta
            
            # 2. Anonimizar logs de auditoria (manter para compliance mas sem dados pessoais)
            audit_logs = self.db.query(AuditLog).filter(AuditLog.user_id == user_id).all()
            for log in audit_logs:
                log.username = f"deleted_user_{user_id}"
                log.ip_address = None
                log.user_agent = None
                # Manter changes e metadata mas remover dados pessoais
            
            # 3. Desabilitar conta
            user.is_active = False
            
            self.db.commit()
            
            logger.info(f"Dados do usuário {user_id} anonimizados conforme LGPD")
            return True
            
        except Exception as e:
            logger.error(f"Erro ao anonimizar dados do usuário {user_id}: {e}", exc_info=True)
            self.db.rollback()
            return False
    
    def export_user_data(self, user_id: UUID) -> Dict:
        """Exporta todos os dados do usuário (LGPD/GDPR - Right to Data Portability)"""
        user = self.user_repo.get_by_id(user_id)
        if not user:
            return None
        
        # Coletar todos os dados do usuário
        data = {
            "user": {
                "id": str(user.id),
                "username": user.username,
                "email": user.email,
                "created_at": user.created_at.isoformat(),
                "updated_at": user.updated_at.isoformat(),
            },
            "audit_logs": [],
            "created_resources": [],
            "modified_resources": [],
        }
        
        # Coletar logs de auditoria
        audit_logs = self.db.query(AuditLog).filter(AuditLog.user_id == user_id).all()
        for log in audit_logs:
            data["audit_logs"].append({
                "action": log.action.value,
                "resource_type": log.resource_type,
                "resource_id": str(log.resource_id) if log.resource_id else None,
                "created_at": log.created_at.isoformat(),
                "changes": log.changes,
            })
        
        # Coletar recursos criados/modificados pelo usuário
        # (implementar conforme estrutura do sistema)
        
        return data
```

### 3.3 Endpoint para Direitos LGPD/GDPR

```python
# backend/app/api/v1/routes/data_protection.py
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from uuid import UUID
from app.core.dependencies import get_db, get_current_user
from app.domain.models.user import User
from app.application.services.data_protection_service import DataProtectionService

router = APIRouter()

@router.post("/data-protection/export")
def export_user_data(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Exporta todos os dados do usuário (LGPD/GDPR)"""
    service = DataProtectionService(db)
    data = service.export_user_data(current_user.id)
    
    if not data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User data not found"
        )
    
    return JSONResponse(content=data)

@router.post("/data-protection/anonymize")
def request_data_anonymization(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Solicita anonimização de dados (LGPD/GDPR - Right to be Forgotten)"""
    service = DataProtectionService(db)
    success = service.anonymize_user_data(current_user.id)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to anonymize user data"
        )
    
    return {"message": "User data anonymized successfully"}
```

---

## 4. Boas Práticas de Segurança em Camadas

### 4.1 Princípio do Menor Privilégio (Mesmo em Sistema Colaborativo)

```python
# backend/app/core/security/permissions.py
from enum import Enum
from typing import List
from uuid import UUID
from app.domain.models.user import User

class Permission(str, Enum):
    """Permissões granulares mesmo em sistema colaborativo"""
    READ_PRAISES = "read:praises"
    CREATE_PRAISES = "create:praises"
    UPDATE_PRAISES = "update:praises"
    DELETE_PRAISES = "delete:praises"
    EXPORT_DATA = "export:data"
    MANAGE_USERS = "manage:users"
    VIEW_AUDIT_LOGS = "view:audit_logs"
    MANAGE_SYSTEM = "manage:system"

class PermissionChecker:
    """Verifica permissões mesmo em sistema colaborativo"""
    
    # Por padrão, todos têm todas as permissões em sistema colaborativo
    # Mas isso pode ser facilmente modificado se necessário
    DEFAULT_PERMISSIONS = list(Permission)
    
    @staticmethod
    def has_permission(user: User, permission: Permission) -> bool:
        """Verifica se usuário tem permissão"""
        # Em sistema colaborativo, todos têm acesso
        # Mas pode ser estendido para verificar roles/permissões específicas
        if not user.is_active:
            return False
        
        # TODO: Implementar verificação de roles/permissões se necessário
        return True
    
    @staticmethod
    def require_permission(permission: Permission):
        """Decorator para exigir permissão"""
        def decorator(func):
            @wraps(func)
            async def wrapper(*args, **kwargs):
                current_user = kwargs.get('current_user') or None
                if not current_user:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Authentication required"
                    )
                
                if not PermissionChecker.has_permission(current_user, permission):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"Permission required: {permission.value}"
                    )
                
                return await func(*args, **kwargs)
            return wrapper
        return decorator
```

### 4.2 Defesa em Profundidade

#### Camada 1: Validação de Entrada

```python
# backend/app/core/validation/input_validator.py
from pydantic import BaseModel, validator
from typing import Any
import re

class InputValidator:
    """Validação rigorosa de entrada"""
    
    @staticmethod
    def sanitize_string(value: str, max_length: int = None) -> str:
        """Sanitiza string removendo caracteres perigosos"""
        # Remover caracteres de controle
        value = re.sub(r'[\x00-\x1f\x7f-\x9f]', '', value)
        
        # Limitar tamanho
        if max_length:
            value = value[:max_length]
        
        return value.strip()
    
    @staticmethod
    def validate_uuid(value: Any) -> UUID:
        """Valida e converte UUID"""
        try:
            return UUID(str(value))
        except (ValueError, TypeError):
            raise ValueError(f"Invalid UUID: {value}")
```

#### Camada 2: Rate Limiting por Usuário

```python
# Já implementado acima em ActionRateLimiter
```

#### Camada 3: Validação de Negócio

```python
# backend/app/application/services/praise_service.py (adição)

class PraiseService:
    def update(self, praise_id: UUID, praise_data: PraiseUpdate, current_user: User) -> Praise:
        # Validação de negócio antes de atualizar
        self._validate_business_rules(praise_data)
        
        # ... resto do código ...
    
    def _validate_business_rules(self, praise_data: PraiseUpdate):
        """Valida regras de negócio"""
        # Exemplo: não permitir número negativo
        if praise_data.number is not None and praise_data.number < 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Praise number cannot be negative"
            )
```

#### Camada 4: Logging e Monitoramento

```python
# Já implementado em AuditMiddleware e AnomalyDetector
```

### 4.3 Backup e Recuperação

```python
# backend/app/core/backup/backup_service.py
from datetime import datetime
from typing import List
import json
from sqlalchemy.orm import Session
from app.domain.models.audit_log import AuditLog

class BackupService:
    """Serviço de backup para recuperação de dados"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def create_audit_backup(self, days: int = 30) -> str:
        """Cria backup dos logs de auditoria"""
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        
        logs = self.db.query(AuditLog).filter(
            AuditLog.created_at >= cutoff_date
        ).all()
        
        backup_data = {
            "created_at": datetime.utcnow().isoformat(),
            "period_days": days,
            "logs": [
                {
                    "id": str(log.id),
                    "user_id": str(log.user_id),
                    "username": log.username,
                    "action": log.action.value,
                    "resource_type": log.resource_type,
                    "resource_id": str(log.resource_id) if log.resource_id else None,
                    "changes": log.changes,
                    "created_at": log.created_at.isoformat(),
                }
                for log in logs
            ]
        }
        
        # Salvar em arquivo ou storage
        filename = f"audit_backup_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
        # TODO: Implementar salvamento em storage seguro
        
        return filename
```

---

## 5. Implementação Prática - Checklist

### Fase 1: Auditoria Básica (Semana 1)
- [ ] Criar modelo `AuditLog` no banco de dados
- [ ] Criar migration para tabela `audit_logs`
- [ ] Implementar `AuditMiddleware` básico
- [ ] Registrar ações de CREATE, UPDATE, DELETE
- [ ] Criar endpoint básico de consulta de logs

### Fase 2: Auditoria Avançada (Semana 2)
- [ ] Implementar captura de mudanças detalhadas
- [ ] Adicionar IP address e User-Agent
- [ ] Criar endpoint de histórico por recurso
- [ ] Implementar filtros avançados de busca
- [ ] Adicionar paginação e ordenação

### Fase 3: Detecção de Anomalias (Semana 3)
- [ ] Implementar `AnomalyDetector`
- [ ] Configurar thresholds de risco
- [ ] Implementar sistema de alertas
- [ ] Criar dashboard de monitoramento
- [ ] Configurar notificações por email

### Fase 4: Proteção e Limites (Semana 4)
- [ ] Implementar `ActionRateLimiter`
- [ ] Configurar limites por tipo de ação
- [ ] Adicionar verificação em endpoints críticos
- [ ] Implementar bloqueio temporário de conta
- [ ] Criar endpoint de desbloqueio manual

### Fase 5: Conformidade LGPD/GDPR (Semana 5)
- [ ] Criar modelo `UserConsent`
- [ ] Implementar `DataProtectionService`
- [ ] Criar endpoint de exportação de dados
- [ ] Implementar anonimização de dados
- [ ] Adicionar política de retenção de logs

### Fase 6: Monitoramento e Alertas (Semana 6)
- [ ] Configurar logging estruturado
- [ ] Integrar com sistema de monitoramento externo
- [ ] Criar dashboards de métricas
- [ ] Configurar alertas automáticos
- [ ] Documentar procedimentos de resposta a incidentes

---

## 6. Configuração e Manutenção

### 6.1 Retenção de Logs

```python
# backend/app/core/tasks/cleanup_tasks.py
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.domain.models.audit_log import AuditLog
from app.core.config import settings

def cleanup_old_audit_logs(db: Session, retention_days: int = 365):
    """Remove logs de auditoria antigos conforme política de retenção"""
    cutoff_date = datetime.utcnow() - timedelta(days=retention_days)
    
    # Criar backup antes de deletar
    backup_service = BackupService(db)
    backup_service.create_audit_backup(days=retention_days)
    
    # Deletar logs antigos
    deleted_count = db.query(AuditLog).filter(
        AuditLog.created_at < cutoff_date
    ).delete()
    
    db.commit()
    
    logger.info(f"Removidos {deleted_count} logs de auditoria anteriores a {cutoff_date}")
    return deleted_count
```

### 6.2 Monitoramento de Performance

```python
# backend/app/core/monitoring/performance_monitor.py
from datetime import datetime
from typing import Dict
from app.domain.models.audit_log import AuditLog
from sqlalchemy.orm import Session
from sqlalchemy import func

class PerformanceMonitor:
    """Monitora performance do sistema de auditoria"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def get_audit_stats(self, days: int = 7) -> Dict:
        """Obtém estatísticas de auditoria"""
        cutoff = datetime.utcnow() - timedelta(days=days)
        
        total_logs = self.db.query(AuditLog).filter(
            AuditLog.created_at >= cutoff
        ).count()
        
        logs_by_action = self.db.query(
            AuditLog.action,
            func.count(AuditLog.id)
        ).filter(
            AuditLog.created_at >= cutoff
        ).group_by(AuditLog.action).all()
        
        logs_by_user = self.db.query(
            AuditLog.user_id,
            AuditLog.username,
            func.count(AuditLog.id)
        ).filter(
            AuditLog.created_at >= cutoff
        ).group_by(AuditLog.user_id, AuditLog.username).order_by(
            func.count(AuditLog.id).desc()
        ).limit(10).all()
        
        return {
            "period_days": days,
            "total_logs": total_logs,
            "logs_by_action": {action.value: count for action, count in logs_by_action},
            "top_users": [
                {"user_id": str(user_id), "username": username, "count": count}
                for user_id, username, count in logs_by_user
            ],
            "average_logs_per_day": total_logs / days if days > 0 else 0
        }
```

---

## 7. Considerações Finais

### Benefícios da Implementação

1. **Rastreabilidade Completa**: Todas as ações são registradas e podem ser auditadas
2. **Detecção Proativa**: Sistema detecta comportamentos anômalos automaticamente
3. **Conformidade Legal**: Atende requisitos de LGPD/GDPR
4. **Proteção em Camadas**: Múltiplas camadas de segurança mesmo em sistema colaborativo
5. **Recuperação de Dados**: Histórico completo permite recuperação e análise forense

### Próximos Passos Recomendados

1. Implementar Fase 1 (Auditoria Básica) imediatamente
2. Configurar alertas e monitoramento
3. Treinar equipe em procedimentos de resposta a incidentes
4. Revisar e ajustar thresholds baseado em uso real
5. Documentar procedimentos operacionais

### Manutenção Contínua

- Revisar logs de auditoria semanalmente
- Ajustar thresholds de anomalias baseado em padrões reais
- Atualizar políticas de retenção conforme necessário
- Realizar testes de recuperação de dados periodicamente
- Revisar e atualizar políticas de segurança trimestralmente

---

**Documento criado em:** 16 de Fevereiro de 2026  
**Versão:** 1.0  
**Autor:** Engenheiro de Segurança de Aplicações (AppSec)
