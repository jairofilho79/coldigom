from sqlalchemy.orm import Session
from app.infrastructure.database.repositories.changelog_repository import ChangelogRepository


class ChangelogService:
    def __init__(self, db: Session):
        self.repository = ChangelogRepository(db)

    def get_changes_since(self, version: int) -> dict:
        changes = self.repository.get_since_version(version)
        current_version = self.repository.get_current_version()
        return {
            "current_version": current_version,
            "changes": [
                {
                    "version": entry.id,
                    "entity_type": entry.entity_type,
                    "entity_id": entry.entity_id,
                    "action": entry.action,
                    "created_at": entry.created_at,
                }
                for entry in changes
            ],
        }

    def get_current_version(self) -> int:
        return self.repository.get_current_version()
