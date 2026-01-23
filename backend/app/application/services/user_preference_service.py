from typing import List
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy.orm import joinedload
from fastapi import HTTPException, status
from app.domain.models.user_material_kind_preference import UserMaterialKindPreference
from app.domain.schemas.user_preference import MaterialKindOrderUpdate
from app.infrastructure.database.repositories.user_preference_repository import UserPreferenceRepository
from app.infrastructure.database.repositories.material_kind_repository import MaterialKindRepository


class UserPreferenceService:
    def __init__(self, db: Session):
        self.db = db
        self.repository = UserPreferenceRepository(db)
        self.material_kind_repository = MaterialKindRepository(db)

    def get_user_preferences(self, user_id: UUID) -> List[UserMaterialKindPreference]:
        """Retorna preferências do usuário com material_kind incluído"""
        preferences = (
            self.db.query(UserMaterialKindPreference)
            .options(joinedload(UserMaterialKindPreference.material_kind))
            .filter(UserMaterialKindPreference.user_id == user_id)
            .order_by(UserMaterialKindPreference.order)
            .all()
        )
        return preferences

    def update_material_kind_order(self, user_id: UUID, order_data: MaterialKindOrderUpdate) -> List[UserMaterialKindPreference]:
        """
        Atualiza ordem de preferência do usuário.
        Valida máximo 5 itens, existência dos IDs e ausência de duplicatas.
        """
        material_kind_ids = order_data.material_kind_ids

        # Validação: máximo 5 itens (já validado no schema, mas verificamos aqui também)
        if len(material_kind_ids) > 5:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Máximo de 5 material kinds permitidos"
            )

        # Validação: verificar se todos os material_kind_ids existem
        for material_kind_id in material_kind_ids:
            material_kind = self.material_kind_repository.get_by_id(material_kind_id)
            if not material_kind:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"MaterialKind com id {material_kind_id} não encontrado"
                )

        # Validação: sem duplicatas (já validado no schema, mas verificamos aqui também)
        if len(material_kind_ids) != len(set(material_kind_ids)):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="material_kind_ids não pode conter duplicatas"
            )

        # Remove preferências antigas do usuário
        self.repository.delete_by_user_id(user_id)

        # Cria novas preferências com ordem baseada no índice do array (0-4)
        new_preferences = []
        for index, material_kind_id in enumerate(material_kind_ids):
            preference = UserMaterialKindPreference(
                user_id=user_id,
                material_kind_id=material_kind_id,
                order=index
            )
            new_preferences.append(preference)

        # Salva todas as preferências
        saved_preferences = self.repository.bulk_upsert(user_id, new_preferences)
        
        # Retorna preferências com material_kind carregado
        return self.get_user_preferences(user_id)

    def delete_user_preferences(self, user_id: UUID) -> int:
        """Remove todas as preferências do usuário"""
        return self.repository.delete_by_user_id(user_id)
