from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session, joinedload
from app.domain.models.praise import Praise
from app.domain.models.praise_material import PraiseMaterial
from app.application.repositories import BaseRepository


class PraiseRepository(BaseRepository):
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, id: UUID) -> Optional[Praise]:
        return (
            self.db.query(Praise)
            .options(
                joinedload(Praise.tags),
                joinedload(Praise.materials).joinedload(PraiseMaterial.material_kind),
                joinedload(Praise.materials).joinedload(PraiseMaterial.material_type)
            )
            .filter(Praise.id == id)
            .first()
        )

    def get_by_number(self, number: int) -> Optional[Praise]:
        return (
            self.db.query(Praise)
            .options(
                joinedload(Praise.tags),
                joinedload(Praise.materials).joinedload(PraiseMaterial.material_kind),
                joinedload(Praise.materials).joinedload(PraiseMaterial.material_type)
            )
            .filter(Praise.number == number)
            .first()
        )

    def get_all(self, skip: int = 0, limit: int = 100) -> List[Praise]:
        return (
            self.db.query(Praise)
            .options(
                joinedload(Praise.tags),
                joinedload(Praise.materials).joinedload(PraiseMaterial.material_kind),
                joinedload(Praise.materials).joinedload(PraiseMaterial.material_type)
            )
            .offset(skip)
            .limit(limit)
            .all()
        )

    def search_by_name(self, name: str, skip: int = 0, limit: int = 100) -> List[Praise]:
        return (
            self.db.query(Praise)
            .options(
                joinedload(Praise.tags),
                joinedload(Praise.materials).joinedload(PraiseMaterial.material_kind),
                joinedload(Praise.materials).joinedload(PraiseMaterial.material_type)
            )
            .filter(Praise.name.ilike(f"%{name}%"))
            .offset(skip)
            .limit(limit)
            .all()
        )

    def create(self, praise: Praise) -> Praise:
        self.db.add(praise)
        self.db.commit()
        self.db.refresh(praise)
        return praise

    def update(self, praise: Praise) -> Praise:
        self.db.commit()
        self.db.refresh(praise)
        return praise

    def delete(self, id: UUID) -> bool:
        praise = self.get_by_id(id)
        if praise:
            self.db.delete(praise)
            self.db.commit()
            return True
        return False






