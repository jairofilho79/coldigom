from typing import List
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.domain.models.changelog_entry import ChangelogEntry


class ChangelogRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_since_version(self, version: int) -> List[ChangelogEntry]:
        return (
            self.db.query(ChangelogEntry)
            .filter(ChangelogEntry.id > version)
            .order_by(ChangelogEntry.id)
            .all()
        )

    def get_current_version(self) -> int:
        result = self.db.query(func.max(ChangelogEntry.id)).scalar()
        return result or 0

    def record(self, entity_type: str, entity_id: str, action: str) -> ChangelogEntry:
        entry = ChangelogEntry(
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
        )
        self.db.add(entry)
        self.db.commit()
        self.db.refresh(entry)
        return entry
