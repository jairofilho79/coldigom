from sqlalchemy import Column, String, DateTime, Table, ForeignKey, Boolean, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
from app.infrastructure.database.database import Base

# Association table for many-to-many relationship between PraiseList and Praise
praise_list_praise_association = Table(
    "praise_list_praise",
    Base.metadata,
    Column("praise_list_id", UUID(as_uuid=True), ForeignKey("praise_lists.id", ondelete="CASCADE"), primary_key=True),
    Column("praise_id", UUID(as_uuid=True), ForeignKey("praises.id", ondelete="CASCADE"), primary_key=True),
    Column("order", Integer, nullable=False, default=0),
    Column("added_at", DateTime, default=datetime.utcnow, nullable=False),
)


class PraiseList(Base):
    __tablename__ = "praise_lists"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    name = Column(String, nullable=False, index=True)
    description = Column(String, nullable=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    is_public = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", backref="praise_lists")
    praises = relationship(
        "Praise",
        secondary=praise_list_praise_association,
        back_populates="praise_lists"
    )
    followers = relationship(
        "PraiseListFollow",
        back_populates="praise_list",
        cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<PraiseList(id={self.id}, name='{self.name}', user_id={self.user_id})>"


class PraiseListFollow(Base):
    __tablename__ = "praise_list_follows"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    praise_list_id = Column(UUID(as_uuid=True), ForeignKey("praise_lists.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", backref="followed_praise_lists")
    praise_list = relationship("PraiseList", back_populates="followers")

    def __repr__(self):
        return f"<PraiseListFollow(id={self.id}, user_id={self.user_id}, praise_list_id={self.praise_list_id})>"
