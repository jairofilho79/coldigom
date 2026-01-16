from sqlalchemy import Column, String, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from app.infrastructure.database.database import Base


class PraiseTagTranslation(Base):
    __tablename__ = "praise_tag_translations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    praise_tag_id = Column(UUID(as_uuid=True), ForeignKey("praise_tags.id"), nullable=False, index=True)
    language_code = Column(String, ForeignKey("languages.code"), nullable=False, index=True)
    translated_name = Column(String, nullable=False)

    # Relationships
    praise_tag = relationship("PraiseTag", back_populates="translations")
    language = relationship("Language", back_populates="praise_tag_translations")

    __table_args__ = (
        UniqueConstraint('praise_tag_id', 'language_code', name='uq_praise_tag_translation'),
    )

    def __repr__(self):
        return f"<PraiseTagTranslation(praise_tag_id={self.praise_tag_id}, language_code='{self.language_code}', translated_name='{self.translated_name}')>"
