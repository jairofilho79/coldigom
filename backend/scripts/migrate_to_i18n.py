"""
Script para migrar valores existentes de 'name' para traduções em pt-BR
"""
import sys
import os
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.orm import Session
from app.infrastructure.database.database import SessionLocal
from app.domain.models.material_kind import MaterialKind
from app.domain.models.praise_tag import PraiseTag
from app.domain.models.material_type import MaterialType
from app.domain.models.material_kind_translation import MaterialKindTranslation
from app.domain.models.praise_tag_translation import PraiseTagTranslation
from app.domain.models.material_type_translation import MaterialTypeTranslation
from app.domain.models.language import Language


def migrate_to_i18n(language_code: str = 'pt-BR'):
    """Migra valores de name para traduções"""
    db: Session = SessionLocal()
    
    try:
        # Verificar se a linguagem existe
        language = db.query(Language).filter(Language.code == language_code).first()
        if not language:
            print(f"Erro: Linguagem '{language_code}' não encontrada.")
            print("Criando linguagem...")
            language = Language(code=language_code, name=f"Português (Brasil)", is_active=True)
            db.add(language)
            db.commit()
            db.refresh(language)
            print(f"Linguagem '{language_code}' criada com sucesso.")
        
        # Migrar MaterialKinds
        material_kinds = db.query(MaterialKind).all()
        migrated_kinds = 0
        for kind in material_kinds:
            # Verificar se já existe tradução
            existing = db.query(MaterialKindTranslation).filter(
                MaterialKindTranslation.material_kind_id == kind.id,
                MaterialKindTranslation.language_code == language_code
            ).first()
            
            if not existing:
                translation = MaterialKindTranslation(
                    material_kind_id=kind.id,
                    language_code=language_code,
                    translated_name=kind.name
                )
                db.add(translation)
                migrated_kinds += 1
        
        print(f"Migrados {migrated_kinds} MaterialKinds para '{language_code}'")
        
        # Migrar PraiseTags
        praise_tags = db.query(PraiseTag).all()
        migrated_tags = 0
        for tag in praise_tags:
            existing = db.query(PraiseTagTranslation).filter(
                PraiseTagTranslation.praise_tag_id == tag.id,
                PraiseTagTranslation.language_code == language_code
            ).first()
            
            if not existing:
                translation = PraiseTagTranslation(
                    praise_tag_id=tag.id,
                    language_code=language_code,
                    translated_name=tag.name
                )
                db.add(translation)
                migrated_tags += 1
        
        print(f"Migrados {migrated_tags} PraiseTags para '{language_code}'")
        
        # Migrar MaterialTypes
        material_types = db.query(MaterialType).all()
        migrated_types = 0
        for material_type in material_types:
            existing = db.query(MaterialTypeTranslation).filter(
                MaterialTypeTranslation.material_type_id == material_type.id,
                MaterialTypeTranslation.language_code == language_code
            ).first()
            
            if not existing:
                translation = MaterialTypeTranslation(
                    material_type_id=material_type.id,
                    language_code=language_code,
                    translated_name=material_type.name
                )
                db.add(translation)
                migrated_types += 1
        
        print(f"Migrados {migrated_types} MaterialTypes para '{language_code}'")
        
        db.commit()
        print(f"\nMigração concluída com sucesso!")
        print(f"Total: {migrated_kinds + migrated_tags + migrated_types} traduções criadas")
        
    except Exception as e:
        db.rollback()
        print(f"Erro durante a migração: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        db.close()


if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='Migra valores de name para traduções')
    parser.add_argument(
        '--language',
        type=str,
        default='pt-BR',
        help='Código da linguagem para migração (padrão: pt-BR)'
    )
    
    args = parser.parse_args()
    migrate_to_i18n(args.language)
