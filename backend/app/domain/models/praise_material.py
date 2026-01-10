from sqlalchemy import Column, String, ForeignKey, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
import enum
from app.infrastructure.database.database import Base


class MaterialType(str, enum.Enum):
    FILE = "file"
    YOUTUBE = "youtube"
    SPOTIFY = "spotify"
    TEXT = "text"


class PraiseMaterial(Base):
    __tablename__ = "praise_materials"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    material_kind_id = Column(UUID(as_uuid=True), ForeignKey("material_kinds.id"), nullable=False)
    path = Column(String, nullable=False)  # Path no Wasabi ou URL para links externos
    type = Column(Enum(MaterialType), nullable=False, default=MaterialType.FILE)
    praise_id = Column(UUID(as_uuid=True), ForeignKey("praises.id"), nullable=False)

    # Relationships
    material_kind = relationship("MaterialKind", back_populates="materials")
    praise = relationship("Praise", back_populates="materials")

    def __repr__(self):
        return f"<PraiseMaterial(id={self.id}, type='{self.type}', path='{self.path}')>"






