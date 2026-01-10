#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para popular MaterialKinds iniciais no banco de dados
Baseado no enum MaterialKind do frontend
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from app.infrastructure.database.database import SessionLocal
from app.domain.models.material_kind import MaterialKind
from app.infrastructure.database.repositories.material_kind_repository import MaterialKindRepository


# Lista completa de MaterialKinds baseada no enum TypeScript
MATERIAL_KINDS = [
    # Instruments - Strings
    "Violin",
    "Violin I",
    "Violin II",
    "Viola",
    "Cello",
    "Double Bass",
    "Contra Bass",
    "Strings",
    "Guitar",
    
    # Instruments - Woodwinds
    "Flute",
    "Flute I",
    "Flute II",
    "Piccolo",
    "Clarinet",
    "Clarinet in Bb",
    "Oboe",
    "Bassoon",
    "Contrabassoon",
    "Saxophone",
    "Soprano Saxophone",
    "Alto Saxophone",
    "Tenor Saxophone",
    "Woodwinds",
    
    # Instruments - Brass
    "Trumpet",
    "Trumpet in Bb",
    "French Horn",
    "French Horn in F",
    "Trombone",
    "Flugelhorn",
    "Tuba",
    "Cornet",
    "Euphonium",
    "Baritone",
    "Brass",
    "Glockenspiel",
    
    # Instruments - Percussion
    "Drums",
    "Timpani",
    "Snare Drum",
    "Bass Drum",
    "Cymbal",
    "Suspended Cymbal",
    "Vibraphone",
    "Orchestra Bells",
    "Percussion",
    
    # Instruments - Keyboard
    "Piano",
    "Organ",
    "Keyboard",
    
    # Instruments - Other
    "Harp",
    "Harmonica",
    "Electric Bass",
    
    # Scores and Charts
    "Score",
    "Chord Chart",
    "Sheet Music",
    "Base",
    "Harmony",
    
    # Choir
    "Choir",
    "Choir and Piano",
    "Choir Bass",
    "Choir Tenor",
    "Choir Alto",
    "Choir Soprano",
    
    # MIDI Voices
    "MIDI Voice",
    "MIDI General",
    "MIDI Choir",
    "MIDI Bass",
    "MIDI Bass I",
    "MIDI Bass II",
    "MIDI Baritone",
    "MIDI Tenor",
    "MIDI Tenor I",
    "MIDI Tenor II",
    "MIDI Alto",
    "MIDI Alto I",
    "MIDI Alto II",
    "MIDI Soprano",
    "MIDI Soprano I",
    "MIDI Soprano II",
    "MIDI First Voice",
    "MIDI Second Voice",
    "MIDI Instruments",
    "MIDI Score",
    "MIDI Men",
    "MIDI Women",
    
    # Sung Voices
    "Sung Voice",
    "First Voice",
    "Second Voice",
    "Bass Voice",
    "Baritone Voice",
    "Tenor Voice",
    "Tenor Voice I",
    "Tenor Voice II",
    "Alto Voice",
    "Alto Voice I",
    "Alto Voice II",
    "Soprano Voice",
    "Soprano Voice I",
    "Soprano Voice II",
    "Voice Men",
    "Voice Women",
    
    # Audio Types
    "Audio",
    "Audio General",
    "Audio Group",
    "Audio Solo",
    "Playback",
    "Rehearsal Version",
    "Instrumental",
    
    # Other
    "Lyrics",
    "Unknown",
]


def seed_material_kinds(dry_run: bool = False):
    """Popula MaterialKinds no banco de dados"""
    db: Session = SessionLocal()
    repo = MaterialKindRepository(db)
    
    try:
        created_count = 0
        skipped_count = 0
        
        print(f"🌱 Populando MaterialKinds...")
        if dry_run:
            print("⚠️  MODO DRY RUN - Nenhuma alteração será feita")
        print()
        
        for kind_name in MATERIAL_KINDS:
            # Verifica se já existe
            existing = repo.get_by_name(kind_name)
            if existing:
                print(f"⏭️  Já existe: {kind_name}")
                skipped_count += 1
                continue
            
            if dry_run:
                print(f"  [DRY RUN] Criaria: {kind_name}")
            else:
                material_kind = MaterialKind(name=kind_name)
                repo.create(material_kind)
                print(f"✅ Criado: {kind_name}")
                created_count += 1
        
        if not dry_run:
            db.commit()
            print(f"\n💾 Commit realizado")
        
        print(f"\n{'='*60}")
        print(f"✅ Criados: {created_count}")
        print(f"⏭️  Já existiam: {skipped_count}")
        print(f"📊 Total processados: {len(MATERIAL_KINDS)}")
        
    except Exception as e:
        print(f"\n❌ Erro: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
        return 1
    finally:
        db.close()
    
    return 0


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Popula MaterialKinds iniciais no banco de dados')
    parser.add_argument('--dry-run', action='store_true', help='Modo de simulação')
    
    args = parser.parse_args()
    exit(seed_material_kinds(dry_run=args.dry_run))
