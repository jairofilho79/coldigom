#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para listar todas as traduções existentes em pt
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from app.infrastructure.database.database import SessionLocal
from app.infrastructure.database.repositories.material_kind_repository import MaterialKindRepository
from app.infrastructure.database.repositories.material_kind_translation_repository import MaterialKindTranslationRepository


def list_material_kind_translations(db: Session, language_code: str):
    """Lista todas as traduções de Material Kinds"""
    material_kind_repo = MaterialKindRepository(db)
    translation_repo = MaterialKindTranslationRepository(db)
    
    material_kinds = material_kind_repo.get_all(skip=0, limit=1000)
    
    print("\n" + "=" * 80)
    print("TODAS AS TRADUÇÕES DE MATERIAL KINDS (pt)")
    print("=" * 80)
    
    translations_list = []
    for kind in sorted(material_kinds, key=lambda x: x.name):
        translation = translation_repo.get_by_entity_and_language(kind.id, language_code)
        if translation:
            translations_list.append({
                'original': kind.name,
                'translated': translation.translated_name
            })
            print(f"{kind.name:40} → {translation.translated_name}")
    
    return translations_list


def main():
    """Função principal"""
    language_code = "pt"
    
    db: Session = SessionLocal()
    try:
        print("=" * 80)
        print("LISTAGEM DE TRADUÇÕES")
        print("=" * 80)
        
        translations = list_material_kind_translations(db, language_code)
        
        print(f"\nTotal de traduções listadas: {len(translations)}")
        
    except Exception as e:
        print(f"\n✗ Erro durante a execução: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
