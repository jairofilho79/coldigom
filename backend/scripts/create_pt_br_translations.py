#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para criar traduções em português brasileiro (pt) para Material Kinds, Praise Tags e Material Types
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from app.infrastructure.database.database import SessionLocal
from app.domain.models.language import Language
from app.infrastructure.database.repositories.language_repository import LanguageRepository
from app.infrastructure.database.repositories.material_kind_repository import MaterialKindRepository
from app.infrastructure.database.repositories.praise_tag_repository import PraiseTagRepository
from app.infrastructure.database.repositories.material_type_repository import MaterialTypeRepository
from app.infrastructure.database.repositories.material_kind_translation_repository import MaterialKindTranslationRepository
from app.infrastructure.database.repositories.praise_tag_translation_repository import PraiseTagTranslationRepository
from app.infrastructure.database.repositories.material_type_translation_repository import MaterialTypeTranslationRepository
from app.application.services.translation_service import TranslationService
from app.domain.schemas.translation import (
    MaterialKindTranslationCreate,
    PraiseTagTranslationCreate,
    MaterialTypeTranslationCreate,
)


# Dicionário de traduções para Material Kinds
MATERIAL_KIND_TRANSLATIONS = {
    "Choir": "Coral",
    "Playback": "Playback",
    "Audio": "Áudio",
    "Chord Chart": "Cifra",
    "Chord Chart I": "Cifra I",
    "Chord Chart II": "Cifra II",
    "Sheet Music": "Partitura",
    "Strings": "Cordas",
    "Viola": "Viola",
    "Violin I": "Violino I",
    "Violin II": "Violino II",
    "Violin": "Violino",
    "Cello": "Violoncelo",
    "Double Bass": "Contrabaixo",
    "Contra Bass": "Contrabaixo",
    "Guitar": "Violão",
    "Flute": "Flauta",
    "Flute I": "Flauta I",
    "Flute II": "Flute II",
    "Piccolo": "Flautim",
    "Clarinet": "Clarinete",
    "Clarinet in Bb": "Clarinete em Si bemol",
    "Oboe": "Oboé",
    "Bassoon": "Fagote",
    "Contrabassoon": "Contrafagote",
    "Saxophone": "Saxofone",
    "Soprano Saxophone": "Saxofone Soprano",
    "Alto Saxophone": "Saxofone Alto",
    "Tenor Saxophone": "Saxofone Tenor",
    "Woodwinds": "Madeiras",
    "Trumpet": "Trompete",
    "Trombone": "Trombone",
    "French Horn": "Trompa",
    "Tuba": "Tuba",
    "Brass": "Metais",
    "Piano": "Piano",
    "Organ": "Órgão",
    "Keyboard": "Teclado",
    "Drums": "Bateria",
    "Percussion": "Percussão",
    "Timpani": "Tímpanos",
    "Voice": "Voz",
    "Soprano": "Soprano",
    "Alto": "Contralto",
    "Tenor": "Tenor",
    "Bass": "Baixo",
    "Score": "Partitura Completa",
    "Lead Sheet": "Cifra Simplificada",
    "Full Score": "Partitura Completa",
    "Conductor Score": "Partitura do Regente",
}


# Dicionário de traduções para Material Types
MATERIAL_TYPE_TRANSLATIONS = {
    "pdf": "PDF",
    "audio": "Áudio",
    "youtube": "YouTube",
    "spotify": "Spotify",
    "text": "Texto",
}


def get_translation_for_material_kind(name: str) -> str:
    """Retorna a tradução para um Material Kind, ou o nome original se não houver tradução"""
    return MATERIAL_KIND_TRANSLATIONS.get(name, name)


def get_translation_for_material_type(name: str) -> str:
    """Retorna a tradução para um Material Type, ou o nome original se não houver tradução"""
    name_lower = name.lower()
    return MATERIAL_TYPE_TRANSLATIONS.get(name_lower, name)


def get_translation_for_tag(name: str) -> str:
    """Retorna a tradução para uma Tag, ou o nome original se não houver tradução"""
    # Por enquanto, mantém o nome original. Pode ser expandido com um dicionário específico
    return name


def ensure_language_exists(db: Session, language_code: str) -> Language:
    """Verifica se o código de idioma existe, criando se necessário"""
    language_repo = LanguageRepository(db)
    language = language_repo.get_by_code(language_code)
    
    if not language:
        print(f"Criando código de idioma '{language_code}'...")
        language = Language(
            code=language_code,
            name="Português (Brasil)" if language_code == "pt" else f"Idioma {language_code}",
            is_active=True
        )
        language = language_repo.create(language)
        print(f"✓ Código de idioma '{language_code}' criado com sucesso")
    else:
        print(f"✓ Código de idioma '{language_code}' já existe")
    
    return language


