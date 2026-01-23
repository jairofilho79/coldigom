from sqlalchemy import Column, Integer, DateTime, ForeignKey, UniqueConstraint, Index
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid
from app.infrastructure.database.database import Base
from sqlalchemy.orm import relationship


class UserMaterialKindPreference(Base):
    __tablename__ = "user_material_kind_preferences"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    material_kind_id = Column(UUID(as_uuid=True), ForeignKey("material_kinds.id"), nullable=False, index=True)
    order = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", backref="material_kind_preferences")
    material_kind = relationship("MaterialKind", backref="user_preferences")

    # Constraints
    __table_args__ = (
        UniqueConstraint('user_id', 'material_kind_id', name='uq_user_material_kind'),
        Index('ix_user_material_kind_preferences_user_order', 'user_id', 'order'),
    )

    def __repr__(self):
        return f"<UserMaterialKindPreference(id={self.id}, user_id={self.user_id}, material_kind_id={self.material_kind_id}, order={self.order})>"
