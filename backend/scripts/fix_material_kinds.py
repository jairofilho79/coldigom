#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para corrigir os material_kind_id dos materiais no banco de dados
baseado nos valores do metadata.yml
"""

import sys
import os
import yaml
from pathlib import Path
from uuid import UUID

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
import re
from app.infrastructure.database.database import SessionLocal
from app.infrastructure.database.repositories.praise_material_repository import PraiseMaterialRepository
from app.infrastructure.database.repositories.material_kind_repository import MaterialKindRepository


def infer_material_kind_name_from_file(file_path: str) -> str:
    """
    Infere o nome do MaterialKind baseado no caminho do arquivo
    """
    file_path_lower = file_path.lower()
    
    # Mapeamento de padrões para nomes
    patterns = [
        # Vozes cantadas
        (r'vozes cantadas.*baixo', 'Choir Bass'),
        (r'vozes cantadas.*contralto', 'Choir Alto'),
        (r'vozes cantadas.*tenor', 'Choir Tenor'),
        (r'vozes cantadas.*soprano', 'Choir Soprano'),
        
        # MIDI
        (r'midi.*baixo', 'MIDI Bass'),
        (r'midi.*contralto', 'MIDI Alto'),
        (r'midi.*tenor', 'MIDI Tenor'),
        (r'midi.*soprano', 'MIDI Soprano'),
        (r'midi.*geral', 'MIDI General'),
        (r'midi.*coro', 'MIDI Choir'),
        
        # Cordas
        (r'violino\s+i[^i]', 'Violin I'),
        (r'violino\s+ii', 'Violin II'),
        (r'violino', 'Violin'),
        (r'viola', 'Viola'),
        (r'violoncelo', 'Cello'),
        
        # Madeiras
        (r'flauta', 'Flute'),
        (r'oboe', 'Oboe'),
        (r'saxofone\s+alto', 'Alto Saxophone'),
        (r'saxofone', 'Saxophone'),
        
        # Metais
        (r'trompete.*sib', 'Trumpet in Bb'),
        (r'trompete', 'Trumpet'),
        (r'trombone', 'Trombone'),
        
        # Partituras
        (r'grade', 'Score'),
        (r'cifra', 'Chord Chart'),
        (r'coro', 'Choir'),
        
        # Áudio
        (r'áudio.*geral|audio.*geral', 'Audio General'),
        (r'\.mp3$', 'Audio'),
    ]
    
    # Tentar padrões
    for pattern, name in patterns:
        if re.search(pattern, file_path_lower):
            return name
    
    # Fallback
    if file_path_lower.endswith('.pdf'):
        return 'Sheet Music'
    elif file_path_lower.endswith('.mp3'):
        return 'Audio'
    
    return 'Unknown'


def load_metadata_file(metadata_path: Path) -> dict:
    """Carrega e parseia um arquivo de metadados YAML"""
    try:
        with open(metadata_path, 'r', encoding='utf-8') as f:
            metadata = yaml.safe_load(f)
            return metadata
    except Exception as e:
        print(f"Erro ao carregar {metadata_path}: {e}")
        return {}


def fix_praise_materials(db: Session, metadata_path: Path, dry_run: bool = False):
    """Corrige os material_kind_id dos materiais de um praise"""
    metadata = load_metadata_file(metadata_path)
    
    if not metadata:
        print(f"❌ Não foi possível carregar o metadata: {metadata_path}")
        return False
    
    praise_id_str = metadata.get('praise_id')
    praise_name = metadata.get('praise_name', 'Desconhecido')
    
    if not praise_id_str:
        print(f"❌ Praise ID não encontrado no metadata")
        return False
    
    try:
        praise_id = UUID(praise_id_str)
    except ValueError:
        print(f"❌ Praise ID inválido: {praise_id_str}")
        return False
    
    print(f"\n🔧 Corrigindo: {praise_name} (ID: {praise_id})")
    if dry_run:
        print("⚠️  MODO DRY RUN - Nenhuma alteração será feita")
    print("=" * 80)
    
    # Buscar materiais do banco
    material_repo = PraiseMaterialRepository(db)
    db_materials = material_repo.get_by_praise_id(praise_id)
    
    # Mapear materiais do banco por ID
    db_materials_map = {str(m.id): m for m in db_materials}
    
    # Buscar materiais do metadata
    metadata_materials = metadata.get('praise_materiais', [])
    
    if not metadata_materials:
        print("⚠️  Nenhum material encontrado no metadata")
        return True
    
    material_kind_repo = MaterialKindRepository(db)
    fixed_count = 0
    errors = []
    
    for material_meta in metadata_materials:
        material_id_str = material_meta.get('praise_material_id')
        expected_kind_id_str = material_meta.get('material_kind')
        file_path = material_meta.get('file_path_legacy', '')
        
        if not material_id_str:
            continue
        
        if not expected_kind_id_str:
            print(f"⚠️  Material {material_id_str} não tem material_kind no metadata - pulando")
            continue
        
        # Buscar material no banco
        db_material = db_materials_map.get(material_id_str)
        
        if not db_material:
            print(f"⚠️  Material {material_id_str} não encontrado no banco - pulando")
            continue
        
        # Verificar se precisa corrigir
        try:
            expected_kind_id = UUID(expected_kind_id_str)
        except ValueError:
            print(f"⚠️  Material {material_id_str} tem material_kind_id inválido no metadata: {expected_kind_id_str}")
            continue
        
        actual_kind_id = db_material.material_kind_id
        
        if str(actual_kind_id) == expected_kind_id_str:
            # Já está correto
            continue
        
        # Verificar se o material_kind existe
        expected_kind = material_kind_repo.get_by_id(expected_kind_id)
        if not expected_kind:
            # Tentar inferir o nome do material_kind baseado no arquivo
            inferred_name = infer_material_kind_name_from_file(file_path)
            
            # Tentar buscar por nome
            existing_by_name = material_kind_repo.get_by_name(inferred_name)
            if existing_by_name:
                print(f"⚠️  Material {material_id_str}: material_kind_id {expected_kind_id_str} não existe")
                print(f"   Mas encontrado MaterialKind '{inferred_name}' com ID {existing_by_name.id}")
                print(f"   Usando ID existente: {existing_by_name.id}")
                expected_kind_id = existing_by_name.id
                expected_kind = existing_by_name
            else:
                print(f"❌ Material {material_id_str}: material_kind_id {expected_kind_id_str} não existe no banco")
                print(f"   Nome inferido: {inferred_name} também não existe")
                errors.append({
                    'material_id': material_id_str,
                    'file': file_path,
                    'error': f'material_kind_id {expected_kind_id_str} não existe no banco e nome inferido também não existe'
                })
                continue
        
        # Buscar nomes para exibição
        actual_kind = material_kind_repo.get_by_id(actual_kind_id)
        
        print(f"\n📝 Material: {file_path}")
        print(f"   ID: {material_id_str}")
        print(f"   Atual: {actual_kind.name if actual_kind else 'N/A'} (ID: {actual_kind_id})")
        print(f"   Esperado: {expected_kind.name} (ID: {expected_kind_id_str})")
        
        if not dry_run:
            # Atualizar material_kind_id
            db_material.material_kind_id = expected_kind_id
            material_repo.update(db_material)
            print(f"   ✅ Corrigido!")
            fixed_count += 1
        else:
            print(f"   [DRY RUN] Seria corrigido")
            fixed_count += 1
    
    print(f"\n{'📊 Resumo:' if not dry_run else '📊 Resumo (DRY RUN):'}")
    print(f"   Materiais corrigidos: {fixed_count}")
    if errors:
        print(f"   Erros: {len(errors)}")
        for error in errors:
            print(f"      - {error['file']}: {error['error']}")
    
    return len(errors) == 0


def main():
    """Função principal"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Corrige material_kind_id dos materiais baseado no metadata.yml')
    parser.add_argument('metadata_path', type=str, help='Caminho para o arquivo metadata.yml')
    parser.add_argument('--dry-run', action='store_true', help='Modo de simulação (não faz alterações)')
    
    args = parser.parse_args()
    
    metadata_path = Path(args.metadata_path)
    
    if not metadata_path.exists():
        print(f"❌ Arquivo não encontrado: {metadata_path}")
        return 1
    
    db: Session = SessionLocal()
    try:
        success = fix_praise_materials(db, metadata_path, dry_run=args.dry_run)
        if success:
            if not args.dry_run:
                print("\n✅ Correção concluída com sucesso!")
            else:
                print("\n✅ Verificação concluída! Use sem --dry-run para aplicar as correções.")
            return 0
        else:
            print("\n❌ Alguns erros ocorreram durante a correção!")
            return 1
    finally:
        db.close()


if __name__ == '__main__':
    sys.exit(main())
