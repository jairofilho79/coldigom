from sqlalchemy import Column, String, Integer, DateTime, Table, ForeignKey, Boolean, text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
from app.infrastructure.database.database import Base

# Association table for many-to-many relationship
praise_tag_association = Table(
    "praise_tag_association",
    Base.metadata,
    Column("praise_id", UUID(as_uuid=True), ForeignKey("praises.id"), primary_key=True),
    Column("tag_id", UUID(as_uuid=True), ForeignKey("praise_tags.id"), primary_key=True),
)


class Praise(Base):
    __tablename__ = "praises"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    name = Column(String, nullable=False, index=True)
    number = Column(Integer, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    in_review = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    in_review_description = Column(String(2000), nullable=True)
    review_history = Column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))

    # Extended metadata from metadata.yml
    author = Column(String(255), nullable=True)
    rhythm = Column(String(100), nullable=True)
    tonality = Column(String(50), nullable=True)
    category = Column(String(255), nullable=True)

    # Many-to-many relationship with PraiseTag
    tags = relationship(
        "PraiseTag",
        secondary=praise_tag_association,
        back_populates="praises"
    )

    # One-to-many relationship with PraiseMaterial
    materials = relationship("PraiseMaterial", back_populates="praise", cascade="all, delete-orphan")

    # Many-to-many relationship with PraiseList
    praise_lists = relationship(
        "PraiseList",
        secondary="praise_list_praise",
        back_populates="praises"
    )

    def __repr__(self):
        return f"<Praise(id={self.id}, name='{self.name}', number={self.number})>"






