from sqlalchemy import Column, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from app.infrastructure.database.database import Base


class PraiseTag(Base):
    __tablename__ = "praise_tags"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    name = Column(String, unique=True, nullable=False, index=True)

    # Many-to-many relationship with Praise
    praises = relationship(
        "Praise",
        secondary="praise_tag_association",
        back_populates="tags"
    )

    def __repr__(self):
        return f"<PraiseTag(id={self.id}, name='{self.name}')>"






