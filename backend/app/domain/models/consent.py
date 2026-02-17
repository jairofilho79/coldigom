from sqlalchemy import Column, String, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime, timezone
import uuid
from app.infrastructure.database.database import Base


class UserConsent(Base):
    __tablename__ = "user_consents"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    consent_type = Column(String, nullable=False, index=True)  # "data_processing", "cookies", "marketing", etc.
    granted = Column(String, nullable=False, default="true")  # "true", "false", "revoked"
    granted_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    consent_text = Column(Text, nullable=True)  # Texto do consentimento no momento da concessão
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)
    
    def __repr__(self):
        return f"<UserConsent(user_id={self.user_id}, type={self.consent_type}, granted={self.granted})>"
