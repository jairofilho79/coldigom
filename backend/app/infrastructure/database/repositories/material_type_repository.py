from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session
from app.domain.models.material_type import MaterialType
from app.application.repositories import BaseRepository


class MaterialTypeRepository(BaseRepository):
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, id: UUID) -> Optional[MaterialType]:
        return self.db.query(MaterialType).filter(MaterialType.id == id).first()

    def get_by_name(self, name: str) -> Optional[MaterialType]:
        return self.db.query(MaterialType).filter(MaterialType.name == name).first()

    def get_all(self, skip: int = 0, limit: int = 100) -> List[MaterialType]:
        return self.db.query(MaterialType).offset(skip).limit(limit).all()

    def create(self, material_type: MaterialType) -> MaterialType:
        self.db.add(material_type)
        self.db.commit()
        self.db.refresh(material_type)
        return material_type

    def update(self, material_type: MaterialType) -> MaterialType:
        self.db.commit()
        self.db.refresh(material_type)
        return material_type

    def delete(self, id: UUID) -> bool:
        material_type = self.get_by_id(id)
        if material_type:
            self.db.delete(material_type)
            self.db.commit()
            return True
        return False
