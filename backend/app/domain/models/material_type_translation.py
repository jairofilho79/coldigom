from sqlalchemy import Column, String, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from app.infrastructure.database.database import Base


class MaterialTypeTranslation(Base):
    __tablename__ = "material_type_translations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    material_type_id = Column(UUID(as_uuid=True), ForeignKey("material_types.id"), nullable=False, index=True)
    language_code = Column(String, ForeignKey("languages.code"), nullable=False, index=True)
    translated_name = Column(String, nullable=False)

    # Relationships
    material_type = relationship("MaterialType", back_populates="translations")
    language = relationship("Language", back_populates="material_type_translations")

    __table_args__ = (
        UniqueConstraint('material_type_id', 'language_code', name='uq_material_type_translation'),
    )

    def __repr__(self):
        return f"<MaterialTypeTranslation(material_type_id={self.material_type_id}, language_code='{self.language_code}', translated_name='{self.translated_name}')>"
