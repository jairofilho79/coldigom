from sqlalchemy import Column, String, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from app.infrastructure.database.database import Base


class MaterialKindTranslation(Base):
    __tablename__ = "material_kind_translations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    material_kind_id = Column(UUID(as_uuid=True), ForeignKey("material_kinds.id"), nullable=False, index=True)
    language_code = Column(String, ForeignKey("languages.code"), nullable=False, index=True)
    translated_name = Column(String, nullable=False)

    # Relationships
    material_kind = relationship("MaterialKind", back_populates="translations")
    language = relationship("Language", back_populates="material_kind_translations")

    __table_args__ = (
        UniqueConstraint('material_kind_id', 'language_code', name='uq_material_kind_translation'),
    )

    def __repr__(self):
        return f"<MaterialKindTranslation(material_kind_id={self.material_kind_id}, language_code='{self.language_code}', translated_name='{self.translated_name}')>"
