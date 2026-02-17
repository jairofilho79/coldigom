from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from sqlalchemy.orm import Session
from uuid import UUID
from typing import Optional
import logging
from app.infrastructure.database.database import SessionLocal
from app.domain.models.audit_log import AuditLog, AuditActionType

logger = logging.getLogger(__name__)


class AuditMiddleware(BaseHTTPMiddleware):
    """Middleware para registrar automaticamente ações de auditoria"""
    
    # Mapeamento de métodos HTTP para ações de auditoria
    METHOD_TO_ACTION = {
        "GET": AuditActionType.READ,
        "POST": AuditActionType.CREATE,
        "PUT": AuditActionType.UPDATE,
        "PATCH": AuditActionType.UPDATE,
        "DELETE": AuditActionType.DELETE,
    }
    
    # Rotas que devem ser ignoradas
    IGNORED_PATHS = {
        "/health",
        "/docs",
        "/redoc",
        "/openapi.json",
        "/favicon.ico",
    }
    
    # Rotas que devem ser auditadas mesmo em GET
    SPECIAL_ROUTES = {
        "/api/v1/auth/login": AuditActionType.LOGIN,
        "/api/v1/praises/download-by-material-kind": AuditActionType.DOWNLOAD,
        "/api/v1/praises/{praise_id}/download-zip": AuditActionType.DOWNLOAD,
    }
    
    async def dispatch(self, request: Request, call_next):
        # Ignorar rotas de sistema
        if request.url.path in self.IGNORED_PATHS or request.url.path.startswith("/assets"):
            return await call_next(request)
        
        # Extrair informações do usuário (se autenticado)
        user_id: Optional[UUID] = None
        username: Optional[str] = None
        
        # Tentar obter usuário do token (se disponível)
        try:
            # Verificar se há token de autorização
            auth_header = request.headers.get("Authorization")
            if auth_header and auth_header.startswith("Bearer "):
                from app.core.security import decode_access_token
                token = auth_header.split(" ")[1]
                payload = decode_access_token(token)
                if payload and "sub" in payload:
                    user_id = UUID(payload["sub"])
                    # Buscar username do banco
                    db = SessionLocal()
                    try:
                        from app.infrastructure.database.repositories.user_repository import UserRepository
                        user_repo = UserRepository(db)
                        user = user_repo.get_by_id(user_id)
                        if user:
                            username = user.username
                    finally:
                        db.close()
        except Exception as e:
            logger.debug(f"Could not extract user from token: {e}")
        
        # Determinar ação de auditoria
        action = self._determine_action(request)
        if not action:
            return await call_next(request)
        
        # Extrair informações da requisição
        ip_address = request.client.host if request.client else None
        user_agent = request.headers.get("User-Agent")
        request_method = request.method
        request_path = request.url.path
        
        # Determinar tipo de recurso baseado no path
        resource_type = self._extract_resource_type(request_path)
        resource_id = self._extract_resource_id(request_path)
        
        # Executar requisição e capturar resposta
        response = await call_next(request)
        
        # Registrar auditoria (assíncrono para não bloquear resposta)
        try:
            self._log_audit(
                user_id=user_id,
                username=username or "anonymous",
                action=action,
                resource_type=resource_type,
                resource_id=resource_id,
                ip_address=ip_address,
                user_agent=user_agent,
                request_method=request_method,
                request_path=request_path,
                success=response.status_code < 400,
                error_message=None if response.status_code < 400 else f"HTTP {response.status_code}",
            )
        except Exception as e:
            logger.error(f"Failed to log audit: {e}", exc_info=True)
        
        return response
    
    def _determine_action(self, request: Request) -> Optional[AuditActionType]:
        """Determina a ação de auditoria baseada na rota e método"""
        path = request.url.path
        
        # Verificar rotas especiais primeiro
        for route_pattern, action in self.SPECIAL_ROUTES.items():
            if route_pattern.replace("{praise_id}", "") in path or path.startswith(route_pattern.split("{")[0]):
                return action
        
        # Verificar mapeamento padrão de métodos
        return self.METHOD_TO_ACTION.get(request.method)
    
    def _extract_resource_type(self, path: str) -> str:
        """Extrai o tipo de recurso do path"""
        if "/api/v1/praises" in path:
            return "praise"
        elif "/api/v1/users" in path or "/api/v1/auth" in path:
            return "user"
        elif "/api/v1/praise-tags" in path:
            return "praise_tag"
        elif "/api/v1/material-kinds" in path:
            return "material_kind"
        elif "/api/v1/material-types" in path:
            return "material_type"
        elif "/api/v1/praise-materials" in path:
            return "praise_material"
        else:
            return "unknown"
    
    def _extract_resource_id(self, path: str) -> Optional[UUID]:
        """Extrai o ID do recurso do path (se disponível)"""
        import re
        # Padrão para UUIDs
        uuid_pattern = r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
        matches = re.findall(uuid_pattern, path, re.IGNORECASE)
        if matches:
            try:
                return UUID(matches[-1])  # Pegar o último UUID (geralmente o ID do recurso)
            except ValueError:
                pass
        return None
    
    def _log_audit(
        self,
        user_id: Optional[UUID],
        username: str,
        action: AuditActionType,
        resource_type: str,
        resource_id: Optional[UUID],
        ip_address: Optional[str],
        user_agent: Optional[str],
        request_method: str,
        request_path: str,
        success: bool,
        error_message: Optional[str],
    ):
        """Registra entrada de auditoria no banco de dados"""
        db = SessionLocal()
        try:
            audit_log = AuditLog(
                user_id=user_id or UUID('00000000-0000-0000-0000-000000000000'),  # UUID vazio para usuários anônimos
                username=username,
                action=action,
                resource_type=resource_type,
                resource_id=resource_id,
                ip_address=ip_address,
                user_agent=user_agent,
                request_method=request_method,
                request_path=request_path,
                success=success,
                error_message=error_message,
            )
            db.add(audit_log)
            db.commit()
        except Exception as e:
            db.rollback()
            logger.error(f"Error creating audit log: {e}", exc_info=True)
            raise
        finally:
            db.close()
