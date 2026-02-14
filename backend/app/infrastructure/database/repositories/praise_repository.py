from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, case, func
from app.domain.models.praise import Praise
from app.domain.models.praise_material import PraiseMaterial
from app.domain.models.material_type import MaterialType
from app.domain.models.material_kind import MaterialKind
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

    def search_by_name_or_number_or_lyrics(
        self, query: str, skip: int = 0, limit: int = 100
    ) -> List[Praise]:
        """Search praises by name, number, or lyrics content."""
        conditions = [Praise.name.ilike(f"%{query}%")]

        # Match number if query is numeric
        if query.strip().isdigit():
            conditions.append(Praise.number == int(query.strip()))

        # Match lyrics in text materials (Material Type 'text', Material Kind 'Lyrics')
        lyrics_subq = (
            self.db.query(PraiseMaterial.praise_id)
            .join(MaterialType, PraiseMaterial.material_type_id == MaterialType.id)
            .join(MaterialKind, PraiseMaterial.material_kind_id == MaterialKind.id)
            .filter(
                MaterialType.name.ilike("text"),
                MaterialKind.name.ilike("Lyrics"),
                PraiseMaterial.path.ilike(f"%{query}%"),
            )
        )
        conditions.append(Praise.id.in_(lyrics_subq))

        return (
            self.db.query(Praise)
            .options(
                joinedload(Praise.tags),
                joinedload(Praise.materials).joinedload(PraiseMaterial.material_kind),
                joinedload(Praise.materials).joinedload(PraiseMaterial.material_type)
            )
            .filter(or_(*conditions))
            .distinct()
            .offset(skip)
            .limit(limit)
            .all()
        )

    def get_by_tag_id(self, tag_id: UUID, skip: int = 0, limit: int = 100) -> List[Praise]:
        from app.domain.models.praise import praise_tag_association
        return (
            self.db.query(Praise)
            .join(praise_tag_association)
            .options(
                joinedload(Praise.tags),
                joinedload(Praise.materials).joinedload(PraiseMaterial.material_kind),
                joinedload(Praise.materials).joinedload(PraiseMaterial.material_type)
            )
            .filter(praise_tag_association.c.tag_id == tag_id)
            .offset(skip)
            .limit(limit)
            .all()
        )

    def get_all_filtered_sorted(
        self,
        skip: int = 0,
        limit: int = 100,
        name: Optional[str] = None,
        tag_id: Optional[UUID] = None,
        sort_by: str = "name",
        sort_direction: str = "asc",
        no_number: str = "last",
    ) -> List[Praise]:
        """Query unificada com filtros e ordenação no banco."""
        from app.domain.models.praise import praise_tag_association

        query = (
            self.db.query(Praise)
            .options(
                joinedload(Praise.tags),
                joinedload(Praise.materials).joinedload(PraiseMaterial.material_kind),
                joinedload(Praise.materials).joinedload(PraiseMaterial.material_type)
            )
        )

        # Filtro por tag
        if tag_id:
            query = query.join(praise_tag_association).filter(
                praise_tag_association.c.tag_id == tag_id
            )

        # Filtro por nome/número/lyrics
        if name and name.strip():
            conditions = [Praise.name.ilike(f"%{name.strip()}%")]
            if name.strip().isdigit():
                conditions.append(Praise.number == int(name.strip()))
            lyrics_subq = (
                self.db.query(PraiseMaterial.praise_id)
                .join(MaterialType, PraiseMaterial.material_type_id == MaterialType.id)
                .join(MaterialKind, PraiseMaterial.material_kind_id == MaterialKind.id)
                .filter(
                    MaterialType.name.ilike("text"),
                    MaterialKind.name.ilike("Lyrics"),
                    PraiseMaterial.path.ilike(f"%{name.strip()}%"),
                )
            )
            conditions.append(Praise.id.in_(lyrics_subq))
            query = query.filter(or_(*conditions)).distinct()

        # Filtro por number IS NOT NULL quando no_number=hide e sort_by=number
        if sort_by == "number" and no_number == "hide":
            query = query.filter(Praise.number.isnot(None))

        # Ordenação
        asc = sort_direction.lower() != "desc"
        if sort_by == "number":
            if no_number == "first":
                # NULLs primeiro: 0 para NULL, 1 para não-NULL
                null_order = case((Praise.number.is_(None), 0), else_=1).asc()
                num_order = Praise.number.asc() if asc else Praise.number.desc()
                query = query.order_by(null_order, num_order, func.lower(Praise.name))
            elif no_number == "last":
                # NULLs por último: 0 para não-NULL, 1 para NULL
                null_order = case((Praise.number.is_(None), 1), else_=0).asc()
                num_order = Praise.number.asc() if asc else Praise.number.desc()
                query = query.order_by(null_order, num_order, func.lower(Praise.name))
            else:
                # hide: já filtrado, só ordenar por number
                num_order = Praise.number.asc() if asc else Praise.number.desc()
                query = query.order_by(num_order, func.lower(Praise.name))
        else:
            # ordenar por nome (case-insensitive)
            name_order = func.lower(Praise.name).asc() if asc else func.lower(Praise.name).desc()
            query = query.order_by(name_order)

        return query.offset(skip).limit(limit).all()

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






