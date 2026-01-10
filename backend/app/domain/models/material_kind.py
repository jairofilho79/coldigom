from sqlalchemy import Column, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from app.infrastructure.database.database import Base


class MaterialKind(Base):
    __tablename__ = "material_kinds"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    name = Column(String, unique=True, nullable=False, index=True)

    # One-to-many relationship with PraiseMaterial
    materials = relationship("PraiseMaterial", back_populates="material_kind")

    def __repr__(self):
        return f"<MaterialKind(id={self.id}, name='{self.name}')>"






