from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session
from app.domain.models.user_material_kind_preference import UserMaterialKindPreference
from app.application.repositories import BaseRepository


class UserPreferenceRepository(BaseRepository):
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, id: UUID) -> Optional[UserMaterialKindPreference]:
        return self.db.query(UserMaterialKindPreference).filter(UserMaterialKindPreference.id == id).first()

    def get_by_user_id(self, user_id: UUID) -> List[UserMaterialKindPreference]:
        return (
            self.db.query(UserMaterialKindPreference)
            .filter(UserMaterialKindPreference.user_id == user_id)
            .order_by(UserMaterialKindPreference.order)
            .all()
        )

    def get_by_user_and_kind(self, user_id: UUID, material_kind_id: UUID) -> Optional[UserMaterialKindPreference]:
        return (
            self.db.query(UserMaterialKindPreference)
            .filter(
                UserMaterialKindPreference.user_id == user_id,
                UserMaterialKindPreference.material_kind_id == material_kind_id
            )
            .first()
        )

    def get_all(self, skip: int = 0, limit: int = 100) -> List[UserMaterialKindPreference]:
        return self.db.query(UserMaterialKindPreference).offset(skip).limit(limit).all()

    def create(self, preference: UserMaterialKindPreference) -> UserMaterialKindPreference:
        self.db.add(preference)
        self.db.commit()
        self.db.refresh(preference)
        return preference

    def update(self, preference: UserMaterialKindPreference) -> UserMaterialKindPreference:
        self.db.commit()
        self.db.refresh(preference)
        return preference

    def delete(self, id: UUID) -> bool:
        preference = self.get_by_id(id)
        if preference:
            self.db.delete(preference)
            self.db.commit()
            return True
        return False

    def delete_by_user_id(self, user_id: UUID) -> int:
        """Remove todas as preferências do usuário e retorna o número de registros deletados"""
        deleted_count = (
            self.db.query(UserMaterialKindPreference)
            .filter(UserMaterialKindPreference.user_id == user_id)
            .delete()
        )
        self.db.commit()
        return deleted_count

    def bulk_upsert(self, user_id: UUID, preferences: List[UserMaterialKindPreference]) -> List[UserMaterialKindPreference]:
        """Remove preferências antigas e cria novas"""
        self.delete_by_user_id(user_id)
        for preference in preferences:
            self.db.add(preference)
        self.db.commit()
        for preference in preferences:
            self.db.refresh(preference)
        return preferences
