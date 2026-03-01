from sqlalchemy import Column, Integer, String, DateTime
from datetime import datetime, timezone
from app.infrastructure.database.database import Base


class ChangelogEntry(Base):
    __tablename__ = "changelog_entries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    entity_type = Column(String, nullable=False, index=True)
    entity_id = Column(String, nullable=False)
    action = Column(String, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    def __repr__(self):
        return f"<ChangelogEntry(id={self.id}, entity_type='{self.entity_type}', action='{self.action}')>"
