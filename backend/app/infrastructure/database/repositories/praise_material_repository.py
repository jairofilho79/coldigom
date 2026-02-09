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

    def get_by_criteria(
        self,
        tag_ids: Optional[List[UUID]] = None,
        material_kind_ids: Optional[List[UUID]] = None,
        operation: str = "union",  # "union" ou "intersection"
        is_old: Optional[bool] = None,
    ) -> List[PraiseMaterial]:
        """Busca materiais por critérios múltiplos (tags e material kinds)
        
        Args:
            tag_ids: Lista de IDs de tags
            material_kind_ids: Lista de IDs de material kinds
            operation: "union" (OU) ou "intersection" (E)
            is_old: Filtrar por materiais antigos
        """
        from app.domain.models.praise import Praise, praise_tag_association
        
        query = (
            self.db.query(PraiseMaterial)
            .options(
                joinedload(PraiseMaterial.material_kind),
                joinedload(PraiseMaterial.praise),
            )
            .join(Praise, PraiseMaterial.praise_id == Praise.id)
        )
        
        # Aplicar filtros
        if tag_ids and len(tag_ids) > 0:
            if operation == "union":
                # União: materiais de praises que têm QUALQUER uma das tags
                query = query.join(
                    praise_tag_association,
                    Praise.id == praise_tag_association.c.praise_id
                ).filter(praise_tag_association.c.tag_id.in_(tag_ids))
            else:
                # Intersecção: materiais de praises que têm TODAS as tags
                # Para cada tag, precisamos garantir que o praise tenha essa tag
                for tag_id in tag_ids:
                    subquery = (
                        self.db.query(praise_tag_association.c.praise_id)
                        .filter(praise_tag_association.c.tag_id == tag_id)
                        .subquery()
                    )
                    query = query.filter(Praise.id.in_(self.db.query(subquery.c.praise_id)))
        
        if material_kind_ids and len(material_kind_ids) > 0:
            if operation == "union":
                # União: materiais que têm QUALQUER um dos material kinds
                query = query.filter(PraiseMaterial.material_kind_id.in_(material_kind_ids))
            else:
                # Intersecção: materiais que têm TODOS os material kinds
                # Como um material só pode ter um material_kind_id, intersecção não faz sentido
                # Vamos tratar como união neste caso
                query = query.filter(PraiseMaterial.material_kind_id.in_(material_kind_ids))
        
        if is_old is not None:
            query = query.filter(PraiseMaterial.is_old == is_old)
        
        # Remover duplicatas
        return list(set(query.all()))






