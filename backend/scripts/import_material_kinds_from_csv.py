#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para importar MaterialKinds de um arquivo CSV com IDs específicos
"""

import sys
import os
import csv
from pathlib import Path
from uuid import UUID

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from app.infrastructure.database.database import SessionLocal
from app.domain.models.material_kind import MaterialKind
from app.infrastructure.database.repositories.material_kind_repository import MaterialKindRepository


def import_material_kinds_from_csv(db: Session, csv_path: Path, dry_run: bool = False):
    """Importa MaterialKinds de um arquivo CSV"""
    if not csv_path.exists():
        print(f"❌ Arquivo não encontrado: {csv_path}")
        return False
    
    print(f"\n📥 Importando MaterialKinds de: {csv_path}")
    if dry_run:
        print("⚠️  MODO DRY RUN - Nenhuma alteração será feita")
    print("=" * 80)
    
    repo = MaterialKindRepository(db)
    created_count = 0
    updated_count = 0
    skipped_count = 0
    errors = []
    
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        
        for row in reader:
            material_kind_id_str = row.get('material_kind_id', '').strip()
            material_kind_name = row.get('material_kind_name', '').strip()
            
            if not material_kind_id_str or not material_kind_name:
                print(f"⚠️  Linha ignorada: ID ou nome vazio")
                continue
            
            try:
                material_kind_id = UUID(material_kind_id_str)
            except ValueError:
                print(f"⚠️  ID inválido: {material_kind_id_str} - pulando")
                errors.append({
                    'id': material_kind_id_str,
                    'name': material_kind_name,
                    'error': 'ID inválido'
                })
                continue
            
            # Verificar se já existe com esse ID
            existing_by_id = repo.get_by_id(material_kind_id)
            if existing_by_id:
                # Se o nome é diferente, atualizar
                if existing_by_id.name != material_kind_name:
                    print(f"🔄 Atualizando: {existing_by_id.name} → {material_kind_name} (ID: {material_kind_id_str})")
                    if not dry_run:
                        existing_by_id.name = material_kind_name
                        repo.update(existing_by_id)
                    updated_count += 1
                else:
                    print(f"⏭️  Já existe: {material_kind_name} (ID: {material_kind_id_str})")
                    skipped_count += 1
                continue
            
            # Verificar se já existe com esse nome (mas ID diferente)
            existing_by_name = repo.get_by_name(material_kind_name)
            if existing_by_name:
                print(f"⚠️  MaterialKind '{material_kind_name}' já existe com ID {existing_by_name.id}")
                print(f"   Desejado: {material_kind_id_str}")
                print(f"   Mantendo ID existente: {existing_by_name.id}")
                skipped_count += 1
                continue
            
            # Criar novo MaterialKind com ID específico
            print(f"✅ Criando: {material_kind_name} (ID: {material_kind_id_str})")
            if not dry_run:
                try:
                    material_kind = MaterialKind(id=material_kind_id, name=material_kind_name)
                    repo.create(material_kind)
                    created_count += 1
                except Exception as e:
                    print(f"   ❌ Erro ao criar: {e}")
                    errors.append({
                        'id': material_kind_id_str,
                        'name': material_kind_name,
                        'error': str(e)
                    })
            else:
                created_count += 1
    
    print(f"\n{'📊 Resumo:' if not dry_run else '📊 Resumo (DRY RUN):'}")
    print(f"   Criados: {created_count}")
    print(f"   Atualizados: {updated_count}")
    print(f"   Já existiam: {skipped_count}")
    if errors:
        print(f"   Erros: {len(errors)}")
        for error in errors:
            print(f"      - {error['name']} (ID: {error['id']}): {error['error']}")
    
    return len(errors) == 0


def main():
    """Função principal"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Importa MaterialKinds de um arquivo CSV')
    parser.add_argument('csv_path', type=str, help='Caminho para o arquivo CSV')
    parser.add_argument('--dry-run', action='store_true', help='Modo de simulação (não faz alterações)')
    
    args = parser.parse_args()
    
    csv_path = Path(args.csv_path)
    
    db: Session = SessionLocal()
    try:
        success = import_material_kinds_from_csv(db, csv_path, dry_run=args.dry_run)
        if success:
            if not args.dry_run:
                print("\n✅ Importação concluída com sucesso!")
            else:
                print("\n✅ Verificação concluída! Use sem --dry-run para importar os MaterialKinds.")
            return 0
        else:
            print("\n❌ Alguns erros ocorreram durante a importação!")
            return 1
    finally:
        db.close()


if __name__ == '__main__':
    sys.exit(main())
