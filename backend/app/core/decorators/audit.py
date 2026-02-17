from functools import wraps
from typing import Callable, Optional, Dict, Any
from uuid import UUID
from sqlalchemy.orm import Session
from app.domain.models.audit_log import AuditLog, AuditActionType
from app.infrastructure.database.database import SessionLocal
import logging

logger = logging.getLogger(__name__)


def audit_action(
    action: AuditActionType,
    resource_type: str,
    get_resource_id: Optional[Callable] = None,
    get_resource_name: Optional[Callable] = None,
    capture_changes: bool = False,
    get_before_state: Optional[Callable] = None,
    get_after_state: Optional[Callable] = None,
):
    """
    Decorator para registrar ações de auditoria com contexto detalhado.
    
    Args:
        action: Tipo de ação de auditoria
        resource_type: Tipo do recurso (ex: "praise", "user")
        get_resource_id: Função para extrair ID do recurso dos argumentos
        get_resource_name: Função para extrair nome do recurso
        capture_changes: Se True, captura mudanças antes/depois
        get_before_state: Função para obter estado antes da operação
        get_after_state: Função para obter estado depois da operação
    """
    def decorator(func: Callable):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Extrair informações do contexto
            db: Optional[Session] = None
            user_id: Optional[UUID] = None
            username: str = "system"
            
            # Tentar encontrar db e user nos argumentos
            for arg in args:
                if isinstance(arg, Session):
                    db = arg
                elif hasattr(arg, 'id') and hasattr(arg, 'username'):
                    user_id = arg.id
                    username = arg.username
            
            # Verificar kwargs também
            if not db:
                db = kwargs.get('db')
            if not user_id:
                current_user = kwargs.get('current_user')
                if current_user and hasattr(current_user, 'id'):
                    user_id = current_user.id
                    username = current_user.username
            
            # Obter estado antes (se necessário)
            before_state: Optional[Dict[str, Any]] = None
            if capture_changes and get_before_state:
                try:
                    before_state = get_before_state(*args, **kwargs)
                except Exception as e:
                    logger.warning(f"Failed to get before state: {e}")
            
            # Executar função
            result = func(*args, **kwargs)
            
            # Obter estado depois (se necessário)
            after_state: Optional[Dict[str, Any]] = None
            if capture_changes and get_after_state:
                try:
                    after_state = get_after_state(result, *args, **kwargs)
                except Exception as e:
                    logger.warning(f"Failed to get after state: {e}")
            
            # Calcular mudanças
            changes: Optional[Dict[str, Any]] = None
            if before_state and after_state:
                changes = _calculate_changes(before_state, after_state)
            
            # Extrair resource_id e resource_name
            resource_id: Optional[UUID] = None
            resource_name: Optional[str] = None
            
            if get_resource_id:
                try:
                    resource_id = get_resource_id(*args, **kwargs)
                except Exception as e:
                    logger.warning(f"Failed to get resource_id: {e}")
            
            if get_resource_name:
                try:
                    resource_name = get_resource_name(*args, **kwargs)
                except Exception as e:
                    logger.warning(f"Failed to get resource_name: {e}")
            
            # Registrar auditoria
            if db:
                try:
                    audit_log = AuditLog(
                        user_id=user_id or UUID('00000000-0000-0000-0000-000000000000'),
                        username=username,
                        action=action,
                        resource_type=resource_type,
                        resource_id=resource_id,
                        resource_name=resource_name,
                        changes=changes,
                        success=True,
                    )
                    db.add(audit_log)
                    db.commit()
                except Exception as e:
                    logger.error(f"Failed to create audit log: {e}", exc_info=True)
                    if db:
                        db.rollback()
            
            return result
        
        return wrapper
    return decorator


def _calculate_changes(before: Dict[str, Any], after: Dict[str, Any]) -> Dict[str, Any]:
    """Calcula diferenças entre dois estados"""
    changes = {}
    
    # Verificar campos que mudaram
    all_keys = set(before.keys()) | set(after.keys())
    
    for key in all_keys:
        old_value = before.get(key)
        new_value = after.get(key)
        
        if old_value != new_value:
            changes[key] = {
                "old": old_value,
                "new": new_value
            }
    
    return changes
