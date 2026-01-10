from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session
from app.domain.models.material_kind import MaterialKind
from app.application.repositories import BaseRepository


class MaterialKindRepository(BaseRepository):
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, id: UUID) -> Optional[MaterialKind]:
        return self.db.query(MaterialKind).filter(MaterialKind.id == id).first()

    def get_by_name(self, name: str) -> Optional[MaterialKind]:
        return self.db.query(MaterialKind).filter(MaterialKind.name == name).first()

    def get_all(self, skip: int = 0, limit: int = 100) -> List[MaterialKind]:
        return self.db.query(MaterialKind).offset(skip).limit(limit).all()

    def create(self, material_kind: MaterialKind) -> MaterialKind:
        self.db.add(material_kind)
        self.db.commit()
        self.db.refresh(material_kind)
        return material_kind

    def update(self, material_kind: MaterialKind) -> MaterialKind:
        self.db.commit()
        self.db.refresh(material_kind)
        return material_kind

    def delete(self, id: UUID) -> bool:
        material_kind = self.get_by_id(id)
        if material_kind:
            self.db.delete(material_kind)
            self.db.commit()
            return True
        return False






