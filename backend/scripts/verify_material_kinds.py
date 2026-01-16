#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para verificar se os material_kind_id dos materiais estão corretos
comparando com o metadata.yml
"""

import sys
import os
import yaml
from pathlib import Path
from uuid import UUID

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from app.infrastructure.database.database import SessionLocal
from app.infrastructure.database.repositories.praise_material_repository import PraiseMaterialRepository
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


def verify_praise_materials(db: Session, metadata_path: Path):
    """Verifica os material_kind_id dos materiais de um praise"""
    metadata = load_metadata_file(metadata_path)
    
    if not metadata:
        print(f"❌ Não foi possível carregar o metadata: {metadata_path}")
        return
    
    praise_id_str = metadata.get('praise_id')
    praise_name = metadata.get('praise_name', 'Desconhecido')
    
    if not praise_id_str:
        print(f"❌ Praise ID não encontrado no metadata")
        return
    
    try:
        praise_id = UUID(praise_id_str)
    except ValueError:
        print(f"❌ Praise ID inválido: {praise_id_str}")
        return
    
    print(f"\n🔍 Verificando: {praise_name} (ID: {praise_id})")
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
        return
    
    material_kind_repo = MaterialKindRepository(db)
    issues = []
    matches = []
    
    for material_meta in metadata_materials:
        material_id_str = material_meta.get('praise_material_id')
        expected_kind_id_str = material_meta.get('material_kind')
        file_path = material_meta.get('file_path_legacy', '')
        
        if not material_id_str:
            continue
        
        if not expected_kind_id_str:
            print(f"⚠️  Material {material_id_str} não tem material_kind no metadata")
            continue
        
        # Buscar material no banco
        db_material = db_materials_map.get(material_id_str)
        
        if not db_material:
            issues.append({
                'material_id': material_id_str,
                'file': file_path,
                'issue': 'Material não encontrado no banco de dados',
                'expected_kind_id': expected_kind_id_str
            })
            continue
        
        # Comparar material_kind_id
        expected_kind_id = UUID(expected_kind_id_str)
        actual_kind_id = db_material.material_kind_id
        
        if str(actual_kind_id) != expected_kind_id_str:
            # Buscar nomes dos material kinds para exibição
            expected_kind = material_kind_repo.get_by_id(expected_kind_id)
            actual_kind = material_kind_repo.get_by_id(actual_kind_id)
            
            issues.append({
                'material_id': material_id_str,
                'file': file_path,
                'issue': 'material_kind_id incorreto',
                'expected_kind_id': expected_kind_id_str,
                'expected_kind_name': expected_kind.name if expected_kind else 'N/A',
                'actual_kind_id': str(actual_kind_id),
                'actual_kind_name': actual_kind.name if actual_kind else 'N/A'
            })
        else:
            matches.append({
                'material_id': material_id_str,
                'file': file_path,
                'kind_name': db_material.material_kind.name if db_material.material_kind else 'N/A'
            })
    
    # Exibir resultados
    print(f"\n✅ Materiais corretos: {len(matches)}")
    for match in matches:
        print(f"   ✓ {match['file']} → {match['kind_name']}")
    
    print(f"\n❌ Problemas encontrados: {len(issues)}")
    for issue in issues:
        print(f"\n   Material ID: {issue['material_id']}")
        print(f"   Arquivo: {issue['file']}")
        print(f"   Problema: {issue['issue']}")
        if 'expected_kind_name' in issue:
            print(f"   Esperado: {issue['expected_kind_name']} (ID: {issue['expected_kind_id']})")
            print(f"   Atual: {issue['actual_kind_name']} (ID: {issue['actual_kind_id']})")
    
    return len(issues) == 0


def main():
    """Função principal"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Verifica material_kind_id dos materiais')
    parser.add_argument('metadata_path', type=str, help='Caminho para o arquivo metadata.yml')
    
    args = parser.parse_args()
    
    metadata_path = Path(args.metadata_path)
    
    if not metadata_path.exists():
        print(f"❌ Arquivo não encontrado: {metadata_path}")
        return 1
    
    db: Session = SessionLocal()
    try:
        is_correct = verify_praise_materials(db, metadata_path)
        if is_correct:
            print("\n✅ Todos os materiais estão com os material_kind_id corretos!")
            return 0
        else:
            print("\n❌ Alguns materiais têm material_kind_id incorretos!")
            return 1
    finally:
        db.close()


if __name__ == '__main__':
    sys.exit(main())
