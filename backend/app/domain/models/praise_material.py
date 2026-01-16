from sqlalchemy import Column, String, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from app.infrastructure.database.database import Base


# Enum MaterialType mantido temporariamente para compatibilidade durante migração
# Será removido após a migração completa
class MaterialType(str):
    """Enum temporário para compatibilidade - será removido após migração"""
    FILE = "file"
    YOUTUBE = "youtube"
    SPOTIFY = "spotify"
    TEXT = "text"


class PraiseMaterial(Base):
    __tablename__ = "praise_materials"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    material_kind_id = Column(UUID(as_uuid=True), ForeignKey("material_kinds.id"), nullable=False)
    material_type_id = Column(UUID(as_uuid=True), ForeignKey("material_types.id"), nullable=False)
    path = Column(String, nullable=False)  # Path no Wasabi ou URL para links externos
    # type = Column(Enum(MaterialType), nullable=False, default=MaterialType.FILE)  # Removido - usar material_type_id
    praise_id = Column(UUID(as_uuid=True), ForeignKey("praises.id"), nullable=False)

    # Relationships
    material_kind = relationship("MaterialKind", back_populates="materials")
    material_type = relationship("MaterialType", back_populates="materials")
    praise = relationship("Praise", back_populates="materials")

    def __repr__(self):
        return f"<PraiseMaterial(id={self.id}, material_type_id='{self.material_type_id}', path='{self.path}')>"






