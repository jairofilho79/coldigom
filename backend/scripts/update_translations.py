#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para atualizar traduções existentes e adicionar traduções faltantes em português brasileiro (pt)
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from app.infrastructure.database.database import SessionLocal
from app.infrastructure.database.repositories.material_kind_repository import MaterialKindRepository
from app.infrastructure.database.repositories.material_kind_translation_repository import MaterialKindTranslationRepository
from app.application.services.translation_service import TranslationService
from app.domain.schemas.translation import MaterialKindTranslationUpdate


# Dicionário completo de traduções corrigidas e adicionais
MATERIAL_KIND_TRANSLATIONS = {
    # Correções específicas mencionadas pelo usuário
    "Euphonium": "Eufônio (Bombardino)",
    "Lyrics": "Letras",
    "Choir": "Coro",  # Era "Coral", agora é "Coro"
    "Score": "Grade",  # Era "Partitura Completa", agora é "Grade"
    
    # Vozes - correções
    "Soprano": "Soprano",
    "Alto": "Contralto",
    "Tenor": "Tenor",
    "Bass": "Baixo",
    "Soprano Voice": "Voz Soprano",
    "Alto Voice": "Voz Contralto",
    "Tenor Voice": "Voz Tenor",
    "Bass Voice": "Voz Baixo",
    "Soprano Voice I": "Voz Soprano I",
    "Soprano Voice II": "Voz Soprano II",
    "Alto Voice I": "Voz Contralto I",
    "Alto Voice II": "Voz Contralto II",
    "Tenor Voice I": "Voz Tenor I",
    "Tenor Voice II": "Voz Tenor II",
    "Baritone Voice": "Voz Barítono",
    "First Voice": "Primeira Voz",
    "Second Voice": "Segunda Voz",
    
    # MIDI - traduções para tipos audio
    "MIDI": "MIDI",
    "MIDI Alto": "MIDI Contralto",
    "MIDI Bass": "MIDI Baixo",
    "MIDI Soprano": "MIDI Soprano",
    "MIDI Tenor": "MIDI Tenor",
    "MIDI Alto I": "MIDI Contralto I",
    "MIDI Alto II": "MIDI Contralto II",
    "MIDI Bass I": "MIDI Baixo I",
    "MIDI Bass II": "MIDI Baixo II",
    "MIDI Soprano I": "MIDI Soprano I",
    "MIDI Soprano II": "MIDI Soprano II",
    "MIDI Tenor I": "MIDI Tenor I",
    "MIDI Tenor II": "MIDI Tenor II",
    "MIDI Baritone": "MIDI Barítono",
    "MIDI Choir": "MIDI Coro",
    "MIDI First Voice": "MIDI Primeira Voz",
    "MIDI Second Voice": "MIDI Segunda Voz",
    "MIDI General": "MIDI Geral",
    "MIDI Voice": "MIDI Voz",
    "MIDI Voice Men": "MIDI Voz Masculina",
    "MIDI Voice Women": "MIDI Voz Feminina",
    "MIDI Men": "MIDI Masculino",
    "MIDI Women": "MIDI Feminino",
    "MIDI Score": "MIDI Grade",
    "MIDI Instruments": "MIDI Instrumentos",
    
    # Outros tipos audio
    "Audio": "Áudio",
    "Audio General": "Áudio Geral",
    "Audio Group": "Áudio Coro",
    "Audio Solo": "Áudio Solo",
    
    # Vozes gerais
    "Voice Men": "Voz Masculina",
    "Voice Women": "Voz Feminina",
    "Sung Voice": "Voz Cantada",
    
    # Instrumentos - já traduzidos corretamente
    "Choir": "Coro",
    "Playback": "Playback",
    "Chord Chart": "Cifra",
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
    "Electric Bass": "Contrabaixo Elétrico",
    "Flute": "Flauta",
    "Flute I": "Flauta I",
    "Flute II": "Flauta II",
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
    "Baritone Saxophone": "Saxofone Barítono",
    "Woodwinds": "Madeiras",
    "Trumpet": "Trompete",
    "Trumpet in Bb": "Trompete em Si bemol",
    "Trombone": "Trombone",
    "French Horn": "Trompa",
    "French Horn in F": "Trompa em Fá",
    "Tuba": "Tuba",
    "Cornet": "Corneta",
    "Flugelhorn": "Fliscorne",
    "Euphonium": "Eufônio (Bombardino)",
    "Brass": "Metais",
    "Piano": "Piano",
    "Organ": "Órgão",
    "Keyboard": "Teclado",
    "Drums": "Bateria",
    "Percussion": "Percussão",
    "Timpani": "Tímpanos",
    "Bass Drum": "Bumbo",
    "Snare Drum": "Caixa",
    "Cymbal": "Prato",
    "Suspended Cymbal": "Prato Suspenso",
    "Glockenspiel": "Glockenspiel",
    "Vibraphone": "Vibrafone",
    "Orchestra Bells": "Sinos Orquestrais",
    "Harp": "Harpa",
    "Harmonica": "Harmônica",
    
    # Outros
    "Choir and Piano": "Coro e Piano",
    "Score": "Grade",
    "Full Score": "Grade Completa",
    "Conductor Score": "Partitura do Regente",
    "Lead Sheet": "Cifra Simplificada",
    "Rehearsal Version": "Versão de Ensaio",
    
    # Especiais
    "Unknown": "Desconhecido",
    "Base": "Base",
    "Experience": "Experiência",
    "CIAs Gestures": "Gestos CIAs",
}