def create_material_kind_translations(db: Session, language_code: str) -> tuple[int, int]:
    """Cria traduções para todos os Material Kinds"""
    material_kind_repo = MaterialKindRepository(db)
    translation_repo = MaterialKindTranslationRepository(db)
    translation_service = TranslationService(db)
    
    material_kinds = material_kind_repo.get_all(skip=0, limit=1000)
    created_count = 0
    skipped_count = 0
    
    print(f"\nProcessando {len(material_kinds)} Material Kinds...")
    
    for kind in material_kinds:
        # Verificar se já existe tradução
        existing = translation_repo.get_by_entity_and_language(kind.id, language_code)
        
        if existing:
            print(f"  ⊘ Tradução já existe para '{kind.name}' (ID: {kind.id})")
            skipped_count += 1
            continue
        
        # Criar tradução
        translated_name = get_translation_for_material_kind(kind.name)
        translation_data = MaterialKindTranslationCreate(
            material_kind_id=kind.id,
            language_code=language_code,
            translated_name=translated_name
        )
        
        try:
            translation_service.create_material_kind_translation(translation_data)
            print(f"  ✓ Criada tradução: '{kind.name}' → '{translated_name}'")
            created_count += 1
        except Exception as e:
            print(f"  ✗ Erro ao criar tradução para '{kind.name}': {e}")
    
    return created_count, skipped_count


def create_praise_tag_translations(db: Session, language_code: str) -> tuple[int, int]:
    """Cria traduções para todas as Praise Tags"""
    praise_tag_repo = PraiseTagRepository(db)
    translation_repo = PraiseTagTranslationRepository(db)
    translation_service = TranslationService(db)
    
    praise_tags = praise_tag_repo.get_all(skip=0, limit=1000)
    created_count = 0
    skipped_count = 0
    
    print(f"\nProcessando {len(praise_tags)} Praise Tags...")
    
    for tag in praise_tags:
        # Verificar se já existe tradução
        existing = translation_repo.get_by_entity_and_language(tag.id, language_code)
        
        if existing:
            print(f"  ⊘ Tradução já existe para '{tag.name}' (ID: {tag.id})")
            skipped_count += 1
            continue
        
        # Criar tradução
        translated_name = get_translation_for_tag(tag.name)
        translation_data = PraiseTagTranslationCreate(
            praise_tag_id=tag.id,
            language_code=language_code,
            translated_name=translated_name
        )
        
        try:
            translation_service.create_praise_tag_translation(translation_data)
            print(f"  ✓ Criada tradução: '{tag.name}' → '{translated_name}'")
            created_count += 1
        except Exception as e:
            print(f"  ✗ Erro ao criar tradução para '{tag.name}': {e}")
    
    return created_count, skipped_count


def create_material_type_translations(db: Session, language_code: str) -> tuple[int, int]:
    """Cria traduções para todos os Material Types"""
    material_type_repo = MaterialTypeRepository(db)
    translation_repo = MaterialTypeTranslationRepository(db)
    translation_service = TranslationService(db)
    
    material_types = material_type_repo.get_all(skip=0, limit=1000)
    created_count = 0
    skipped_count = 0
    
    print(f"\nProcessando {len(material_types)} Material Types...")
    
    for material_type in material_types:
        # Verificar se já existe tradução
        existing = translation_repo.get_by_entity_and_language(material_type.id, language_code)
        
        if existing:
            print(f"  ⊘ Tradução já existe para '{material_type.name}' (ID: {material_type.id})")
            skipped_count += 1
            continue
        
        # Criar tradução
        translated_name = get_translation_for_material_type(material_type.name)
        translation_data = MaterialTypeTranslationCreate(
            material_type_id=material_type.id,
            language_code=language_code,
            translated_name=translated_name
        )
        
        try:
            translation_service.create_material_type_translation(translation_data)
            print(f"  ✓ Criada tradução: '{material_type.name}' → '{translated_name}'")
            created_count += 1
        except Exception as e:
            print(f"  ✗ Erro ao criar tradução para '{material_type.name}': {e}")
    
    return created_count, skipped_count


def main():
    """Função principal"""
    language_code = "pt"  # O frontend usa "pt" como código
    
    db: Session = SessionLocal()
    try:
        print("=" * 60)
        print("Criando traduções em português brasileiro (pt)")
        print("=" * 60)
        
        # Verificar/criar código de idioma
        ensure_language_exists(db, language_code)
        
        # Criar traduções para Material Kinds
        mk_created, mk_skipped = create_material_kind_translations(db, language_code)
        
        # Criar traduções para Praise Tags
        pt_created, pt_skipped = create_praise_tag_translations(db, language_code)
        
        # Criar traduções para Material Types
        mt_created, mt_skipped = create_material_type_translations(db, language_code)
        
        # Resumo final
        print("\n" + "=" * 60)
        print("RESUMO")
        print("=" * 60)
        print(f"Material Kinds:  {mk_created} criadas, {mk_skipped} já existiam")
        print(f"Praise Tags:    {pt_created} criadas, {pt_skipped} já existiam")
        print(f"Material Types: {mt_created} criadas, {mt_skipped} já existiam")
        print(f"\nTotal: {mk_created + pt_created + mt_created} novas traduções criadas")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n✗ Erro durante a execução: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
