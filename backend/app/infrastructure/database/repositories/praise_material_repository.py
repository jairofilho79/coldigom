from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session, joinedload
from app.domain.models.praise_material import PraiseMaterial
from app.application.repositories import BaseRepository


class PraiseMaterialRepository(BaseRepository):
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, id: UUID) -> Optional[PraiseMaterial]:
        return (
            self.db.query(PraiseMaterial)
            .options(joinedload(PraiseMaterial.material_kind))
            .filter(PraiseMaterial.id == id)
            .first()
        )

    def get_by_praise_id(self, praise_id: UUID, is_old: Optional[bool] = None) -> List[PraiseMaterial]:
        query = (
            self.db.query(PraiseMaterial)
            .options(joinedload(PraiseMaterial.material_kind))
            .filter(PraiseMaterial.praise_id == praise_id)
        )
        if is_old is not None:
            query = query.filter(PraiseMaterial.is_old == is_old)
        return query.all()

    def get_all(self, skip: int = 0, limit: int = 100) -> List[PraiseMaterial]:
        return (
            self.db.query(PraiseMaterial)
            .options(joinedload(PraiseMaterial.material_kind))
            .offset(skip)
            .limit(limit)
            .all()
        )

    def create(self, material: PraiseMaterial) -> PraiseMaterial:
        self.db.add(material)
        self.db.commit()
        self.db.refresh(material)
        return material

    def update(self, material: PraiseMaterial) -> PraiseMaterial:
        self.db.commit()
        self.db.refresh(material)
        return material

    def delete(self, id: UUID) -> bool:
        material = self.get_by_id(id)
        if material:
            self.db.delete(material)
            self.db.commit()
            return True
        return False






