from sqlalchemy.orm import Session
from app.domain.models.changelog_entry import ChangelogEntry


def record_changelog(db: Session, entity_type: str, entity_id, action: str):
    """Register a change in the changelog. Called by services after successful CRUD operations."""
    entry = ChangelogEntry(
        entity_type=entity_type,
        entity_id=str(entity_id),
        action=action,
    )
    db.add(entry)
    db.commit()
