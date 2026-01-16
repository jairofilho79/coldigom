from sqlalchemy import Column, String, Boolean
from sqlalchemy.orm import relationship
from app.infrastructure.database.database import Base


class Language(Base):
    __tablename__ = "languages"

    code = Column(String, primary_key=True, index=True)  # ex: pt-BR, en-US
    name = Column(String, nullable=False)  # ex: "Português (Brasil)"
    is_active = Column(Boolean, nullable=False, default=True)

    # Relationships with translation tables
    material_kind_translations = relationship("MaterialKindTranslation", back_populates="language")
    praise_tag_translations = relationship("PraiseTagTranslation", back_populates="language")
    material_type_translations = relationship("MaterialTypeTranslation", back_populates="language")

    def __repr__(self):
        return f"<Language(code='{self.code}', name='{self.name}')>"
