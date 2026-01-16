#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para popular MaterialTypes iniciais no banco de dados
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from app.infrastructure.database.database import SessionLocal
from app.domain.models.material_type import MaterialType
from app.infrastructure.database.repositories.material_type_repository import MaterialTypeRepository


# Lista de MaterialTypes iniciais
MATERIAL_TYPES = [
    "pdf",
    "audio",
    "youtube",
    "spotify",
    "text",
]


def seed_material_types(db: Session):
    """Cria os tipos iniciais se não existirem"""
    repo = MaterialTypeRepository(db)
    created_count = 0
    existing_count = 0
    
    for type_name in MATERIAL_TYPES:
        existing_type = repo.get_by_name(type_name)
        if existing_type:
            print(f"✓ MaterialType '{type_name}' já existe (ID: {existing_type.id})")
            existing_count += 1
        else:
            material_type = MaterialType(name=type_name)
            repo.create(material_type)
            print(f"✓ Criado MaterialType '{type_name}' (ID: {material_type.id})")
            created_count += 1
    
    print(f"\nResumo: {created_count} criados, {existing_count} já existiam")
    return created_count


if __name__ == "__main__":
    db = SessionLocal()
    try:
        print("Populando MaterialTypes iniciais...")
        seed_material_types(db)
    except Exception as e:
        print(f"Erro ao popular MaterialTypes: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        db.close()
