#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para criar MaterialKinds com IDs específicos baseado no metadata.yml
Inferindo os nomes a partir dos file_path_legacy dos materiais
"""

import sys
import os
import yaml
import re
from pathlib import Path
from uuid import UUID
from collections import defaultdict

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from app.infrastructure.database.database import SessionLocal
from app.domain.models.material_kind import MaterialKind
from app.infrastructure.database.repositories.material_kind_repository import MaterialKindRepository


def load_metadata_file(metadata_path: Path) -> dict:
    """Carrega e parseia um arquivo de metadados YAML"""
    try:
        with open(metadata_path, 'r', encoding='utf-8') as f:
            metadata = yaml.safe_load(f)
            return metadata
    except Exception as e:
        print(f"Erro ao carregar {metadata_path}: {e}")
        return {}


def infer_material_kind_name(file_path: str, material_type: str) -> str:
    """
    Infere o nome do MaterialKind baseado no caminho do arquivo e tipo
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
    
    # Fallback baseado em tipo
    if material_type == 'pdf':
        return 'Sheet Music'
    elif material_type == 'mp3':
        return 'Audio'
    
    return 'Unknown'


def create_material_kinds_from_metadata(db: Session, metadata_path: Path, dry_run: bool = False):
    """Cria MaterialKinds com IDs específicos baseado no metadata.yml"""
    metadata = load_metadata_file(metadata_path)
    
    if not metadata:
        print(f"❌ Não foi possível carregar o metadata: {metadata_path}")
        return False
    
    praise_name = metadata.get('praise_name', 'Desconhecido')
    print(f"\n🔧 Criando MaterialKinds para: {praise_name}")
    if dry_run:
        print("⚠️  MODO DRY RUN - Nenhuma alteração será feita")
    print("=" * 80)
    
    # Coletar todos os material_kind_id únicos com seus arquivos
    material_kinds_map = defaultdict(list)
    
    materials = metadata.get('praise_materiais', [])
    for material_meta in materials:
        material_kind_id_str = material_meta.get('material_kind')
        file_path = material_meta.get('file_path_legacy', '')
        material_type = material_meta.get('type', '')
        
        if not material_kind_id_str:
            continue
        
        material_kinds_map[material_kind_id_str].append({
            'file_path': file_path,
            'type': material_type
        })
    
    if not material_kinds_map:
        print("⚠️  Nenhum material_kind encontrado no metadata")
        return True
    
    repo = MaterialKindRepository(db)
    created_count = 0
    existing_count = 0
    errors = []
    
    for material_kind_id_str, files in material_kinds_map.items():
        try:
            material_kind_id = UUID(material_kind_id_str)
        except ValueError:
            print(f"⚠️  ID inválido: {material_kind_id_str} - pulando")
            continue
        
        # Verificar se já existe com esse ID
        existing_by_id = repo.get_by_id(material_kind_id)
        if existing_by_id:
            print(f"✅ Já existe: {existing_by_id.name} (ID: {material_kind_id_str})")
            existing_count += 1
            continue
        
        # Inferir nome baseado nos arquivos
        # Usar o primeiro arquivo para inferir (ou o mais representativo)
        inferred_names = []
        for file_info in files:
            name = infer_material_kind_name(file_info['file_path'], file_info['type'])
            inferred_names.append(name)
        
        # Usar o nome mais comum ou o primeiro
        from collections import Counter
        if inferred_names:
            most_common = Counter(inferred_names).most_common(1)[0][0]
            inferred_name = most_common
        else:
            inferred_name = 'Unknown'
        
        print(f"\n📝 MaterialKind ID: {material_kind_id_str}")
        print(f"   Nome inferido: {inferred_name}")
        print(f"   Arquivos relacionados: {len(files)}")
        for file_info in files[:3]:  # Mostrar até 3 arquivos
            print(f"      - {file_info['file_path']}")
        if len(files) > 3:
            print(f"      ... e mais {len(files) - 3} arquivo(s)")
        
        if not dry_run:
            # Verificar se já existe um MaterialKind com esse nome
            existing_by_name = repo.get_by_name(inferred_name)
            if existing_by_name:
                print(f"   ⚠️  MaterialKind '{inferred_name}' já existe com ID {existing_by_name.id}")
                print(f"   💡 Você pode atualizar os materiais para usar o ID existente ou criar um novo com nome diferente")
                errors.append({
                    'id': material_kind_id_str,
                    'name': inferred_name,
                    'existing_id': str(existing_by_name.id),
                    'error': f'Nome já existe com ID diferente'
                })
                continue
            
            # Criar MaterialKind com ID específico
            try:
                material_kind = MaterialKind(id=material_kind_id, name=inferred_name)
                repo.create(material_kind)
                print(f"   ✅ Criado!")
                created_count += 1
            except Exception as e:
                print(f"   ❌ Erro ao criar: {e}")
                errors.append({
                    'id': material_kind_id_str,
                    'name': inferred_name,
                    'error': str(e)
                })
        else:
            print(f"   [DRY RUN] Seria criado")
            created_count += 1
    
    print(f"\n{'📊 Resumo:' if not dry_run else '📊 Resumo (DRY RUN):'}")
    print(f"   Criados: {created_count}")
    print(f"   Já existiam: {existing_count}")
    if errors:
        print(f"   Erros/Conflitos: {len(errors)}")
        for error in errors:
            if 'existing_id' in error:
                print(f"      - {error['name']} (ID desejado: {error['id']}): {error['error']}")
                print(f"        ID existente: {error['existing_id']}")
            else:
                print(f"      - {error['name']} (ID: {error['id']}): {error['error']}")
    
    return len(errors) == 0


def main():
    """Função principal"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Cria MaterialKinds com IDs específicos baseado no metadata.yml')
    parser.add_argument('metadata_path', type=str, help='Caminho para o arquivo metadata.yml')
    parser.add_argument('--dry-run', action='store_true', help='Modo de simulação (não faz alterações)')
    
    args = parser.parse_args()
    
    metadata_path = Path(args.metadata_path)
    
    if not metadata_path.exists():
        print(f"❌ Arquivo não encontrado: {metadata_path}")
        return 1
    
    db: Session = SessionLocal()
    try:
        success = create_material_kinds_from_metadata(db, metadata_path, dry_run=args.dry_run)
        if success:
            if not args.dry_run:
                print("\n✅ MaterialKinds criados com sucesso!")
            else:
                print("\n✅ Verificação concluída! Use sem --dry-run para criar os MaterialKinds.")
            return 0
        else:
            print("\n❌ Alguns erros ocorreram!")
            return 1
    finally:
        db.close()


if __name__ == '__main__':
    sys.exit(main())