def get_translation(name: str) -> str:
    """Retorna a tradução para um Material Kind, ou o nome original se não houver tradução"""
    return MATERIAL_KIND_TRANSLATIONS.get(name, name)


def update_material_kind_translations(db: Session, language_code: str) -> tuple[int, int]:
    """Atualiza traduções existentes e cria novas se necessário"""
    material_kind_repo = MaterialKindRepository(db)
    translation_repo = MaterialKindTranslationRepository(db)
    translation_service = TranslationService(db)
    
    material_kinds = material_kind_repo.get_all(skip=0, limit=1000)
    updated_count = 0
    created_count = 0
    skipped_count = 0
    
    print(f"\nProcessando {len(material_kinds)} Material Kinds...")
    
    for kind in material_kinds:
        translation = translation_repo.get_by_entity_and_language(kind.id, language_code)
        expected_translation = get_translation(kind.name)
        
        if translation:
            # Verificar se precisa atualizar
            if translation.translated_name != expected_translation:
                # Atualizar tradução existente
                translation_data = MaterialKindTranslationUpdate(
                    translated_name=expected_translation
                )
                try:
                    translation_service.update_material_kind_translation(translation.id, translation_data)
                    print(f"  ✓ Atualizada: '{kind.name}' → '{expected_translation}' (era: '{translation.translated_name}')")
                    updated_count += 1
                except Exception as e:
                    print(f"  ✗ Erro ao atualizar '{kind.name}': {e}")
            else:
                skipped_count += 1
        else:
            # Criar nova tradução
            from app.domain.schemas.translation import MaterialKindTranslationCreate
            translation_data = MaterialKindTranslationCreate(
                material_kind_id=kind.id,
                language_code=language_code,
                translated_name=expected_translation
            )
            try:
                translation_service.create_material_kind_translation(translation_data)
                print(f"  ✓ Criada: '{kind.name}' → '{expected_translation}'")
                created_count += 1
            except Exception as e:
                print(f"  ✗ Erro ao criar tradução para '{kind.name}': {e}")
    
    return updated_count, created_count, skipped_count


def main():
    """Função principal"""
    language_code = "pt"
    
    db: Session = SessionLocal()
    try:
        print("=" * 80)
        print("ATUALIZANDO TRADUÇÕES EM PORTUGUÊS BRASILEIRO (pt)")
        print("=" * 80)
        
        updated, created, skipped = update_material_kind_translations(db, language_code)
        
        # Resumo final
        print("\n" + "=" * 80)
        print("RESUMO")
        print("=" * 80)
        print(f"Traduções atualizadas: {updated}")
        print(f"Traduções criadas: {created}")
        print(f"Traduções já corretas: {skipped}")
        print(f"\nTotal processado: {updated + created + skipped}")
        print("=" * 80)
        
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
