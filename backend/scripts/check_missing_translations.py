#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para verificar quais Material Kinds, Praise Tags e Material Types não possuem tradução em pt
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from app.infrastructure.database.database import SessionLocal
from app.infrastructure.database.repositories.material_kind_repository import MaterialKindRepository
from app.infrastructure.database.repositories.praise_tag_repository import PraiseTagRepository
from app.infrastructure.database.repositories.material_type_repository import MaterialTypeRepository
from app.infrastructure.database.repositories.material_kind_translation_repository import MaterialKindTranslationRepository
from app.infrastructure.database.repositories.praise_tag_translation_repository import PraiseTagTranslationRepository
from app.infrastructure.database.repositories.material_type_translation_repository import MaterialTypeTranslationRepository
def check_material_kinds(db: Session, language_code: str):
    """Verifica Material Kinds sem tradução"""
    material_kind_repo = MaterialKindRepository(db)
    translation_repo = MaterialKindTranslationRepository(db)
    
    material_kinds = material_kind_repo.get_all(skip=0, limit=1000)
    missing_translations = []
    has_translation = []
    
    print("\n" + "=" * 80)
    print("MATERIAL KINDS SEM TRADUÇÃO")
    print("=" * 80)
    
    for kind in material_kinds:
        translation = translation_repo.get_by_entity_and_language(kind.id, language_code)
        
        if not translation:
            missing_translations.append({
                'name': kind.name,
                'id': kind.id
            })
        else:
            has_translation.append({
                'name': kind.name,
                'translation': translation.translated_name
            })
    
    print(f"\nTotal de Material Kinds: {len(material_kinds)}")
    print(f"Com tradução: {len(has_translation)}")
    print(f"Sem tradução: {len(missing_translations)}")
    
    if missing_translations:
        print(f"\n--- Material Kinds sem tradução ({len(missing_translations)}):")
        for mk in sorted(missing_translations, key=lambda x: x['name']):
            print(f"  - {mk['name']}")
    
    return missing_translations, has_translation


def check_praise_tags(db: Session, language_code: str):
    """Verifica Praise Tags sem tradução"""
    praise_tag_repo = PraiseTagRepository(db)
    translation_repo = PraiseTagTranslationRepository(db)
    
    praise_tags = praise_tag_repo.get_all(skip=0, limit=1000)
    missing_translations = []
    has_translation = []
    
    print("\n" + "=" * 80)
    print("PRAISE TAGS SEM TRADUÇÃO")
    print("=" * 80)
    
    for tag in praise_tags:
        translation = translation_repo.get_by_entity_and_language(tag.id, language_code)
        
        if not translation:
            missing_translations.append({
                'name': tag.name,
                'id': tag.id
            })
        else:
            has_translation.append({
                'name': tag.name,
                'translation': translation.translated_name
            })
    
    print(f"\nTotal de Praise Tags: {len(praise_tags)}")
    print(f"Com tradução: {len(has_translation)}")
    print(f"Sem tradução: {len(missing_translations)}")
    
    if missing_translations:
        print(f"\n--- Praise Tags sem tradução ({len(missing_translations)}):")
        for tag in sorted(missing_translations, key=lambda x: x['name']):
            print(f"  - {tag['name']}")
    
    return missing_translations, has_translation


def check_material_types(db: Session, language_code: str):
    """Verifica Material Types sem tradução"""
    material_type_repo = MaterialTypeRepository(db)
    translation_repo = MaterialTypeTranslationRepository(db)
    
    material_types = material_type_repo.get_all(skip=0, limit=1000)
    missing_translations = []
    has_translation = []
    
    print("\n" + "=" * 80)
    print("MATERIAL TYPES SEM TRADUÇÃO")
    print("=" * 80)
    
    for material_type in material_types:
        translation = translation_repo.get_by_entity_and_language(material_type.id, language_code)
        
        if not translation:
            missing_translations.append({
                'name': material_type.name,
                'id': material_type.id
            })
        else:
            has_translation.append({
                'name': material_type.name,
                'translation': translation.translated_name
            })
    
    print(f"\nTotal de Material Types: {len(material_types)}")
    print(f"Com tradução: {len(has_translation)}")
    print(f"Sem tradução: {len(missing_translations)}")
    
    if missing_translations:
        print(f"\n--- Material Types sem tradução ({len(missing_translations)}):")
        for mt in sorted(missing_translations, key=lambda x: x['name']):
            print(f"  - {mt['name']}")
    
    return missing_translations, has_translation


def main():
    """Função principal"""
    language_code = "pt"
    
    db: Session = SessionLocal()
    try:
        print("=" * 80)
        print("VERIFICAÇÃO DE TRADUÇÕES FALTANTES")
        print("=" * 80)
        
        # Verificar Material Kinds
        mk_missing, mk_has = check_material_kinds(db, language_code)
        
        # Verificar Praise Tags
        pt_missing, pt_has = check_praise_tags(db, language_code)
        
        # Verificar Material Types
        mt_missing, mt_has = check_material_types(db, language_code)
        
        # Resumo final
        print("\n" + "=" * 80)
        print("RESUMO GERAL")
        print("=" * 80)
        print(f"Material Kinds sem tradução: {len(mk_missing)}")
        print(f"Praise Tags sem tradução: {len(pt_missing)}")
        print(f"Material Types sem tradução: {len(mt_missing)}")
        print(f"\nTotal de entidades sem tradução: {len(mk_missing) + len(pt_missing) + len(mt_missing)}")
        print("=" * 80)
        
    except Exception as e:
        print(f"\n✗ Erro durante a execução: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
