from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session
from app.domain.models.praise_tag import PraiseTag
from app.application.repositories import BaseRepository


class PraiseTagRepository(BaseRepository):
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, id: UUID) -> Optional[PraiseTag]:
        return self.db.query(PraiseTag).filter(PraiseTag.id == id).first()

    def get_by_name(self, name: str) -> Optional[PraiseTag]:
        return self.db.query(PraiseTag).filter(PraiseTag.name == name).first()

    def get_all(self, skip: int = 0, limit: int = 100) -> List[PraiseTag]:
        return self.db.query(PraiseTag).offset(skip).limit(limit).all()

    def create(self, tag: PraiseTag) -> PraiseTag:
        self.db.add(tag)
        self.db.commit()
        self.db.refresh(tag)
        return tag

    def update(self, tag: PraiseTag) -> PraiseTag:
        self.db.commit()
        self.db.refresh(tag)
        return tag

    def delete(self, id: UUID) -> bool:
        tag = self.get_by_id(id)
        if tag:
            self.db.delete(tag)
            self.db.commit()
            return True
        return False






