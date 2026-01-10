from sqlalchemy import Column, String, Integer, DateTime, Table, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
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

    # Many-to-many relationship with PraiseTag
    tags = relationship(
        "PraiseTag",
        secondary=praise_tag_association,
        back_populates="praises"
    )

    # One-to-many relationship with PraiseMaterial
    materials = relationship("PraiseMaterial", back_populates="praise", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Praise(id={self.id}, name='{self.name}', number={self.number})>"






