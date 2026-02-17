from sqlalchemy import Column, String, DateTime, JSON, Text, Boolean, Enum
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime, timezone
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
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
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
    extra_metadata = Column(JSON, nullable=True)  # Dados adicionais contextuais (renomeado de 'metadata' pois é reservado no SQLAlchemy)
    
    # Timestamp
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False, index=True)
    
    # Status da operação
    success = Column(Boolean, default=True, nullable=False)
    error_message = Column(Text, nullable=True)
    
    def __repr__(self):
        return f"<AuditLog(user={self.username}, action={self.action}, resource={self.resource_type})>"
